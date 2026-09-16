from __future__ import annotations

import asyncio

from app.auth.deps import mint_token
from app.config import get_settings
from app import db as database
from app.logging import configure_logging, get_logger
from app.seeds.exception_review import EXCEPTION_REVIEW_DEFINITION, SYNTHETIC_EXCEPTION
from app.services.cache import MemoryCache
from app.services.workflows import create_workflow, get_published, publish_workflow

log = get_logger("seed")


async def seed() -> None:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    database.init_engine(settings)
    assert database.SessionLocal is not None
    async with database.SessionLocal() as db:
        existing = await get_published(db, "exception-review")
        if existing:
            log.info("seed_skip_already_published", workflow_id=str(existing.id), version=existing.version)
        else:
            row = await create_workflow(db, "exception-review", "Exception review", EXCEPTION_REVIEW_DEFINITION)
            published = await publish_workflow(db, row.id, MemoryCache())
            await db.commit()
            log.info("seeded_exception_review", workflow_id=str(published.id), version=published.version)

        published = await get_published(db, "exception-review")
        admin_jwt = mint_token(settings, "demo-admin", "admin")
        operator_jwt = mint_token(settings, "demo-operator", "operator")
        print("=== HITL runtime seed ===")
        print(f"published_workflow_id={published.id if published else None}")
        print(f"synthetic_fixture={SYNTHETIC_EXCEPTION}")
        print(f"API_KEY={next(iter(settings.api_key_set))}")
        print(f"ADMIN_JWT={admin_jwt}")
        print(f"OPERATOR_JWT={operator_jwt}")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
