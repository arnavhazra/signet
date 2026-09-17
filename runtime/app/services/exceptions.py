from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.dag import DagEngine
from app.engine.nodes import NodeRegistry
from app.logging import get_logger
from app.models.entities import AuditEvent, ExceptionEventRow, Workflow, WorkflowSession
from app.org import CHECKER_ADVANCE_ROLES, DEFAULT_WORKFLOW_SLUG, DEMO_ORG_ID
from app.otel import get_tracer
from app.schemas.api import AppError, ExceptionEvent
from app.services.sessions import (
    apply_state,
    get_session,
    inbox_status,
    is_checker_node,
    iso_z,
    orm_to_state,
    parse_iso,
    snapshot,
    write_audit,
)
from app.services.tools import ToolGateway
from app.services.workflows import get_published, get_workflow
from app.wizard.resolver import resolve_wizard
from app.wizard.strip import strip_bindings

log = get_logger("exceptions")
tracer = get_tracer("signet-runtime")


def fingerprint_event(event: dict[str, Any]) -> str:
    blob = json.dumps(event, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _engine_for(db: AsyncSession, session_id: UUID, org_id: str) -> DagEngine:
    tools = ToolGateway(db, session_id, org_id=org_id)
    return DagEngine(NodeRegistry(tools=tools))


async def _snapshot_row(db: AsyncSession, row: WorkflowSession) -> dict[str, Any]:
    workflow = await get_workflow(db, row.workflow_id)
    return snapshot(orm_to_state(row), workflow, row)


async def _replay_existing(
    db: AsyncSession,
    *,
    org_id: str,
    source: str | None = None,
    idempotency_key: str | None = None,
    fingerprint: str | None = None,
) -> dict[str, Any] | None:
    outbox = None
    if idempotency_key:
        outbox = await db.scalar(
            select(ExceptionEventRow).where(
                ExceptionEventRow.org_id == org_id,
                ExceptionEventRow.idempotency_key == idempotency_key,
            )
        )
    if outbox is None and source:
        outbox = await db.scalar(
            select(ExceptionEventRow).where(
                ExceptionEventRow.org_id == org_id,
                ExceptionEventRow.source == source,
            )
        )
    if outbox and outbox.session_id:
        row = await db.get(WorkflowSession, outbox.session_id)
        if row:
            return await _snapshot_row(db, row)
    if fingerprint:
        existing = await db.scalar(
            select(WorkflowSession).where(
                WorkflowSession.org_id == org_id,
                WorkflowSession.event_fingerprint == fingerprint,
            )
        )
        if existing:
            return await _snapshot_row(db, existing)
    return None


async def process_exception(
    db: AsyncSession,
    event: ExceptionEvent,
    bus: Any | None = None,
    *,
    org_id: str = DEMO_ORG_ID,
    idempotency_key: str | None = None,
    actor: str | None = None,
) -> dict[str, Any]:
    del bus  # Hobby path is inline; Redis/NATS are not used in production.
    payload = event.model_dump()
    fp = fingerprint_event(payload)

    replay = await _replay_existing(
        db,
        org_id=org_id,
        source=event.source,
        idempotency_key=idempotency_key,
        fingerprint=fp,
    )
    if replay:
        return replay

    slug = event.workflowSlug or DEFAULT_WORKFLOW_SLUG
    workflow = await get_published(db, slug)
    if not workflow:
        raise AppError(f"Published workflow '{slug}' not found", status_code=404, error="NOT_FOUND")

    definition = workflow.definition
    entry = definition.get("entryNodeId") or definition["nodes"][0]["id"]
    row = WorkflowSession(
        org_id=org_id,
        workflow_id=workflow.id,
        version=workflow.version,
        status="created",
        current_node_id=entry,
        accumulated_answers=payload,
        derived={},
        citations=[],
        history=[],
        event_fingerprint=fp,
        lock_version=0,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        replay = await _replay_existing(db, org_id=org_id, source=event.source, fingerprint=fp)
        if replay:
            return replay
        raise

    outbox = ExceptionEventRow(
        org_id=org_id,
        source=event.source,
        idempotency_key=idempotency_key,
        payload=payload,
        session_id=row.id,
    )
    db.add(outbox)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        replay = await _replay_existing(
            db,
            org_id=org_id,
            source=event.source,
            idempotency_key=idempotency_key,
            fingerprint=fp,
        )
        if replay:
            return replay
        raise

    await write_audit(db, row.id, "session.created", payload, actor=actor, org_id=org_id)

    engine = _engine_for(db, row.id, org_id)
    state = orm_to_state(row)
    result = await engine.start(definition, state)
    apply_state(row, result.session)
    await db.flush()
    await write_audit(
        db,
        row.id,
        "dag.halt" if result.status == "awaiting_input" else f"session.{result.status}",
        {"status": result.status, "currentNodeId": result.session.current_node_id, "history": result.session.history},
        actor=actor,
        org_id=org_id,
    )
    log.info("exception_processed", session_id=str(row.id), status=result.status, slug=slug)
    return snapshot(result.session, workflow, row)


async def consume_exception_payload(db: AsyncSession, payload: dict[str, Any], bus: Any | None = None) -> dict[str, Any]:
    with tracer.start_as_current_span("queue.consume") as span:
        span.set_attribute("messaging.system", "outbox")
        span.set_attribute("messaging.destination", "exception_events")
        event = ExceptionEvent.model_validate(payload)
        return await process_exception(db, event, bus=None)


def alias_question_inputs(definition: dict[str, Any], current_node_id: str | None, inputs: dict[str, Any]) -> dict[str, Any]:
    """Clients may key advance inputs by DAG node id or wizard questionId."""
    out = dict(inputs)
    if not current_node_id:
        return out
    node = next((n for n in definition.get("nodes", []) if n.get("id") == current_node_id), None)
    if not node:
        return out
    qid = node.get("questionId")
    nid = node.get("id")
    if qid and nid in out and qid not in out:
        out[qid] = out[nid]
    return out


def _tokens_match(expected: str, row: WorkflowSession) -> bool:
    current = iso_z(row.updated_at)
    if expected == current:
        return True
    try:
        return parse_iso(expected) == (row.updated_at.replace(tzinfo=None) if row.updated_at else None)
    except ValueError:
        return expected == str(row.lock_version)


async def advance_session(
    db: AsyncSession,
    session_id: UUID,
    inputs: dict[str, Any],
    *,
    expected_updated_at: str | None = None,
    actor: str | None = None,
    org_id: str = DEMO_ORG_ID,
) -> dict[str, Any]:
    row = await get_session(db, session_id, org_id=org_id)
    if expected_updated_at and not _tokens_match(expected_updated_at, row):
        raise AppError("Session changed", status_code=409, error="CONFLICT")
    if row.status in {"completed", "failed"}:
        raise AppError("Session is already terminal", status_code=409, error="TERMINAL_SESSION")
    if is_checker_node(row.current_node_id) and actor not in CHECKER_ADVANCE_ROLES:
        raise AppError("checker role required", status_code=403, error="FORBIDDEN")
    workflow = await db.get(Workflow, row.workflow_id)
    if not workflow:
        raise AppError("Workflow version gone", status_code=410, error="WIZARD_VERSION_GONE")

    inputs = alias_question_inputs(workflow.definition or {}, row.current_node_id, inputs)
    await write_audit(
        db,
        row.id,
        "human.decision",
        {"inputs": inputs, "nodeId": row.current_node_id},
        actor=actor,
        org_id=org_id,
    )
    state = orm_to_state(row)
    merged = {**state.accumulated_answers, **inputs}
    try:
        resolved = resolve_wizard(workflow.definition, merged)
        state.derived = {
            **state.derived,
            **resolved.get("derived", {}),
            "filters": resolved.get("filters"),
            "query": resolved.get("query"),
        }
    except AppError:
        pass
    state.accumulated_answers = merged
    engine = _engine_for(db, row.id, org_id)
    result = await engine.advance(state, workflow.definition, {})
    apply_state(row, result.session)
    await db.flush()
    await write_audit(
        db,
        row.id,
        "session.advanced",
        {"status": result.status, "currentNodeId": result.session.current_node_id, "history": result.session.history},
        actor=actor,
        org_id=org_id,
    )
    return snapshot(result.session, workflow, row)


async def get_session_snapshot(db: AsyncSession, session_id: UUID, org_id: str = DEMO_ORG_ID) -> dict[str, Any]:
    row = await get_session(db, session_id, org_id=org_id)
    workflow = await db.get(Workflow, row.workflow_id)
    if not workflow:
        raise AppError("Workflow version gone", status_code=410, error="WIZARD_VERSION_GONE")
    return snapshot(orm_to_state(row), workflow, row)


async def list_audit(db: AsyncSession, session_id: UUID, org_id: str = DEMO_ORG_ID) -> list[dict[str, Any]]:
    await get_session(db, session_id, org_id=org_id)
    rows = (
        await db.scalars(
            select(AuditEvent)
            .where(AuditEvent.session_id == session_id, AuditEvent.org_id == org_id)
            .order_by(AuditEvent.created_at.asc())
        )
    ).all()
    return [_audit_dict(r) for r in rows]


def _audit_dict(row: AuditEvent) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "sessionId": str(row.session_id) if row.session_id else None,
        "eventType": row.event_type,
        "actor": row.actor,
        "payload": row.payload,
        "createdAt": iso_z(row.created_at),
    }


async def list_inbox(db: AsyncSession, org_id: str = DEMO_ORG_ID) -> list[dict[str, Any]]:
    rows = (
        await db.scalars(
            select(WorkflowSession)
            .where(WorkflowSession.org_id == org_id)
            .order_by(WorkflowSession.created_at.desc())
        )
    ).all()
    if not rows:
        return []
    workflow_ids = {r.workflow_id for r in rows}
    workflows = {
        w.id: w
        for w in (await db.scalars(select(Workflow).where(Workflow.id.in_(workflow_ids)))).all()
    }

    def rank(item: dict[str, Any]) -> tuple[int, str]:
        status = item["status"]
        order = 0 if status == "awaiting_checker" else 1 if status == "open" else 2
        return (order, item["createdAt"] or "")

    items = []
    for row in rows:
        answers = row.accumulated_answers or {}
        derived = row.derived or {}
        workflow = workflows.get(row.workflow_id)
        delta = derived.get("delta", answers.get("delta"))
        try:
            delta_n = float(delta) if delta is not None else 0.0
        except (TypeError, ValueError):
            delta_n = 0.0
        status = inbox_status(row)
        items.append(
            {
                "sessionId": str(row.id),
                "accountId": answers.get("accountId") or "",
                "securityId": answers.get("securityId") or "",
                "bookQty": answers.get("bookQty"),
                "custodianQty": answers.get("custodianQty"),
                "delta": delta_n,
                "asOf": answers.get("asOf") or "",
                "status": status,
                "awaitingChecker": status == "awaiting_checker",
                "createdAt": iso_z(row.created_at),
                "workflowSlug": workflow.slug if workflow else "",
            }
        )
    items.sort(key=rank)
    return items


async def search_audit(
    db: AsyncSession,
    *,
    account_id: str | None = None,
    event_type: str | None = None,
    session_id: str | None = None,
    org_id: str = DEMO_ORG_ID,
) -> list[dict[str, Any]]:
    stmt = (
        select(AuditEvent)
        .outerjoin(WorkflowSession, AuditEvent.session_id == WorkflowSession.id)
        .where(AuditEvent.org_id == org_id)
    )
    if session_id:
        stmt = stmt.where(AuditEvent.session_id == UUID(session_id))
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    if account_id:
        stmt = stmt.where(
            or_(
                AuditEvent.payload["accountId"].as_string() == account_id,
                WorkflowSession.accumulated_answers["accountId"].as_string() == account_id,
            )
        )
    stmt = stmt.order_by(AuditEvent.created_at.desc()).limit(200)
    rows = (await db.scalars(stmt)).all()
    return [_audit_dict(r) for r in rows]


async def get_replay(db: AsyncSession, session_id: UUID, org_id: str = DEMO_ORG_ID) -> dict[str, Any]:
    row = await get_session(db, session_id, org_id=org_id)
    workflow = await db.get(Workflow, row.workflow_id)
    if not workflow:
        raise AppError("Workflow version gone", status_code=410, error="WIZARD_VERSION_GONE")
    citations = []
    for item in row.citations or []:
        citations.append(
            {
                "source": item.get("source"),
                "recordId": item.get("recordId"),
                "asOf": item.get("asOf"),
            }
        )
    return {
        "workflowId": str(workflow.id),
        "version": workflow.version,
        "slug": workflow.slug,
        "stripped": strip_bindings(workflow.definition),
        "citations": citations,
        "accumulatedAnswers": row.accumulated_answers or {},
        "derived": row.derived or {},
        "createdAt": iso_z(row.created_at),
        "sessionId": str(row.id),
        "status": row.status,
    }
