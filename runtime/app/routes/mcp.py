from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Principal, current_principal
from app.config import Settings
from app.db import get_db
from app.schemas.api import AppError, ProposeBody
from app.services import agent as agent_service
from app.services import demo_tenant
from app.services import exceptions as exception_service

router = APIRouter(tags=["mcp"])

PROTOCOL_VERSION = "2025-03-26"
INBOX_RESOURCE_URI = "signet://inbox"

TOOLS = [
    {
        "name": "list_exceptions",
        "description": "List book-vs-custodian exception sessions for the current org.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "propose_remediation",
        "description": (
            "Propose a remediation. Write-class intents never execute; policy opens a HITL session."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "intent": {"type": "string"},
                "text": {"type": "string"},
                "accountId": {"type": "string"},
                "params": {"type": "object"},
                "rationale": {"type": "string"},
            },
            "additionalProperties": True,
        },
    },
    {
        "name": "get_session",
        "description": "Get a workflow session snapshot by id.",
        "inputSchema": {
            "type": "object",
            "properties": {"sessionId": {"type": "string"}},
            "required": ["sessionId"],
        },
    },
    {
        "name": "get_audit",
        "description": "Get audit events, optionally filtered by sessionId, accountId, or eventType.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "sessionId": {"type": "string"},
                "accountId": {"type": "string"},
                "eventType": {"type": "string"},
            },
        },
    },
]

RESOURCES = [
    {
        "uri": INBOX_RESOURCE_URI,
        "name": "inbox",
        "description": "Open and awaiting-checker exception sessions for the current org.",
        "mimeType": "application/json",
    }
]


def _rpc_result(req_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _rpc_error(req_id: Any, code: int, message: str, data: Any | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": req_id, "error": error}


def _tool_text(payload: Any, *, is_error: bool = False) -> dict[str, Any]:
    text = payload if isinstance(payload, str) else json.dumps(payload, default=str)
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


async def _inbox_items(db: AsyncSession, principal: Principal, settings: Settings) -> list[Any]:
    if settings.DEMO_MODE:
        await demo_tenant.ensure_inbox(db, principal.org_id)
    return await exception_service.list_inbox(db, org_id=principal.org_id)


async def _call_tool(
    name: str,
    arguments: dict[str, Any],
    *,
    db: AsyncSession,
    principal: Principal,
    settings: Settings,
) -> dict[str, Any]:
    args = arguments if isinstance(arguments, dict) else {}
    if name == "list_exceptions":
        items = await _inbox_items(db, principal, settings)
        return _tool_text({"items": items})
    if name == "propose_remediation":
        if settings.DEMO_MODE:
            await demo_tenant.ensure_inbox(db, principal.org_id)
        body = ProposeBody.model_validate(args)
        result = await agent_service.propose(db, body, principal=principal, settings=settings)
        return _tool_text(result)
    if name == "get_session":
        session_id = args.get("sessionId") or args.get("session_id")
        if not session_id:
            return _tool_text({"error": "sessionId is required"}, is_error=True)
        snap = await exception_service.get_session_snapshot(db, UUID(str(session_id)), org_id=principal.org_id)
        return _tool_text(snap)
    if name == "get_audit":
        session_id = args.get("sessionId") or args.get("session_id")
        if session_id:
            events = await exception_service.list_audit(db, UUID(str(session_id)), org_id=principal.org_id)
            return _tool_text({"events": events})
        events = await exception_service.search_audit(
            db,
            account_id=args.get("accountId"),
            event_type=args.get("eventType"),
            session_id=None,
            org_id=principal.org_id,
        )
        return _tool_text({"events": events})
    return _tool_text({"error": f"Unknown tool: {name}"}, is_error=True)


async def _read_resource(
    uri: str,
    *,
    db: AsyncSession,
    principal: Principal,
    settings: Settings,
) -> dict[str, Any] | None:
    if uri != INBOX_RESOURCE_URI:
        return None
    items = await _inbox_items(db, principal, settings)
    return {
        "contents": [
            {
                "uri": INBOX_RESOURCE_URI,
                "mimeType": "application/json",
                "text": json.dumps({"items": items}, default=str),
            }
        ]
    }


async def _handle_method(
    message: dict[str, Any],
    *,
    db: AsyncSession,
    principal: Principal,
    settings: Settings,
) -> dict[str, Any] | None:
    req_id = message.get("id")
    method = message.get("method")
    params = message.get("params") if isinstance(message.get("params"), dict) else {}
    if method == "initialize":
        return _rpc_result(
            req_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                },
                "serverInfo": {"name": "signet", "version": "0.2.0"},
            },
        )
    if method == "notifications/initialized" or method == "initialized":
        return None
    if method == "ping":
        return _rpc_result(req_id, {})
    if method == "tools/list":
        return _rpc_result(req_id, {"tools": TOOLS})
    if method == "resources/list":
        return _rpc_result(req_id, {"resources": RESOURCES})
    if method == "resources/read":
        uri = params.get("uri")
        if not uri:
            return _rpc_error(req_id, -32602, "Missing resource uri")
        try:
            contents = await _read_resource(str(uri), db=db, principal=principal, settings=settings)
        except AppError as exc:
            return _rpc_error(req_id, -32000, exc.message, {"error": exc.error})
        if contents is None:
            return _rpc_error(req_id, -32002, f"Resource not found: {uri}")
        return _rpc_result(req_id, contents)
    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        if not name:
            return _rpc_error(req_id, -32602, "Missing tool name")
        try:
            result = await _call_tool(str(name), arguments, db=db, principal=principal, settings=settings)
        except AppError as exc:
            return _rpc_result(req_id, _tool_text({"error": exc.error, "message": exc.message}, is_error=True))
        return _rpc_result(req_id, result)
    if req_id is None:
        return None
    return _rpc_error(req_id, -32601, f"Method not found: {method}")


def _encode_mcp(payload: Any, accept: str) -> Response:
    prefers_sse = "text/event-stream" in accept and "application/json" not in accept
    if prefers_sse:
        data = json.dumps(payload, default=str)
        return Response(content=f"event: message\ndata: {data}\n\n", media_type="text/event-stream")
    return JSONResponse(payload)


@router.post("/mcp")
async def mcp_post(
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    try:
        payload = await request.json()
    except Exception:
        return _encode_mcp(_rpc_error(None, -32700, "Parse error"), request.headers.get("accept") or "")

    accept = request.headers.get("accept") or ""
    if isinstance(payload, list):
        responses = []
        for item in payload:
            if not isinstance(item, dict):
                responses.append(_rpc_error(None, -32600, "Invalid Request"))
                continue
            handled = await _handle_method(item, db=db, principal=principal, settings=settings)
            if handled is not None:
                responses.append(handled)
        if not responses:
            return Response(status_code=202)
        return _encode_mcp(responses, accept)

    if not isinstance(payload, dict):
        return _encode_mcp(_rpc_error(None, -32600, "Invalid Request"), accept)

    handled = await _handle_method(payload, db=db, principal=principal, settings=settings)
    if handled is None:
        return Response(status_code=202)
    return _encode_mcp(handled, accept)


@router.get("/mcp")
async def mcp_get(_principal: Principal = Depends(current_principal)):
    raise AppError("Use JSON-RPC POST /mcp", status_code=405, error="METHOD_NOT_ALLOWED")
