from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import admin_jwt
from app.db import get_db
from app.schemas.api import CreateWorkflowBody, PreviewBody
from app.seed import bootstrap
from app.services import workflows as workflow_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/seed")
async def seed_demo(
    request: Request,
    _admin: dict = Depends(admin_jwt),
    db: AsyncSession = Depends(get_db),
):
    return await bootstrap(db, request.app.state.cache)


@router.get("/workflows")
async def list_workflows(_admin: dict = Depends(admin_jwt), db: AsyncSession = Depends(get_db)):
    return {"workflows": await workflow_service.list_workflows(db)}


@router.post("/workflows")
async def create_workflow(
    body: CreateWorkflowBody,
    _admin: dict = Depends(admin_jwt),
    db: AsyncSession = Depends(get_db),
):
    definition = body.definition.model_dump(by_alias=True)
    row = await workflow_service.create_workflow(db, body.slug, body.name, definition)
    return workflow_service.workflow_detail(row)


@router.get("/workflows/{workflow_id}")
async def get_workflow(
    workflow_id: UUID,
    _admin: dict = Depends(admin_jwt),
    db: AsyncSession = Depends(get_db),
):
    row = await workflow_service.get_workflow(db, workflow_id)
    return workflow_service.workflow_detail(row)


@router.post("/workflows/{workflow_id}/preview")
async def preview_workflow(
    workflow_id: UUID,
    body: PreviewBody,
    _admin: dict = Depends(admin_jwt),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.preview_workflow(db, workflow_id, body.inputs)


@router.post("/workflows/{workflow_id}/publish")
async def publish_workflow(
    workflow_id: UUID,
    request: Request,
    _admin: dict = Depends(admin_jwt),
    db: AsyncSession = Depends(get_db),
):
    row = await workflow_service.publish_workflow(db, workflow_id, request.app.state.cache)
    return workflow_service.workflow_summary(row)
