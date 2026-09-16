from __future__ import annotations

from typing import Any

from app.engine.eval import EvalError, evaluate


class LintIssue:
    def __init__(self, severity: str, message: str, node_id: str | None = None, edge_index: int | None = None):
        self.severity = severity
        self.message = message
        self.node_id = node_id
        self.edge_index = edge_index

    def as_dict(self) -> dict[str, Any]:
        payload = {"severity": self.severity, "message": self.message}
        if self.node_id:
            payload["nodeId"] = self.node_id
        if self.edge_index is not None:
            payload["edgeIndex"] = self.edge_index
        return payload


VALID_LOGIC_SUBTYPES = {"expression", "tool", "transform"}


def lint_workflow(definition: dict[str, Any]) -> dict[str, Any]:
    errors: list[LintIssue] = []
    warnings: list[LintIssue] = []
    nodes = definition.get("nodes") or []
    edges = definition.get("edges") or []

    seen = set()
    for node in nodes:
        nid = node.get("id")
        if not nid:
            errors.append(LintIssue("error", "Node missing id"))
            continue
        if nid in seen:
            errors.append(LintIssue("error", f'Duplicate node id "{nid}"', node_id=nid))
        seen.add(nid)

        if node.get("type") == "logic":
            subtype = node.get("subtype")
            if subtype not in VALID_LOGIC_SUBTYPES:
                errors.append(
                    LintIssue(
                        "error",
                        f'Logic node "{nid}" has unknown subtype "{subtype}". Expected: expression | tool | transform.',
                        node_id=nid,
                    )
                )
            if subtype in {"expression", "transform"} and not node.get("outputKey"):
                errors.append(LintIssue("error", f'Logic node "{nid}" missing outputKey', node_id=nid))
            if subtype == "tool" and not node.get("toolName"):
                errors.append(LintIssue("error", f'Logic node "{nid}" missing toolName', node_id=nid))

    node_ids = {n.get("id") for n in nodes}
    outgoing: dict[str, list[dict]] = {}
    for i, edge in enumerate(edges):
        src = edge.get("from")
        dest = edge.get("to")
        if src not in node_ids:
            errors.append(LintIssue("error", f'Edge[{i}]: from "{src}" does not exist', edge_index=i))
        if dest not in node_ids:
            errors.append(LintIssue("error", f'Edge[{i}]: to "{dest}" does not exist', edge_index=i))
        outgoing.setdefault(src, []).append(edge)
        if edge.get("condition"):
            try:
                evaluate(edge["condition"], {"__lint": 1})
            except EvalError:
                # Names may be missing at lint time; only fail on syntax.
                try:
                    compile(edge["condition"], "<edge>", "eval")
                except SyntaxError as exc:
                    errors.append(
                        LintIssue(
                            "error",
                            f'Edge[{i}] ({src} → {dest}): invalid condition "{edge["condition"]}": {exc}',
                            edge_index=i,
                        )
                    )

    for src, group in outgoing.items():
        unconditional = [e for e in group if not e.get("condition")]
        if len(unconditional) > 1:
            errors.append(
                LintIssue(
                    "error",
                    f'Node "{src}" has {len(unconditional)} unconditional edges. Only one fallback is allowed.',
                    node_id=src,
                )
            )

    cycle = _first_cycle(nodes, edges)
    if cycle:
        errors.append(LintIssue("error", f"Workflow has a cycle: {' → '.join(cycle)}"))

    entry = definition.get("entryNodeId") or (nodes[0]["id"] if nodes else None)
    reachable: set[str] = set()
    if entry:
        queue = [entry]
        adj: dict[str, list[str]] = {}
        for edge in edges:
            adj.setdefault(edge.get("from"), []).append(edge.get("to"))
        while queue:
            current = queue.pop(0)
            if current in reachable:
                continue
            reachable.add(current)
            queue.extend(adj.get(current, []))
        for node in nodes:
            if node.get("id") not in reachable:
                warnings.append(
                    LintIssue(
                        "warning",
                        f'Node "{node.get("id")}" is unreachable from entry "{entry}"',
                        node_id=node.get("id"),
                    )
                )

    nodes_with_out = {e.get("from") for e in edges}
    for node in nodes:
        if node.get("type") == "logic" and node.get("id") not in nodes_with_out:
            warnings.append(
                LintIssue(
                    "warning",
                    f'Logic node "{node.get("id")}" has no outgoing edges; workflow will complete after it.',
                    node_id=node.get("id"),
                )
            )

    return {
        "valid": len(errors) == 0,
        "errors": [e.as_dict() for e in errors],
        "warnings": [w.as_dict() for w in warnings],
    }


def _first_cycle(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str] | None:
    adj: dict[str, list[str]] = {}
    for edge in edges:
        src = edge.get("from")
        dest = edge.get("to")
        if src and dest:
            adj.setdefault(src, []).append(dest)
    color: dict[str, str] = {}
    stack: list[str] = []

    def dfs(node_id: str) -> list[str] | None:
        color[node_id] = "gray"
        stack.append(node_id)
        for nxt in adj.get(node_id, []):
            state = color.get(nxt, "white")
            if state == "gray":
                start = stack.index(nxt)
                return stack[start:] + [nxt]
            if state == "white":
                found = dfs(nxt)
                if found:
                    return found
        stack.pop()
        color[node_id] = "black"
        return None

    for node in nodes:
        nid = node.get("id")
        if nid and color.get(nid, "white") == "white":
            found = dfs(nid)
            if found:
                return found
    return None


def assert_valid_workflow(definition: dict[str, Any]) -> None:
    result = lint_workflow(definition)
    if not result["valid"]:
        messages = "\n".join(f"  - {e['message']}" for e in result["errors"])
        raise ValueError(f"WorkflowDefinition has errors:\n{messages}")
