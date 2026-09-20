from __future__ import annotations

from collections.abc import AsyncIterator
import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from fastapi import Request

from app.config import Settings
from app.models.base import Base
from app.org import DEMO_ORG_ID

engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None
_SQLITE_LOCK = asyncio.Lock()


def init_engine(settings: Settings):
    global engine, SessionLocal
    connect_args = settings.async_connect_args()
    kwargs: dict = {"echo": False, "pool_pre_ping": True}
    if settings.DATABASE_URL.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        kwargs["poolclass"] = StaticPool
        kwargs.pop("pool_pre_ping", None)
    engine = create_async_engine(settings.async_database_url, connect_args=connect_args, **kwargs)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return engine


async def create_all() -> None:
    assert engine is not None
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    global engine
    if engine is not None:
        await engine.dispose()
        engine = None


async def apply_org_guc(session: AsyncSession, org_id: str = DEMO_ORG_ID) -> None:
    if engine is not None and engine.dialect.name == "postgresql":
        await session.execute(
            text("SELECT set_config('app.current_org', :org, true)"),
            {"org": org_id},
        )


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    assert SessionLocal is not None
    org_id = getattr(request.state, "org_id", None)
    if not org_id:
        from app.auth.deps import peek_org_id

        org_id = peek_org_id(request)
        request.state.org_id = org_id
    sqlite = engine is not None and engine.dialect.name == "sqlite"
    if sqlite:
        await _SQLITE_LOCK.acquire()
    try:
        async with SessionLocal() as session:
            try:
                await apply_org_guc(session, org_id)
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    finally:
        if sqlite:
            _SQLITE_LOCK.release()
