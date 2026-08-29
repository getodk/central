"""Write labelled tables as Stata (.dta), SPSS (.sav) or CSV files.

Each package has its own limits on identifier length, label length and string
width. Rather than mangling the canonical table, we derive a per-format view of
it and record every compromise we had to make so the user can see it.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import pyreadstat

from .dataset import Table

_STATA_RESERVED = {
    "_all", "_b", "byte", "double", "float", "if", "in", "int", "long", "_n",
    "_N", "_pi", "_rc", "_skip", "using", "with", "str", "strl", "by",
}
_SPSS_RESERVED = {
    "all", "and", "by", "eq", "ge", "gt", "le", "lt", "ne", "not", "or", "to",
    "with",
}


@dataclass(frozen=True)
class FormatSpec:
    key: str
    label: str
    extension: str
    max_name: int
    max_var_label: int
    max_value_label: int
    max_string: int
    reserved: frozenset[str]
    string_value_labels: bool


STATA = FormatSpec(
    key="stata",
    label="Stata",
    extension=".dta",
    max_name=32,
    max_var_label=80,
    max_value_label=32000,
    max_string=2045,
    reserved=frozenset(_STATA_RESERVED),
    string_value_labels=False,
)

SPSS = FormatSpec(
    key="spss",
    label="SPSS",
    extension=".sav",
    max_name=64,
    max_var_label=256,
    max_value_label=120,
    max_string=32767,
    reserved=frozenset(_SPSS_RESERVED),
    string_value_labels=True,
)


@dataclass
class RenderedTable:
    frame: pd.DataFrame
    column_labels: list[str]
    value_labels: dict[str, dict[Any, str]]
    renames: dict[str, str]
    notes: list[str]


def safe_names(headers: list[str], spec: FormatSpec) -> dict[str, str]:
    """Map export headers to identifiers the target package will accept."""
    used: set[str] = set()
    mapping: dict[str, str] = {}

    for header in headers:
        name = re.sub(r"[^0-9A-Za-z_]+", "_", header).strip("_")
        if not name:
            name = "v"
        if not re.match(r"[A-Za-z_]", name[0]):
            name = f"v_{name}"
        if name.lower() in spec.reserved:
            name = f"{name}_"
        name = name[: spec.max_name]

        candidate, counter = name, 1
        while candidate.lower() in used:
            counter += 1
            suffix = f"_{counter}"
            candidate = f"{name[: spec.max_name - len(suffix)]}{suffix}"
        used.add(candidate.lower())
        mapping[header] = candidate

    return mapping


def _holds_text(series: pd.Series) -> bool:
    """True for text columns under both the object and the newer str dtypes."""
    if pd.api.types.is_string_dtype(series):
        return True
    return series.dtype == "object" and series.dropna().map(lambda v: isinstance(v, str)).any()


def _truncate(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def render(table: Table, spec: FormatSpec) -> RenderedTable:
    """Adapt a canonical table to one statistics package."""
    headers = list(table.frame.columns)
    renames = safe_names(headers, spec)
    notes: list[str] = []

    frame = table.frame.copy()

    for header in headers:
        if renames[header] != header:
            notes.append(f"renamed '{header}' to '{renames[header]}'")

        series = frame[header]
        if _holds_text(series) and header not in table.date_columns:
            lengths = series.dropna().map(lambda v: len(v) if isinstance(v, str) else 0)
            longest = int(lengths.max()) if len(lengths) else 0
            if longest > spec.max_string:
                frame[header] = series.map(
                    lambda v: v[: spec.max_string] if isinstance(v, str) else v
                )
                notes.append(
                    f"'{header}' truncated to {spec.max_string} characters "
                    f"({spec.label} string limit)"
                )

    value_labels: dict[str, dict[Any, str]] = {}
    for header, labels in table.value_labels.items():
        if header not in frame.columns:
            continue
        if header in table.string_coded and not spec.string_value_labels:
            notes.append(
                f"'{header}' kept as text: {spec.label} cannot label string values"
            )
            continue
        value_labels[renames[header]] = {
            key: _truncate(text, spec.max_value_label) for key, text in labels.items()
        }

    column_labels = [
        _truncate(table.column_labels.get(header, header), spec.max_var_label)
        for header in headers
    ]

    frame.columns = [renames[header] for header in headers]
    return RenderedTable(frame, column_labels, value_labels, renames, notes)


def write_stata(table: Table, path: Path, stata_version: int = 15) -> list[str]:
    rendered = render(table, STATA)
    if stata_version not in (13, 14, 15):
        stata_version = 15
    pyreadstat.write_dta(
        rendered.frame,
        str(path),
        file_label=_truncate(table.label, 80),
        column_labels=rendered.column_labels,
        variable_value_labels=rendered.value_labels,
        version=stata_version,
    )
    return rendered.notes


def write_spss(table: Table, path: Path) -> list[str]:
    rendered = render(table, SPSS)
    pyreadstat.write_sav(
        rendered.frame,
        str(path),
        file_label=_truncate(table.label, 64),
        column_labels=rendered.column_labels,
        variable_value_labels=rendered.value_labels,
    )
    return rendered.notes


def write_csv(table: Table, path: Path) -> list[str]:
    table.frame.to_csv(path, index=False)
    return []


def _describe(table: Table, header: str) -> str:
    """A stable type name for the codebook, independent of the pandas version."""
    if header in table.date_columns:
        return "date"
    if header in table.datetime_columns:
        return "datetime"
    series = table.frame[header]
    if _holds_text(series):
        return "string"
    if pd.api.types.is_integer_dtype(series):
        return "integer"
    if pd.api.types.is_float_dtype(series):
        return "numeric"
    return str(series.dtype)


def write_codebook(tables: list[Table], path: Path) -> None:
    """A flat listing of every variable, its label and its codes."""
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "table",
                "column",
                "stata_name",
                "spss_name",
                "label",
                "type",
                "value",
                "value_label",
            ]
        )
        for table in tables:
            headers = list(table.frame.columns)
            stata_names = safe_names(headers, STATA)
            spss_names = safe_names(headers, SPSS)
            for header in headers:
                dtype = _describe(table, header)
                labels = table.value_labels.get(header)
                base = [
                    table.name,
                    header,
                    stata_names[header],
                    spss_names[header],
                    table.column_labels.get(header, ""),
                    dtype,
                ]
                if not labels:
                    writer.writerow(base + ["", ""])
                    continue
                for value, text in labels.items():
                    writer.writerow(base + [value, text])
