"""Parse an XForms definition into the metadata a statistics package needs.

An ODK CSV export is untyped and unlabelled: every column is text and the
choice codes are bare. The XForm carries the question labels, the choice lists
and the data types, so we read them from there and re-attach them to the data.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable
from xml.etree import ElementTree as ET

XF = "http://www.w3.org/2002/xforms"
XH = "http://www.w3.org/1999/xhtml"

# Controls that carry a user-visible label and map to a variable.
_CONTROL_TAGS = {
    "input",
    "select1",
    "select",
    "upload",
    "trigger",
    "range",
    "rank",
    "secret",
    "odk:rank",
}

_ITEXT_REF = re.compile(r"""jr:itext\(\s*['"]?(?P<id>[^'")]+)['"]?\s*\)""")


@dataclass
class Choice:
    value: str
    label: str


@dataclass
class Field:
    """One leaf node of the form, i.e. one column of the exported dataset."""

    path: str
    name: str
    data_type: str = "string"
    label: str = ""
    choices: list[Choice] = field(default_factory=list)
    group_labels: list[str] = field(default_factory=list)
    calculated: bool = False

    @property
    def is_select_one(self) -> bool:
        return self.data_type == "select1"

    @property
    def is_select_multiple(self) -> bool:
        return self.data_type == "select"

    @property
    def qualified_label(self) -> str:
        """Label prefixed with its section, which is what a codebook wants."""
        parts = [p for p in self.group_labels if p]
        text = self.label or self.name
        return " / ".join(parts + [text]) if parts else text


@dataclass
class FormSchema:
    title: str = ""
    form_id: str = ""
    version: str = ""
    root: str = "/data"
    languages: list[str] = field(default_factory=list)
    default_language: str | None = None
    fields: dict[str, Field] = field(default_factory=dict)
    repeats: list[str] = field(default_factory=list)

    def contexts(self) -> list[str]:
        """Every node that Central emits as its own CSV table."""
        return [self.root] + list(self.repeats)

    def fields_in(self, context: str) -> dict[str, Field]:
        """Fields belonging directly to `context`, excluding nested repeats.

        Keys are the path relative to the context, joined with '-', which is
        how Central names CSV columns.
        """
        deeper = [r for r in self.repeats if r != context and r.startswith(context + "/")]
        out: dict[str, Field] = {}
        for path, fld in self.fields.items():
            if not path.startswith(context + "/"):
                continue
            if any(path.startswith(rep + "/") for rep in deeper):
                continue
            rel = path[len(context) + 1 :]
            out[rel.replace("/", "-")] = fld
        return out


def parse(xml_text: str, language: str | None = None) -> FormSchema:
    """Parse an XForm. `language` selects which itext translation to use."""
    root_el = ET.fromstring(xml_text)
    model = root_el.find(f"{{{XH}}}head/{{{XF}}}model")
    if model is None:  # pragma: no cover - malformed forms are rejected upstream
        raise ValueError("form definition has no model element")

    schema = FormSchema()
    _read_title(root_el, schema)

    translations, default_lang = _read_itext(model)
    schema.languages = list(translations)
    chosen = language if language in translations else default_lang
    schema.default_language = chosen
    texts = translations.get(chosen, {}) if chosen else {}

    primary = _primary_instance(model)
    if primary is None:
        raise ValueError("form definition has no primary instance")
    schema.root = "/" + _local(primary.tag)
    schema.form_id = primary.get("id", "") or schema.form_id
    schema.version = primary.get("version", "")

    order: list[str] = []
    leaves: set[str] = set()
    _walk_instance(primary, schema.root, order, leaves)

    binds = _read_binds(model)
    secondary = _read_secondary_instances(model)

    for path in order:
        if path not in leaves:
            continue
        bind = binds.get(path, {})
        if bind.get("type") == "binary" or bind.get("calculate"):
            pass
        schema.fields[path] = Field(
            path=path,
            name=path.rsplit("/", 1)[-1],
            data_type=_normalise_type(bind.get("type")),
            calculated=bool(bind.get("calculate")),
        )

    body = root_el.find(f"{{{XH}}}body")
    if body is not None:
        _walk_body(body, schema, texts, secondary, schema.root, [])

    return schema


# -- helpers ---------------------------------------------------------------


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _read_title(root_el: ET.Element, schema: FormSchema) -> None:
    title = root_el.find(f"{{{XH}}}head/{{{XH}}}title")
    if title is not None and title.text:
        schema.title = title.text.strip()


def _primary_instance(model: ET.Element) -> ET.Element | None:
    for instance in model.findall(f"{{{XF}}}instance"):
        if instance.get("id"):
            continue
        for child in instance:
            return child
    return None


def _walk_instance(
    node: ET.Element, path: str, order: list[str], leaves: set[str]
) -> None:
    children = [c for c in node if isinstance(c.tag, str)]
    for child in children:
        name = _local(child.tag)
        if name == "meta" and path.count("/") == 1:
            # meta is kept: instanceID etc. are genuinely useful columns.
            pass
        child_path = f"{path}/{name}"
        if child_path not in order:
            order.append(child_path)
        grandchildren = [c for c in child if isinstance(c.tag, str)]
        if grandchildren:
            _walk_instance(child, child_path, order, leaves)
        else:
            leaves.add(child_path)


def _read_binds(model: ET.Element) -> dict[str, dict[str, str]]:
    binds: dict[str, dict[str, str]] = {}
    for bind in model.iter(f"{{{XF}}}bind"):
        nodeset = bind.get("nodeset") or bind.get("ref")
        if not nodeset:
            continue
        binds[nodeset] = {
            "type": bind.get("type", ""),
            "calculate": bind.get("calculate", ""),
            "readonly": bind.get("readonly", ""),
        }
    return binds


def _read_itext(model: ET.Element) -> tuple[dict[str, dict[str, str]], str | None]:
    translations: dict[str, dict[str, str]] = {}
    default_lang: str | None = None
    itext = model.find(f"{{{XF}}}itext")
    if itext is None:
        return translations, None
    for translation in itext.findall(f"{{{XF}}}translation"):
        lang = translation.get("lang") or ""
        if translation.get("default") is not None and default_lang is None:
            default_lang = lang
        entries: dict[str, str] = {}
        for text in translation.findall(f"{{{XF}}}text"):
            text_id = text.get("id")
            if not text_id:
                continue
            for value in text.findall(f"{{{XF}}}value"):
                # Skip media alternatives (form="image", "audio", ...).
                if value.get("form"):
                    continue
                entries[text_id] = _flatten_text(value)
                break
        translations[lang] = entries
    if default_lang is None and translations:
        default_lang = next(iter(translations))
    return translations, default_lang


def _flatten_text(node: ET.Element) -> str:
    """Collapse an element's text, including <output> placeholders, to a string."""
    parts: list[str] = []
    if node.text:
        parts.append(node.text)
    for child in node:
        if _local(child.tag) == "output":
            ref = child.get("value") or child.get("ref") or ""
            parts.append("${" + ref.rsplit("/", 1)[-1] + "}")
        else:
            parts.append(_flatten_text(child))
        if child.tail:
            parts.append(child.tail)
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def _read_secondary_instances(model: ET.Element) -> dict[str, list[ET.Element]]:
    """Secondary instances keyed by id; each is the list of <item> elements."""
    out: dict[str, list[ET.Element]] = {}
    for instance in model.findall(f"{{{XF}}}instance"):
        inst_id = instance.get("id")
        if not inst_id:
            continue
        items: list[ET.Element] = []
        for child in instance:
            items.extend([c for c in child if isinstance(c.tag, str)])
        out[inst_id] = items
    return out


def _normalise_type(xsd_type: str | None) -> str:
    if not xsd_type:
        return "string"
    base = xsd_type.split(":")[-1].strip().lower()
    return {
        "int": "int",
        "integer": "int",
        "long": "int",
        "decimal": "decimal",
        "double": "decimal",
        "float": "decimal",
        "date": "date",
        "time": "time",
        "datetime": "dateTime",
        "geopoint": "geopoint",
        "geotrace": "geotrace",
        "geoshape": "geoshape",
        "binary": "binary",
        "barcode": "string",
        "boolean": "boolean",
    }.get(base, "string")


def _resolve_ref(ref: str, context: str) -> str:
    ref = (ref or "").strip()
    if not ref:
        return ""
    if ref.startswith("/"):
        return ref
    return f"{context}/{ref}"


def _label_text(node: ET.Element | None, texts: dict[str, str]) -> str:
    if node is None:
        return ""
    ref = node.get("ref") or ""
    match = _ITEXT_REF.search(ref)
    if match:
        return texts.get(match.group("id"), "")
    return _flatten_text(node)


def _walk_body(
    node: ET.Element,
    schema: FormSchema,
    texts: dict[str, str],
    secondary: dict[str, list[ET.Element]],
    context: str,
    group_labels: list[str],
) -> None:
    for child in node:
        if not isinstance(child.tag, str):
            continue
        tag = _local(child.tag)
        label_el = child.find(f"{{{XF}}}label")

        if tag == "repeat":
            nodeset = _resolve_ref(child.get("nodeset") or child.get("ref") or "", context)
            if nodeset and nodeset not in schema.repeats:
                schema.repeats.append(nodeset)
            _walk_body(child, schema, texts, secondary, nodeset or context, group_labels)
            continue

        if tag == "group":
            ref = _resolve_ref(child.get("ref") or "", context)
            label = _label_text(label_el, texts)
            inner = group_labels + ([label] if label else [])
            _walk_body(child, schema, texts, secondary, ref or context, inner)
            continue

        if tag in _CONTROL_TAGS:
            ref = _resolve_ref(child.get("ref") or "", context)
            fld = schema.fields.get(ref)
            if fld is not None:
                fld.label = _label_text(label_el, texts) or fld.label
                fld.group_labels = list(group_labels)
                if tag in ("select1", "select", "rank", "odk:rank"):
                    fld.data_type = "select" if tag == "select" else "select1"
                    fld.choices = _read_choices(child, texts, secondary)
            continue

        # Unknown wrapper (e.g. odk:setgeopoint); keep descending.
        _walk_body(child, schema, texts, secondary, context, group_labels)


def _read_choices(
    control: ET.Element,
    texts: dict[str, str],
    secondary: dict[str, list[ET.Element]],
) -> list[Choice]:
    choices: list[Choice] = []

    for item in control.findall(f"{{{XF}}}item"):
        value_el = item.find(f"{{{XF}}}value")
        value = (value_el.text or "").strip() if value_el is not None else ""
        label = _label_text(item.find(f"{{{XF}}}label"), texts)
        if value:
            choices.append(Choice(value, label or value))
    if choices:
        return choices

    itemset = control.find(f"{{{XF}}}itemset")
    if itemset is None:
        return choices

    nodeset = itemset.get("nodeset") or ""
    match = re.search(r"""instance\(\s*['"]([^'"]+)['"]\s*\)""", nodeset)
    if not match:
        return choices
    items = secondary.get(match.group(1), [])

    value_field = (itemset.find(f"{{{XF}}}value") or ET.Element("x")).get("ref") or "name"
    label_el = itemset.find(f"{{{XF}}}label")
    label_ref = (label_el.get("ref") if label_el is not None else "") or "label"
    itext_match = _ITEXT_REF.search(label_ref)
    label_field = itext_match.group("id") if itext_match else label_ref
    label_is_itext = itext_match is not None

    for item in items:
        value = _child_text(item, value_field)
        if not value:
            continue
        raw_label = _child_text(item, label_field)
        label = texts.get(raw_label, raw_label) if label_is_itext else raw_label
        choices.append(Choice(value, label or value))
    return choices


def _child_text(item: ET.Element, name: str) -> str:
    name = name.strip().lstrip("./")
    for child in item:
        if isinstance(child.tag, str) and _local(child.tag) == name:
            return (child.text or "").strip()
    return ""


def iter_fields(schema: FormSchema) -> Iterable[Field]:
    return schema.fields.values()
