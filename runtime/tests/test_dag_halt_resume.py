from __future__ import annotations

import json

from app.engine.dag import DagEngine, SessionState
from app.engine.nodes import NodeRegistry
from app.seeds.exception_review import EXCEPTION_REVIEW_DEFINITION, SYNTHETIC_EXCEPTION


class RecordingTools:
    def __init__(self):
        self.calls: list[str] = []

    async def call(self, name, accumulated, params):
        self.calls.append(name)
        if name == "attach_citations":
            return {
                "citations": [
                    {"source": "book_ledger", "recordId": "pos-book-A-100-US0378331005", "asOf": "2026-09-14"}
                ]
            }
        if name == "write_remediation":
            return {"outcome": "accepted", "remediationId": "rem-1"}
        return {"outcome": params.get("outcome"), "reason": accumulated.get("reason")}


async def test_engine_halts_on_approval_then_resumes():
    tools = RecordingTools()
    engine = DagEngine(NodeRegistry(tools=tools))
    session = SessionState(
        session_id="s1",
        workflow_id="wf",
        version=1,
        current_node_id="compute_delta",
        accumulated_answers=dict(SYNTHETIC_EXCEPTION),
        status="created",
    )
    halted = await engine.start(EXCEPTION_REVIEW_DEFINITION, session)
    assert halted.status == "awaiting_input"
    assert halted.session.accumulated_answers["delta"] == 30
    assert halted.ui_node["id"] == "approval"
    assert "attach_citations" in tools.calls
    assert "write_remediation" not in tools.calls

    halted.session.accumulated_answers["decision"] = "accept_adjustment"
    done = await engine.advance(halted.session, EXCEPTION_REVIEW_DEFINITION, {})
    assert done.status == "completed"
    assert done.session.derived["outcome"] == "accepted"
    assert "write_remediation" in tools.calls


async def test_api_approve_writes_audit_and_remediation(client, api_headers, fixture_event):
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=fixture_event)
    assert created.status_code == 200, created.text
    snap = created.json()
    assert snap["status"] == "awaiting_input"
    assert snap["currentNode"]["artifactType"] == "approval_card"
    assert snap["currentNode"]["id"] == "approval"
    assert snap["derived"]["delta"] == 30
    assert len(snap["citations"]) == 2
    assert snap["citations"][0]["source"] == "book_ledger"
    fields = {item["label"]: item["value"] for item in snap["currentNode"]["config"]["fields"]}
    assert fields["delta"] == 30
    assert fields["accountId"] == "A-100"
    assert "binding" not in json.dumps(snap["currentNode"])
    session_id = snap["sessionId"]

    advanced = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "accept_adjustment"}},
    )
    assert advanced.status_code == 200, advanced.text
    done = advanced.json()
    assert done["status"] == "completed"
    assert done["currentNode"] is None
    assert done["derived"]["outcome"] == "accepted"
    assert done["accumulatedAnswers"]["decision"] == "accept_adjustment"

    audit = await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)
    assert audit.status_code == 200
    events = audit.json()["events"]
    types = [e["eventType"] for e in events]
    assert "session.created" in types
    assert "tool.invoked" in types
    assert "remediation.written" in types
    invoked_tools = [e["payload"].get("tool") for e in events if e["eventType"] == "tool.invoked"]
    assert "write_remediation" in invoked_tools
    written = next(e for e in events if e["eventType"] == "remediation.written")
    assert written["payload"]["delta"] == 30
    assert written["payload"]["auditEventId"]


async def test_reject_closes_without_remediation(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "reject-path"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]
    done = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "reject", "reason": "custodian feed lag"}},
    )
    assert done.status_code == 200
    body = done.json()
    assert body["status"] == "completed"
    assert body["derived"]["outcome"] == "rejected"
    audit = await client.get(f"/v1/sessions/{session_id}/audit", headers=api_headers)
    types = [e["eventType"] for e in audit.json()["events"]]
    assert "remediation.written" not in types
    assert "tool.invoked" in types


async def test_advance_accepts_dag_node_id_as_input_key(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "node-id-key"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    snap = created.json()
    session_id = snap["sessionId"]
    assert snap["currentNode"]["id"] == "approval"
    assert snap["currentNode"]["questionId"] == "decision"
    done = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"approval": "accept_adjustment"}},
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"
    assert done.json()["accumulatedAnswers"]["decision"] == "accept_adjustment"


async def test_request_more_data_completes_pending(client, api_headers, fixture_event):
    event = {**fixture_event, "source": "pending-path"}
    created = await client.post("/v1/events/exceptions", headers=api_headers, json=event)
    session_id = created.json()["sessionId"]
    done = await client.post(
        f"/v1/sessions/{session_id}/advance",
        headers=api_headers,
        json={"inputs": {"decision": "request_more_data"}},
    )
    assert done.json()["status"] == "completed"
    assert done.json()["derived"]["outcome"] == "pending_more_data"
