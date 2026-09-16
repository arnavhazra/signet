from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.api import AppError

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request, db: AsyncSession = Depends(get_db)):
    checks = {"postgres": False}
    try:
        await db.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception as exc:
        checks["postgres_error"] = str(exc)

    if checks["postgres"]:
        return {"status": "ok", "checks": checks, "cache": "memory"}
    raise AppError("dependencies not reachable", status_code=503, error="NOT_READY", extra={"checks": checks})
