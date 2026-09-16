from __future__ import annotations

from simpleeval import EvalWithCompoundTypes, NameNotDefined, FeatureNotAvailable, InvalidExpression


SAFE_FUNCTIONS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "len": len,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
}


class EvalError(Exception):
    pass


def evaluate(expression: str, scope: dict) -> object:
    names = dict(SAFE_FUNCTIONS)
    names.update(scope)
    evaluator = EvalWithCompoundTypes(names=names, functions=SAFE_FUNCTIONS)
    try:
        return evaluator.eval(expression)
    except (NameNotDefined, FeatureNotAvailable, InvalidExpression, SyntaxError, TypeError, ValueError) as exc:
        raise EvalError(f"Could not evaluate {expression!r}: {exc}") from exc
