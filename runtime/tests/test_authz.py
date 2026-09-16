from __future__ import annotations


async def test_auditor_can_read_not_write(client, api_headers, auditor_headers, fixture_event):
    event = {**fixture_event, "source": "auditor-read"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]

    inbox = await client.get("/v1/inbox", headers=auditor_headers)
    assert inbox.status_code == 200
    snap = await client.get(f"/v1/sessions/{session_id}", headers=auditor_headers)
    assert snap.status_code == 200
    audit = await client.get(f"/v1/sessions/{session_id}/audit", headers=auditor_headers)
    assert audit.status_code == 200
    replay = await client.get(f"/v1/sessions/{session_id}/replay", headers=auditor_headers)
    assert replay.status_code == 200

    ingest = await client.post("/v1/events/exceptions", headers=auditor_headers, json={**event, "source": "auditor-write"})
    assert ingest.status_code == 403
    advance = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=auditor_headers,
        json={"inputs": {"decision": "reject"}},
    )
    assert advance.status_code == 403


async def test_demo_cookie_auth(demo_client):
    missing = await demo_client.get("/v1/inbox")
    assert missing.status_code == 401
    demo = await demo_client.get("/v1/auth/demo")
    assert demo.status_code == 200
    assert "signet_demo" in demo.cookies
    inbox = await demo_client.get("/v1/inbox")
    assert inbox.status_code == 200
    me = await demo_client.get("/v1/auth/me")
    assert me.json()["role"] == "operator"

    checker = await demo_client.get("/v1/auth/demo", params={"role": "checker"})
    assert checker.json()["role"] == "checker"
    me = await demo_client.get("/v1/auth/me")
    assert me.json()["role"] == "checker"


async def test_demo_auth_disabled_without_flag(client):
    response = await client.get("/v1/auth/demo")
    assert response.status_code == 404


async def test_rate_limit_ingest(limited_client, api_headers, fixture_event):
    first = await limited_client.post(
        "/v1/events/exceptions",
        headers=api_headers,
        json={**fixture_event, "source": "rate-1"},
    )
    assert first.status_code == 200
    second = await limited_client.post(
        "/v1/events/exceptions",
        headers=api_headers,
        json={**fixture_event, "source": "rate-2"},
    )
    assert second.status_code == 429
    assert second.json()["error"] == "RATE_LIMITED"
