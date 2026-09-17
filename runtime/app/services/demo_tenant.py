from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import apply_org_guc
from app.logging import get_logger
from app.models.entities import AuditEvent, ExceptionEventRow, Remediation, WorkflowSession
from app.org import DEMO_ORG_ID, DEMO_ORG_TTL_HOURS
from app.schemas.api import ExceptionEvent
from app.seeds.exception_review import INBOX_SEED
from app.seeds.nav_signoff import NAV_SIGNOFF_EVENT
from app.services import exceptions as exception_service
from app.services.cache import Cache

log = get_logger("demo_tenant")

_SWEEP_KEY = "demo_org_sweep"

# Tour row (INBOX_SEED[0] = A-214) then mixed exception-review rows + one nav-signoff.
SEED_EVENTS: list[dict[str, Any]] = [*INBOX_SEED, NAV_SIGNOFF_EVENT]
FAST_INBOX_SIZE = len(SEED_EVENTS)


async def _process_seed_event(db: AsyncSession, org_id: str, raw: dict[str, Any]) -> str:
    snap = await exception_service.process_exception(
        db, ExceptionEvent.model_validate(raw), bus=None, org_id=org_id, actor="seed"
    )
    return snap["sessionId"]


async def _existing_seed_sources(db: AsyncSession, org_id: str) -> set[str]:
    rows = (await db.scalars(select(ExceptionEventRow.source).where(ExceptionEventRow.org_id == org_id))).all()
    return {source for source in rows if source}


async def seed_inbox_for_org(db: AsyncSession, org_id: str) -> list[str]:
    """Seed tour A-214 first (commit), then mixed rows + nav. Idempotent by source."""
    existing = await _existing_seed_sources(db, org_id)
    missing = [raw for raw in SEED_EVENTS if raw["source"] not in existing]
    session_ids: list[str] = []
    for index, raw in enumerate(missing):
        session_ids.append(await _process_seed_event(db, org_id, raw))
        # Persist the tour row before remaining DAGs so a Hobby 504 still leaves A-214.
        if index == 0:
            await db.commit()
            await apply_org_guc(db, org_id)
    return session_ids


async def org_session_count(db: AsyncSession, org_id: str) -> int:
    value = await db.scalar(select(func.count()).select_from(WorkflowSession).where(WorkflowSession.org_id == org_id))
    return int(value or 0)


async def ensure_inbox(db: AsyncSession, org_id: str) -> list[str]:
    existing = await _existing_seed_sources(db, org_id)
    if all(raw["source"] in existing for raw in SEED_EVENTS):
        return []
    ids = await seed_inbox_for_org(db, org_id)
    log.info("demo_inbox_seeded", org_id=org_id, sessions=len(ids), total=FAST_INBOX_SIZE)
    return ids


async def delete_org_runtime_rows(db: AsyncSession, org_id: str) -> None:
    await db.execute(delete(Remediation).where(Remediation.org_id == org_id))
    await db.execute(delete(ExceptionEventRow).where(ExceptionEventRow.org_id == org_id))
    await db.execute(delete(AuditEvent).where(AuditEvent.org_id == org_id))
    await db.execute(delete(WorkflowSession).where(WorkflowSession.org_id == org_id))
    await db.flush()


async def reset_org_inbox(db: AsyncSession, org_id: str) -> dict[str, Any]:
    await delete_org_runtime_rows(db, org_id)
    ids = await seed_inbox_for_org(db, org_id)
    return {"ok": True, "orgId": org_id, "sessions": len(ids)}


async def stale_visitor_org_ids(db: AsyncSession, *, ttl_hours: int = DEMO_ORG_TTL_HOURS) -> list[str]:
    cutoff = datetime.utcnow() - timedelta(hours=ttl_hours)
    rows = (
        await db.execute(
            select(WorkflowSession.org_id)
            .where(WorkflowSession.org_id != DEMO_ORG_ID)
            .group_by(WorkflowSession.org_id)
            .having(func.max(WorkflowSession.updated_at) < cutoff)
        )
    ).all()
    return [row[0] for row in rows if row[0]]


async def sweep_stale_demo_orgs(db: AsyncSession, *, ttl_hours: int = DEMO_ORG_TTL_HOURS) -> int:
    org_ids = await stale_visitor_org_ids(db, ttl_hours=ttl_hours)
    for org_id in org_ids:
        await delete_org_runtime_rows(db, org_id)
    if org_ids:
        log.info("demo_orgs_swept", count=len(org_ids))
    return len(org_ids)


async def maybe_sweep_stale_orgs(db: AsyncSession, cache: Cache, *, ttl_hours: int = DEMO_ORG_TTL_HOURS) -> int:
    if await cache.get(_SWEEP_KEY):
        return 0
    await cache.set(_SWEEP_KEY, "1", ttl=3600)
    return await sweep_stale_demo_orgs(db, ttl_hours=ttl_hours)
