from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, Request

from app.config import Settings
from app.schemas.api import AppError


def decode_jwt(authorization: str | None, settings: Settings) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("Missing Authorization Bearer token", status_code=401, error="UNAUTHORIZED")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AppError("Token expired", status_code=401, error="UNAUTHORIZED") from exc
    except jwt.PyJWTError as exc:
        raise AppError("Invalid token", status_code=401, error="UNAUTHORIZED") from exc
    role = payload.get("role")
    if role not in {"admin", "operator"}:
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


def mint_token(settings: Settings, sub: str, role: str, days: int = 7) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=days)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


async def admin_jwt(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    settings: Settings = request.app.state.settings
    return require_admin(decode_jwt(authorization, settings))


async def runtime_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> str:
    settings: Settings = request.app.state.settings
    return require_api_key(x_api_key, settings)
