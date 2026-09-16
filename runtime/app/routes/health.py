from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db import get_db
from app.schemas.api import AppError

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request, db: AsyncSession = Depends(get_db)):
    checks = {"postgres": False, "redis": False, "nats": False}
    try:
        await db.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception as exc:
        checks["postgres_error"] = str(exc)
    try:
        checks["redis"] = await request.app.state.cache.ping()
    except Exception as exc:
        checks["redis_error"] = str(exc)
    try:
        checks["nats"] = await request.app.state.bus.ping()
    except Exception as exc:
        checks["nats_error"] = str(exc)

    core = {k: bool(checks.get(k)) for k in ("postgres", "redis", "nats")}
    if all(core.values()):
        return {"status": "ok", "checks": core}
    raise AppError("dependencies not reachable", status_code=503, error="NOT_READY", extra={"checks": checks})
