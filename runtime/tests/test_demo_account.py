from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app import db as database
from app.models.entities import AuditEvent
from app.services.demo_tenant import FAST_INBOX_SIZE


async def test_demo_account_upsert_and_get(demo_client):
    auth = await demo_client.get("/v1/auth/demo")
    assert auth.status_code == 200
    org_id = auth.json()["orgId"]

    missing = await demo_client.get("/v1/demo/account")
    assert missing.status_code == 404

    created = await demo_client.post(
        "/v1/demo/account",
        json={"email": "ops@example.com", "orgName": "Northwind Desk"},
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["orgId"] == org_id
    assert body["email"] == "ops@example.com"
    assert body["orgName"] == "Northwind Desk"
    assert body["plan"] == "operator"
    assert body["confirmed"] is False
    assert isinstance(body["confirmToken"], str) and len(body["confirmToken"]) >= 6

    fetched = await demo_client.get("/v1/demo/account")
    assert fetched.status_code == 200
    assert fetched.json() == body

    updated = await demo_client.post(
        "/v1/demo/account",
        json={"email": "ops@example.com", "orgName": "Northwind Desk", "plan": "desk"},
    )
    assert updated.status_code == 200
    assert updated.json()["plan"] == "desk"
    assert updated.json()["confirmed"] is False
    assert updated.json()["orgId"] == org_id


async def test_demo_account_confirm(demo_client):
    await demo_client.get("/v1/auth/demo")
    created = await demo_client.post(
        "/v1/demo/account",
        json={"email": "a@b.co", "orgName": "Acme", "plan": "platform"},
    )
    token = created.json()["confirmToken"]

    bad = await demo_client.post("/v1/demo/account/confirm", json={"token": "nope"})
    assert bad.status_code == 400

    ok = await demo_client.post("/v1/demo/account/confirm", json={"token": token})
    assert ok.status_code == 200, ok.text
    assert ok.json()["confirmed"] is True
    assert ok.json()["plan"] == "platform"
    assert ok.json()["confirmToken"] == token

    again = await demo_client.get("/v1/demo/account")
    assert again.json()["confirmed"] is True


async def test_demo_usage_scoped_to_org(demo_app):
    transport = ASGITransport(app=demo_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client_a:
        async with AsyncClient(transport=transport, base_url="http://test") as client_b:
            a_auth = await client_a.get("/v1/auth/demo")
            b_auth = await client_b.get("/v1/auth/demo")
            org_a = a_auth.json()["orgId"]
            org_b = b_auth.json()["orgId"]
            assert org_a != org_b

            await client_a.get("/v1/inbox")
            usage_a = await client_a.get("/v1/demo/usage")
            assert usage_a.status_code == 200, usage_a.text
            assert usage_a.json()["sessions"] == FAST_INBOX_SIZE
            assert usage_a.json()["agentProposed"] == 0
            assert usage_a.json()["remediationsWritten"] == 0

            usage_b = await client_b.get("/v1/demo/usage")
            assert usage_b.status_code == 200
            assert usage_b.json()["sessions"] == 0
            assert usage_b.json()["agentProposed"] == 0
            assert usage_b.json()["remediationsWritten"] == 0

            async with database.SessionLocal() as db:
                db.add(
                    AuditEvent(
                        org_id=org_a,
                        session_id=None,
                        event_type="agent.proposed",
                        actor="operator",
                        payload={"intent": "resolve_break"},
                    )
                )
                db.add(
                    AuditEvent(
                        org_id=org_a,
                        session_id=None,
                        event_type="remediation.written",
                        actor="checker",
                        payload={"accountId": "A-214"},
                    )
                )
                db.add(
                    AuditEvent(
                        org_id=org_b,
                        session_id=None,
                        event_type="agent.proposed",
                        actor="operator",
                        payload={"intent": "other"},
                    )
                )
                await db.commit()

            usage_a2 = await client_a.get("/v1/demo/usage")
            assert usage_a2.json() == {
                "sessions": FAST_INBOX_SIZE,
                "agentProposed": 1,
                "remediationsWritten": 1,
            }

            await client_b.get("/v1/inbox")
            usage_b2 = await client_b.get("/v1/demo/usage")
            assert usage_b2.json()["sessions"] == FAST_INBOX_SIZE
            assert usage_b2.json()["agentProposed"] == 1
            assert usage_b2.json()["remediationsWritten"] == 0


async def test_other_org_cannot_read_demo_account(demo_app):
    transport = ASGITransport(app=demo_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client_a:
        async with AsyncClient(transport=transport, base_url="http://test") as client_b:
            await client_a.get("/v1/auth/demo")
            await client_b.get("/v1/auth/demo")
            created = await client_a.post(
                "/v1/demo/account",
                json={"email": "a@example.com", "orgName": "Org A"},
            )
            assert created.status_code == 200
            token_a = created.json()["confirmToken"]

            missing = await client_b.get("/v1/demo/account")
            assert missing.status_code == 404

            stolen = await client_b.post("/v1/demo/account/confirm", json={"token": token_a})
            assert stolen.status_code == 400

            still = await client_a.get("/v1/demo/account")
            assert still.json()["confirmed"] is False


async def test_demo_account_disabled_without_flag(client, api_headers):
    response = await client.post(
        "/v1/demo/account",
        headers=api_headers,
        json={"email": "x@y.z", "orgName": "Nope"},
    )
    assert response.status_code == 404
    assert (await client.get("/v1/demo/usage", headers=api_headers)).status_code == 404
