from __future__ import annotations

# Synthetic book vs custodian mismatch used in seed + demo script.
SYNTHETIC_EXCEPTION = {
    "accountId": "A-100",
    "securityId": "US0378331005",
    "bookQty": 150.0,
    "custodianQty": 120.0,
    "asOf": "2026-09-14",
    "source": "synthetic-fixture",
}

EXCEPTION_REVIEW_DEFINITION = {
    "entryNodeId": "compute_delta",
    "queryTemplate": None,
    "steps": [
        {
            "questionId": "decision",
            "order": 1,
            "title": "Book vs custodian mismatch",
            "helperText": "Delta and citations are computed server-side. Accept writes an audited remediation; reject closes; request more data completes as pending.",
            "artifactType": "approval_card",
            "config": {
                "options": [
                    {
                        "value": "accept_adjustment",
                        "label": "Accept adjustment",
                        "description": "Write a books-side remediation for the quantity delta",
                    },
                    {
                        "value": "reject",
                        "label": "Reject",
                        "description": "Close the exception with no position change",
                    },
                    {
                        "value": "request_more_data",
                        "label": "Request more data",
                        "description": "Park the exception as pending until the custodian feed is confirmed",
                    },
                ],
                "summaryFields": ["delta", "accountId", "securityId"],
            },
            "binding": {"kind": "filter_value", "field": "decision"},
            "required": True,
        }
    ],
    "nodes": [
        {
            "id": "compute_delta",
            "type": "logic",
            "subtype": "expression",
            "name": "Compute quantity delta",
            "expression": "bookQty - custodianQty",
            "outputKey": "delta",
        },
        {
            "id": "attach_citations",
            "type": "logic",
            "subtype": "tool",
            "name": "Attach position citations",
            "toolName": "attach_citations",
        },
        {
            "id": "approval",
            "type": "ui",
            "name": "Approve exception",
            "questionId": "decision",
            "artifactType": "approval_card",
        },
        {
            "id": "accept_remediation",
            "type": "logic",
            "subtype": "tool",
            "name": "Write audited remediation",
            "toolName": "write_remediation",
        },
        {
            "id": "reject_close",
            "type": "logic",
            "subtype": "tool",
            "name": "Close rejected exception",
            "toolName": "close_exception",
            "params": {"outcome": "rejected"},
        },
        {
            "id": "request_more",
            "type": "logic",
            "subtype": "tool",
            "name": "Complete as pending more data",
            "toolName": "close_exception",
            "params": {"outcome": "pending_more_data"},
        },
    ],
    "edges": [
        {"from": "compute_delta", "to": "attach_citations"},
        {"from": "attach_citations", "to": "approval"},
        {"from": "approval", "to": "accept_remediation", "condition": 'decision == "accept_adjustment"'},
        {"from": "approval", "to": "reject_close", "condition": 'decision == "reject"'},
        {"from": "approval", "to": "request_more", "condition": 'decision == "request_more_data"'},
    ],
}
