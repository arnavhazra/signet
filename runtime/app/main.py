from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.db import apply_org_guc, dispose_engine, init_engine
from app.logging import configure_logging, get_logger
from app.otel import instrument_app, setup_tracing
from app.routes import admin, health, runtime
from app.schemas.api import AppError
from app.services.cache import MemoryCache
from app.services.nats import MemoryBus
from app.services.rate_limit import RateLimiter

log = get_logger("main")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = init_engine(settings)
        setup_tracing(settings, engine=engine)
        app.state.settings = settings
        app.state.engine = engine
        # Hobby / serverless: no Redis or NATS. Active workflow cache and rate
        # limits are in-process; durable state is Postgres.
        app.state.cache = MemoryCache()
        app.state.bus = MemoryBus(healthy=True)
        app.state.redis = None
        app.state.nats_consumer_task = None
        app.state.limiter = RateLimiter(app.state.cache, settings.RATE_LIMIT_PER_MINUTE)
        if settings.SIGNET_BOOTSTRAP:
            from app.db import SessionLocal, create_all
            from app.seed import bootstrap

            await create_all()
            assert SessionLocal is not None
            async with SessionLocal() as db:
                await apply_org_guc(db)
                await bootstrap(db, app.state.cache)
                await db.commit()
        log.info("runtime_started", testing=settings.TESTING, demo_mode=settings.DEMO_MODE)
        try:
            yield
        finally:
            await dispose_engine()

    app = FastAPI(
        title="Signet",
        description="Versioned HITL workflow kernel: SDUI, audit-first tools, maker-checker.",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://([a-z0-9-]+\.)+vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
        max_age=600,
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError):
        body = {"error": exc.error, "message": exc.message, **exc.extra}
        return JSONResponse(status_code=exc.status_code, content=body)

    app.include_router(health.router)
    app.include_router(admin.router)
    app.include_router(runtime.router)
    if not settings.TESTING:
        instrument_app(app)
    return app


app = create_app()
