from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, Request

from app.config import Settings
from app.org import DEMO_COOKIE, DEMO_ORG_ID
from app.schemas.api import AppError

ROLES = frozenset({"admin", "operator", "checker", "auditor", "runtime"})
MUTATE_ROLES = frozenset({"admin", "operator", "checker", "runtime"})


@dataclass
class Principal:
    sub: str
    role: str
    via: str
    identity: str
    org_id: str = DEMO_ORG_ID

    @property
    def can_mutate(self) -> bool:
        return self.role in MUTATE_ROLES

    @property
    def can_admin(self) -> bool:
        return self.role == "admin"


def decode_jwt(authorization: str | None, settings: Settings) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("Missing Authorization Bearer token", status_code=401, error="UNAUTHORIZED")
    token = authorization.split(" ", 1)[1].strip()
    return decode_token(token, settings)


def decode_token(token: str, settings: Settings) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AppError("Token expired", status_code=401, error="UNAUTHORIZED") from exc
    except jwt.PyJWTError as exc:
        raise AppError("Invalid token", status_code=401, error="UNAUTHORIZED") from exc
    role = payload.get("role")
    if role not in ROLES:
        raise AppError("Invalid role", status_code=403, error="FORBIDDEN")
    return payload


def require_admin(payload: dict) -> dict:
    if payload.get("role") != "admin":
        raise AppError("admin role required", status_code=403, error="FORBIDDEN")
    return payload


def require_api_key(x_api_key: str | None, settings: Settings) -> str:
    if not x_api_key:
        raise AppError("Missing X-API-Key header", status_code=401, error="UNAUTHORIZED")
    if x_api_key not in settings.api_key_set:
        raise AppError("Invalid API key", status_code=403, error="FORBIDDEN")
    return x_api_key


def mint_token(
    settings: Settings,
    sub: str,
    role: str,
    days: int = 7,
    hours: int | None = None,
    org_id: str = DEMO_ORG_ID,
) -> str:
    now = datetime.now(timezone.utc)
    delta = timedelta(hours=hours) if hours is not None else timedelta(days=days)
    payload = {
        "sub": sub,
        "role": role,
        "org_id": org_id,
        "iat": int(now.timestamp()),
        "exp": int((now + delta).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _org_from_payload(payload: dict) -> str:
    org = payload.get("org_id") or payload.get("orgId")
    if isinstance(org, str) and org.strip():
        return org.strip()
    return DEMO_ORG_ID


def _principal_from_payload(payload: dict, via: str) -> Principal:
    sub = str(payload.get("sub") or "unknown")
    return Principal(
        sub=sub,
        role=str(payload.get("role")),
        via=via,
        identity=f"{via}:{sub}",
        org_id=_org_from_payload(payload),
    )


def peek_org_id(request: Request) -> str:
    settings: Settings = request.app.state.settings
    authorization = request.headers.get("authorization")
    if authorization and authorization.lower().startswith("bearer "):
        try:
            payload = decode_token(authorization.split(" ", 1)[1].strip(), settings)
            return _org_from_payload(payload)
        except AppError:
            pass
    token = request.cookies.get(DEMO_COOKIE)
    if token:
        try:
            return _org_from_payload(decode_token(token, settings))
        except AppError:
            pass
    return DEMO_ORG_ID


def _from_cookie(request: Request, settings: Settings) -> Principal | None:
    token = request.cookies.get(DEMO_COOKIE)
    if not token:
        return None
    return _principal_from_payload(decode_token(token, settings), "cookie")


def resolve_principal(
    request: Request,
    authorization: str | None,
    x_api_key: str | None,
) -> Principal:
    settings: Settings = request.app.state.settings
    if authorization:
        return _principal_from_payload(decode_jwt(authorization, settings), "jwt")
    cookie_principal = _from_cookie(request, settings)
    if cookie_principal:
        return cookie_principal
    key = require_api_key(x_api_key, settings)
    return Principal(
        sub="api-key",
        role="runtime",
        via="api_key",
        identity=f"key:{key}",
        org_id=DEMO_ORG_ID,
    )


async def current_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> Principal:
    principal = resolve_principal(request, authorization, x_api_key)
    request.state.org_id = principal.org_id
    return principal


async def mutate_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> Principal:
    principal = resolve_principal(request, authorization, x_api_key)
    request.state.org_id = principal.org_id
    if not principal.can_mutate:
        raise AppError("Auditor role is read-only", status_code=403, error="FORBIDDEN")
    return principal


async def admin_jwt(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    principal = resolve_principal(request, authorization, x_api_key)
    if not principal.can_admin:
        raise AppError("admin role required", status_code=403, error="FORBIDDEN")
    return {"sub": principal.sub, "role": principal.role, "via": principal.via}


async def runtime_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
) -> str:
    principal = resolve_principal(request, authorization, x_api_key)
    return principal.identity
