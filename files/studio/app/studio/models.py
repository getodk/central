"""The questionnaire document: what the designer edits and stores.

This is a superset of what a single XLSForm sheet can express comfortably, but
it maps one-to-one onto XLSForm so that Central (and any other ODK tool) stays
the system of record for the published form.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
FORM_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.\-]*$")

# Question types the designer offers, mapped to their XLSForm type string.
QUESTION_TYPES: dict[str, dict[str, Any]] = {
    "text": {"label": "Text", "group": "Text"},
    "integer": {"label": "Integer", "group": "Numeric"},
    "decimal": {"label": "Decimal", "group": "Numeric"},
    "range": {"label": "Range slider", "group": "Numeric", "parameters": True},
    "select_one": {"label": "Single select", "group": "Choice", "choices": True},
    "select_multiple": {"label": "Multiple select", "group": "Choice", "choices": True},
    "rank": {"label": "Rank", "group": "Choice", "choices": True},
    "date": {"label": "Date", "group": "Date & time"},
    "time": {"label": "Time", "group": "Date & time"},
    "dateTime": {"label": "Date and time", "group": "Date & time"},
    "geopoint": {"label": "GPS point", "group": "Location"},
    "geotrace": {"label": "GPS line", "group": "Location"},
    "geoshape": {"label": "GPS area", "group": "Location"},
    "image": {"label": "Photo", "group": "Media"},
    "audio": {"label": "Audio", "group": "Media"},
    "video": {"label": "Video", "group": "Media"},
    "file": {"label": "File upload", "group": "Media"},
    "barcode": {"label": "Barcode / QR", "group": "Media"},
    "note": {"label": "Note (display only)", "group": "Other"},
    "calculate": {"label": "Calculation", "group": "Other", "calculation": True},
    "acknowledge": {"label": "Acknowledge", "group": "Other"},
    "hidden": {"label": "Hidden value", "group": "Other"},
}

# Names XLSForm/ODK reserve or that collide with generated nodes.
RESERVED_NAMES = {
    "meta", "instanceid", "instancename", "start", "end", "today", "deviceid",
    "subscriberid", "simserial", "phonenumber", "username", "email", "audit",
}


# Suffixes Studio appends when compiling validation rules into XLSForm. User
# names must not collide with them.
GENERATED_SUFFIX = re.compile(r"_studio_(msg(_[A-Za-z0-9]+)?|warn\d+)$")


class Rule(BaseModel):
    """One validation check on a question.

    An error blocks the interviewer until it passes; a warning is shown but can
    be ignored, which is how Survey Solutions distinguishes the two.
    """

    expression: str = ""
    message: dict[str, str] = Field(default_factory=dict)
    severity: Literal["error", "warning"] = "error"


class ChoiceOption(BaseModel):
    value: str = ""
    label: dict[str, str] = Field(default_factory=dict)
    # Free-form extra choices columns, used for cascading selects.
    attributes: dict[str, str] = Field(default_factory=dict)


class ChoiceList(BaseModel):
    name: str = ""
    options: list[ChoiceOption] = Field(default_factory=list)


class Item(BaseModel):
    id: str = ""
    kind: Literal["question", "group"] = "question"
    type: str = "text"
    name: str = ""
    label: dict[str, str] = Field(default_factory=dict)
    hint: dict[str, str] = Field(default_factory=dict)
    required: bool = False
    requiredMessage: dict[str, str] = Field(default_factory=dict)
    relevant: str = ""
    constraint: str = ""
    constraintMessage: dict[str, str] = Field(default_factory=dict)
    calculation: str = ""
    default: str = ""
    appearance: str = ""
    readOnly: bool = False
    choiceList: str = ""
    choiceFilter: str = ""
    parameters: str = ""
    repeat: bool = False
    repeatCount: str = ""
    rules: list[Rule] = Field(default_factory=list)
    children: list["Item"] = Field(default_factory=list)

    @model_validator(mode="after")
    def _fold_legacy_constraint(self) -> "Item":
        """Move a pre-rules `constraint` into the rules list.

        Questionnaires saved before multi-rule validation carry a single
        constraint and message. Folding them in on load keeps `rules` the only
        thing the rest of the code has to read.
        """
        if self.constraint.strip():
            self.rules.insert(
                0,
                Rule(
                    expression=self.constraint,
                    message=dict(self.constraintMessage),
                    severity="error",
                ),
            )
            self.constraint = ""
            self.constraintMessage = {}
        return self

    def rules_of(self, severity: str) -> list[Rule]:
        return [r for r in self.rules if r.severity == severity and r.expression.strip()]


Item.model_rebuild()


class Questionnaire(BaseModel):
    title: str = "Untitled questionnaire"
    formId: str = "untitled"
    version: str = ""
    languages: list[str] = Field(default_factory=lambda: ["English (en)"])
    defaultLanguage: str = "English (en)"
    style: str = ""
    instanceName: str = ""
    publicKey: str = ""
    choiceLists: list[ChoiceList] = Field(default_factory=list)
    items: list[Item] = Field(default_factory=list)

    def walk(self) -> list[tuple[Item, list[str]]]:
        """Every item with the names of its enclosing groups."""
        out: list[tuple[Item, list[str]]] = []

        def visit(items: list[Item], trail: list[str]) -> None:
            for item in items:
                out.append((item, trail))
                if item.kind == "group":
                    visit(item.children, trail + [item.name or "(unnamed)"])

        visit(self.items, [])
        return out


class Issue(BaseModel):
    level: Literal["error", "warning"]
    message: str
    where: str = ""


def validate(questionnaire: Questionnaire) -> list[Issue]:
    """Check a questionnaire before it is converted or published."""
    issues: list[Issue] = []

    if not FORM_ID_RE.match(questionnaire.formId or ""):
        issues.append(
            Issue(
                level="error",
                where="settings",
                message="Form id must start with a letter or underscore and contain "
                "only letters, numbers, '.', '-' and '_'.",
            )
        )
    if not (questionnaire.title or "").strip():
        issues.append(Issue(level="error", where="settings", message="Form title is required."))
    if not questionnaire.languages:
        issues.append(Issue(level="error", where="settings", message="At least one language is required."))
    elif questionnaire.defaultLanguage not in questionnaire.languages:
        issues.append(
            Issue(
                level="error",
                where="settings",
                message=f"Default language '{questionnaire.defaultLanguage}' is not in the language list.",
            )
        )

    list_names: set[str] = set()
    for choice_list in questionnaire.choiceLists:
        where = f"choice list '{choice_list.name or '(unnamed)'}'"
        if not NAME_RE.match(choice_list.name or ""):
            issues.append(Issue(level="error", where=where, message="Invalid choice list name."))
        elif choice_list.name in list_names:
            issues.append(Issue(level="error", where=where, message="Duplicate choice list name."))
        list_names.add(choice_list.name)

        if not choice_list.options:
            issues.append(Issue(level="error", where=where, message="Choice list has no options."))
        seen: set[str] = set()
        for option in choice_list.options:
            if not (option.value or "").strip():
                issues.append(Issue(level="error", where=where, message="An option has an empty value."))
            elif option.value in seen:
                issues.append(
                    Issue(level="error", where=where, message=f"Duplicate option value '{option.value}'.")
                )
            seen.add(option.value)
            if not _text(option.label, questionnaire.defaultLanguage):
                issues.append(
                    Issue(
                        level="warning",
                        where=where,
                        message=f"Option '{option.value}' has no label in the default language.",
                    )
                )

    names: set[str] = set()
    has_question = False

    for item, trail in questionnaire.walk():
        where = "/".join(trail + [item.name or "(unnamed)"])

        if not NAME_RE.match(item.name or ""):
            issues.append(
                Issue(
                    level="error",
                    where=where,
                    message="Name must start with a letter or underscore and contain "
                    "only letters, numbers and underscores.",
                )
            )
        elif item.name.lower() in names:
            issues.append(Issue(level="error", where=where, message=f"Duplicate name '{item.name}'."))
        elif item.name.lower() in RESERVED_NAMES:
            issues.append(Issue(level="error", where=where, message=f"'{item.name}' is a reserved name."))
        elif GENERATED_SUFFIX.search(item.name):
            issues.append(
                Issue(
                    level="error",
                    where=where,
                    message="Names ending in '_studio_msg' or '_studio_warn<n>' are reserved "
                    "for the validation rules Studio generates.",
                )
            )
        names.add((item.name or "").lower())

        if item.kind == "group":
            if not item.children:
                issues.append(Issue(level="warning", where=where, message="Group is empty."))
            if item.repeat and item.repeatCount and not item.repeatCount.strip():
                issues.append(Issue(level="warning", where=where, message="Repeat count is blank."))
            continue

        has_question = True
        spec = QUESTION_TYPES.get(item.type)
        if spec is None:
            issues.append(Issue(level="error", where=where, message=f"Unknown question type '{item.type}'."))
            continue

        if spec.get("choices"):
            if not item.choiceList:
                issues.append(Issue(level="error", where=where, message="No choice list selected."))
            elif item.choiceList not in list_names:
                issues.append(
                    Issue(level="error", where=where, message=f"Choice list '{item.choiceList}' does not exist.")
                )

        if item.type == "calculate" and not item.calculation.strip():
            issues.append(Issue(level="error", where=where, message="A calculation is required."))

        if item.type == "calculate" and item.required:
            issues.append(Issue(level="warning", where=where, message="Calculations cannot be required."))

        for index, rule in enumerate(item.rules, start=1):
            label = f"validation rule {index}"
            if not rule.expression.strip():
                issues.append(
                    Issue(level="error", where=where, message=f"{label} has no expression.")
                )
                continue
            if not _text(rule.message, questionnaire.defaultLanguage):
                issues.append(
                    Issue(
                        level="warning",
                        where=where,
                        message=f"{label} has no message, so interviewers see a generic one.",
                    )
                )
            for language in questionnaire.languages:
                if language == questionnaire.defaultLanguage:
                    continue
                if not (rule.message or {}).get(language, "").strip():
                    issues.append(
                        Issue(
                            level="warning",
                            where=where,
                            message=f"{label} has no message in {language}.",
                        )
                    )

        if item.rules and item.type in ("note", "calculate", "hidden"):
            issues.append(
                Issue(
                    level="warning",
                    where=where,
                    message=f"Validation on a '{item.type}' is not shown to interviewers.",
                )
            )

        if item.type not in ("calculate", "hidden") and not _text(item.label, questionnaire.defaultLanguage):
            issues.append(
                Issue(level="warning", where=where, message="No label in the default language.")
            )

    if not has_question:
        issues.append(Issue(level="error", where="form", message="The questionnaire has no questions."))

    return issues


def _text(mapping: dict[str, str], language: str) -> str:
    value = (mapping or {}).get(language, "")
    if value.strip():
        return value
    for candidate in (mapping or {}).values():
        if candidate.strip():
            return candidate
    return ""
