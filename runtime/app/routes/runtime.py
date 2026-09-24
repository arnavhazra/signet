from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Principal, client_ip, current_principal, decode_token, mint_token, mutate_principal
from app.config import Settings
from app.db import get_db
from app.org import DEMO_COOKIE, new_visitor_org_id
from app.schemas.api import (
    AUDIT_EXAMPLE,
    INBOX_EXAMPLE,
    SESSION_EXAMPLE,
    AdvanceBody,
    AppError,
    AuditListResponse,
    DemoAccountBody,
    DemoAccountResponse,
    DemoAuthResponse,
    DemoConfirmBody,
    DemoUsageResponse,
    ExceptionEvent,
    InboxListResponse,
    SessionSnapshot,
    openapi_example,
)
from app.services import demo_tenant
from app.services import exceptions as exception_service
from app.services.workflows import get_active_public

router = APIRouter(prefix="/v1", tags=["runtime"])

DEMO_ROLES = frozenset({"operator", "checker", "admin", "auditor"})


@router.get("/auth/demo", response_model=DemoAuthResponse)
async def demo_auth(
    request: Request,
    response: Response,
    role: str = Query(default="operator"),
):
    settings: Settings = request.app.state.settings
    if not settings.DEMO_MODE:
        raise AppError("Demo auth disabled", status_code=404, error="NOT_FOUND")
    if role not in DEMO_ROLES:
        raise AppError("Invalid demo role", status_code=400, error="BAD_REQUEST")
    org_id = None
    existing = request.cookies.get(DEMO_COOKIE)
    if existing:
        try:
            payload = decode_token(existing, settings)
            raw = payload.get("org_id")
            if isinstance(raw, str) and raw.strip():
                org_id = raw.strip()
        except AppError:
            org_id = None
    if not org_id:
        org_id = new_visitor_org_id()
    token = mint_token(settings, f"demo-{role}", role, hours=12, org_id=org_id)
    response.set_cookie(
        key=DEMO_COOKIE,
        value=token,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        max_age=12 * 3600,
        path="/",
    )
    return {"ok": True, "role": role, "orgId": org_id, "accessToken": token}


@router.get("/auth/me")
async def auth_me(principal: Principal = Depends(current_principal)):
    return {"sub": principal.sub, "role": principal.role, "via": principal.via, "orgId": principal.org_id}


@router.get("/workflows/{slug}/active")
async def get_active_workflow(
    slug: str,
    request: Request,
    _principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    return await get_active_public(db, request.app.state.cache, slug)


@router.get("/inbox", response_model=InboxListResponse, responses={200: openapi_example(INBOX_EXAMPLE)})
async def get_inbox(
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    if settings.DEMO_MODE:
        await demo_tenant.ensure_inbox(db, principal.org_id)
        await demo_tenant.maybe_sweep_stale_orgs(db, request.app.state.cache)
    return {"items": await exception_service.list_inbox(db, org_id=principal.org_id)}


@router.post("/demo/reset")
async def reset_demo(
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    if not settings.DEMO_MODE:
        raise AppError("Demo reset disabled", status_code=404, error="NOT_FOUND")
    await request.app.state.limiter.hit(f"{client_ip(request)}:{principal.identity}", "demo-reset")
    result = await demo_tenant.reset_org_inbox(db, principal.org_id)
    return result


@router.post("/demo/account", response_model=DemoAccountResponse)
async def upsert_demo_account(
    body: DemoAccountBody,
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    if not settings.DEMO_MODE:
        raise AppError("Demo account disabled", status_code=404, error="NOT_FOUND")
    email = body.email.strip()
    org_name = body.orgName.strip()
    if not email or not org_name:
        raise AppError("email and orgName are required", status_code=400, error="BAD_REQUEST")
    row = await demo_tenant.upsert_demo_account(
        db,
        principal.org_id,
        email=email,
        org_name=org_name,
        plan=body.plan,
    )
    return demo_tenant.demo_account_public(row)


@router.post("/demo/account/confirm", response_model=DemoAccountResponse)
async def confirm_demo_account(
    body: DemoConfirmBody,
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    if not settings.DEMO_MODE:
        raise AppError("Demo account disabled", status_code=404, error="NOT_FOUND")
    token = body.token.strip()
    if not token:
        raise AppError("token is required", status_code=400, error="BAD_REQUEST")
    row = await demo_tenant.confirm_demo_account(db, principal.org_id, token)
    return demo_tenant.demo_account_public(row)


@router.get("/demo/account", response_model=DemoAccountResponse)
async def get_demo_account(
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    if not settings.DEMO_MODE:
        raise AppError("Demo account disabled", status_code=404, error="NOT_FOUND")
    row = await demo_tenant.get_demo_account(db, principal.org_id)
    if row is None:
        raise AppError("Demo account not found", status_code=404, error="NOT_FOUND")
    return demo_tenant.demo_account_public(row)


@router.get("/demo/usage", response_model=DemoUsageResponse)
async def get_demo_usage(
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    if not settings.DEMO_MODE:
        raise AppError("Demo usage disabled", status_code=404, error="NOT_FOUND")
    return await demo_tenant.usage_for_org(db, principal.org_id)


@router.get("/audit", response_model=AuditListResponse, responses={200: openapi_example(AUDIT_EXAMPLE)})
async def search_audit(
    accountId: str | None = Query(default=None),
    eventType: str | None = Query(default=None),
    sessionId: str | None = Query(default=None),
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    events = await exception_service.search_audit(
        db,
        account_id=accountId,
        event_type=eventType,
        session_id=sessionId,
        org_id=principal.org_id,
    )
    return {"events": events}


@router.post("/events/exceptions")
async def ingest_exception(
    body: ExceptionEvent,
    request: Request,
    principal: Principal = Depends(mutate_principal),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    await request.app.state.limiter.hit(f"{client_ip(request)}:{principal.identity}", "exceptions")
    return await exception_service.process_exception(
        db,
        body,
        bus=None,
        org_id=principal.org_id,
        idempotency_key=idempotency_key,
        actor=principal.role,
    )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionSnapshot,
    responses={200: openapi_example(SESSION_EXAMPLE)},
)
async def get_session(
    session_id: UUID,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    return await exception_service.get_session_snapshot(db, session_id, org_id=principal.org_id)


@router.post("/sessions/{session_id}/advance")
async def advance_session(
    session_id: UUID,
    body: AdvanceBody,
    request: Request,
    principal: Principal = Depends(mutate_principal),
    db: AsyncSession = Depends(get_db),
):
    await request.app.state.limiter.hit(f"{client_ip(request)}:{principal.identity}", "advance")
    return await exception_service.advance_session(
        db,
        session_id,
        body.inputs,
        expected_updated_at=body.expectedUpdatedAt,
        actor=principal.role,
        org_id=principal.org_id,
    )


@router.get(
    "/sessions/{session_id}/audit",
    response_model=AuditListResponse,
    responses={200: openapi_example(AUDIT_EXAMPLE)},
)
async def get_audit(
    session_id: UUID,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    return {"events": await exception_service.list_audit(db, session_id, org_id=principal.org_id)}


@router.get("/sessions/{session_id}/replay")
async def get_replay(
    session_id: UUID,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    return await exception_service.get_replay(db, session_id, org_id=principal.org_id)
