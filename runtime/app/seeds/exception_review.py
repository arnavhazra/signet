from __future__ import annotations

from app.org import CHECKER_THRESHOLD

# Synthetic book vs custodian mismatch used in seed + demo script.
SYNTHETIC_EXCEPTION = {
    "accountId": "A-100",
    "securityId": "US0378331005",
    "bookQty": 150.0,
    "custodianQty": 120.0,
    "asOf": "2026-09-14",
    "source": "synthetic-fixture",
}

# Sole A-214 row. Tour + agent sample both target this high-|delta| exception-review.
HIGH_DELTA_EXCEPTION = {
    "accountId": "A-214",
    "securityId": "US5949181045",
    "bookQty": 5000.0,
    "custodianQty": 4880.0,
    "asOf": "2026-09-15",
    "source": "synthetic-high-delta",
}

# Tour row first. Small mixed set so first GET /v1/inbox fits Vercel Hobby 30s
# (not 11 full DAGs). Every accountId is unique; only one A-214.
INBOX_SEED = [
    HIGH_DELTA_EXCEPTION,
    SYNTHETIC_EXCEPTION,
    {
        "accountId": "A-331",
        "securityId": "US02079K1079",
        "bookQty": 80.0,
        "custodianQty": 95.0,
        "asOf": "2026-09-12",
        "source": "seed-inbox-03",
    },
]

EXCEPTION_REVIEW_DEFINITION = {
    "entryNodeId": "compute_delta",
    "queryTemplate": None,
    "config": {"checkerThreshold": CHECKER_THRESHOLD},
    "steps": [
        {
            "questionId": "decision",
            "order": 1,
            "title": "Book vs custodian mismatch",
            "helperText": "Delta and citations are computed server-side. High |delta| requires a checker before remediation.",
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
                        "description": "Park the exception until the custodian feed is confirmed",
                    },
                ],
                "summaryFields": ["delta", "accountId", "securityId"],
            },
            "binding": {"kind": "filter_value", "field": "decision"},
            "required": True,
        },
        {
            "questionId": "checkerDecision",
            "order": 2,
            "title": "Checker approval",
            "helperText": "Quantity delta meets dual-control threshold. Second approval writes the remediation.",
            "artifactType": "approval_card",
            "config": {
                "options": [
                    {
                        "value": "accept_adjustment",
                        "label": "Approve",
                        "description": "Write the audited remediation",
                    },
                    {
                        "value": "reject",
                        "label": "Reject",
                        "description": "Close with no position change",
                    },
                ],
                "summaryFields": ["delta", "accountId", "securityId"],
            },
            "binding": {"kind": "filter_value", "field": "checkerDecision"},
            "required": True,
        },
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
            "id": "checker_approval",
            "type": "ui",
            "name": "Checker approval",
            "questionId": "checkerDecision",
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
        {
            "id": "checker_reject_close",
            "type": "logic",
            "subtype": "tool",
            "name": "Checker rejected",
            "toolName": "close_exception",
            "params": {"outcome": "rejected"},
        },
    ],
    "edges": [
        {"from": "compute_delta", "to": "attach_citations"},
        {"from": "attach_citations", "to": "approval"},
        {
            "from": "approval",
            "to": "checker_approval",
            "condition": f'decision == "accept_adjustment" and abs(delta) >= {CHECKER_THRESHOLD}',
        },
        {
            "from": "approval",
            "to": "accept_remediation",
            "condition": f'decision == "accept_adjustment" and abs(delta) < {CHECKER_THRESHOLD}',
        },
        {"from": "approval", "to": "reject_close", "condition": 'decision == "reject"'},
        {"from": "approval", "to": "request_more", "condition": 'decision == "request_more_data"'},
        {
            "from": "checker_approval",
            "to": "accept_remediation",
            "condition": 'checkerDecision == "accept_adjustment"',
        },
        {
            "from": "checker_approval",
            "to": "checker_reject_close",
            "condition": 'checkerDecision == "reject"',
        },
    ],
}
