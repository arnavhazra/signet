from __future__ import annotations

import json
from typing import Any, Protocol

from app.logging import get_logger
from app.otel import get_tracer

log = get_logger("nats")
tracer = get_tracer("hitl-runtime")

STREAM = "EXCEPTIONS"
SUBJECT = "exceptions.received"


class EventBus(Protocol):
    async def publish_exception(self, payload: dict[str, Any]) -> None: ...
    async def ping(self) -> bool: ...
    async def close(self) -> None: ...


class MemoryBus:
    def __init__(self, healthy: bool = True):
        self.published: list[dict[str, Any]] = []
        self.healthy = healthy

    async def publish_exception(self, payload: dict[str, Any]) -> None:
        self.published.append(payload)

    async def ping(self) -> bool:
        return self.healthy

    async def close(self) -> None:
        return None


class NatsBus:
    def __init__(self, nc, js):
        self.nc = nc
        self.js = js

    async def publish_exception(self, payload: dict[str, Any]) -> None:
        with tracer.start_as_current_span("queue.publish") as span:
            span.set_attribute("messaging.system", "nats")
            span.set_attribute("messaging.destination", SUBJECT)
            await self.js.publish(SUBJECT, json.dumps(payload).encode("utf-8"))
            log.info("exception_published", subject=SUBJECT, accountId=payload.get("accountId"))

    async def ping(self) -> bool:
        return self.nc.is_connected

    async def close(self) -> None:
        await self.nc.drain()


async def connect_nats(url: str) -> NatsBus:
    import asyncio
    import nats

    # Fail fast when JetStream is not running (no Docker). max_reconnect_attempts=0
    # means "never give up" in nats-py, so use 1 plus a hard timeout.
    nc = await asyncio.wait_for(
        nats.connect(
            url,
            connect_timeout=1,
            allow_reconnect=False,
            max_reconnect_attempts=1,
            reconnect_time_wait=0,
        ),
        timeout=3,
    )
    js = nc.jetstream()
    try:
        await js.add_stream(name=STREAM, subjects=["exceptions.>"])
    except Exception:
        await js.stream_info(STREAM)
    log.info("nats_connected", url=url, stream=STREAM)
    return NatsBus(nc, js)
