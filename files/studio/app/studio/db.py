"""SQLite storage for saved questionnaires and their version history.

Questionnaires are scoped to a Central project, and every read and write is
gated on the caller's access to that project, so Central's permission model
carries over unchanged.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS questionnaires (
  id           TEXT PRIMARY KEY,
  project_id   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  form_id      TEXT NOT NULL,
  document     TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  published_as TEXT
);
CREATE INDEX IF NOT EXISTS questionnaires_project
  ON questionnaires (project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS questionnaire_versions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  questionnaire_id TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  created_by       TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  document         TEXT NOT NULL,
  FOREIGN KEY (questionnaire_id) REFERENCES questionnaires (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS questionnaire_versions_owner
  ON questionnaire_versions (questionnaire_id, id DESC);
"""

# How many past versions to keep per questionnaire.
_KEEP_VERSIONS = 50


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(_SCHEMA)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(settings.db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _row_to_summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "title": row["title"],
        "formId": row["form_id"],
        "createdAt": row["created_at"],
        "createdBy": row["created_by"],
        "updatedAt": row["updated_at"],
        "updatedBy": row["updated_by"],
        "publishedAt": row["published_at"],
        "publishedAs": row["published_as"],
    }


def list_questionnaires(project_id: int) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM questionnaires WHERE project_id = ? ORDER BY updated_at DESC",
            (project_id,),
        ).fetchall()
    return [_row_to_summary(row) for row in rows]


def get(questionnaire_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM questionnaires WHERE id = ?", (questionnaire_id,)
        ).fetchone()
    if row is None:
        return None
    record = _row_to_summary(row)
    record["document"] = json.loads(row["document"])
    return record


def create(
    project_id: int, document: dict[str, Any], actor: str
) -> dict[str, Any]:
    questionnaire_id = uuid.uuid4().hex
    stamp = now()
    with connect() as conn:
        conn.execute(
            """INSERT INTO questionnaires
               (id, project_id, title, form_id, document, created_at, created_by,
                updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                questionnaire_id,
                project_id,
                document.get("title", ""),
                document.get("formId", ""),
                json.dumps(document),
                stamp,
                actor,
                stamp,
                actor,
            ),
        )
        _snapshot(conn, questionnaire_id, document, actor, "created")
    result = get(questionnaire_id)
    assert result is not None
    return result


def update(
    questionnaire_id: str, document: dict[str, Any], actor: str, note: str = ""
) -> dict[str, Any] | None:
    with connect() as conn:
        existing = conn.execute(
            "SELECT document FROM questionnaires WHERE id = ?", (questionnaire_id,)
        ).fetchone()
        if existing is None:
            return None
        # Snapshot the previous state so an edit is always recoverable.
        if existing["document"] != json.dumps(document):
            _snapshot(
                conn,
                questionnaire_id,
                json.loads(existing["document"]),
                actor,
                note or "edited",
            )
        conn.execute(
            """UPDATE questionnaires
               SET title = ?, form_id = ?, document = ?, updated_at = ?, updated_by = ?
               WHERE id = ?""",
            (
                document.get("title", ""),
                document.get("formId", ""),
                json.dumps(document),
                now(),
                actor,
                questionnaire_id,
            ),
        )
    return get(questionnaire_id)


def mark_published(questionnaire_id: str, published_as: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE questionnaires SET published_at = ?, published_as = ? WHERE id = ?",
            (now(), published_as, questionnaire_id),
        )


def delete(questionnaire_id: str) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            "DELETE FROM questionnaires WHERE id = ?", (questionnaire_id,)
        )
        conn.execute(
            "DELETE FROM questionnaire_versions WHERE questionnaire_id = ?",
            (questionnaire_id,),
        )
        return cursor.rowcount > 0


def versions(questionnaire_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """SELECT id, created_at, created_by, note
               FROM questionnaire_versions
               WHERE questionnaire_id = ? ORDER BY id DESC""",
            (questionnaire_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "createdAt": row["created_at"],
            "createdBy": row["created_by"],
            "note": row["note"],
        }
        for row in rows
    ]


def version_document(questionnaire_id: str, version_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """SELECT document FROM questionnaire_versions
               WHERE questionnaire_id = ? AND id = ?""",
            (questionnaire_id, version_id),
        ).fetchone()
    return json.loads(row["document"]) if row else None


def _snapshot(
    conn: sqlite3.Connection,
    questionnaire_id: str,
    document: dict[str, Any],
    actor: str,
    note: str,
) -> None:
    conn.execute(
        """INSERT INTO questionnaire_versions
           (questionnaire_id, created_at, created_by, note, document)
           VALUES (?, ?, ?, ?, ?)""",
        (questionnaire_id, now(), actor, note, json.dumps(document)),
    )
    conn.execute(
        """DELETE FROM questionnaire_versions
           WHERE questionnaire_id = ? AND id NOT IN (
             SELECT id FROM questionnaire_versions
             WHERE questionnaire_id = ? ORDER BY id DESC LIMIT ?
           )""",
        (questionnaire_id, questionnaire_id, _KEEP_VERSIONS),
    )
