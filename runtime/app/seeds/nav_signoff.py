from __future__ import annotations

NAV_SIGNOFF_EVENT = {
    "accountId": "A-NAV",
    "securityId": "NAV-FUND-1",
    "bookQty": 104.25,
    "custodianQty": 104.25,
    "asOf": "2026-09-16",
    "source": "seed-nav-signoff",
    "workflowSlug": "nav-signoff",
}

NAV_SIGNOFF_DEFINITION = {
    "entryNodeId": "ask_override",
    "queryTemplate": None,
    "steps": [
        {
            "questionId": "overrideNav",
            "order": 1,
            "title": "NAV override",
            "helperText": "Enter the signed-off NAV. The kernel stores the override; it is not computed in the browser.",
            "artifactType": "numeric_input",
            "config": {"label": "Override NAV", "min": 0, "step": 0.01, "unit": "NAV"},
            "binding": {"kind": "filter_value", "field": "overrideNav"},
            "required": True,
        },
        {
            "questionId": "navDecision",
            "order": 2,
            "title": "Sign off NAV",
            "helperText": "Approve writes an audited remediation for the override delta.",
            "artifactType": "approval_card",
            "config": {
                "options": [
                    {
                        "value": "accept_adjustment",
                        "label": "Sign off",
                        "description": "Write the NAV override through the tool gateway",
                    },
                    {
                        "value": "reject",
                        "label": "Reject",
                        "description": "Leave the published NAV unchanged",
                    },
                ],
                "summaryFields": ["delta", "overrideNav", "bookQty", "accountId"],
            },
            "binding": {"kind": "filter_value", "field": "navDecision"},
            "required": True,
        },
    ],
    "nodes": [
        {
            "id": "ask_override",
            "type": "ui",
            "name": "NAV override",
            "questionId": "overrideNav",
            "artifactType": "numeric_input",
        },
        {
            "id": "compute_delta",
            "type": "logic",
            "subtype": "expression",
            "name": "Override minus published NAV",
            "expression": "overrideNav - bookQty",
            "outputKey": "delta",
        },
        {
            "id": "attach_citations",
            "type": "logic",
            "subtype": "tool",
            "name": "Attach NAV citations",
            "toolName": "attach_citations",
        },
        {
            "id": "approval",
            "type": "ui",
            "name": "Sign off",
            "questionId": "navDecision",
            "artifactType": "approval_card",
        },
        {
            "id": "accept_remediation",
            "type": "logic",
            "subtype": "tool",
            "name": "Write NAV remediation",
            "toolName": "write_remediation",
        },
        {
            "id": "reject_close",
            "type": "logic",
            "subtype": "tool",
            "name": "Leave NAV unchanged",
            "toolName": "close_exception",
            "params": {"outcome": "rejected"},
        },
    ],
    "edges": [
        {"from": "ask_override", "to": "compute_delta"},
        {"from": "compute_delta", "to": "attach_citations"},
        {"from": "attach_citations", "to": "approval"},
        {"from": "approval", "to": "accept_remediation", "condition": 'navDecision == "accept_adjustment"'},
        {"from": "approval", "to": "reject_close", "condition": 'navDecision == "reject"'},
    ],
}
