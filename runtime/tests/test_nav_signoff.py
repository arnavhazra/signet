from __future__ import annotations

from app.seeds.nav_signoff import NAV_SIGNOFF_EVENT


async def test_nav_signoff_numeric_then_approval(client, api_headers):
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=NAV_SIGNOFF_EVENT)
    assert created.status_code == 200, created.text
    snap = created.json()
    assert snap["currentNode"]["artifactType"] == "numeric_input"
    assert snap["currentNode"]["questionId"] == "overrideNav"
    session_id = snap["sessionId"]

    after_num = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"overrideNav": 105.5}, "expectedUpdatedAt": snap["updatedAt"]},
    )
    assert after_num.status_code == 200, after_num.text
    halted = after_num.json()
    assert halted["status"] == "awaiting_input"
    assert halted["currentNode"]["id"] == "approval"
    assert halted["derived"]["delta"] == 1.25

    done = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"navDecision": "accept_adjustment"}, "expectedUpdatedAt": halted["updatedAt"]},
    )
    assert done.json()["status"] == "completed"
    types = [e["eventType"] for e in (await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)).json()["events"]]
    assert "remediation.written" in types
