"""Thin client for the ODK Central REST/OData API.

Every call is made with the caller's own session token, so Central remains the
single source of truth for authentication and project permissions: Studio never
widens what a user is allowed to see or do.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import httpx

from .config import settings

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class CentralError(Exception):
    """An error returned by central-backend, carrying its status code."""

    def __init__(self, status: int, message: str, detail: Any = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.detail = detail


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    detail: Any = None
    message = f"Central returned {response.status_code}"
    try:
        body = response.json()
        if isinstance(body, dict):
            detail = body
            message = body.get("message") or message
    except ValueError:
        text = response.text.strip()
        if text:
            detail = text[:2000]
    raise CentralError(response.status_code, message, detail)


@dataclass
class Client:
    """Authenticated Central client. `token` is a Central session token."""

    token: str | None = None

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if extra:
            headers.update(extra)
        return headers

    def _client(self, timeout: float | None = None) -> httpx.Client:
        return httpx.Client(
            base_url=settings.central_api,
            timeout=timeout or 60.0,
            follow_redirects=False,
        )

    # -- authentication ---------------------------------------------------

    @staticmethod
    def login(email: str, password: str) -> dict[str, Any]:
        with httpx.Client(base_url=settings.central_api, timeout=60.0) as http:
            response = http.post(
                "/v1/sessions",
                json={"email": email, "password": password},
                headers={"Accept": "application/json"},
            )
            _raise_for_status(response)
            return response.json()

    def logout(self) -> None:
        if not self.token:
            return
        with self._client() as http:
            # A already-expired token is not an error worth surfacing.
            response = http.delete(f"/v1/sessions/{self.token}", headers=self._headers())
            if response.status_code not in (200, 403, 404):
                _raise_for_status(response)

    def current_user(self) -> dict[str, Any]:
        with self._client() as http:
            response = http.get("/v1/users/current", headers=self._headers())
            _raise_for_status(response)
            return response.json()

    # -- projects and forms -----------------------------------------------

    def projects(self) -> list[dict[str, Any]]:
        with self._client() as http:
            response = http.get("/v1/projects", headers=self._headers())
            _raise_for_status(response)
            return response.json()

    def forms(self, project_id: int) -> list[dict[str, Any]]:
        with self._client() as http:
            response = http.get(
                f"/v1/projects/{project_id}/forms", headers=self._headers()
            )
            _raise_for_status(response)
            return response.json()

    def form(self, project_id: int, xml_form_id: str) -> dict[str, Any]:
        with self._client() as http:
            response = http.get(
                f"/v1/projects/{project_id}/forms/{_seg(xml_form_id)}",
                headers=self._headers(),
            )
            _raise_for_status(response)
            return response.json()

    def form_xml(
        self, project_id: int, xml_form_id: str, version: str | None = None
    ) -> str:
        """Fetch the XForms definition, which carries labels and choice lists."""
        path = f"/v1/projects/{project_id}/forms/{_seg(xml_form_id)}"
        if version is not None:
            path += f"/versions/{_seg(version)}"
        path += ".xml"
        with self._client() as http:
            response = http.get(path, headers=self._headers({"Accept": "*/*"}))
            _raise_for_status(response)
            return response.text

    def form_versions(self, project_id: int, xml_form_id: str) -> list[dict[str, Any]]:
        with self._client() as http:
            response = http.get(
                f"/v1/projects/{project_id}/forms/{_seg(xml_form_id)}/versions",
                headers=self._headers(),
            )
            _raise_for_status(response)
            return response.json()

    # -- submissions -------------------------------------------------------

    def submissions_csv_zip(
        self,
        project_id: int,
        xml_form_id: str,
        *,
        odata_filter: str | None = None,
        group_paths: bool = True,
        deleted_fields: bool = False,
    ) -> dict[str, str]:
        """Download Central's own CSV export and return {member name: text}.

        Reusing Central's CSV flattening means Studio produces exactly the
        columns users already see in the Central UI export, including its
        handling of repeats, and keeps repeat/parent keys consistent.
        """
        params: dict[str, str] = {
            "attachments": "false",
            "groupPaths": "true" if group_paths else "false",
            "deletedFields": "true" if deleted_fields else "false",
            "splitSelectMultiples": "false",
        }
        if odata_filter:
            params["$filter"] = odata_filter

        with self._client(timeout=settings.central_timeout) as http:
            response = http.get(
                f"/v1/projects/{project_id}/forms/{_seg(xml_form_id)}/submissions.csv.zip",
                params=params,
                headers=self._headers({"Accept": "*/*"}),
            )
            _raise_for_status(response)
            payload = response.content

        members: dict[str, str] = {}
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            for info in archive.infolist():
                if info.is_dir() or not info.filename.lower().endswith(".csv"):
                    continue
                members[info.filename] = archive.read(info).decode("utf-8-sig")
        return members

    def submission_count(self, project_id: int, xml_form_id: str) -> int | None:
        """Best-effort row count via OData, used only to warn about huge exports."""
        with self._client() as http:
            response = http.get(
                f"/v1/projects/{project_id}/forms/{_seg(xml_form_id)}.svc/Submissions",
                params={"$top": "0", "$count": "true"},
                headers=self._headers(),
            )
            if response.status_code >= 400:
                return None
            try:
                return int(response.json().get("@odata.count"))
            except (ValueError, TypeError, AttributeError):
                return None

    # -- publishing --------------------------------------------------------

    def create_form(
        self, project_id: int, xlsx: bytes, form_id_fallback: str
    ) -> dict[str, Any]:
        """Upload an XLSForm as a new form, left in draft state for review."""
        with self._client(timeout=180.0) as http:
            response = http.post(
                f"/v1/projects/{project_id}/forms",
                params={"ignoreWarnings": "true", "publish": "false"},
                content=xlsx,
                headers=self._headers(
                    {
                        "Content-Type": XLSX_MIME,
                        "X-XlsForm-FormId-Fallback": form_id_fallback,
                    }
                ),
            )
            _raise_for_status(response)
            return response.json()

    def create_draft(
        self, project_id: int, xml_form_id: str, xlsx: bytes, form_id_fallback: str
    ) -> dict[str, Any]:
        """Upload an XLSForm as a new draft of an existing form."""
        with self._client(timeout=180.0) as http:
            response = http.post(
                f"/v1/projects/{project_id}/forms/{_seg(xml_form_id)}/draft",
                params={"ignoreWarnings": "true"},
                content=xlsx,
                headers=self._headers(
                    {
                        "Content-Type": XLSX_MIME,
                        "X-XlsForm-FormId-Fallback": form_id_fallback,
                    }
                ),
            )
            _raise_for_status(response)
            return response.json() if response.content else {"success": True}


def _seg(value: str) -> str:
    """Percent-encode a single path segment (form ids may contain odd characters)."""
    from urllib.parse import quote

    return quote(str(value), safe="")
