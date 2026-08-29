import pandas as pd
import pyreadstat

from studio.export.dataset import Table
from studio.export.writers import SPSS, STATA, safe_names, write_spss, write_stata


def make_table():
    frame = pd.DataFrame(
        {
            "hh-village": ["Nadi", "Suva"],
            "hh-size": [4.0, 7.0],
            "sex": [1.0, 2.0],
        }
    )
    return Table(
        name="demo",
        label="Demo form",
        frame=frame,
        column_labels={
            "hh-village": "Household details / Name of village",
            "hh-size": "Household size",
            "sex": "Sex",
        },
        value_labels={"sex": {1: "Male", 2: "Female"}},
    )


def test_names_are_made_legal_for_each_package():
    mapping = safe_names(["hh-village", "meta/instanceID", "2bad", "int"], STATA)
    assert mapping["hh-village"] == "hh_village"
    assert mapping["meta/instanceID"] == "meta_instanceID"
    assert mapping["2bad"] == "v_2bad"
    # 'int' is a Stata keyword.
    assert mapping["int"] == "int_"


def test_duplicate_names_after_truncation_stay_distinct():
    long_a = "a" * 31 + "one"
    long_b = "a" * 31 + "two"
    mapping = safe_names([long_a, long_b], STATA)
    assert mapping[long_a] != mapping[long_b]
    assert all(len(v) <= STATA.max_name for v in mapping.values())


def test_spss_allows_longer_names_than_stata():
    header = "b" * 50
    assert len(safe_names([header], STATA)[header]) == 32
    assert len(safe_names([header], SPSS)[header]) == 50


def test_stata_round_trip_keeps_labels(tmp_path):
    path = tmp_path / "demo.dta"
    write_stata(make_table(), path)
    frame, meta = pyreadstat.read_dta(str(path))
    assert list(frame.columns) == ["hh_village", "hh_size", "sex"]
    assert meta.column_names_to_labels["hh_village"] == "Household details / Name of village"
    assert meta.variable_value_labels["sex"] == {1: "Male", 2: "Female"}


def test_spss_round_trip_keeps_labels(tmp_path):
    path = tmp_path / "demo.sav"
    write_spss(make_table(), path)
    frame, meta = pyreadstat.read_sav(str(path))
    assert meta.variable_value_labels["sex"] == {1: "Male", 2: "Female"}
    assert frame["hh_size"].tolist() == [4.0, 7.0]


def test_long_variable_labels_are_truncated_for_stata(tmp_path):
    table = make_table()
    table.column_labels["hh-size"] = "x" * 200
    path = tmp_path / "demo.dta"
    write_stata(table, path)
    _, meta = pyreadstat.read_dta(str(path))
    assert len(meta.column_names_to_labels["hh_size"]) <= STATA.max_var_label


def test_long_strings_are_truncated_for_stata(tmp_path):
    table = make_table()
    table.frame["hh-village"] = ["y" * 5000, "Suva"]
    path = tmp_path / "demo.dta"
    notes = write_stata(table, path)
    frame, _ = pyreadstat.read_dta(str(path))
    assert len(frame["hh_village"].iloc[0]) == STATA.max_string
    assert any("truncated" in note for note in notes)


def test_stata_drops_string_value_labels_but_spss_keeps_them(tmp_path):
    table = make_table()
    table.frame["sex"] = ["m", "f"]
    table.value_labels["sex"] = {"m": "Male", "f": "Female"}
    table.string_coded.add("sex")

    notes = write_stata(table, tmp_path / "d.dta")
    _, stata_meta = pyreadstat.read_dta(str(tmp_path / "d.dta"))
    assert "sex" not in stata_meta.variable_value_labels
    assert any("cannot label string values" in note for note in notes)

    write_spss(table, tmp_path / "d.sav")
    _, spss_meta = pyreadstat.read_sav(str(tmp_path / "d.sav"))
    assert spss_meta.variable_value_labels["sex"] == {"m": "Male", "f": "Female"}
