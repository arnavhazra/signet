from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.linter import lint_workflow
from app.models.entities import Workflow, utcnow
from app.schemas.api import AppError
from app.services.cache import Cache
from app.wizard.resolver import resolve_wizard
from app.wizard.strip import public_steps, strip_bindings
from app.wizard.validate import validate_definition

ACTIVE_TTL = 60


def active_cache_key(slug: str) -> str:
    return f"workflow:active:{slug}"


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")


def workflow_summary(row: Workflow) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "slug": row.slug,
        "name": row.name,
        "version": row.version,
        "status": row.status,
        "createdAt": _iso(row.created_at),
        "publishedAt": _iso(row.published_at),
    }


def workflow_detail(row: Workflow) -> dict[str, Any]:
    return {**workflow_summary(row), "definition": row.definition}


async def list_workflows(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (await db.scalars(select(Workflow).order_by(Workflow.slug.asc(), Workflow.version.desc()))).all()
    return [workflow_summary(r) for r in rows]


async def get_workflow(db: AsyncSession, workflow_id: UUID) -> Workflow:
    row = await db.get(Workflow, workflow_id)
    if not row:
        raise AppError("Workflow not found", status_code=404, error="NOT_FOUND")
    return row


async def create_workflow(db: AsyncSession, slug: str, name: str, definition: dict[str, Any]) -> Workflow:
    issues = validate_definition(definition)
    if issues:
        raise AppError("Invalid workflow definition", status_code=400, error="VALIDATION", extra={"issues": issues})
    latest = await db.scalar(
        select(Workflow.version).where(Workflow.slug == slug).order_by(Workflow.version.desc()).limit(1)
    )
    version = (latest or 0) + 1
    row = Workflow(slug=slug, name=name, version=version, status="draft", definition=definition)
    db.add(row)
    await db.flush()
    return row


async def preview_workflow(db: AsyncSession, workflow_id: UUID, inputs: dict[str, Any]) -> dict[str, Any]:
    row = await get_workflow(db, workflow_id)
    lint = lint_workflow(row.definition)
    resolved = resolve_wizard(row.definition, inputs)
    return {
        **resolved,
        "warnings": [w["message"] for w in lint["warnings"]],
        "workflowId": str(row.id),
        "version": row.version,
    }


async def publish_workflow(db: AsyncSession, workflow_id: UUID, cache: Cache) -> Workflow:
    row = await get_workflow(db, workflow_id)
    if row.status != "draft":
        raise AppError("Only draft workflows can be published", status_code=400, error="INVALID_STATUS")
    issues = validate_definition(row.definition)
    if issues:
        raise AppError("Publish validation failed", status_code=400, error="VALIDATION", extra={"issues": issues})

    current = await db.scalar(
        select(Workflow).where(Workflow.slug == row.slug, Workflow.status == "published")
    )
    if current and current.id != row.id:
        current.status = "archived"
        current.updated_at = utcnow()
    row.status = "published"
    row.published_at = utcnow()
    row.updated_at = utcnow()
    await db.flush()
    await cache.delete(active_cache_key(row.slug))
    return row


async def get_published(db: AsyncSession, slug: str) -> Workflow | None:
    return await db.scalar(select(Workflow).where(Workflow.slug == slug, Workflow.status == "published"))


async def get_active_public(db: AsyncSession, cache: Cache, slug: str) -> dict[str, Any]:
    cached = await cache.get(active_cache_key(slug))
    if cached:
        return json.loads(cached)
    row = await get_published(db, slug)
    if not row:
        raise AppError("No published workflow for this slug", status_code=404, error="NOT_FOUND")
    payload = strip_bindings(
        {
            "workflowId": str(row.id),
            "version": row.version,
            "slug": row.slug,
            "name": row.name,
            "steps": public_steps(row.definition.get("steps") or []),
        }
    )
    await cache.set(active_cache_key(slug), json.dumps(payload), ttl=ACTIVE_TTL)
    return payload
