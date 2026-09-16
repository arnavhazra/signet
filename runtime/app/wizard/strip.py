from __future__ import annotations

from typing import Any


def strip_bindings(obj: Any) -> Any:
    """Recursively drop every `binding` key so rules never leave the server."""
    if isinstance(obj, dict):
        return {k: strip_bindings(v) for k, v in obj.items() if k != "binding"}
    if isinstance(obj, list):
        return [strip_bindings(item) for item in obj]
    return obj


def public_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    public = []
    for step in steps:
        public.append(
            {
                "questionId": step["questionId"],
                "order": step.get("order", 0),
                "title": step["title"],
                "helperText": step.get("helperText"),
                "artifactType": step["artifactType"],
                "config": step.get("config") or {},
                "required": step.get("required", True),
            }
        )
    return public
