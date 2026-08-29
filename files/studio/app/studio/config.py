"""Runtime configuration, read from the environment."""

import os
from dataclasses import dataclass
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # Where central-backend can be reached from inside the Docker network.
    central_api: str = os.environ.get("CENTRAL_API", "http://service:8383").rstrip("/")

    # Path prefix this app is mounted at by nginx. Used to build asset URLs.
    base_path: str = "/" + os.environ.get("STUDIO_BASE_PATH", "studio").strip("/")

    # Directory holding the SQLite database and scratch space for exports.
    data_dir: Path = Path(os.environ.get("STUDIO_DATA_DIR", "/var/lib/odk/studio"))

    # Guard rails for export jobs.
    max_export_rows: int = _int("STUDIO_MAX_EXPORT_ROWS", 2_000_000)
    central_timeout: int = _int("STUDIO_CENTRAL_TIMEOUT", 900)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "studio.sqlite3"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"


settings = Settings()
