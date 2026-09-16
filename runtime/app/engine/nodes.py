from __future__ import annotations

from typing import Any, Protocol

from app.engine.eval import evaluate
from app.logging import get_logger
from app.otel import get_tracer

log = get_logger("engine.nodes")
tracer = get_tracer("hitl-runtime")


class ToolRunner(Protocol):
    async def call(self, name: str, accumulated: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        ...


class BaseNode:
    def __init__(self, definition: dict[str, Any]):
        self.definition = definition

    @property
    def id(self) -> str:
        return self.definition["id"]

    @property
    def name(self) -> str:
        return self.definition.get("name") or self.id

    def is_ui_node(self) -> bool:
        return self.definition.get("type") == "ui"

    def is_logic_node(self) -> bool:
        return self.definition.get("type") == "logic"

    async def execute(self, inputs: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class UiNode(BaseNode):
    async def execute(self, inputs: dict[str, Any]) -> dict[str, Any]:
        return {
            "uiArtifact": self.definition.get("artifactType") or self.definition.get("uiArtifact"),
            "uiConfig": self.definition.get("config") or self.definition.get("uiConfig") or {},
            "context": inputs,
        }


class ExpressionNode(BaseNode):
    async def execute(self, inputs: dict[str, Any]) -> dict[str, Any]:
        expression = self.definition["expression"]
        output_key = self.definition["outputKey"]
        params = self.definition.get("params") or {}
        scope = {**params, **inputs}
        with tracer.start_as_current_span("dag.node") as span:
            span.set_attribute("dag.node.id", self.id)
            span.set_attribute("dag.node.type", "logic")
            span.set_attribute("dag.node.subtype", self.definition.get("subtype", "expression"))
            result = evaluate(expression, scope)
            log.info("expression_evaluated", node_id=self.id, expression=expression, result=result)
            return {output_key: result}


class TransformNode(ExpressionNode):
    """Same safe evaluator as expression — no arbitrary Python/JS eval."""


class ToolNode(BaseNode):
    def __init__(self, definition: dict[str, Any], tools: ToolRunner):
        super().__init__(definition)
        self.tools = tools

    async def execute(self, inputs: dict[str, Any]) -> dict[str, Any]:
        tool_name = self.definition["toolName"]
        params = self.definition.get("params") or {}
        with tracer.start_as_current_span("dag.node") as span:
            span.set_attribute("dag.node.id", self.id)
            span.set_attribute("dag.node.type", "logic")
            span.set_attribute("dag.node.subtype", "tool")
            span.set_attribute("tool.name", tool_name)
            return await self.tools.call(tool_name, inputs, params)


class NodeRegistry:
    def __init__(self, tools: ToolRunner | None = None):
        self.tools = tools

    def create(self, definition: dict[str, Any]) -> BaseNode:
        ntype = definition.get("type")
        if ntype == "ui":
            return UiNode(definition)
        if ntype != "logic":
            raise ValueError(f'Unknown node type "{ntype}" on "{definition.get("id")}"')
        subtype = definition.get("subtype")
        if subtype == "expression":
            return ExpressionNode(definition)
        if subtype == "transform":
            return TransformNode(definition)
        if subtype == "tool":
            if self.tools is None:
                raise ValueError("Tool node registered but no ToolRunner bound")
            return ToolNode(definition, self.tools)
        raise ValueError(
            f'Logic node "{definition.get("id")}" missing/unknown subtype "{subtype}". '
            "Expected: expression | tool | transform"
        )
