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
