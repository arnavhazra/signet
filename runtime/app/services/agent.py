from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Principal
from app.config import Settings
from app.org import DEFAULT_WORKFLOW_SLUG, DEMO_ORG_ID
from app.schemas.api import AppError, ExceptionEvent, ProposeBody
from app.seeds.exception_review import HIGH_DELTA_EXCEPTION
from app.services import exceptions as exception_service
from app.services.agent_llm import parse_deterministic, parse_proposal
from app.services.policy import classify_intent, evaluate_policy, normalize_intent
from app.services.sessions import write_audit

_DEFAULT_EVENT = HIGH_DELTA_EXCEPTION


def _merge_proposal(body: ProposeBody, parsed: dict[str, Any] | None) -> dict[str, Any]:
    base = {
        "intent": "unknown",
        "accountId": None,
        "params": {},
        "rationale": None,
        "text": None,
    }
    if parsed:
        base.update({k: parsed.get(k) for k in base})
    if body.intent and not (body.text and body.text.strip()):
        base["intent"] = normalize_intent(body.intent)
    elif body.intent and parsed and parsed.get("intent") == "unknown":
        base["intent"] = normalize_intent(body.intent)
    elif body.intent and not parsed:
        base["intent"] = normalize_intent(body.intent)
    if body.accountId:
        base["accountId"] = body.accountId
    if body.params:
        merged = dict(base.get("params") or {})
        merged.update(body.params)
        base["params"] = merged
    if body.rationale:
        base["rationale"] = body.rationale
    if body.text and body.text.strip():
        base["text"] = body.text.strip()
    base["intent"] = normalize_intent(str(base.get("intent") or "unknown"))
    params = base.get("params") if isinstance(base.get("params"), dict) else {}
    base["params"] = params
    return base


async def resolve_typed_proposal(body: ProposeBody, settings: Settings) -> dict[str, Any]:
    parsed = None
    if body.text and body.text.strip():
        parsed = await parse_proposal(body.text, settings)
    elif body.intent:
        parsed = parse_deterministic(body.intent)
        parsed["intent"] = normalize_intent(body.intent)
        parsed["text"] = None
    return _merge_proposal(body, parsed)


def _delta_from_snapshot(snap: dict[str, Any] | None) -> float | None:
    if not snap:
        return None
    derived = snap.get("derived") or {}
    value = derived.get("delta")
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


async def find_session_for_account(
    db: AsyncSession, org_id: str, account_id: str
) -> dict[str, Any] | None:
    items = await exception_service.list_inbox(db, org_id=org_id)
    matches = [row for row in items if row.get("accountId") == account_id]
    if not matches:
        return None
    open_rows = [row for row in matches if row.get("status") != "done"]
    pool = open_rows or matches
    pool.sort(key=lambda row: abs(float(row.get("delta") or 0)), reverse=True)
    session_id = UUID(str(pool[0]["sessionId"]))
    return await exception_service.get_session_snapshot(db, session_id, org_id=org_id)


def _event_from_proposal(proposal: dict[str, Any]) -> ExceptionEvent:
    params = proposal.get("params") or {}
    account = proposal.get("accountId") or params.get("accountId") or _DEFAULT_EVENT["accountId"]
    security = str(params.get("securityId") or _DEFAULT_EVENT["securityId"])
    return ExceptionEvent(
        accountId=str(account),
        securityId=security,
        bookQty=float(params.get("bookQty") if params.get("bookQty") is not None else _DEFAULT_EVENT["bookQty"]),
        custodianQty=float(
            params.get("custodianQty") if params.get("custodianQty") is not None else _DEFAULT_EVENT["custodianQty"]
        ),
        asOf=str(params.get("asOf") or _DEFAULT_EVENT["asOf"]),
        source=str(params.get("source") or f"agent-propose:{account}:{security}"),
        workflowSlug=str(params.get("workflowSlug") or DEFAULT_WORKFLOW_SLUG),
    )


async def _open_write_session(
    db: AsyncSession,
    *,
    org_id: str,
    proposal: dict[str, Any],
    actor: str | None,
) -> dict[str, Any]:
    account_id = proposal.get("accountId")
    if account_id:
        existing = await find_session_for_account(db, org_id, str(account_id))
        if existing:
            return existing
    event = _event_from_proposal(proposal)
    if not proposal.get("accountId"):
        proposal["accountId"] = event.accountId
    existing = await find_session_for_account(db, org_id, event.accountId)
    if existing:
        return existing
    return await exception_service.process_exception(
        db, event, bus=None, org_id=org_id, actor=actor
    )


def _public_proposal(proposal: dict[str, Any], result: Any | None = None) -> dict[str, Any]:
    out = {
        "intent": proposal.get("intent"),
        "accountId": proposal.get("accountId"),
        "params": proposal.get("params") or {},
        "rationale": proposal.get("rationale"),
    }
    if proposal.get("text"):
        out["text"] = proposal["text"]
    if result is not None:
        out["result"] = result
    return out


def _response(
    *,
    decision: str,
    policy: dict[str, Any],
    audit_id,
    proposal: dict[str, Any],
    session_id: str | None = None,
    approval_url: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "decision": decision,
        "policy": policy,
        "auditEventId": str(audit_id),
        "proposal": proposal,
    }
    if session_id:
        body["sessionId"] = session_id
    if approval_url:
        body["approvalUrl"] = approval_url
    return body


async def propose(
    db: AsyncSession,
    body: ProposeBody,
    *,
    principal: Principal,
    settings: Settings,
) -> dict[str, Any]:
    proposal = await resolve_typed_proposal(body, settings)
    intent = str(proposal.get("intent") or "unknown")
    kind = classify_intent(intent)
    actor = principal.role
    org_id = principal.org_id or DEMO_ORG_ID

    if kind == "write" and not principal.can_mutate:
        raise AppError("Auditor role is read-only", status_code=403, error="FORBIDDEN")

    if kind == "unknown":
        verdict = evaluate_policy(intent)
        audit = await write_audit(
            db,
            None,
            "agent.denied",
            {
                "intent": intent,
                "accountId": proposal.get("accountId"),
                "params": proposal.get("params") or {},
                "rationale": proposal.get("rationale"),
                "decision": "denied",
            },
            actor=actor,
            org_id=org_id,
        )
        return _response(
            decision="denied",
            policy=verdict["policy"],
            audit_id=audit.id,
            proposal=_public_proposal(proposal),
        )

    if kind == "read":
        result: Any
        session_snap = None
        if intent == "list_exceptions":
            result = {"items": await exception_service.list_inbox(db, org_id=org_id)}
        else:
            account_id = proposal.get("accountId")
            session_snap = (
                await find_session_for_account(db, org_id, str(account_id)) if account_id else None
            )
            if session_snap:
                result = {
                    "found": True,
                    "sessionId": session_snap.get("sessionId"),
                    "delta": (session_snap.get("derived") or {}).get("delta"),
                    "status": session_snap.get("status"),
                    "accountId": account_id,
                    "citations": session_snap.get("citations") or [],
                    "derived": session_snap.get("derived") or {},
                }
            else:
                result = {"found": False, "accountId": account_id}
        verdict = evaluate_policy(intent, delta=_delta_from_snapshot(session_snap))
        session_id = session_snap.get("sessionId") if session_snap else None
        sid = UUID(str(session_id)) if session_id else None
        audit = await write_audit(
            db,
            sid,
            "agent.proposed",
            {
                "intent": intent,
                "accountId": proposal.get("accountId"),
                "params": proposal.get("params") or {},
                "rationale": proposal.get("rationale"),
                "decision": "auto_executed",
            },
            actor=actor,
            org_id=org_id,
        )
        return _response(
            decision="auto_executed",
            policy=verdict["policy"],
            audit_id=audit.id,
            proposal=_public_proposal(proposal, result),
            session_id=str(session_id) if session_id else None,
            approval_url=f"/sessions/{session_id}" if session_id else None,
        )

    session_snap = await _open_write_session(db, org_id=org_id, proposal=proposal, actor=actor)
    session_id = str(session_snap["sessionId"])
    delta = _delta_from_snapshot(session_snap)
    verdict = evaluate_policy(intent, delta=delta)
    audit = await write_audit(
        db,
        UUID(session_id),
        "agent.proposed",
        {
            "intent": intent,
            "accountId": proposal.get("accountId") or session_snap.get("accumulatedAnswers", {}).get("accountId"),
            "params": proposal.get("params") or {},
            "rationale": proposal.get("rationale"),
            "decision": "requires_human",
            "delta": delta,
        },
        actor=actor,
        org_id=org_id,
    )
    return _response(
        decision="requires_human",
        policy=verdict["policy"],
        audit_id=audit.id,
        proposal=_public_proposal(proposal, {"sessionId": session_id, "status": session_snap.get("status")}),
        session_id=session_id,
        approval_url=f"/sessions/{session_id}",
    )
