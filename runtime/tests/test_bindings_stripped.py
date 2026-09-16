from __future__ import annotations

import json


async def test_active_payload_strips_bindings(client, api_headers, admin_headers):
    active = await client.get("/v1/workflows/exception-review/active", headers=api_headers)
    assert active.status_code == 200, active.text
    body = active.json()
    blob = json.dumps(body)
    assert "binding" not in blob
    assert "filter_value" not in blob
    assert "filter_bracket" not in blob
    assert "query_token" not in blob
    assert body["slug"] == "exception-review"
    assert body["name"] == "Exception review"
    assert "workflowId" in body
    assert body["version"] == 1
    assert body["steps"]
    step = body["steps"][0]
    assert set(step.keys()) == {
        "questionId",
        "order",
        "title",
        "helperText",
        "artifactType",
        "config",
        "required",
    }
    assert step["artifactType"] == "approval_card"
    assert step["questionId"] == "decision"

    listed = await client.get("/admin/workflows", headers=admin_headers)
    assert listed.status_code == 200
    workflow_id = listed.json()["workflows"][0]["id"]
    admin = await client.get(f"/admin/workflows/{workflow_id}", headers=admin_headers)
    assert admin.status_code == 200
    definition = admin.json()["definition"]
    assert definition["steps"][0]["binding"]["kind"] == "filter_value"


async def test_operator_cannot_read_admin(client, operator_headers):
    response = await client.get("/admin/workflows", headers=operator_headers)
    assert response.status_code == 403


async def test_admin_create_preview_publish(client, admin_headers, api_headers):
    created = await client.post(
        "/admin/workflows",
        headers=admin_headers,
        json={
            "slug": "tiny-toggle",
            "name": "Tiny toggle",
            "definition": {
                "entryNodeId": "ask",
                "nodes": [
                    {
                        "id": "ask",
                        "type": "ui",
                        "name": "Ask",
                        "questionId": "on",
                        "artifactType": "toggle",
                    }
                ],
                "edges": [],
                "steps": [
                    {
                        "questionId": "on",
                        "order": 1,
                        "title": "Enabled?",
                        "helperText": None,
                        "artifactType": "toggle",
                        "config": {"label": "Enabled"},
                        "binding": {"kind": "filter_value", "field": "enabled"},
                        "required": True,
                    }
                ],
            },
        },
    )
    assert created.status_code == 200, created.text
    workflow_id = created.json()["id"]
    assert created.json()["status"] == "draft"
    assert created.json()["definition"]["edges"] == []
    assert created.json()["definition"]["steps"][0]["binding"]["kind"] == "filter_value"

    preview = await client.post(
        f"/admin/workflows/{workflow_id}/preview",
        headers=admin_headers,
        json={"inputs": {"on": True}},
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["filters"]["enabled"] is True

    published = await client.post(f"/admin/workflows/{workflow_id}/publish", headers=admin_headers)
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    active = await client.get("/v1/workflows/tiny-toggle/active", headers=api_headers)
    assert active.status_code == 200
    assert "binding" not in active.text
    assert active.json()["steps"][0]["artifactType"] == "toggle"
