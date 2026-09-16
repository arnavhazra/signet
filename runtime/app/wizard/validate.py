from __future__ import annotations

from typing import Any

from app.engine.linter import lint_workflow
from app.schemas.api import ARTIFACT_TYPES

ALLOWED_BINDING_KINDS = {"filter_value", "filter_bracket", "query_token"}


def validate_binding(binding: Any, step_label: str) -> str | None:
    if not isinstance(binding, dict):
        return f"{step_label}: binding required"
    kind = binding.get("kind")
    if kind not in ALLOWED_BINDING_KINDS:
        return f"{step_label}: unsupported binding kind '{kind}'"
    if kind == "filter_value":
        if not isinstance(binding.get("field"), str) or not binding["field"]:
            return f"{step_label}: filter_value requires 'field'"
    elif kind == "filter_bracket":
        if not isinstance(binding.get("field"), str) or not binding["field"]:
            return f"{step_label}: filter_bracket requires 'field'"
        brackets = binding.get("brackets")
        if not isinstance(brackets, list) or not brackets:
            return f"{step_label}: filter_bracket requires non-empty 'brackets'"
        outputs = []
        for bracket in brackets:
            if not isinstance(bracket, dict) or "max" not in bracket or "output" not in bracket:
                return f"{step_label}: each bracket needs 'max' and 'output'"
            outputs.append(type(bracket["output"]).__name__)
        if len(set(outputs)) > 1:
            return f"{step_label}: filter_bracket output types are inconsistent"
    elif kind == "query_token":
        if not isinstance(binding.get("template"), str) or not binding["template"]:
            return f"{step_label}: query_token requires 'template'"
        if binding.get("derivedAs") is not None and not isinstance(binding.get("derivedAs"), str):
            return f"{step_label}: query_token 'derivedAs' must be a string"
    return None


def validate_artifact(artifact_type: str, config: Any, step_label: str) -> str | None:
    if artifact_type not in ARTIFACT_TYPES:
        return f"{step_label}: unsupported artifactType '{artifact_type}'"
    if not isinstance(config, dict):
        return f"{step_label}: config required"
    if artifact_type in {"choice_cards", "approval_card"}:
        options = config.get("options")
        if not isinstance(options, list) or not options:
            return f"{step_label}: {artifact_type} needs non-empty options"
        for option in options:
            if not isinstance(option, dict) or not isinstance(option.get("value"), str) or not isinstance(option.get("label"), str):
                return f"{step_label}: each option needs string 'value' and 'label'"
    if artifact_type == "toggle" and not isinstance(config.get("label"), str):
        return f"{step_label}: toggle needs string 'label'"
    return None


def validate_definition(definition: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    steps = definition.get("steps") or []
    seen_q: set[str] = set()
    for step in steps:
        qid = step.get("questionId")
        label = f'step "{qid}"'
        if not qid:
            issues.append("step missing questionId")
            continue
        if qid in seen_q:
            issues.append(f"duplicate questionId '{qid}'")
        seen_q.add(qid)
        issues.append(validate_binding(step.get("binding"), label) or "")
        issues.append(validate_artifact(step.get("artifactType"), step.get("config"), label) or "")
    issues = [i for i in issues if i]

    lint = lint_workflow(definition)
    issues.extend(e["message"] for e in lint["errors"])
    return issues
