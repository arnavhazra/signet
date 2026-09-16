from __future__ import annotations

from app.engine.linter import lint_workflow


def test_lint_cycle_is_error():
    result = lint_workflow(
        {
            "entryNodeId": "a",
            "nodes": [
                {"id": "a", "type": "logic", "subtype": "expression", "expression": "1", "outputKey": "x"},
                {"id": "b", "type": "logic", "subtype": "expression", "expression": "1", "outputKey": "y"},
            ],
            "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}],
        }
    )
    assert result["valid"] is False
    assert any("cycle" in e["message"].lower() for e in result["errors"])


def test_lint_missing_tool_name():
    result = lint_workflow(
        {
            "entryNodeId": "t",
            "nodes": [{"id": "t", "type": "logic", "subtype": "tool"}],
            "edges": [],
        }
    )
    assert result["valid"] is False
    assert any("toolName" in e["message"] for e in result["errors"])


async def test_publish_rejects_cycle(client, admin_headers):
    created = await client.post(
        "/admin/workflows",
        headers=admin_headers,
        json={
            "slug": "cyclic",
            "name": "Cyclic",
            "definition": {
                "entryNodeId": "a",
                "nodes": [
                    {"id": "a", "type": "ui", "questionId": "q", "artifactType": "toggle"},
                    {"id": "b", "type": "ui", "questionId": "r", "artifactType": "toggle"},
                ],
                "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}],
                "steps": [
                    {
                        "questionId": "q",
                        "order": 1,
                        "title": "Q",
                        "artifactType": "toggle",
                        "config": {"label": "On"},
                        "binding": {"kind": "filter_value", "field": "q"},
                    },
                    {
                        "questionId": "r",
                        "order": 2,
                        "title": "R",
                        "artifactType": "toggle",
                        "config": {"label": "On"},
                        "binding": {"kind": "filter_value", "field": "r"},
                    },
                ],
            },
        },
    )
    assert created.status_code == 400
    assert created.json()["error"] == "VALIDATION"


async def test_preview_returns_lint_errors(client, admin_headers):
    created = await client.post(
        "/admin/workflows",
        headers=admin_headers,
        json={
            "slug": "missing-tool",
            "name": "Missing tool",
            "definition": {
                "entryNodeId": "t",
                "nodes": [{"id": "t", "type": "logic", "subtype": "tool"}],
                "edges": [],
                "steps": [
                    {
                        "questionId": "x",
                        "order": 1,
                        "title": "X",
                        "artifactType": "toggle",
                        "config": {"label": "On"},
                        "binding": {"kind": "filter_value", "field": "x"},
                    }
                ],
            },
        },
    )
    # create itself validates and should reject missing toolName
    if created.status_code == 400:
        assert any("toolName" in str(item) for item in created.json().get("issues", []))
        return
    preview = await client.post(
        f"/admin/workflows/{created.json()['id']}/preview",
        headers=admin_headers,
        json={"inputs": {}},
    )
    assert preview.status_code == 200
    assert preview.json()["lint"]["valid"] is False
    assert any("toolName" in e for e in preview.json()["errors"])
