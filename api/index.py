"""Vercel Python entry: FastAPI app from runtime/."""

from __future__ import annotations

import sys
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1] / "runtime"
if str(RUNTIME) not in sys.path:
    sys.path.insert(0, str(RUNTIME))

from app.main import app  # noqa: E402,F401
