from conftest import FIXTURES

from studio.export import schema as S


def load(language=None):
    return S.parse((FIXTURES / "household.xml").read_text(), language=language)


def test_reads_structure_and_types():
    form = load()
    assert form.title == "Household Survey"
    assert form.root == "/household"
    assert form.repeats == ["/household/member"]
    assert form.fields["/household/hh/hhsize"].data_type == "int"
    assert form.fields["/household/hh/income"].data_type == "decimal"
    assert form.fields["/household/hh/interview_date"].data_type == "date"
    assert form.fields["/household/hh/loc"].data_type == "geopoint"
    assert form.fields["/household/hh/photo"].data_type == "binary"


def test_labels_come_from_itext_and_include_the_section():
    form = load()
    assert form.fields["/household/hh/village"].qualified_label == (
        "Household details / Name of village"
    )
    # A literal <label> with no itext reference is read directly.
    assert form.fields["/household/hh/loc"].label == "Location"


def test_choices_from_itemset_and_inline_items():
    form = load()
    sex = form.fields["/household/member/sex"]
    assert sex.is_select_one
    assert [(c.value, c.label) for c in sex.choices] == [("1", "Male"), ("2", "Female")]

    langs = form.fields["/household/member/langs"]
    assert langs.is_select_multiple
    assert [c.value for c in langs.choices] == ["en", "fj", "hi"]


def test_translation_is_selectable():
    form = load(language="Français (fr)")
    assert form.fields["/household/hh/village"].label == "Nom du village"
    assert form.fields["/household/member/sex"].choices[0].label == "Homme"


def test_contexts_split_repeats_from_the_root():
    form = load()
    assert set(form.fields_in("/household")) == {
        "start", "hh-village", "hh-hhsize", "hh-income", "hh-interview_date",
        "hh-loc", "hh-photo", "meta-instanceID",
    }
    assert set(form.fields_in("/household/member")) == {"name", "sex", "age", "langs"}
