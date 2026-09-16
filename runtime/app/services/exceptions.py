from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.dag import DagEngine
from app.engine.nodes import NodeRegistry
from app.logging import get_logger
from app.models.entities import AuditEvent, Workflow, WorkflowSession
from app.otel import get_tracer
from app.schemas.api import AppError, ExceptionEvent
from app.services.nats import EventBus
from app.services.sessions import apply_state, get_session, orm_to_state, snapshot, write_audit
from app.services.tools import ToolGateway
from app.services.workflows import get_published, get_workflow
from app.wizard.resolver import resolve_wizard

log = get_logger("exceptions")
tracer = get_tracer("hitl-runtime")

EXCEPTION_SLUG = "exception-review"


def fingerprint_event(event: dict[str, Any]) -> str:
    blob = json.dumps(event, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _engine_for(db: AsyncSession, session_id: UUID) -> DagEngine:
    tools = ToolGateway(db, session_id)
    return DagEngine(NodeRegistry(tools=tools))


async def process_exception(db: AsyncSession, event: ExceptionEvent, bus: EventBus | None = None) -> dict[str, Any]:
    payload = event.model_dump()
    fp = fingerprint_event(payload)

    existing = await db.scalar(select(WorkflowSession).where(WorkflowSession.event_fingerprint == fp))
    if existing:
        workflow = await get_workflow(db, existing.workflow_id)
        return snapshot(orm_to_state(existing), workflow)

    workflow = await get_published(db, EXCEPTION_SLUG)
    if not workflow:
        raise AppError("Published workflow 'exception-review' not found", status_code=404, error="NOT_FOUND")

    definition = workflow.definition
    entry = definition.get("entryNodeId") or definition["nodes"][0]["id"]
    row = WorkflowSession(
        workflow_id=workflow.id,
        version=workflow.version,
        status="created",
        current_node_id=entry,
        accumulated_answers=payload,
        derived={},
        citations=[],
        history=[],
        event_fingerprint=fp,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raced = await db.scalar(select(WorkflowSession).where(WorkflowSession.event_fingerprint == fp))
        if not raced:
            raise
        workflow = await get_workflow(db, raced.workflow_id)
        return snapshot(orm_to_state(raced), workflow)

    await write_audit(db, row.id, "session.created", payload)
    if bus is not None:
        try:
            await bus.publish_exception(payload)
        except Exception as exc:
            log.warning("nats_publish_failed", error=str(exc))

    engine = _engine_for(db, row.id)
    state = orm_to_state(row)
    result = await engine.start(definition, state)
    apply_state(row, result.session)
    await db.flush()
    await write_audit(
        db,
        row.id,
        "dag.halt" if result.status == "awaiting_input" else f"session.{result.status}",
        {"status": result.status, "currentNodeId": result.session.current_node_id, "history": result.session.history},
    )
    log.info("exception_processed", session_id=str(row.id), status=result.status)
    return snapshot(result.session, workflow)


async def consume_exception_payload(db: AsyncSession, payload: dict[str, Any], bus: EventBus | None = None) -> dict[str, Any]:
    with tracer.start_as_current_span("queue.consume") as span:
        span.set_attribute("messaging.system", "nats")
        span.set_attribute("messaging.destination", "exceptions.received")
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


async def advance_session(db: AsyncSession, session_id: UUID, inputs: dict[str, Any]) -> dict[str, Any]:
    row = await get_session(db, session_id)
    if row.status in {"completed", "failed"}:
        raise AppError("Session is already terminal", status_code=409, error="TERMINAL_SESSION")
    workflow = await db.get(Workflow, row.workflow_id)
    if not workflow:
        raise AppError("Workflow version gone", status_code=410, error="WIZARD_VERSION_GONE")

    inputs = alias_question_inputs(workflow.definition or {}, row.current_node_id, inputs)
    await write_audit(db, row.id, "input.received", {"inputs": inputs})
    state = orm_to_state(row)
    merged = {**state.accumulated_answers, **inputs}
    try:
        resolved = resolve_wizard(workflow.definition, merged)
        state.derived = {**state.derived, **resolved.get("derived", {}), "filters": resolved.get("filters"), "query": resolved.get("query")}
    except AppError:
        # Bindings may require future steps; merge raw inputs and continue the DAG.
        pass
    state.accumulated_answers = merged
    engine = _engine_for(db, row.id)
    result = await engine.advance(state, workflow.definition, {})
    apply_state(row, result.session)
    await db.flush()
    await write_audit(
        db,
        row.id,
        "session.advanced",
        {"status": result.status, "currentNodeId": result.session.current_node_id, "history": result.session.history},
    )
    return snapshot(result.session, workflow)


async def get_session_snapshot(db: AsyncSession, session_id: UUID) -> dict[str, Any]:
    row = await get_session(db, session_id)
    workflow = await db.get(Workflow, row.workflow_id)
    if not workflow:
        raise AppError("Workflow version gone", status_code=410, error="WIZARD_VERSION_GONE")
    return snapshot(orm_to_state(row), workflow)


async def list_audit(db: AsyncSession, session_id: UUID) -> list[dict[str, Any]]:
    await get_session(db, session_id)
    rows = (
        await db.scalars(
            select(AuditEvent).where(AuditEvent.session_id == session_id).order_by(AuditEvent.created_at.asc())
        )
    ).all()
    return [
        {
            "id": str(r.id),
            "eventType": r.event_type,
            "payload": r.payload,
            "createdAt": r.created_at.isoformat() + "Z",
        }
        for r in rows
    ]
