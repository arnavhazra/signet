from __future__ import annotations

import json

from app.engine.dag import DagEngine, SessionState
from app.engine.nodes import NodeRegistry


class DenyTools:
    async def call(self, name, accumulated, params):
        from app.schemas.api import AppError

        raise AppError(f"tool not allowlisted: {name}", status_code=403, error="TOOL_IAM")


async def test_unknown_tool_denied(client, admin_headers, api_headers):
    created = await client.post(
        "/admin/workflows",
        headers=admin_headers,
        json={
            "slug": "bad-tool",
            "name": "Bad tool",
            "definition": {
                "entryNodeId": "t",
                "nodes": [{"id": "t", "type": "logic", "subtype": "tool", "toolName": "drop_table"}],
                "edges": [],
                "steps": [],
            },
        },
    )
    assert created.status_code == 200, created.text
    published = await client.post(f"/admin/workflows/{created.json()['id']}/publish", headers=admin_headers)
    assert published.status_code == 200, published.text
    ingested = await client.post(
        "/v1/events/exceptions",
        headers=api_headers,
        json={
            "accountId": "A-1",
            "securityId": "X",
            "bookQty": 1,
            "custodianQty": 1,
            "asOf": "2026-09-16",
            "source": "deny-tool",
            "workflowSlug": "bad-tool",
        },
    )
    assert ingested.status_code == 200, ingested.text
    body = ingested.json()
    assert body["status"] == "failed"
    audit = await client.get(f"/v1/sessions/{body['sessionId']}/audit", headers=api_headers)
    types = [e["eventType"] for e in audit.json()["events"]]
    assert "tool.denied" in types
    assert "remediation.written" not in types


async def test_engine_unknown_tool_raises():
    engine = DagEngine(NodeRegistry(tools=DenyTools()))
    session = SessionState(
        session_id="s-deny",
        workflow_id="wf",
        version=1,
        current_node_id="t",
        accumulated_answers={},
        status="created",
    )
    result = await engine.start(
        {"entryNodeId": "t", "nodes": [{"id": "t", "type": "logic", "subtype": "tool", "toolName": "nope"}], "edges": []},
        session,
    )
    assert result.status == "failed"
    assert "allowlisted" in (result.error or "")


async def test_inbox_and_replay_strip_bindings(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "inbox-replay"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]
    inbox = await client.get("/v1/inbox", headers=api_headers)
    assert inbox.status_code == 200
    items = inbox.json()["items"]
    assert any(i["sessionId"] == session_id for i in items)
    row = next(i for i in items if i["sessionId"] == session_id)
    assert row["status"] == "open"
    assert row["delta"] == 30
    replay = await client.get(f"/v1/sessions/{session_id}/replay", headers=api_headers)
    assert replay.status_code == 200
    body = replay.json()
    blob = json.dumps(body)
    assert "binding" not in blob
    assert "filter_value" not in blob
    assert body["slug"] == "exception-review"
    assert body["version"] == 1
    search = await client.get("/v1/audit", headers=api_headers, params={"accountId": "A-100"})
    assert search.status_code == 200
    assert search.json()["events"]
