from __future__ import annotations

import json
import re
from typing import Any

from app.config import Settings
from app.logging import get_logger
from app.services.policy import KNOWN_INTENTS, normalize_intent

log = get_logger("agent_llm")

_ACCOUNT_RE = re.compile(r"\bA-\d+\b", re.IGNORECASE)

_SYSTEM = (
    "You convert an operator request into a Signet agent proposal. "
    "Reply with JSON only: "
    '{"intent":"...","accountId":null,"params":{},"rationale":"..."}. '
    "intent must be one of: resolve_break, adjust_position, list_exceptions, "
    "explain_break, unknown. Use unknown when the request is not one of those. "
    "accountId looks like A-214 when present."
)


def parse_deterministic(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    lowered = raw.lower()
    account = None
    match = _ACCOUNT_RE.search(raw)
    if match:
        account = match.group(0).upper()

    if ("list" in lowered and "exception" in lowered) or "show inbox" in lowered or "list_exceptions" in lowered:
        intent = "list_exceptions"
    elif "explain" in lowered:
        intent = "explain_break"
    elif "adjust" in lowered and "position" in lowered:
        intent = "adjust_position"
    elif any(tok in lowered for tok in ("resolve", "remediat", "fix break", "fix the break")):
        intent = "resolve_break"
    elif account and any(tok in lowered for tok in ("fix", "close", "accept", "resolve")):
        intent = "resolve_break"
    elif "break" in lowered and any(tok in lowered for tok in ("fix", "close", "resolve", "accept")):
        intent = "resolve_break"
    else:
        intent = "unknown"

    rationale = raw[:500] if raw else None
    return {
        "intent": intent,
        "accountId": account,
        "params": {},
        "rationale": rationale,
        "text": raw or None,
    }


def _coerce_proposal(data: dict[str, Any], text: str) -> dict[str, Any]:
    intent = normalize_intent(str(data.get("intent") or "unknown"))
    if intent not in KNOWN_INTENTS:
        intent = "unknown"
    account = data.get("accountId") or data.get("account_id")
    if isinstance(account, str):
        account = account.strip() or None
    else:
        account = None
    params = data.get("params") if isinstance(data.get("params"), dict) else {}
    rationale = data.get("rationale")
    if rationale is not None:
        rationale = str(rationale)
    return {
        "intent": intent,
        "accountId": account,
        "params": params,
        "rationale": rationale or (text[:500] if text else None),
        "text": text or None,
    }


async def parse_with_llm(text: str, settings: Settings) -> dict[str, Any]:
    base = (settings.LLM_BASE_URL or "").rstrip("/")
    url = f"{base}/chat/completions"
    payload = {
        "model": settings.LLM_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": text},
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        import httpx
    except ImportError as exc:
        raise RuntimeError("httpx is required for LLM parsing") from exc
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        body = response.json()
    content = body["choices"][0]["message"]["content"]
    data = json.loads(content)
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object")
    return _coerce_proposal(data, text)


async def parse_proposal(text: str, settings: Settings) -> dict[str, Any]:
    """Hybrid parser: LLM when keyed, otherwise deterministic. Same proposal shape."""
    if settings.LLM_API_KEY:
        try:
            return await parse_with_llm(text, settings)
        except Exception as exc:
            log.warning("agent_llm_fallback", error=str(exc))
    return parse_deterministic(text)
