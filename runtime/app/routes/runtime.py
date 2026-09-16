from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import runtime_api_key
from app.db import get_db
from app.schemas.api import AdvanceBody, ExceptionEvent
from app.services import exceptions as exception_service
from app.services.workflows import get_active_public

router = APIRouter(prefix="/v1", tags=["runtime"])


@router.get("/workflows/{slug}/active")
async def get_active_workflow(
    slug: str,
    request: Request,
    _key: str = Depends(runtime_api_key),
    db: AsyncSession = Depends(get_db),
):
    return await get_active_public(db, request.app.state.cache, slug)


@router.post("/events/exceptions")
async def ingest_exception(
    body: ExceptionEvent,
    request: Request,
    key: str = Depends(runtime_api_key),
    db: AsyncSession = Depends(get_db),
):
    await request.app.state.limiter.hit(key, "exceptions")
    return await exception_service.process_exception(db, body, bus=request.app.state.bus)


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: UUID,
    _key: str = Depends(runtime_api_key),
    db: AsyncSession = Depends(get_db),
):
    return await exception_service.get_session_snapshot(db, session_id)


@router.post("/sessions/{session_id}/advance")
async def advance_session(
    session_id: UUID,
    body: AdvanceBody,
    request: Request,
    key: str = Depends(runtime_api_key),
    db: AsyncSession = Depends(get_db),
):
    await request.app.state.limiter.hit(key, "advance")
    return await exception_service.advance_session(db, session_id, body.inputs)


@router.get("/sessions/{session_id}/audit")
async def get_audit(
    session_id: UUID,
    _key: str = Depends(runtime_api_key),
    db: AsyncSession = Depends(get_db),
):
    return {"events": await exception_service.list_audit(db, session_id)}
