from __future__ import annotations

from app.routes.mcp import TOOLS


async def test_mcp_requires_auth(client):
    response = await client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert response.status_code == 401


async def test_mcp_initialize_and_tools_list(client, api_headers):
    init = await client.post(
        "/mcp",
        headers=api_headers,
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert init.status_code == 200, init.text
    result = init.json()["result"]
    assert result["protocolVersion"] == "2025-03-26"
    assert result["serverInfo"]["name"] == "signet"
    listed = await client.post(
        "/mcp",
        headers=api_headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert listed.status_code == 200, listed.text
    names = {tool["name"] for tool in listed.json()["result"]["tools"]}
    assert names == {tool["name"] for tool in TOOLS}
    assert names == {"list_exceptions", "propose_remediation", "get_session", "get_audit"}


async def test_mcp_call_list_and_propose(demo_client):
    auth = await demo_client.get("/v1/auth/demo")
    assert auth.status_code == 200
    listed = await demo_client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "list_exceptions", "arguments": {}},
        },
    )
    assert listed.status_code == 200, listed.text
    payload = listed.json()["result"]
    assert payload["isError"] is False
    text = payload["content"][0]["text"]
    assert "sessionId" in text
    proposed = await demo_client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "propose_remediation",
                "arguments": {"intent": "resolve_break", "accountId": "A-214", "rationale": "mcp"},
            },
        },
    )
    assert proposed.status_code == 200, proposed.text
    body_text = proposed.json()["result"]["content"][0]["text"]
    assert "requires_human" in body_text
    assert "A-214" in body_text


async def test_mcp_unknown_tool_is_error(client, api_headers):
    response = await client.post(
        "/mcp",
        headers=api_headers,
        json={"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "drop_table", "arguments": {}}},
    )
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    assert result["isError"] is True
