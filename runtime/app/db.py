from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.models.base import Base

engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None


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


async def get_db() -> AsyncIterator[AsyncSession]:
    assert SessionLocal is not None
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
