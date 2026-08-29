"""Orchestrates an export: fetch from Central, label, write, bundle."""

from __future__ import annotations

import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from ..central import Client
from ..config import settings
from . import schema as schema_mod
from . import writers
from .dataset import BuildOptions, Table, build_tables

FORMATS = ("stata", "spss", "csv")


@dataclass
class ExportRequest:
    project_id: int
    xml_form_id: str
    formats: list[str] = field(default_factory=lambda: ["stata", "spss"])
    language: str | None = None
    value_coding: str = "numeric"
    split_select_multiples: bool = True
    keep_multiple_raw: bool = True
    drop_attachments: bool = False
    stata_version: int = 15
    odata_filter: str | None = None

    def validate(self) -> None:
        chosen = [f for f in self.formats if f in FORMATS]
        if not chosen:
            raise ValueError(
                "choose at least one output format: " + ", ".join(FORMATS)
            )
        self.formats = chosen
        if self.value_coding not in ("numeric", "string"):
            raise ValueError("value_coding must be 'numeric' or 'string'")


@dataclass
class ExportResult:
    path: Path
    filename: str
    tables: list[dict]
    notes: list[str]


def run_export(client: Client, request: ExportRequest) -> ExportResult:
    request.validate()

    form_xml = client.form_xml(request.project_id, request.xml_form_id)
    form_schema = schema_mod.parse(form_xml, language=request.language)

    members = client.submissions_csv_zip(
        request.project_id,
        request.xml_form_id,
        odata_filter=request.odata_filter,
    )
    if not members:
        raise ValueError("Central returned no data for this form")

    options = BuildOptions(
        value_coding=request.value_coding,
        split_select_multiples=request.split_select_multiples,
        keep_multiple_raw=request.keep_multiple_raw,
        drop_attachments=request.drop_attachments,
    )
    tables = build_tables(members, form_schema, options)

    total_rows = sum(len(t.frame) for t in tables)
    if total_rows > settings.max_export_rows:
        raise ValueError(
            f"export is {total_rows} rows, above the {settings.max_export_rows} limit; "
            "narrow it with a filter"
        )

    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(dir=settings.tmp_dir, prefix="export-"))
    stage = workdir / "files"
    stage.mkdir()

    notes: list[str] = []
    summary: list[dict] = []

    for table in tables:
        entry = {
            "name": table.name,
            "label": table.label,
            "rows": int(len(table.frame)),
            "columns": int(len(table.frame.columns)),
            "files": [],
        }
        for fmt in request.formats:
            written = _write_one(table, stage, fmt, request.stata_version)
            entry["files"].append(written[0])
            notes.extend(f"{table.name}: {note}" for note in written[1])
        summary.append(entry)

    notes = _dedupe(notes)

    writers.write_codebook(tables, stage / "codebook.csv")
    (stage / "README.txt").write_text(
        _readme(form_schema, request, summary, notes), encoding="utf-8"
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"{_safe(form_schema.form_id or request.xml_form_id)}-{stamp}.zip"
    bundle = workdir / filename
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(stage.iterdir()):
            archive.write(item, item.name)
    shutil.rmtree(stage, ignore_errors=True)

    return ExportResult(bundle, filename, summary, notes)


def _dedupe(notes: list[str]) -> list[str]:
    """Drop repeats while keeping the original order."""
    seen: set[str] = set()
    out: list[str] = []
    for note in notes:
        if note not in seen:
            seen.add(note)
            out.append(note)
    return out


def _write_one(
    table: Table, stage: Path, fmt: str, stata_version: int
) -> tuple[str, list[str]]:
    if fmt == "stata":
        name = f"{table.name}.dta"
        return name, writers.write_stata(table, stage / name, stata_version)
    if fmt == "spss":
        name = f"{table.name}.sav"
        return name, writers.write_spss(table, stage / name)
    name = f"{table.name}.csv"
    return name, writers.write_csv(table, stage / name)


def _safe(text: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(text)) or "form"


def _readme(
    form_schema: schema_mod.FormSchema,
    request: ExportRequest,
    summary: list[dict],
    notes: list[str],
) -> str:
    lines = [
        f"{form_schema.title or request.xml_form_id}",
        "=" * max(3, len(form_schema.title or request.xml_form_id)),
        "",
        f"Form id:    {form_schema.form_id or request.xml_form_id}",
        f"Project:    {request.project_id}",
        f"Exported:   {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"Language:   {form_schema.default_language or 'n/a'}",
        f"Formats:    {', '.join(request.formats)}",
        f"Select-one: stored as {request.value_coding} values",
        "",
        "Tables",
        "------",
    ]
    for entry in summary:
        lines.append(
            f"  {entry['name']}: {entry['rows']} rows, {entry['columns']} columns"
            f"  [{', '.join(entry['files'])}]"
        )
    lines += [
        "",
        "Notes",
        "-----",
        "  Variable labels come from the form's question labels; value labels come",
        "  from its choice lists. codebook.csv lists every variable and code.",
        "  Date/time values are stored in UTC, because neither Stata nor SPSS has a",
        "  timezone-aware type.",
        "  Repeat groups are exported as separate tables; join them to the parent",
        "  table on PARENT_KEY = KEY.",
        "",
    ]
    if notes:
        lines.append("Adjustments made for the target formats:")
        lines.extend(f"  - {note}" for note in notes)
    else:
        lines.append("No name or label adjustments were needed.")
    return "\n".join(lines) + "\n"
