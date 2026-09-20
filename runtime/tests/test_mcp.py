from __future__ import annotations

from app.auth.deps import decode_token
from app.routes.mcp import INBOX_RESOURCE_URI, TOOLS


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
    assert result["capabilities"]["tools"]["listChanged"] is False
    assert "resources" in result["capabilities"]
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


async def test_demo_auth_returns_visitor_jwt(demo_client, demo_app):
    response = await demo_client.get("/v1/auth/demo")
    assert response.status_code == 200, response.text
    body = response.json()
    token = body["accessToken"]
    assert token
    assert token.count(".") == 2
    payload = decode_token(token, demo_app.state.settings)
    assert payload["role"] == "operator"
    assert payload["org_id"] == body["orgId"]
    assert str(payload["org_id"]).startswith("org_v_")
    assert int(payload["exp"]) > int(payload["iat"])
    assert int(payload["exp"]) - int(payload["iat"]) <= 12 * 3600


async def test_mcp_accepts_demo_access_token_without_cookie(demo_app):
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=demo_app)
    async with AsyncClient(transport=transport, base_url="http://test") as minted:
        auth = await minted.get("/v1/auth/demo")
        assert auth.status_code == 200
        token = auth.json()["accessToken"]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        listed = await client.post(
            "/mcp",
            headers={"Authorization": f"Bearer {token}"},
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        )
        assert listed.status_code == 200, listed.text
        names = {tool["name"] for tool in listed.json()["result"]["tools"]}
        assert names == {"list_exceptions", "propose_remediation", "get_session", "get_audit"}


async def test_mcp_resources_list_and_read_inbox(demo_client):
    auth = await demo_client.get("/v1/auth/demo")
    assert auth.status_code == 200
    token = auth.json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    listed = await demo_client.post(
        "/mcp",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 10, "method": "resources/list"},
    )
    assert listed.status_code == 200, listed.text
    resources = listed.json()["result"]["resources"]
    uris = {row["uri"] for row in resources}
    assert INBOX_RESOURCE_URI in uris
    read = await demo_client.post(
        "/mcp",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 11, "method": "resources/read", "params": {"uri": INBOX_RESOURCE_URI}},
    )
    assert read.status_code == 200, read.text
    contents = read.json()["result"]["contents"]
    assert contents
    text = contents[0]["text"]
    assert "A-214" in text
    assert "sessionId" in text


async def test_mcp_resources_read_unknown_uri(demo_client):
    await demo_client.get("/v1/auth/demo")
    response = await demo_client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 12, "method": "resources/read", "params": {"uri": "signet://nope"}},
    )
    assert response.status_code == 200, response.text
    error = response.json()["error"]
    assert error["code"] == -32002
