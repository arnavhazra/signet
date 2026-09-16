from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.db import dispose_engine, init_engine
from app.logging import configure_logging, get_logger
from app.otel import instrument_app, setup_tracing
from app.routes import admin, health, runtime
from app.schemas.api import AppError
from app.services.cache import MemoryCache, RedisCache
from app.services.nats import MemoryBus, connect_nats
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

        if settings.TESTING:
            app.state.cache = MemoryCache()
            app.state.bus = MemoryBus(healthy=True)
            app.state.redis = None
            app.state.nats_consumer_task = None
        else:
            import redis.asyncio as redis_async

            redis_client = redis_async.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
            try:
                await redis_client.ping()
            except Exception as exc:
                log.warning("redis_unavailable_using_memory_cache", error=str(exc))
                await redis_client.aclose()
                redis_client = None
            app.state.redis = redis_client
            app.state.cache = RedisCache(redis_client) if redis_client else MemoryCache()
            try:
                app.state.bus = await connect_nats(settings.NATS_URL)
            except Exception as exc:
                log.warning("nats_unavailable_using_memory_bus", error=str(exc))
                app.state.bus = MemoryBus(healthy=True)
            app.state.nats_consumer_task = None
            if not isinstance(app.state.bus, MemoryBus):
                import asyncio
                from app.worker import consume_forever

                app.state.nats_consumer_task = asyncio.create_task(
                    consume_forever(app, durable="api-inline"),
                    name="nats-exceptions-consumer",
                )
        app.state.limiter = RateLimiter(app.state.cache, settings.RATE_LIMIT_PER_MINUTE)
        log.info("runtime_started", testing=settings.TESTING)
        try:
            yield
        finally:
            task = getattr(app.state, "nats_consumer_task", None)
            if task:
                task.cancel()
            bus = getattr(app.state, "bus", None)
            if bus:
                await bus.close()
            redis_client = getattr(app.state, "redis", None)
            if redis_client:
                await redis_client.aclose()
            await dispose_engine()

    app = FastAPI(
        title="HITL Workflow Runtime",
        description="Governed, versioned, server-driven human-in-the-loop workflow kernel. Not Addison.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=600,
    )

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
