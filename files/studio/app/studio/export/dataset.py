"""Turn Central's CSV export into typed, labelled tables.

The output of this module is format-neutral: full-fidelity names and labels,
with the per-package limits (Stata's 32-character names, SPSS's 120-character
value labels, ...) applied later in `writers`.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from .schema import Field, FormSchema

# Columns Central adds to every export. Labelling them saves users guessing.
META_LABELS = {
    "SubmissionDate": "Submission date (server)",
    "KEY": "Submission key",
    "PARENT_KEY": "Parent record key",
    "SubmitterID": "Submitter user id",
    "SubmitterName": "Submitter name",
    "AttachmentsPresent": "Attachments received",
    "AttachmentsExpected": "Attachments expected",
    "Status": "Attachment status",
    "ReviewState": "Review state",
    "DeviceID": "Device id",
    "Edits": "Number of edits",
    "FormVersion": "Form version",
    "start": "Survey start time",
    "end": "Survey end time",
    "today": "Survey date",
    "deviceid": "Device id",
    "instanceID": "Instance id",
    "instanceName": "Instance name",
}

_NUMERIC_META = {"AttachmentsPresent", "AttachmentsExpected", "Edits", "SubmitterID"}
_DATETIME_META = {"SubmissionDate"}

# Nodes Studio generates when compiling validation rules. They carry no
# respondent data, so they are left out of the exported tables.
_GENERATED = re.compile(r"_studio_(msg(_[A-Za-z0-9]+)?|warn\d+)$")

_GEO_PARTS = {
    "Latitude": "latitude",
    "Longitude": "longitude",
    "Altitude": "altitude",
    "Accuracy": "accuracy",
}


@dataclass
class Table:
    """One rectangular dataset, ready to be written out."""

    name: str
    label: str
    frame: pd.DataFrame
    column_labels: dict[str, str] = field(default_factory=dict)
    value_labels: dict[str, dict[Any, str]] = field(default_factory=dict)
    # Columns whose values are still strings even though they carry labels.
    string_coded: set[str] = field(default_factory=set)
    date_columns: set[str] = field(default_factory=set)
    datetime_columns: set[str] = field(default_factory=set)
    notes: list[str] = field(default_factory=list)


@dataclass
class BuildOptions:
    # How select_one answers are stored: numeric codes, or the original strings.
    value_coding: str = "numeric"  # "numeric" | "string"
    # Add a 0/1 indicator column per choice of every select_multiple.
    split_select_multiples: bool = True
    # Keep the original space-separated answer alongside the indicators.
    keep_multiple_raw: bool = True
    # Drop columns holding attachment filenames.
    drop_attachments: bool = False


def build_tables(
    members: dict[str, str], schema: FormSchema, options: BuildOptions
) -> list[Table]:
    """Match each CSV member to a form context and build a labelled table."""
    contexts = schema.contexts()
    tables: list[Table] = []

    for filename, text in sorted(members.items()):
        headers = _peek_headers(text)
        if not headers:
            continue
        context = _best_context(headers, schema, contexts)
        tables.append(_build_table(filename, text, schema, context, options))

    # The root table first, then repeats in form order.
    order = {ctx: i for i, ctx in enumerate(contexts)}
    tables.sort(key=lambda t: order.get(t.name_context, 99))  # type: ignore[attr-defined]
    return tables


def _peek_headers(text: str) -> list[str]:
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        return row
    return []


def _best_context(
    headers: list[str], schema: FormSchema, contexts: list[str]
) -> str:
    """Pick the form node whose fields best explain this CSV's columns."""
    best, best_score = schema.root, -1
    for context in contexts:
        known = schema.fields_in(context)
        score = 0
        for header in headers:
            if header in known or _split_geo(header, known) is not None:
                score += 1
        # A repeat table is a better match than the root when it explains more.
        if score > best_score:
            best, best_score = context, score
    return best


def _split_geo(header: str, known: dict[str, Field]) -> tuple[Field, str] | None:
    """Recognise the Latitude/Longitude/... columns Central derives from geopoints."""
    if "-" not in header:
        return None
    base, _, part = header.rpartition("-")
    if part not in _GEO_PARTS:
        return None
    fld = known.get(base)
    if fld is None or fld.data_type not in ("geopoint", "geotrace", "geoshape"):
        return None
    return fld, part


def _table_name(schema: FormSchema, context: str) -> str:
    base = _slug(schema.form_id or schema.title or "form")
    if context == schema.root:
        return base
    suffix = "_".join(_slug(p) for p in context[len(schema.root) + 1 :].split("/"))
    return f"{base}_{suffix}"


def _slug(text: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z_]+", "_", str(text)).strip("_")
    return cleaned or "form"


def _build_table(
    filename: str,
    text: str,
    schema: FormSchema,
    context: str,
    options: BuildOptions,
) -> Table:
    frame = pd.read_csv(
        io.StringIO(text),
        dtype=str,
        keep_default_na=False,
        na_values=[""],
        engine="python",
    )
    known = schema.fields_in(context)

    label = schema.title or schema.form_id
    if context != schema.root:
        rel = context[len(schema.root) + 1 :]
        repeat_field = schema.fields.get(context)
        pretty = repeat_field.label if repeat_field and repeat_field.label else rel
        label = f"{label} - {pretty}"

    table = Table(
        name=_table_name(schema, context),
        label=label,
        frame=pd.DataFrame(index=frame.index),
    )
    table.name_context = context  # type: ignore[attr-defined]

    for header in frame.columns:
        _add_column(table, frame, header, known, options)

    table.notes.insert(0, f"Source: {filename} ({len(frame)} rows)")
    return table


def _add_column(
    table: Table,
    frame: pd.DataFrame,
    header: str,
    known: dict[str, Field],
    options: BuildOptions,
) -> None:
    series = frame[header]
    fld = known.get(header)

    if fld is None:
        geo = _split_geo(header, known)
        if geo is not None:
            base, part = geo
            table.frame[header] = _to_numeric(series)
            base_label = base.qualified_label or base.name
            table.column_labels[header] = f"{base_label} ({_GEO_PARTS[part]})"
            return
        _add_meta_column(table, header, series)
        return

    if _GENERATED.search(fld.name):
        return

    if fld.data_type == "binary" and options.drop_attachments:
        return

    label = fld.qualified_label if fld.label else (META_LABELS.get(fld.name) or fld.qualified_label)

    if fld.is_select_one:
        _add_select_one(table, header, series, fld, label, options)
        return

    if fld.is_select_multiple:
        _add_select_multiple(table, header, series, fld, label, options)
        return

    if fld.data_type == "int":
        table.frame[header] = _to_numeric(series, integral=True)
    elif fld.data_type == "decimal":
        table.frame[header] = _to_numeric(series)
    elif fld.data_type == "date":
        table.frame[header] = _to_date(series)
        table.date_columns.add(header)
    elif fld.data_type == "dateTime":
        table.frame[header] = _to_datetime(series)
        table.datetime_columns.add(header)
    elif fld.data_type == "boolean":
        mapped = series.str.strip().str.lower().map({"true": 1.0, "1": 1.0, "false": 0.0, "0": 0.0})
        table.frame[header] = mapped.astype("float64")
        table.value_labels[header] = {0: "False", 1: "True"}
    else:
        table.frame[header] = _clean_string(series)

    table.column_labels[header] = label


def _add_meta_column(table: Table, header: str, series: pd.Series) -> None:
    if header in _DATETIME_META:
        table.frame[header] = _to_datetime(series)
        table.datetime_columns.add(header)
    elif header in _NUMERIC_META:
        table.frame[header] = _to_numeric(series, integral=True)
    else:
        table.frame[header] = _clean_string(series)
    table.column_labels[header] = META_LABELS.get(header, header)


def _add_select_one(
    table: Table,
    header: str,
    series: pd.Series,
    fld: Field,
    label: str,
    options: BuildOptions,
) -> None:
    values = _clean_string(series)

    if options.value_coding == "string" or not fld.choices:
        table.frame[header] = values
        table.column_labels[header] = label
        if fld.choices:
            table.value_labels[header] = {c.value: c.label for c in fld.choices}
            table.string_coded.add(header)
        return

    codes, labels = _code_map(fld, values)
    table.frame[header] = values.map(codes).astype("float64")
    table.column_labels[header] = label
    table.value_labels[header] = labels


def _code_map(fld: Field, values: pd.Series) -> tuple[dict[str, int], dict[int, str]]:
    """Map choice values to integer codes, preserving numeric codes when possible."""
    listed = [c.value for c in fld.choices]
    all_numeric = all(re.fullmatch(r"-?\d+", v or "") for v in listed) and listed

    codes: dict[str, int] = {}
    labels: dict[int, str] = {}
    if all_numeric:
        for choice in fld.choices:
            code = int(choice.value)
            codes[choice.value] = code
            labels[code] = choice.label or choice.value
    else:
        for index, choice in enumerate(fld.choices, start=1):
            codes[choice.value] = index
            labels[index] = choice.label or choice.value

    # Values collected before a choice was renamed still deserve a code.
    observed = {v for v in values.dropna().unique() if v not in codes}
    next_code = (max(labels) if labels else 0) + 1
    for extra in sorted(observed):
        if all_numeric and re.fullmatch(r"-?\d+", extra):
            code = int(extra)
            if code in labels:
                continue
        else:
            while next_code in labels:
                next_code += 1
            code = next_code
            next_code += 1
        codes[extra] = code
        labels[code] = f"{extra} (not in current form)"
    return codes, labels


def _add_select_multiple(
    table: Table,
    header: str,
    series: pd.Series,
    fld: Field,
    label: str,
    options: BuildOptions,
) -> None:
    values = _clean_string(series)

    if options.keep_multiple_raw or not options.split_select_multiples or not fld.choices:
        table.frame[header] = values
        table.column_labels[header] = label

    if not options.split_select_multiples or not fld.choices:
        return

    answered = values.notna()
    selected = values.fillna("").str.split()

    for choice in fld.choices:
        column = f"{header}-{_slug(choice.value)}"
        hit = selected.apply(lambda items, v=choice.value: v in items)
        table.frame[column] = np.where(answered, hit.astype("float64"), np.nan)
        table.column_labels[column] = f"{label}: {choice.label or choice.value}"
        table.value_labels[column] = {0: "Not selected", 1: "Selected"}


# -- coercion helpers ------------------------------------------------------


def _clean_string(series: pd.Series) -> pd.Series:
    out = series.astype("object").where(series.notna(), None)
    return out.map(lambda v: v if v is None else str(v))


def _to_numeric(series: pd.Series, integral: bool = False) -> pd.Series:
    out = pd.to_numeric(series, errors="coerce").astype("float64")
    if integral and out.notna().all() and np.all(np.mod(out.dropna(), 1) == 0):
        return out.astype("int64")
    return out


def _to_date(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce", format="mixed", utc=False)
    return parsed.dt.date.astype("object").where(parsed.notna(), None)


def _to_datetime(series: pd.Series) -> pd.Series:
    """Parse to naive UTC: Stata and SPSS have no timezone-aware datetime type."""
    parsed = pd.to_datetime(series, errors="coerce", format="mixed", utc=True)
    return parsed.dt.tz_localize(None)
