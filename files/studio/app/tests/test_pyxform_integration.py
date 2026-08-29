"""Prove that what the designer generates is a form Central will accept.

Central converts XLSForms with pyxform-http, which wraps the same pyxform this
test imports, so a form that converts here converts there. The test is skipped
when pyxform is not installed, since it is only a development dependency.
"""

from xml.etree import ElementTree as ET

import pytest

from studio import xlsform
from studio.export import schema as S

pyxform = pytest.importorskip("pyxform.xls2xform")

from test_xlsform import EN, FR, sample  # noqa: E402


def convert(questionnaire, tmp_path):
    path = tmp_path / "form.xlsx"
    path.write_bytes(xlsform.to_workbook(questionnaire))
    return pyxform.convert(str(path)).xform


def test_generated_xlsform_converts(tmp_path):
    xml = convert(sample(), tmp_path)
    root = ET.fromstring(xml)
    assert root is not None


def test_the_converted_form_reads_back_with_the_labels_we_wrote(tmp_path):
    """Designer, converter and exporter must agree end to end."""
    xml = convert(sample(), tmp_path)
    form = S.parse(xml)

    assert form.title == "Household Survey"
    assert form.form_id == "household_survey"
    assert form.repeats == ["/data/member"]

    village = form.fields["/data/hh/village"]
    assert village.qualified_label == "Household / Village"
    assert village.data_type == "string"
    assert form.fields["/data/hh/hhsize"].data_type == "int"

    sex = form.fields["/data/member/sex"]
    assert [(c.value, c.label) for c in sex.choices] == [("1", "Male"), ("2", "Female")]

    french = S.parse(xml, language=FR)
    assert french.fields["/data/member/sex"].choices[0].label == "Homme"
    assert EN in form.languages


def test_a_single_language_form_converts_too(tmp_path):
    from studio.models import Item, Questionnaire

    questionnaire = Questionnaire(
        title="Simple", formId="simple", languages=[EN], defaultLanguage=EN,
        items=[
            Item(kind="question", type="text", name="q1", label={EN: "Your name"}, required=True),
            Item(kind="question", type="integer", name="q2", label={EN: "Your age"},
                 constraint=". >= 0", constraintMessage={EN: "Cannot be negative"}),
        ],
    )
    form = S.parse(convert(questionnaire, tmp_path))
    assert form.fields["/data/q1"].label == "Your name"
    assert form.fields["/data/q2"].data_type == "int"
