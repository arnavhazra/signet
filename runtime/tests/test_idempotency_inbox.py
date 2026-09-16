from __future__ import annotations


async def test_idempotent_ingest_by_source(client, api_headers, fixture_event):
    first = await client.post("/v1/events/exceptions", headers=api_headers, json=fixture_event)
    second = await client.post("/v1/events/exceptions", headers=api_headers, json=fixture_event)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["sessionId"] == second.json()["sessionId"]


async def test_idempotency_key_replays_session(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "idem-key-a"}
    headers = {**api_headers, "Idempotency-Key": "loop-1"}
    first = await client.post("/v1/events/exceptions", headers=headers, json=event)
    other = {**fixture_event, "source": "idem-key-b", "bookQty": 999}
    second = await client.post("/v1/events/exceptions", headers=headers, json=other)
    assert first.json()["sessionId"] == second.json()["sessionId"]
    assert second.json()["accumulatedAnswers"]["source"] == "idem-key-a"


async def test_stale_advance_conflict(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "conflict-path"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    snap = created.json()
    session_id = snap["sessionId"]
    token = snap["updatedAt"]
    first = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "reject"}, "expectedUpdatedAt": token},
    )
    assert first.status_code == 200
    second = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "accept_adjustment"}, "expectedUpdatedAt": token},
    )
    assert second.status_code == 409
    assert second.json()["error"] == "CONFLICT"


async def test_inbox_orders_open_before_done(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "inbox-open"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]
    inbox = await client.get("/v1/inbox", headers=api_headers)
    assert inbox.status_code == 200
    items = inbox.json()["items"]
    assert any(item["sessionId"] == session_id and item["status"] == "open" for item in items)
    assert items[0]["status"] in {"open", "awaiting_checker"}


async def test_replay_strips_bindings(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "replay-path"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]
    replay = await client.get(f"/v1/sessions/{session_id}/replay", headers=api_headers)
    assert replay.status_code == 200
    body = replay.json()
    assert body["slug"] == "exception-review"
    assert "workflowId" in body
    assert "version" in body
    blob = replay.text
    assert "binding" not in blob
    assert "filter_value" not in blob
