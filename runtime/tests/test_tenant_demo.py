from __future__ import annotations

from datetime import datetime, timedelta

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app import db as database
from app.models.entities import WorkflowSession
from app.services import demo_tenant


async def test_demo_mints_org_and_keeps_it_on_role_switch(demo_client):
    first = await demo_client.get("/v1/auth/demo")
    assert first.status_code == 200
    org_id = first.json()["orgId"]
    assert org_id.startswith("org_v_")
    me = await demo_client.get("/v1/auth/me")
    assert me.json()["orgId"] == org_id
    inbox = await demo_client.get("/v1/inbox")
    assert inbox.status_code == 200
    items = inbox.json()["items"]
    assert len(items) >= 10
    checker = await demo_client.get("/v1/auth/demo", params={"role": "checker"})
    assert checker.json()["role"] == "checker"
    assert checker.json()["orgId"] == org_id
    still = await demo_client.get("/v1/auth/me")
    assert still.json()["orgId"] == org_id
    assert still.json()["role"] == "checker"


async def test_org_a_cannot_read_org_b_inbox(demo_app):
    transport = ASGITransport(app=demo_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client_a:
        async with AsyncClient(transport=transport, base_url="http://test") as client_b:
            a_auth = await client_a.get("/v1/auth/demo")
            b_auth = await client_b.get("/v1/auth/demo")
            assert a_auth.json()["orgId"] != b_auth.json()["orgId"]
            inbox_a = await client_a.get("/v1/inbox")
            inbox_b = await client_b.get("/v1/inbox")
            assert inbox_a.status_code == 200
            assert inbox_b.status_code == 200
            ids_a = {row["sessionId"] for row in inbox_a.json()["items"]}
            ids_b = {row["sessionId"] for row in inbox_b.json()["items"]}
            assert ids_a
            assert ids_b
            assert ids_a.isdisjoint(ids_b)
            foreign = next(iter(ids_b))
            denied = await client_a.get(f"/v1/sessions/{foreign}")
            assert denied.status_code == 404
            audit = await client_a.get(f"/v1/sessions/{foreign}/audit")
            assert audit.status_code == 404


async def test_demo_reset_reseeds(demo_client):
    await demo_client.get("/v1/auth/demo")
    first = await demo_client.get("/v1/inbox")
    before = {row["sessionId"] for row in first.json()["items"]}
    assert before
    reset = await demo_client.post("/v1/demo/reset")
    assert reset.status_code == 200, reset.text
    assert reset.json()["ok"] is True
    assert reset.json()["sessions"] >= 10
    second = await demo_client.get("/v1/inbox")
    after = {row["sessionId"] for row in second.json()["items"]}
    assert after
    assert before.isdisjoint(after)


async def test_demo_reset_disabled_without_flag(client, api_headers):
    response = await client.post("/v1/demo/reset", headers=api_headers)
    assert response.status_code == 404


async def test_sweep_stale_visitor_org(demo_client):
    await demo_client.get("/v1/auth/demo")
    inbox = await demo_client.get("/v1/inbox")
    assert inbox.json()["items"]
    org_id = (await demo_client.get("/v1/auth/me")).json()["orgId"]
    async with database.SessionLocal() as db:
        rows = (await db.scalars(select(WorkflowSession).where(WorkflowSession.org_id == org_id))).all()
        ancient = datetime.utcnow() - timedelta(days=30)
        for row in rows:
            row.updated_at = ancient
            row.created_at = ancient
        await db.commit()
        swept = await demo_tenant.sweep_stale_demo_orgs(db, ttl_hours=24)
        await db.commit()
        assert swept == 1
    emptied = await demo_client.get("/v1/inbox")
    assert emptied.status_code == 200
    assert emptied.json()["items"]
