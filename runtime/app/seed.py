from __future__ import annotations

import asyncio
from typing import Any

from app.auth.deps import mint_token
from app.config import get_settings
from app import db as database
from app.logging import configure_logging, get_logger
from app.org import DEMO_ORG_ID
from app.seeds.exception_review import EXCEPTION_REVIEW_DEFINITION
from app.seeds.nav_signoff import NAV_SIGNOFF_DEFINITION
from app.services.cache import MemoryCache
from app.services.demo_tenant import seed_inbox_for_org
from app.services.workflows import create_workflow, get_published, publish_workflow

log = get_logger("seed")


async def _ensure_published(db, cache, slug: str, name: str, definition: dict[str, Any]):
    existing = await get_published(db, slug)
    if existing:
        node_ids = {n.get("id") for n in (existing.definition or {}).get("nodes", [])}
        needs_upgrade = slug == "exception-review" and "checker_approval" not in node_ids
        if not needs_upgrade:
            log.info("seed_skip_already_published", slug=slug, workflow_id=str(existing.id), version=existing.version)
            return existing
        log.info("seed_upgrade_published", slug=slug, from_version=existing.version)
    row = await create_workflow(db, slug, name, definition)
    published = await publish_workflow(db, row.id, cache)
    log.info("seeded_workflow", slug=slug, workflow_id=str(published.id), version=published.version)
    return published


async def bootstrap(db, cache) -> dict[str, Any]:
    review = await _ensure_published(db, cache, "exception-review", "Exception review", EXCEPTION_REVIEW_DEFINITION)
    nav = await _ensure_published(db, cache, "nav-signoff", "NAV sign-off", NAV_SIGNOFF_DEFINITION)
    session_ids = await seed_inbox_for_org(db, DEMO_ORG_ID)
    return {
        "exceptionReview": {"id": str(review.id), "version": review.version},
        "navSignoff": {"id": str(nav.id), "version": nav.version},
        "sessions": session_ids,
    }


async def seed() -> None:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    database.init_engine(settings)
    assert database.SessionLocal is not None
    cache = MemoryCache()
    async with database.SessionLocal() as db:
        await database.apply_org_guc(db)
        result = await bootstrap(db, cache)
        await db.commit()

    admin_jwt = mint_token(settings, "demo-admin", "admin")
    operator_jwt = mint_token(settings, "demo-operator", "operator")
    checker_jwt = mint_token(settings, "demo-checker", "checker")
    auditor_jwt = mint_token(settings, "demo-auditor", "auditor")
    print("=== Signet seed ===")
    print(f"exception_review={result['exceptionReview']}")
    print(f"nav_signoff={result['navSignoff']}")
    print(f"sessions={len(result['sessions'])}")
    print(f"API_KEY={next(iter(settings.api_key_set))}")
    print(f"ADMIN_JWT={admin_jwt}")
    print(f"OPERATOR_JWT={operator_jwt}")
    print(f"CHECKER_JWT={checker_jwt}")
    print(f"AUDITOR_JWT={auditor_jwt}")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
