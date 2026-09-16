from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from app.engine.eval import EvalError, evaluate
from app.engine.linter import assert_valid_workflow
from app.engine.nodes import NodeRegistry
from app.logging import get_logger
from app.otel import get_tracer

log = get_logger("engine.dag")
tracer = get_tracer("hitl-runtime")

MAX_HOPS = 100
NODE_TIMEOUT_MS = 8000

SessionStatus = Literal["created", "active", "awaiting_input", "completed", "failed"]


@dataclass
class SessionState:
    session_id: str
    workflow_id: str
    version: int
    current_node_id: str | None
    accumulated_answers: dict[str, Any] = field(default_factory=dict)
    derived: dict[str, Any] = field(default_factory=dict)
    citations: list[dict[str, Any]] = field(default_factory=list)
    history: list[str] = field(default_factory=list)
    status: SessionStatus = "created"
    error: str | None = None
    lock_version: int = 0
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class EngineResponse:
    status: SessionStatus
    session: SessionState
    ui_node: dict[str, Any] | None = None
    error: str | None = None


class DagEngine:
    """Stateless DAG runner. Sessions live in the store, not on this object."""

    def __init__(self, registry: NodeRegistry):
        self.registry = registry

    async def start(self, definition: dict[str, Any], session: SessionState) -> EngineResponse:
        assert_valid_workflow(definition)
        entry = definition.get("entryNodeId") or (definition["nodes"][0]["id"] if definition.get("nodes") else None)
        if not entry:
            raise ValueError("WorkflowDefinition has no nodes")
        session.current_node_id = entry
        session.status = "created"
        return await self.advance(session, definition, {})

    async def advance(
        self,
        session: SessionState,
        definition: dict[str, Any],
        user_inputs: dict[str, Any],
    ) -> EngineResponse:
        accumulated = {**session.accumulated_answers, **user_inputs}
        derived = {**session.derived}
        citations = list(session.citations)
        current_node_id = session.current_node_id
        history = list(session.history)
        hops = 0

        try:
            if session.status == "created":
                entry_def = _find_node(current_node_id, definition)
                entry_node = self.registry.create(entry_def)
                if entry_node.is_ui_node():
                    return EngineResponse(
                        status="awaiting_input",
                        ui_node=entry_def,
                        session=_build(session, current_node_id, accumulated, derived, citations, history + [current_node_id], "awaiting_input"),
                    )
                result = await self._execute(entry_node, accumulated)
                accumulated, derived, citations = _merge(accumulated, derived, citations, result)
                history.append(current_node_id)

            while True:
                hops += 1
                if hops > MAX_HOPS:
                    raise RuntimeError(
                        f'Infinite loop detected: traversal exceeded {MAX_HOPS} hops at node "{current_node_id}"'
                    )
                next_edge = self.resolve_next_edge(current_node_id, accumulated, definition)
                if not next_edge:
                    return EngineResponse(
                        status="completed",
                        session=_build(session, current_node_id, accumulated, derived, citations, history, "completed"),
                    )
                next_def = _find_node(next_edge["to"], definition)
                next_node = self.registry.create(next_def)
                if next_node.is_ui_node():
                    history.append(next_node.id)
                    return EngineResponse(
                        status="awaiting_input",
                        ui_node=next_def,
                        session=_build(session, next_node.id, accumulated, derived, citations, history, "awaiting_input"),
                    )
                result = await self._execute(next_node, accumulated)
                accumulated, derived, citations = _merge(accumulated, derived, citations, result)
                history.append(next_node.id)
                current_node_id = next_node.id
        except Exception as exc:
            log.error("dag_failed", error=str(exc), node_id=current_node_id)
            failed = _build(session, current_node_id, accumulated, derived, citations, history, "failed")
            failed.error = str(exc)
            return EngineResponse(status="failed", error=str(exc), session=failed)

    def resolve_next_edge(
        self,
        current_node_id: str | None,
        accumulated_answers: dict[str, Any],
        definition: dict[str, Any],
    ) -> dict[str, Any] | None:
        outgoing = [e for e in definition.get("edges", []) if e.get("from") == current_node_id]
        if not outgoing:
            return None
        for edge in outgoing:
            cond = edge.get("condition")
            if not cond:
                continue
            try:
                result = evaluate(cond, accumulated_answers)
            except EvalError as exc:
                raise RuntimeError(
                    f'Condition could not be evaluated on edge ({edge.get("from")} → {edge.get("to")}).\n'
                    f'  Condition  : "{cond}"\n'
                    f"  Scope keys : {list(accumulated_answers.keys())}\n"
                    f"  Error      : {exc}"
                ) from exc
            if result is True:
                log.info("edge_condition_true", condition=cond, to=edge.get("to"))
                return edge
        fallback = next((e for e in outgoing if not e.get("condition")), None)
        if fallback:
            log.info("edge_fallback", to=fallback.get("to"))
        return fallback

    async def _execute(self, node, inputs: dict[str, Any]) -> dict[str, Any]:
        with tracer.start_as_current_span("dag.node") as span:
            span.set_attribute("dag.node.id", node.id)
            span.set_attribute("dag.node.type", "ui" if node.is_ui_node() else "logic")
            try:
                return await asyncio.wait_for(node.execute(inputs), timeout=NODE_TIMEOUT_MS / 1000)
            except TimeoutError as exc:
                raise RuntimeError(f'Node "{node.id}" timed out after {NODE_TIMEOUT_MS}ms') from exc


def _find_node(node_id: str | None, definition: dict[str, Any]) -> dict[str, Any]:
    for node in definition.get("nodes", []):
        if node.get("id") == node_id:
            return node
    ids = [n.get("id") for n in definition.get("nodes", [])]
    raise RuntimeError(f'Node "{node_id}" not found. Available IDs: {ids}')


def _merge(
    accumulated: dict[str, Any],
    derived: dict[str, Any],
    citations: list[dict[str, Any]],
    result: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    accumulated = {**accumulated, **result}
    derived = {**derived, **{k: v for k, v in result.items() if k != "citations"}}
    if "citations" in result and isinstance(result["citations"], list):
        citations = list(result["citations"])
    return accumulated, derived, citations


def _build(
    base: SessionState,
    current_node_id: str | None,
    accumulated: dict[str, Any],
    derived: dict[str, Any],
    citations: list[dict[str, Any]],
    history: list[str],
    status: SessionStatus,
) -> SessionState:
    return SessionState(
        session_id=base.session_id,
        workflow_id=base.workflow_id,
        version=base.version,
        current_node_id=current_node_id,
        accumulated_answers=accumulated,
        derived=derived,
        citations=citations,
        history=history,
        status=status,
        error=None,
        lock_version=base.lock_version,
        updated_at=datetime.now(timezone.utc),
    )
