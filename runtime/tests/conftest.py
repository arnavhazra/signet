from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ["TESTING"] = "1"
os.environ["LLM_API_KEY"] = ""
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("API_KEYS", "test-runtime-key")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("OTEL_EXPORTER_OTLP_ENDPOINT", "")
os.environ.setdefault("DEMO_MODE", "0")

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.auth.deps import mint_token
from app.config import Settings
from app.db import create_all
from app import db as database
from app.main import create_app
from app.seeds.exception_review import EXCEPTION_REVIEW_DEFINITION, HIGH_DELTA_EXCEPTION, SYNTHETIC_EXCEPTION
from app.seeds.nav_signoff import NAV_SIGNOFF_DEFINITION
from app.services.cache import MemoryCache
from app.services.workflows import create_workflow, publish_workflow

API_KEY = "test-runtime-key"
JWT_SECRET = "test-jwt-secret"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        JWT_SECRET=JWT_SECRET,
        API_KEYS=API_KEY,
        TESTING=True,
        DEMO_MODE=False,
        OTEL_EXPORTER_OTLP_ENDPOINT="",
        RATE_LIMIT_PER_MINUTE=1000,
        REDIS_URL="redis://localhost:6379/0",
        NATS_URL="nats://localhost:4222",
        LLM_API_KEY="",
    )


@pytest.fixture
def demo_settings() -> Settings:
    return Settings(
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        JWT_SECRET=JWT_SECRET,
        API_KEYS=API_KEY,
        TESTING=True,
        DEMO_MODE=True,
        OTEL_EXPORTER_OTLP_ENDPOINT="",
        RATE_LIMIT_PER_MINUTE=1000,
        LLM_API_KEY="",
    )


@pytest.fixture
def tight_limit_settings() -> Settings:
    return Settings(
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        JWT_SECRET=JWT_SECRET,
        API_KEYS=API_KEY,
        TESTING=True,
        DEMO_MODE=False,
        OTEL_EXPORTER_OTLP_ENDPOINT="",
        RATE_LIMIT_PER_MINUTE=1,
        LLM_API_KEY="",
    )


async def _seed_published(application):
    await create_all()
    async with database.SessionLocal() as db:
        row = await create_workflow(db, "exception-review", "Exception review", EXCEPTION_REVIEW_DEFINITION)
        await publish_workflow(db, row.id, MemoryCache())
        nav = await create_workflow(db, "nav-signoff", "NAV sign-off", NAV_SIGNOFF_DEFINITION)
        await publish_workflow(db, nav.id, MemoryCache())
        await db.commit()


@pytest.fixture
async def app(settings: Settings):
    application = create_app(settings)
    async with LifespanManager(application):
        await _seed_published(application)
        yield application


@pytest.fixture
async def demo_app(demo_settings: Settings):
    application = create_app(demo_settings)
    async with LifespanManager(application):
        await _seed_published(application)
        yield application


@pytest.fixture
async def limited_app(tight_limit_settings: Settings):
    application = create_app(tight_limit_settings)
    async with LifespanManager(application):
        await _seed_published(application)
        yield application


@pytest.fixture
async def client(app) -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def demo_client(demo_app) -> AsyncClient:
    transport = ASGITransport(app=demo_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def limited_client(limited_app) -> AsyncClient:
    transport = ASGITransport(app=limited_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def api_headers() -> dict[str, str]:
    return {"X-API-Key": API_KEY}


@pytest.fixture
def admin_headers(app) -> dict[str, str]:
    token = mint_token(app.state.settings, "tester", "admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def operator_headers(app) -> dict[str, str]:
    token = mint_token(app.state.settings, "tester", "operator")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def checker_headers(app) -> dict[str, str]:
    token = mint_token(app.state.settings, "tester", "checker")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auditor_headers(app) -> dict[str, str]:
    token = mint_token(app.state.settings, "tester", "auditor")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def fixture_event() -> dict:
    return dict(SYNTHETIC_EXCEPTION)


@pytest.fixture
def high_delta_event() -> dict:
    return dict(HIGH_DELTA_EXCEPTION)
