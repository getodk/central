"""Point Studio at a scratch data directory before anything imports its config."""

import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="studio-tests-"))
os.environ.setdefault("STUDIO_DATA_DIR", str(_TMP))
os.environ.setdefault("CENTRAL_API", "http://central.test")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIXTURES = Path(__file__).parent / "fixtures"
