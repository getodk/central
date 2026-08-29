"""HTTP surface for Central Studio.

Endpoints are deliberately synchronous: every dependency (httpx, sqlite,
pyreadstat) is blocking, so FastAPI runs them in its worker threadpool instead
of stalling the event loop.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from contextlib import asynccontextmanager

from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from . import __version__, auth, db, xlsform
from .auth import Caller, require_caller, require_project_access
from .central import XLSX_MIME, CentralError, Client
from .config import settings
from .export import schema as schema_mod
from .export.service import ExportRequest, run_export
from .models import QUESTION_TYPES, Questionnaire, validate

STATIC_DIR = Path(__file__).parent / "static"

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    _sweep_tmp()
    yield


app = FastAPI(
    title="Central Studio",
    version=__version__,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)
api = APIRouter(prefix=f"{settings.base_path}/api")


def _sweep_tmp() -> None:
    """Clear anything a previous run left behind in the scratch directory."""
    if settings.tmp_dir.exists():
        for item in settings.tmp_dir.iterdir():
            shutil.rmtree(item, ignore_errors=True) if item.is_dir() else item.unlink(
                missing_ok=True
            )


@app.exception_handler(CentralError)
def _central_error(_: Request, exc: CentralError) -> JSONResponse:
    status = exc.status if 400 <= exc.status < 600 else 502
    return JSONResponse(status_code=status, content={"detail": exc.message})


# -- session ---------------------------------------------------------------


class Credentials(BaseModel):
    email: str
    password: str


@api.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, Any]:
    return {"status": "ok", "version": __version__}


@api.post("/session")
def sign_in(credentials: Credentials) -> dict[str, Any]:
    try:
        session = Client.login(credentials.email, credentials.password)
    except CentralError as exc:
        if exc.status in (400, 401, 403):
            raise HTTPException(status_code=401, detail="Incorrect email or password.")
        raise
    token = session.get("token", "")
    return {"token": token, "user": Client(token=token).current_user()}


@api.post("/session/from-cookie")
def sign_in_from_cookie(request: Request) -> Response:
    """Adopt an existing Central browser session.

    The custom header requirement is what makes this safe: a cross-site request
    cannot set it without a CORS preflight, which is never granted here.
    """
    if request.headers.get("x-studio-client") != "1":
        raise HTTPException(status_code=400, detail="Missing client header.")
    token = auth.session_cookie_token(request)
    if not token:
        # Not signed in to Central is the ordinary case, not an error.
        return Response(status_code=204)
    try:
        user = Client(token=token).current_user()
    except CentralError:
        return Response(status_code=204)
    return JSONResponse({"token": token, "user": user})


@api.delete("/session")
def sign_out(caller: Caller = Depends(require_caller)) -> Response:
    auth.forget(caller.token)
    caller.client.logout()
    return Response(status_code=204)


@api.get("/me")
def me(caller: Caller = Depends(require_caller)) -> dict[str, Any]:
    return caller.user


# -- browsing Central ------------------------------------------------------


@api.get("/projects")
def projects(caller: Caller = Depends(require_caller)) -> list[dict[str, Any]]:
    return [
        {"id": p["id"], "name": p.get("name", ""), "archived": bool(p.get("archived"))}
        for p in caller.client.projects()
    ]


@api.get("/projects/{project_id}/forms")
def forms(project_id: int, caller: Caller = Depends(require_caller)) -> list[dict[str, Any]]:
    require_project_access(caller, project_id)
    return [
        {
            "xmlFormId": f.get("xmlFormId"),
            "name": f.get("name") or f.get("xmlFormId"),
            "version": f.get("version", ""),
            "state": f.get("state", ""),
            "submissions": f.get("submissions"),
            "lastSubmission": f.get("lastSubmission"),
        }
        for f in caller.client.forms(project_id)
    ]


@api.get("/projects/{project_id}/forms/{xml_form_id}/meta")
def form_meta(
    project_id: int, xml_form_id: str, caller: Caller = Depends(require_caller)
) -> dict[str, Any]:
    """Everything the export screen needs to describe a form up front."""
    require_project_access(caller, project_id)
    client = caller.client
    form_xml = client.form_xml(project_id, xml_form_id)
    parsed = schema_mod.parse(form_xml)
    return {
        "title": parsed.title,
        "formId": parsed.form_id,
        "version": parsed.version,
        "languages": parsed.languages,
        "defaultLanguage": parsed.default_language,
        "repeats": [r.rsplit("/", 1)[-1] for r in parsed.repeats],
        "fieldCount": len(parsed.fields),
        "submissions": client.submission_count(project_id, xml_form_id),
    }


# -- export ----------------------------------------------------------------


class ExportBody(BaseModel):
    projectId: int
    xmlFormId: str
    formats: list[str] = Field(default_factory=lambda: ["stata", "spss"])
    language: str | None = None
    valueCoding: str = "numeric"
    splitSelectMultiples: bool = True
    keepMultipleRaw: bool = True
    dropAttachments: bool = False
    stataVersion: int = 15
    filter: str | None = None


@api.post("/export")
def export(body: ExportBody, caller: Caller = Depends(require_caller)) -> FileResponse:
    require_project_access(caller, body.projectId)
    request = ExportRequest(
        project_id=body.projectId,
        xml_form_id=body.xmlFormId,
        formats=body.formats,
        language=body.language,
        value_coding=body.valueCoding,
        split_select_multiples=body.splitSelectMultiples,
        keep_multiple_raw=body.keepMultipleRaw,
        drop_attachments=body.dropAttachments,
        stata_version=body.stataVersion,
        odata_filter=body.filter,
    )
    try:
        result = run_export(caller.client, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return FileResponse(
        result.path,
        media_type="application/zip",
        filename=result.filename,
        background=BackgroundTask(shutil.rmtree, result.path.parent, ignore_errors=True),
    )


# -- questionnaire designer ------------------------------------------------


@api.get("/question-types")
def question_types() -> dict[str, Any]:
    return {
        "types": [
            {"value": key, "label": spec["label"], "group": spec["group"], **{
                k: v for k, v in spec.items() if k not in ("label", "group")
            }}
            for key, spec in QUESTION_TYPES.items()
        ]
    }


class QuestionnaireBody(BaseModel):
    projectId: int
    document: Questionnaire


def _load(questionnaire_id: str, caller: Caller) -> dict[str, Any]:
    record = db.get(questionnaire_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found.")
    require_project_access(caller, record["projectId"])
    return record


@api.get("/questionnaires")
def list_questionnaires(
    projectId: int, caller: Caller = Depends(require_caller)
) -> list[dict[str, Any]]:
    require_project_access(caller, projectId)
    return db.list_questionnaires(projectId)


@api.post("/questionnaires", status_code=201)
def create_questionnaire(
    body: QuestionnaireBody, caller: Caller = Depends(require_caller)
) -> dict[str, Any]:
    require_project_access(caller, body.projectId)
    return db.create(body.projectId, body.document.model_dump(), caller.display_name)


@api.get("/questionnaires/{questionnaire_id}")
def read_questionnaire(
    questionnaire_id: str, caller: Caller = Depends(require_caller)
) -> dict[str, Any]:
    return _load(questionnaire_id, caller)


@api.put("/questionnaires/{questionnaire_id}")
def save_questionnaire(
    questionnaire_id: str,
    document: Questionnaire,
    caller: Caller = Depends(require_caller),
) -> dict[str, Any]:
    _load(questionnaire_id, caller)
    updated = db.update(questionnaire_id, document.model_dump(), caller.display_name)
    if updated is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found.")
    return updated


@api.delete("/questionnaires/{questionnaire_id}", status_code=204)
def delete_questionnaire(
    questionnaire_id: str, caller: Caller = Depends(require_caller)
) -> Response:
    _load(questionnaire_id, caller)
    db.delete(questionnaire_id)
    return Response(status_code=204)


@api.get("/questionnaires/{questionnaire_id}/versions")
def questionnaire_versions(
    questionnaire_id: str, caller: Caller = Depends(require_caller)
) -> list[dict[str, Any]]:
    _load(questionnaire_id, caller)
    return db.versions(questionnaire_id)


@api.post("/questionnaires/{questionnaire_id}/versions/{version_id}/restore")
def restore_version(
    questionnaire_id: str, version_id: int, caller: Caller = Depends(require_caller)
) -> dict[str, Any]:
    _load(questionnaire_id, caller)
    document = db.version_document(questionnaire_id, version_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Version not found.")
    updated = db.update(
        questionnaire_id, document, caller.display_name, note=f"restored version {version_id}"
    )
    assert updated is not None
    return updated


@api.post("/validate")
def validate_questionnaire(document: Questionnaire) -> dict[str, Any]:
    issues = [issue.model_dump() for issue in validate(document)]
    return {
        "issues": issues,
        "errors": sum(1 for i in issues if i["level"] == "error"),
        "warnings": sum(1 for i in issues if i["level"] == "warning"),
    }


@api.post("/xlsform")
def download_xlsform(document: Questionnaire) -> Response:
    issues = validate(document)
    errors = [i for i in issues if i.level == "error"]
    if errors:
        raise HTTPException(
            status_code=400,
            detail="Fix these before exporting: "
            + "; ".join(f"{i.where}: {i.message}" for i in errors[:5]),
        )
    data = xlsform.to_workbook(document)
    filename = f"{document.formId or 'form'}.xlsx"
    return Response(
        content=data,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.post("/import")
def import_xlsform(
    file: UploadFile = File(...), caller: Caller = Depends(require_caller)
) -> dict[str, Any]:
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        document, warnings = xlsform.from_workbook(data)
    except xlsform.ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"document": document.model_dump(), "warnings": warnings}


class PublishBody(BaseModel):
    document: Questionnaire
    mode: str = "new"  # "new" creates a form, "draft" replaces an existing draft
    bumpVersion: bool = True


@api.post("/questionnaires/{questionnaire_id}/publish")
def publish(
    questionnaire_id: str,
    body: PublishBody = Body(...),
    caller: Caller = Depends(require_caller),
) -> dict[str, Any]:
    record = _load(questionnaire_id, caller)
    project_id = record["projectId"]
    document = body.document

    errors = [i for i in validate(document) if i.level == "error"]
    if errors:
        raise HTTPException(
            status_code=400,
            detail="Fix these before publishing: "
            + "; ".join(f"{i.where}: {i.message}" for i in errors[:5]),
        )

    if body.bumpVersion or not document.version.strip():
        document.version = xlsform.default_version()

    data = xlsform.to_workbook(document)
    client = caller.client
    try:
        if body.mode == "draft":
            client.create_draft(project_id, document.formId, data, document.formId)
            outcome = {"mode": "draft", "xmlFormId": document.formId}
        else:
            created = client.create_form(project_id, data, document.formId)
            outcome = {"mode": "new", "xmlFormId": created.get("xmlFormId", document.formId)}
    except CentralError as exc:
        raise HTTPException(
            status_code=exc.status if 400 <= exc.status < 500 else 502,
            detail=_publish_hint(exc),
        )

    db.update(questionnaire_id, document.model_dump(), caller.display_name, note="published")
    db.mark_published(questionnaire_id, outcome["xmlFormId"])
    outcome["version"] = document.version
    outcome["projectId"] = project_id
    return outcome


def _publish_hint(exc: CentralError) -> str:
    if exc.status == 409:
        return (
            f"{exc.message} A form with this id already exists in the project. "
            "Publish as a new draft of that form instead."
        )
    if exc.status == 403:
        return "You do not have permission to create forms in this project."
    return exc.message


# -- static UI -------------------------------------------------------------

app.include_router(api)

if STATIC_DIR.is_dir():
    app.mount(
        f"{settings.base_path}/static",
        StaticFiles(directory=STATIC_DIR),
        name="static",
    )


@app.api_route(settings.base_path, methods=["GET", "HEAD"], include_in_schema=False)
def index_redirect() -> RedirectResponse:
    # The page uses relative asset URLs, which need the trailing slash.
    return RedirectResponse(f"{settings.base_path}/", status_code=308)


@app.api_route(f"{settings.base_path}/", methods=["GET", "HEAD"], include_in_schema=False)
def index() -> HTMLResponse:
    page = STATIC_DIR / "index.html"
    if not page.is_file():  # pragma: no cover - only if the image is built wrong
        raise HTTPException(status_code=500, detail="UI assets are missing.")
    return HTMLResponse(page.read_text(encoding="utf-8"))
