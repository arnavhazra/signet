from __future__ import annotations

from typing import Any

from app.schemas.api import InvalidWizardInputError


def interpolate(template: str, variables: dict[str, Any]) -> str:
    def repl(match_key: str) -> str:
        value = variables.get(match_key)
        return "" if value is None else str(value)

    out = template
    # {value} and {derivedKey}
    i = 0
    result: list[str] = []
    while i < len(out):
        if out[i] == "{":
            end = out.find("}", i)
            if end == -1:
                result.append(out[i:])
                break
            key = out[i + 1 : end]
            result.append(repl(key))
            i = end + 1
        else:
            result.append(out[i])
            i += 1
    return "".join(result)


def resolve_wizard(wizard: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    """Pure function: bindings → query / filters / derived. No I/O."""
    filters: dict[str, Any] = {}
    query_tokens: list[str] = []
    derived: dict[str, Any] = {}
    steps = wizard.get("steps") or []

    for step in steps:
        question_id = step["questionId"]
        value = inputs.get(question_id)
        required = step.get("required", True)
        if value is None or value == "":
            if required:
                raise InvalidWizardInputError(question_id, f"Missing required input '{question_id}'")
            continue

        binding = step.get("binding") or {}
        kind = binding.get("kind")
        if kind == "filter_value":
            field = binding["field"]
            filters[field] = value
            derived[field] = value
        elif kind == "filter_bracket":
            match = None
            for bracket in binding.get("brackets") or []:
                mx = bracket["max"]
                if isinstance(mx, (int, float)) and not isinstance(mx, bool):
                    if float(value) <= float(mx):
                        match = bracket
                        break
                elif value == mx:
                    match = bracket
                    break
            if not match:
                continue
            out = match["output"]
            cap = binding.get("cap")
            if isinstance(out, (int, float)) and not isinstance(out, bool) and cap is not None:
                out = min(out, cap)
            field = binding["field"]
            filters[field] = out
            derived[field] = out
        elif kind == "query_token":
            token = interpolate(binding["template"], {"value": value, **derived}).strip()
            if token:
                query_tokens.append(token)
            if binding.get("derivedAs"):
                derived[binding["derivedAs"]] = value
        else:
            continue

    template = wizard.get("queryTemplate") or ""
    from_template = interpolate(template, derived).strip() if template else ""
    query = " ".join(part for part in [from_template, *query_tokens] if part).strip()
    return {"query": query, "filters": filters, "derived": derived}
