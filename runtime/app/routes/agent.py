from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import Principal, client_ip, current_principal
from app.config import Settings
from app.db import get_db
from app.schemas.api import ProposeBody
from app.services import agent as agent_service
from app.services import demo_tenant

router = APIRouter(prefix="/v1", tags=["agent"])


@router.post("/agent/propose")
async def propose(
    body: ProposeBody,
    request: Request,
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
):
    settings: Settings = request.app.state.settings
    await request.app.state.limiter.hit(f"{client_ip(request)}:{principal.identity}", "agent-propose")
    if settings.DEMO_MODE:
        await demo_tenant.ensure_inbox(db, principal.org_id)
    return await agent_service.propose(db, body, principal=principal, settings=settings)
