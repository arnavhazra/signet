from __future__ import annotations


async def test_high_delta_requires_checker(client, api_headers, checker_headers, high_delta_event):
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=high_delta_event)
    assert created.status_code == 200, created.text
    snap = created.json()
    assert snap["derived"]["delta"] == 120
    assert snap["status"] == "awaiting_input"
    assert snap["currentNode"]["id"] == "approval"
    assert snap["awaitingChecker"] is False
    session_id = snap["sessionId"]
    token = snap["updatedAt"]

    maker = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "accept_adjustment"}, "expectedUpdatedAt": token},
    )
    assert maker.status_code == 200, maker.text
    halted = maker.json()
    assert halted["status"] == "awaiting_input"
    assert halted["currentNode"]["id"] == "checker_approval"
    assert halted["awaitingChecker"] is True
    audit = await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)
    types = [e["eventType"] for e in audit.json()["events"]]
    assert "remediation.written" not in types
    assert "human.decision" in types

    inbox = await client.get("/v1/inbox", headers=api_headers)
    item = next(i for i in inbox.json()["items"] if i["sessionId"] == session_id)
    assert item["status"] == "awaiting_checker"

    checker = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=checker_headers,
        json={"inputs": {"checkerDecision": "accept_adjustment"}, "expectedUpdatedAt": halted["updatedAt"]},
    )
    assert checker.status_code == 200, checker.text
    done = checker.json()
    assert done["status"] == "completed"
    assert done["derived"]["outcome"] == "accepted"
    events = (await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)).json()["events"]
    types = [e["eventType"] for e in events]
    assert "remediation.written" in types
    humans = [e for e in events if e["eventType"] == "human.decision"]
    assert len(humans) == 2
    actors = {e.get("actor") for e in humans}
    assert "runtime" in actors or "operator" in actors
    assert "checker" in actors


async def test_low_delta_accept_is_single_step(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "low-delta-single"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]
    assert created.json()["derived"]["delta"] == 30
    done = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "accept_adjustment"}, "expectedUpdatedAt": created.json()["updatedAt"]},
    )
    assert done.json()["status"] == "completed"
    assert done.json()["currentNode"] is None
    types = [e["eventType"] for e in (await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)).json()["events"]]
    assert "remediation.written" in types
    humans = [
        e
        for e in (await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)).json()["events"]
        if e["eventType"] == "human.decision"
    ]
    assert len(humans) == 1


async def test_operator_cannot_advance_checker_node(
    client, api_headers, operator_headers, checker_headers, high_delta_event
):
    event = {**high_delta_event, "source": "checker-authz"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    assert created.status_code == 200, created.text
    session_id = created.json()["sessionId"]
    maker = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=operator_headers,
        json={"inputs": {"decision": "accept_adjustment"}, "expectedUpdatedAt": created.json()["updatedAt"]},
    )
    assert maker.status_code == 200, maker.text
    halted = maker.json()
    assert halted["currentNode"]["id"] == "checker_approval"
    token = halted["updatedAt"]

    denied = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=operator_headers,
        json={"inputs": {"checkerDecision": "accept_adjustment"}, "expectedUpdatedAt": token},
    )
    assert denied.status_code == 403, denied.text
    assert denied.json()["error"] == "FORBIDDEN"
    assert denied.json()["message"] == "checker role required"

    runtime_denied = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"checkerDecision": "accept_adjustment"}, "expectedUpdatedAt": token},
    )
    assert runtime_denied.status_code == 403, runtime_denied.text
    assert runtime_denied.json()["error"] == "FORBIDDEN"

    still = await client.get(f"/v1/sessions/{session_id}", headers=api_headers)
    assert still.status_code == 200
    assert still.json()["currentNode"]["id"] == "checker_approval"
    assert still.json()["status"] == "awaiting_input"
    humans = [
        e
        for e in (await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)).json()["events"]
        if e["eventType"] == "human.decision"
    ]
    assert len(humans) == 1

    allowed = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=checker_headers,
        json={"inputs": {"checkerDecision": "accept_adjustment"}, "expectedUpdatedAt": token},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["status"] == "completed"
