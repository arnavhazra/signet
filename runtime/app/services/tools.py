from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.logging import get_logger
from app.models.entities import AuditEvent, Remediation
from app.org import DEMO_ORG_ID
from app.otel import get_tracer
from app.schemas.api import AppError

log = get_logger("tools")
tracer = get_tracer("hitl-runtime")

ALLOWED_TOOLS = frozenset({"attach_citations", "write_remediation", "close_exception"})


class ToolGateway:
    """Allowlisted tools only. Every mutating call writes an audit row first."""

    def __init__(self, db: AsyncSession, session_id: UUID):
        self.db = db
        self.session_id = session_id

    async def call(self, name: str, accumulated: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        with tracer.start_as_current_span("tool.call") as span:
            span.set_attribute("tool.name", name)
            if name not in ALLOWED_TOOLS:
                await self._audit("tool.denied", {"tool": name})
                raise AppError(f"tool not allowlisted: {name}", status_code=403, error="TOOL_IAM")
            audit = await self._audit("tool.invoked", {"tool": name, "params": params})
            handler = getattr(self, f"_{name}")
            result = await handler(accumulated, params, audit.id)
            await self._audit("tool.completed", {"tool": name, "result_keys": list(result.keys())})
            log.info("tool_completed", tool=name, session_id=str(self.session_id))
            return result

    async def _audit(self, event_type: str, payload: dict[str, Any]) -> AuditEvent:
        event = AuditEvent(session_id=self.session_id, event_type=event_type, payload=payload, org_id=DEMO_ORG_ID)
        self.db.add(event)
        await self.db.flush()
        if event.id is None:
            raise AppError("audit write failed; refusing tool side effect", status_code=500, error="AUDIT_REQUIRED")
        return event

    async def _attach_citations(self, accumulated: dict[str, Any], _params: dict[str, Any], _audit_id) -> dict[str, Any]:
        account = accumulated.get("accountId")
        security = accumulated.get("securityId")
        as_of = accumulated.get("asOf")
        citations = [
            {"source": "book_ledger", "recordId": f"pos-book-{account}-{security}", "asOf": as_of},
            {"source": "custodian_feed", "recordId": f"pos-cust-{account}-{security}", "asOf": as_of},
        ]
        return {"citations": citations}

    async def _write_remediation(self, accumulated: dict[str, Any], _params: dict[str, Any], audit_id) -> dict[str, Any]:
        # Never skip audit: remediation row is FK-bound to the tool.invoked audit event.
        row = Remediation(
            session_id=self.session_id,
            audit_event_id=audit_id,
            org_id=DEMO_ORG_ID,
            account_id=str(accumulated.get("accountId")),
            security_id=str(accumulated.get("securityId")),
            book_qty=float(accumulated.get("bookQty")),
            custodian_qty=float(accumulated.get("custodianQty")),
            delta=float(accumulated.get("delta")),
            action="accept_adjustment",
        )
        self.db.add(row)
        await self.db.flush()
        await self._audit(
            "remediation.written",
            {"remediationId": str(row.id), "auditEventId": str(audit_id), "delta": row.delta},
        )
        return {"outcome": "accepted", "remediationId": str(row.id)}

    async def _close_exception(self, accumulated: dict[str, Any], params: dict[str, Any], _audit_id) -> dict[str, Any]:
        outcome = params.get("outcome") or "closed"
        reason = accumulated.get("reason")
        return {"outcome": outcome, "reason": reason}
