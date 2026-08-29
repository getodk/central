import pandas as pd
from conftest import FIXTURES

from studio.export import schema as S
from studio.export.dataset import BuildOptions, build_tables

ROOT_CSV = (
    "SubmissionDate,start,hh-village,hh-hhsize,hh-income,hh-interview_date,"
    "hh-loc-Latitude,hh-loc-Longitude,meta-instanceID,KEY\n"
    "2026-01-31T04:15:00.000Z,2026-01-31T16:10:00.000+12:00,Nadi,4,1250.55,2026-01-30,-17.8,177.4,uuid:a,uuid:a\n"
    "2026-02-01T04:15:00.000Z,2026-02-01T16:10:00.000+12:00,Suva,,,2026-02-01,,,uuid:b,uuid:b\n"
)
MEMBER_CSV = (
    "name,sex,age,langs,PARENT_KEY,KEY\n"
    "Ana,2,34,en fj,uuid:a,uuid:a/member[1]\n"
    "Bill,1,9,en,uuid:a,uuid:a/member[2]\n"
    "Cara,,,,uuid:b,uuid:b/member[1]\n"
)


def build(options=None):
    form = S.parse((FIXTURES / "household.xml").read_text())
    members = {"f.csv": ROOT_CSV, "f-member.csv": MEMBER_CSV}
    return build_tables(members, form, options or BuildOptions())


def test_root_and_repeat_are_separate_tables():
    root, member = build()
    assert root.name == "household_survey"
    assert member.name == "household_survey_member"
    assert len(root.frame) == 2 and len(member.frame) == 3


def test_numeric_and_date_types():
    root, _ = build()
    assert root.frame["hh-hhsize"].dtype == "float64"
    assert root.frame["hh-income"].tolist()[0] == 1250.55
    assert str(root.frame["hh-interview_date"].iloc[0]) == "2026-01-30"
    # Local times are normalised to UTC, since neither target format has zones.
    assert root.frame["start"].iloc[0] == pd.Timestamp("2026-01-31 04:10:00")


def test_geopoint_parts_become_numeric_with_derived_labels():
    root, _ = build()
    assert root.frame["hh-loc-Latitude"].iloc[0] == -17.8
    assert root.column_labels["hh-loc-Latitude"] == "Household details / Location (latitude)"


def test_metadata_columns_are_labelled():
    root, _ = build()
    assert root.column_labels["SubmissionDate"] == "Submission date (server)"
    assert root.column_labels["start"] == "Survey start time"


def test_select_one_is_coded_with_value_labels():
    _, member = build()
    assert member.frame["sex"].tolist()[:2] == [2.0, 1.0]
    assert member.value_labels["sex"] == {1: "Male", 2: "Female"}


def test_select_one_can_stay_as_text():
    _, member = build(BuildOptions(value_coding="string"))
    assert member.frame["sex"].tolist()[:2] == ["2", "1"]
    assert "sex" in member.string_coded


def test_select_multiple_expands_to_indicators():
    _, member = build()
    assert member.frame["langs-en"].fillna(-1).tolist() == [1.0, 1.0, -1.0]
    assert member.frame["langs-fj"].fillna(-1).tolist() == [1.0, 0.0, -1.0]
    assert member.column_labels["langs-fj"] == "Household members / Languages spoken: Fijian"


def test_unanswered_multiple_is_missing_not_zero():
    _, member = build()
    # Cara left the question blank; that is missing data, not "chose nothing".
    assert pd.isna(member.frame["langs-hi"].iloc[2])


def test_values_absent_from_the_choice_list_keep_their_own_code():
    form = S.parse((FIXTURES / "household.xml").read_text())
    tables = build_tables(
        {"m.csv": "name,sex\nA,9\nB,2\n"}, form, BuildOptions()
    )
    member = tables[0]
    assert member.frame["sex"].tolist() == [9.0, 2.0]
    assert member.value_labels["sex"][9] == "9 (not in current form)"
