# Central Studio

Central Studio adds two things to an ODK Central installation:

* **A questionnaire designer** — build forms in the browser (sections, repeat
  rosters, choice lists, skip logic, constraints, translations), save them, and
  publish them to Central as XLSForms.
* **Statistical export** — download submissions as **Stata (`.dta`)** and
  **SPSS (`.sav`)** files with variable labels, value labels and real data
  types already applied.

It runs as its own container and talks to central-backend over its public REST
and OData API. Nothing in central-backend or central-frontend is patched, so
Central can be upgraded independently.

Once the stack is up, Studio is at **`https://your.domain.com/studio/`**.

## How it fits together

```
browser ──▶ nginx ──┬─▶ /            central-frontend
                    ├─▶ /v1/         central-backend
                    ├─▶ /-/          enketo
                    └─▶ /studio/     studio ──▶ central-backend /v1/
```

Studio never holds an identity of its own. Every request carries the caller's
Central session token, and Studio uses that same token for its calls to
Central. A user therefore sees exactly the projects, forms and submissions
their Central account already grants them, and publishing a form is subject to
Central's own permission checks.

## Statistical export

Export starts from Central's own CSV export, so the columns match what the
Central UI produces, and then re-attaches everything CSV throws away:

| Source | Becomes |
| --- | --- |
| Question label | Variable label |
| Choice list | Value labels |
| Section title | Prefix on the variable label |
| `int` / `decimal` bind | Numeric variable |
| `date` / `dateTime` bind | Date / datetime variable |
| `select_one` | Numeric code + value labels (or the original text) |
| `select_multiple` | One 0/1 indicator per choice, plus the raw answer |
| geopoint | Separate numeric latitude/longitude/altitude/accuracy |
| Repeat group | Its own file, joinable on `PARENT_KEY` = `KEY` |

Options on the export screen:

* **Formats** — Stata, SPSS and/or CSV, in one archive.
* **Stata version** — 12, 13, or 14-and-later.
* **Label language** — for multilingual forms.
* **Single-select answers** — numeric codes with value labels (the default,
  and what most analysis expects), or the original text codes. Where a form's
  own choice values are already integers those integers are kept, so the codes
  match the questionnaire.
* **Multiple-select questions** — whether to add a 0/1 column per choice.
* **Include** — all submissions, approved only, or everything except rejected.

Every archive also contains:

* `codebook.csv` — every variable, its label, its Stata and SPSS names, its
  type, and each code with its label.
* `README.txt` — what was exported, and every adjustment made to fit the target
  format (renames, truncations).

### Things worth knowing

* **Names are rewritten** to what each package accepts. ODK's `-` separator
  becomes `_`, names are cut to 32 characters for Stata and 64 for SPSS, and
  collisions get a numeric suffix. The codebook maps every original column to
  its new name.
* **Times are stored in UTC**, because neither Stata nor SPSS has a
  timezone-aware type.
* **Stata cannot label string values.** With "original text codes" selected,
  the `.sav` keeps its value labels and the `.dta` does not; the README says so.
* **An answer that is not in the current choice list** still gets a code, and a
  value label marking it as no longer in the form. Renaming choices between
  rounds therefore does not silently drop data.
* **A blank multiple-select is missing, not zero.** Indicator columns are
  missing when the question was not answered, and 0 only when it was answered
  and that choice was not picked.

## Questionnaire designer

Questionnaires belong to a Central project and are stored by Studio, not by
Central, until you publish them. Publishing converts the questionnaire to an
XLSForm and uploads it to Central, which converts it with the same pyxform it
uses for any other form, and leaves it as a **draft** so you can test it in
Central before releasing it.

Supported: text, integer, decimal, range, single/multiple select, rank, date,
time, date-and-time, GPS point/line/area, photo, audio, video, file, barcode,
note, calculation, acknowledge and hidden questions; nested sections; repeat
rosters with an optional repeat count; reusable choice lists with cascading
filter columns; relevance, constraints and constraint messages; defaults,
appearances and read-only; and multiple languages per form.

Also available:

* **Import an XLSForm** to edit an existing form in the designer. Question
  types the designer does not model are imported as text and reported.
* **Download as XLSForm** at any point.
* **Version history** — every save keeps the previous state, and any earlier
  version can be restored.
* **Live checks** — duplicate or invalid variable names, missing choice lists,
  reserved names, calculations without an expression, and missing labels.

Publishing to Central will not overwrite a form by surprise: publishing a form
id that already exists is refused, and the designer offers to publish a new
draft of that form instead.

## Configuration

All optional; the defaults suit a normal installation.

| Variable | Default | Purpose |
| --- | --- | --- |
| `STUDIO_WORKERS` | `2` | uvicorn worker processes. Exports are memory-hungry; raise only with RAM to spare. |
| `STUDIO_MAX_EXPORT_ROWS` | `2000000` | Refuse exports larger than this, across all tables. |
| `STUDIO_CENTRAL_TIMEOUT` | `900` | Seconds to wait for Central's CSV export. |
| `STUDIO_CENTRAL_API` | `http://service:8383` | Where central-backend is. |
| `STUDIO_DATA_DIR` | `/var/lib/odk/studio` | Where saved questionnaires live. |
| `STUDIO_BASE_PATH` | `studio` | URL prefix. Changing it also needs an nginx change. |

Saved questionnaires live in the `studio` Docker volume as SQLite. Back it up
alongside the `postgres14` volume:

```sh
docker compose run --rm -v "$PWD:/backup" studio \
  cp /var/lib/odk/studio/studio.sqlite3 /backup/studio-backup.sqlite3
```

To run Central without Studio, stop the container and remove the `/studio/`
block from `files/nginx/odk.conf.template`; nothing else depends on it.

## Development

```sh
cd files/studio/app
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

# Point at a Central you can reach, then:
CENTRAL_API=http://localhost:8383 STUDIO_DATA_DIR=/tmp/studio \
  uvicorn studio.main:app --reload --port 8686
```

Open <http://localhost:8686/studio/>.

Run the tests with `python3 -m pytest tests`. They cover the XForm parser, the
typing and labelling rules, the Stata/SPSS writers (including round-tripping
files back through `pyreadstat`), XLSForm generation and import, and the API —
including that a user cannot reach a project Central would not give them. One
test converts a generated XLSForm with the real pyxform and reads the result
back through the export parser, so the designer and the exporter are checked
against each other end to end.

### Layout

| Path | What it does |
| --- | --- |
| `studio/main.py` | HTTP endpoints |
| `studio/auth.py` | Token validation and project access checks |
| `studio/central.py` | Client for Central's API |
| `studio/models.py` | Questionnaire document and its validation rules |
| `studio/xlsform.py` | Questionnaire ⇄ XLSForm |
| `studio/db.py` | SQLite storage and version history |
| `studio/export/schema.py` | XForm → labels, choices and types |
| `studio/export/dataset.py` | CSV → typed, labelled tables |
| `studio/export/writers.py` | Tables → `.dta` / `.sav` / `.csv` / codebook |
| `studio/export/service.py` | Fetch, build, bundle |
| `studio/static/` | The browser app (no build step) |
