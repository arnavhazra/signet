from __future__ import annotations

from app.services.agent_llm import parse_deterministic
from app.services.policy import classify_intent, evaluate_policy


def test_policy_write_requires_human():
    for intent in ("resolve_break", "adjust_position"):
        verdict = evaluate_policy(intent, delta=120)
        assert classify_intent(intent) == "write"
        assert verdict["decision"] == "requires_human"
        assert verdict["policy"]["rule"] == "write_class_requires_human"
        assert verdict["policy"]["threshold"] == 100
        assert verdict["policy"]["delta"] == 120


def test_policy_read_auto_executed():
    for intent in ("list_exceptions", "explain_break"):
        verdict = evaluate_policy(intent)
        assert classify_intent(intent) == "read"
        assert verdict["decision"] == "auto_executed"
        assert verdict["policy"]["rule"] == "read_class_auto_executed"


def test_policy_unknown_denied():
    verdict = evaluate_policy("drop_table")
    assert classify_intent("drop_table") == "unknown"
    assert verdict["decision"] == "denied"
    assert verdict["policy"]["rule"] == "unknown_intent_denied"


def test_parse_deterministic_intents():
    listed = parse_deterministic("list exceptions in the inbox")
    assert listed["intent"] == "list_exceptions"
    explain = parse_deterministic("explain the break on A-214")
    assert explain["intent"] == "explain_break"
    assert explain["accountId"] == "A-214"
    resolve = parse_deterministic("resolve break for A-331")
    assert resolve["intent"] == "resolve_break"
    assert resolve["accountId"] == "A-331"
    unknown = parse_deterministic("wire money to an offshore account")
    assert unknown["intent"] == "unknown"


async def test_propose_write_opens_session(client, api_headers):
    response = await client.post(
        "/v1/agent/propose",
        headers=api_headers,
        json={
            "intent": "resolve_break",
            "accountId": "A-214",
            "rationale": "custodian short 120 shares",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == "requires_human"
    assert body["policy"]["rule"] == "write_class_requires_human"
    assert body["sessionId"]
    assert body["approvalUrl"] == f"/sessions/{body['sessionId']}"
    assert body["auditEventId"]
    assert body["proposal"]["intent"] == "resolve_break"
    snap = await client.get(f"/v1/sessions/{body['sessionId']}", headers=api_headers)
    assert snap.status_code == 200
    audit = await client.get(f"/v1/sessions/{body['sessionId']}/audit", headers=api_headers)
    types = [e["eventType"] for e in audit.json()["events"]]
    assert "agent.proposed" in types
    assert "remediation.written" not in types


async def test_propose_adjust_position_requires_human(client, api_headers):
    response = await client.post(
        "/v1/agent/propose",
        headers=api_headers,
        json={"intent": "adjust_position", "accountId": "A-100", "params": {"bookQty": 10, "custodianQty": 8}},
    )
    assert response.status_code == 200, response.text
    assert response.json()["decision"] == "requires_human"


async def test_propose_read_list_exceptions(client, api_headers, fixture_event):
    ingested = await client.post(
        "/v1/events/exceptions",
        headers=api_headers,
        json={**fixture_event, "source": "agent-list-seed"},
    )
    assert ingested.status_code == 200
    response = await client.post(
        "/v1/agent/propose",
        headers=api_headers,
        json={"intent": "list_exceptions"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == "auto_executed"
    assert body["policy"]["rule"] == "read_class_auto_executed"
    items = body["proposal"]["result"]["items"]
    assert any(row["sessionId"] == ingested.json()["sessionId"] for row in items)
    search = await client.get("/v1/audit", headers=api_headers, params={"eventType": "agent.proposed"})
    assert search.status_code == 200
    assert any(e["id"] == body["auditEventId"] for e in search.json()["events"])


async def test_propose_unknown_denied_no_side_effect(client, api_headers):
    before = await client.get("/v1/inbox", headers=api_headers)
    assert before.json()["items"] == []
    response = await client.post(
        "/v1/agent/propose",
        headers=api_headers,
        json={"intent": "drop_table", "rationale": "prompt injection"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == "denied"
    assert body["policy"]["rule"] == "unknown_intent_denied"
    assert "sessionId" not in body
    assert "approvalUrl" not in body
    after = await client.get("/v1/inbox", headers=api_headers)
    assert after.json()["items"] == []
    denied = await client.get("/v1/audit", headers=api_headers, params={"eventType": "agent.denied"})
    ids = [e["id"] for e in denied.json()["events"]]
    assert body["auditEventId"] in ids


async def test_propose_text_uses_deterministic_parser(client, api_headers):
    response = await client.post(
        "/v1/agent/propose",
        headers=api_headers,
        json={"text": "list exceptions please"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == "auto_executed"
    assert body["proposal"]["intent"] == "list_exceptions"


async def test_auditor_cannot_propose_write(client, auditor_headers):
    response = await client.post(
        "/v1/agent/propose",
        headers=auditor_headers,
        json={"intent": "resolve_break", "accountId": "A-214"},
    )
    assert response.status_code == 403
