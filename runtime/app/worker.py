from __future__ import annotations

import asyncio
import json

from app import db as database
from app.config import get_settings
from app.logging import configure_logging, get_logger
from app.otel import get_tracer, setup_tracing
from app.services.exceptions import consume_exception_payload
from app.services.nats import STREAM, SUBJECT, connect_nats

log = get_logger("worker")
tracer = get_tracer("hitl-runtime")


async def consume_forever(app, durable: str = "exception-worker") -> None:
    bus = app.state.bus
    js = getattr(bus, "js", None)
    if js is None:
        log.info("worker_skip_no_jetstream")
        return
    sub = await js.pull_subscribe(SUBJECT, durable=durable, stream=STREAM)
    log.info("worker_subscribed", durable=durable, subject=SUBJECT)
    while True:
        try:
            messages = await sub.fetch(1, timeout=5)
        except TimeoutError:
            continue
        except Exception as exc:
            log.warning("worker_fetch_failed", error=str(exc))
            await asyncio.sleep(1)
            continue
        for msg in messages:
            with tracer.start_as_current_span("queue.consume") as span:
                span.set_attribute("messaging.system", "nats")
                span.set_attribute("messaging.destination", SUBJECT)
                try:
                    payload = json.loads(msg.data.decode("utf-8"))
                    async with database.SessionLocal() as db:
                        await consume_exception_payload(db, payload)
                        await db.commit()
                    await msg.ack()
                except Exception as exc:
                    log.error("worker_process_failed", error=str(exc))
                    await msg.nak()


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    engine = database.init_engine(settings)
    setup_tracing(settings, engine=engine)

    class AppShim:
        pass

    shim = AppShim()
    shim.state = type("S", (), {})()
    shim.state.engine = engine
    shim.state.bus = await connect_nats(settings.NATS_URL)
    await consume_forever(shim, durable="exception-worker")


if __name__ == "__main__":
    asyncio.run(main())
