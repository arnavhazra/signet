from __future__ import annotations

from typing import Any, Literal

from app.org import CHECKER_THRESHOLD

WRITE_INTENTS = frozenset({"resolve_break", "adjust_position"})
READ_INTENTS = frozenset({"list_exceptions", "explain_break"})
KNOWN_INTENTS = WRITE_INTENTS | READ_INTENTS

Decision = Literal["requires_human", "auto_executed", "denied"]
IntentClass = Literal["write", "read", "unknown"]


def normalize_intent(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "unknown"
    text = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text or "unknown"


def classify_intent(intent: str | None) -> IntentClass:
    name = normalize_intent(intent)
    if name in WRITE_INTENTS:
        return "write"
    if name in READ_INTENTS:
        return "read"
    return "unknown"


def evaluate_policy(intent: str | None, *, delta: float | None = None) -> dict[str, Any]:
    """Server-side allowlist. Agents never get a silent write."""
    kind = classify_intent(intent)
    if kind == "write":
        policy: dict[str, Any] = {
            "rule": "write_class_requires_human",
            "threshold": CHECKER_THRESHOLD,
        }
        if delta is not None:
            policy["delta"] = delta
        return {"decision": "requires_human", "policy": policy, "class": kind}
    if kind == "read":
        return {
            "decision": "auto_executed",
            "policy": {"rule": "read_class_auto_executed"},
            "class": kind,
        }
    return {
        "decision": "denied",
        "policy": {"rule": "unknown_intent_denied"},
        "class": kind,
    }
