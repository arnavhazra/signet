from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400, error: str = "BAD_REQUEST", extra: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error = error
        self.extra = extra or {}


class InvalidWizardInputError(AppError):
    def __init__(self, field: str, message: str):
        super().__init__(message, status_code=400, error="INVALID_INPUT", extra={"field": field})
        self.field = field


class Bracket(BaseModel):
    max: int | float | str
    output: int | float | str


class FilterValueBinding(BaseModel):
    kind: Literal["filter_value"]
    field: str


class FilterBracketBinding(BaseModel):
    kind: Literal["filter_bracket"]
    field: str
    brackets: list[Bracket]
    cap: float | None = None


class QueryTokenBinding(BaseModel):
    kind: Literal["query_token"]
    template: str
    derivedAs: str | None = None


Binding = FilterValueBinding | FilterBracketBinding | QueryTokenBinding

ARTIFACT_TYPES = ("choice_cards", "toggle", "numeric_input", "approval_card")


class WizardStep(BaseModel):
    questionId: str
    order: int
    title: str
    helperText: str | None = None
    artifactType: Literal["choice_cards", "toggle", "numeric_input", "approval_card"]
    config: dict[str, Any] = Field(default_factory=dict)
    binding: Binding
    required: bool = True


class Edge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_node: str = Field(alias="from")
    to: str
    condition: str | None = None


class WorkflowDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    entryNodeId: str | None = None
    nodes: list[dict[str, Any]]
    edges: list[Edge]
    steps: list[WizardStep] = Field(default_factory=list)
    queryTemplate: str | None = None


class CreateWorkflowBody(BaseModel):
    slug: str
    name: str
    definition: WorkflowDefinition


class PreviewBody(BaseModel):
    inputs: dict[str, Any]


class ExceptionEvent(BaseModel):
    accountId: str
    securityId: str
    bookQty: float
    custodianQty: float
    asOf: str
    source: str
    workflowSlug: str | None = None


class AdvanceBody(BaseModel):
    inputs: dict[str, Any]
    expectedUpdatedAt: str | None = None


class ProposeBody(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "intent": "resolve_break",
                    "accountId": "A-214",
                    "rationale": "Book vs custodian delta exceeds threshold",
                }
            ]
        }
    )

    intent: str | None = None
    text: str | None = None
    accountId: str | None = None
    params: dict[str, Any] | None = None
    rationale: str | None = None


class PublicStep(BaseModel):
    questionId: str
    order: int
    title: str
    helperText: str | None = None
    artifactType: str
    config: dict[str, Any]
    required: bool


class ActiveWorkflow(BaseModel):
    workflowId: str
    version: int
    slug: str
    name: str
    steps: list[PublicStep]


INBOX_EXAMPLE: dict[str, Any] = {
    "items": [
        {
            "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "accountId": "A-214",
            "securityId": "US5949181045",
            "bookQty": 5000.0,
            "custodianQty": 4880.0,
            "delta": 120.0,
            "asOf": "2026-09-15",
            "status": "open",
            "awaitingChecker": False,
            "createdAt": "2026-09-15T14:00:00.000000Z",
            "workflowSlug": "exception-review",
        }
    ]
}

SESSION_EXAMPLE: dict[str, Any] = {
    "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "status": "awaiting_input",
    "currentNode": {
        "id": "maker_approval",
        "questionId": "decision",
        "title": "Accept adjustment?",
        "artifactType": "approval_card",
        "config": {},
        "helperText": None,
    },
    "accumulatedAnswers": {"accountId": "A-214", "securityId": "US5949181045"},
    "derived": {"delta": 120.0},
    "citations": [{"source": "book", "recordId": "A-214", "asOf": "2026-09-15"}],
    "workflowId": "11111111-1111-1111-1111-111111111111",
    "version": 1,
    "updatedAt": "2026-09-15T14:00:01.000000Z",
    "awaitingChecker": False,
    "orgId": "org_v_example",
}

PROPOSE_EXAMPLE: dict[str, Any] = {
    "decision": "requires_human",
    "policy": {"rule": "write_class_requires_human", "threshold": 100, "delta": 120},
    "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "approvalUrl": "/sessions/3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "auditEventId": "22222222-2222-2222-2222-222222222222",
    "proposal": {"intent": "resolve_break", "accountId": "A-214"},
}

AUDIT_EXAMPLE: dict[str, Any] = {
    "events": [
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "eventType": "agent.proposed",
            "actor": "operator",
            "payload": {"intent": "resolve_break", "accountId": "A-214", "decision": "requires_human"},
            "createdAt": "2026-09-15T14:00:02.000000Z",
        }
    ]
}

DEMO_AUTH_EXAMPLE: dict[str, Any] = {
    "ok": True,
    "role": "operator",
    "orgId": "org_v_example",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example",
}


def openapi_example(value: dict[str, Any]) -> dict[str, Any]:
    return {"content": {"application/json": {"example": value}}}


class CurrentNode(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    questionId: str | None = None
    title: str = ""
    artifactType: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    helperText: str | None = None


class Citation(BaseModel):
    model_config = ConfigDict(extra="allow")

    source: str | None = None
    recordId: str | None = None
    asOf: str | None = None


class SessionSnapshot(BaseModel):
    model_config = ConfigDict(extra="allow", json_schema_extra={"examples": [SESSION_EXAMPLE]})

    sessionId: str
    status: Literal["created", "active", "awaiting_input", "completed", "failed"] | str
    currentNode: CurrentNode | None = None
    accumulatedAnswers: dict[str, Any] = Field(default_factory=dict)
    derived: dict[str, Any] = Field(default_factory=dict)
    citations: list[Citation] = Field(default_factory=list)
    workflowId: str
    version: int
    updatedAt: str | None = None
    awaitingChecker: bool = False
    orgId: str | None = None


class InboxItem(BaseModel):
    sessionId: str
    accountId: str = ""
    securityId: str = ""
    bookQty: float | None = None
    custodianQty: float | None = None
    delta: float = 0.0
    asOf: str = ""
    status: str
    awaitingChecker: bool = False
    createdAt: str | None = None
    workflowSlug: str = ""


class InboxListResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [INBOX_EXAMPLE]})

    items: list[InboxItem] = Field(default_factory=list)


class AuditEventOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    sessionId: str | None = None
    eventType: str
    actor: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    createdAt: str | None = None


class AuditListResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [AUDIT_EXAMPLE]})

    events: list[AuditEventOut] = Field(default_factory=list)


class ProposeResponse(BaseModel):
    model_config = ConfigDict(extra="allow", json_schema_extra={"examples": [PROPOSE_EXAMPLE]})

    decision: Literal["requires_human", "auto_executed", "denied"] | str
    policy: dict[str, Any] = Field(default_factory=dict)
    auditEventId: str
    proposal: dict[str, Any] = Field(default_factory=dict)
    sessionId: str | None = None
    approvalUrl: str | None = None


class DemoAuthResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [DEMO_AUTH_EXAMPLE]})

    ok: bool = True
    role: str
    orgId: str
    accessToken: str
