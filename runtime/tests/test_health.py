async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready(client):
    response = await client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["postgres"] is True
    assert "redis" not in body["checks"]
    assert "nats" not in body["checks"]


async def test_cors_preflight_from_vite(client):
    response = await client.options(
        "/v1/events/exceptions",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-api-key,content-type",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"


async def test_cors_preflight_loopback_alt_port(client):
    response = await client.options(
        "/v1/events/exceptions",
        headers={
            "Origin": "http://localhost:5174",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-api-key,content-type",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5174"


async def test_request_id_echo(client):
    response = await client.get("/health", headers={"X-Request-Id": "hm-trace-1"})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "hm-trace-1"


async def test_missing_api_key(client):
    response = await client.get("/v1/workflows/exception-review/active")
    assert response.status_code == 401


async def test_openapi_core_examples(client):
    spec = (await client.get("/openapi.json")).json()
    schemas = spec["components"]["schemas"]
    inbox = spec["paths"]["/v1/inbox"]["get"]["responses"]["200"]["content"]["application/json"]
    assert "A-214" in str(inbox.get("example") or schemas.get("InboxListResponse", {}))
    session = spec["paths"]["/v1/sessions/{session_id}"]["get"]
    assert session.get("responses", {}).get("200")
    propose = spec["paths"]["/v1/agent/propose"]["post"]["responses"]["200"]["content"]["application/json"]
    assert "requires_human" in str(propose.get("example") or schemas.get("ProposeResponse", {}))
    audit = spec["paths"]["/v1/audit"]["get"]["responses"]["200"]["content"]["application/json"]
    assert "events" in str(audit.get("example") or schemas.get("AuditListResponse", {}))
    assert "accessToken" in schemas["DemoAuthResponse"]["properties"]


def test_otel_module_has_no_console_exporter():
    from pathlib import Path

    from app import otel

    source = Path(otel.__file__).read_text()
    assert "from opentelemetry.sdk.trace.export import BatchSpanProcessor" in source
    assert "ConsoleSpanExporter" not in source
    assert "SimpleSpanProcessor" not in source
