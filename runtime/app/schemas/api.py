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


class CurrentNode(BaseModel):
    id: str
    questionId: str | None = None
    title: str
    artifactType: str
    config: dict[str, Any]
    helperText: str | None = None


class Citation(BaseModel):
    source: str
    recordId: str
    asOf: str


class SessionSnapshot(BaseModel):
    sessionId: str
    status: Literal["created", "active", "awaiting_input", "completed", "failed"]
    currentNode: CurrentNode | None
    accumulatedAnswers: dict[str, Any]
    derived: dict[str, Any]
    citations: list[Citation]
    workflowId: str
    version: int
