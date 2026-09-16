from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.dag import SessionState
from app.models.entities import AuditEvent, Workflow, WorkflowSession, utcnow
from app.schemas.api import AppError
from app.wizard.strip import strip_bindings


def orm_to_state(row: WorkflowSession) -> SessionState:
    return SessionState(
        session_id=str(row.id),
        workflow_id=str(row.workflow_id),
        version=row.version,
        current_node_id=row.current_node_id,
        accumulated_answers=dict(row.accumulated_answers or {}),
        derived=dict(row.derived or {}),
        citations=list(row.citations or []),
        history=list(row.history or []),
        status=row.status,  # type: ignore[arg-type]
        error=row.error,
    )


def apply_state(row: WorkflowSession, state: SessionState) -> None:
    row.current_node_id = state.current_node_id
    row.accumulated_answers = state.accumulated_answers
    row.derived = state.derived
    row.citations = state.citations
    row.history = state.history
    row.status = state.status
    row.error = state.error
    row.updated_at = utcnow()


async def write_audit(db: AsyncSession, session_id: UUID, event_type: str, payload: dict[str, Any]) -> AuditEvent:
    event = AuditEvent(session_id=session_id, event_type=event_type, payload=payload)
    db.add(event)
    await db.flush()
    return event


def current_node_payload(state: SessionState, workflow: Workflow) -> dict[str, Any] | None:
    if state.status != "awaiting_input" or not state.current_node_id:
        return None
    definition = workflow.definition or {}
    node = next((n for n in definition.get("nodes", []) if n.get("id") == state.current_node_id), None)
    if not node:
        return None
    question_id = node.get("questionId")
    step = None
    if question_id:
        step = next((s for s in definition.get("steps", []) if s.get("questionId") == question_id), None)
    if step is None:
        step = next((s for s in definition.get("steps", []) if s.get("questionId") == node.get("id")), None)
    title = (step or {}).get("title") or node.get("name") or node.get("id")
    artifact = (step or {}).get("artifactType") or node.get("artifactType") or node.get("uiArtifact")
    config = _public_ui_config(
        (step or {}).get("config") or node.get("config") or node.get("uiConfig") or {},
        state,
    )
    qid = question_id or node.get("id")
    return {
        "id": node["id"],
        "questionId": qid,
        "title": title,
        "artifactType": artifact,
        "config": config,
        "helperText": (step or {}).get("helperText"),
    }


def _public_ui_config(config: dict[str, Any], state: SessionState) -> dict[str, Any]:
    """Presentation-only config. Bindings never leave the server; facts are filled from kernel state."""
    public = strip_bindings(dict(config) if isinstance(config, dict) else {})
    if not isinstance(public, dict):
        return {}
    summary = public.get("summaryFields")
    if isinstance(summary, list) and not public.get("fields"):
        fields = []
        for key in summary:
            if not isinstance(key, str):
                continue
            if key in state.derived:
                value = state.derived[key]
            else:
                value = state.accumulated_answers.get(key)
            fields.append({"label": key, "value": value})
        if fields:
            public["fields"] = fields
    return public


def snapshot(state: SessionState, workflow: Workflow) -> dict[str, Any]:
    node = current_node_payload(state, workflow)
    citations = []
    for item in state.citations:
        citations.append(
            {
                "source": item.get("source"),
                "recordId": item.get("recordId"),
                "asOf": item.get("asOf"),
            }
        )
    return strip_bindings(
        {
            "sessionId": state.session_id,
            "status": state.status,
            "currentNode": node,
            "accumulatedAnswers": state.accumulated_answers,
            "derived": state.derived,
            "citations": citations,
            "workflowId": str(workflow.id),
            "version": workflow.version,
        }
    )


async def get_session(db: AsyncSession, session_id: UUID) -> WorkflowSession:
    row = await db.get(WorkflowSession, session_id)
    if not row:
        raise AppError("Session not found", status_code=404, error="NOT_FOUND")
    return row
