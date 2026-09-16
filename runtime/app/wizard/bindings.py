from __future__ import annotations

"""Server-only binding DSL. These never appear on GET /v1/workflows/{slug}/active."""

from typing import Literal, TypedDict


class FilterValue(TypedDict):
    kind: Literal["filter_value"]
    field: str


class Bracket(TypedDict):
    max: int | float | str
    output: int | float | str


class FilterBracket(TypedDict):
    kind: Literal["filter_bracket"]
    field: str
    brackets: list[Bracket]
    cap: float


class QueryToken(TypedDict):
    kind: Literal["query_token"]
    template: str
    derivedAs: str


Binding = FilterValue | FilterBracket | QueryToken

BINDING_KINDS = ("filter_value", "filter_bracket", "query_token")
