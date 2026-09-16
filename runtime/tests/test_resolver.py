from __future__ import annotations

import pytest

from app.schemas.api import InvalidWizardInputError
from app.wizard.resolver import resolve_wizard
from app.wizard.strip import strip_bindings


WASHING_MACHINE = {
    "queryTemplate": "{capacity_kg}kg washing machine",
    "steps": [
        {
            "questionId": "familySize",
            "required": True,
            "binding": {
                "kind": "filter_bracket",
                "field": "capacity_kg",
                "brackets": [
                    {"max": "single", "output": 6},
                    {"max": "couple", "output": 7},
                    {"max": "small_family", "output": 8},
                    {"max": "large_family", "output": 10},
                ],
            },
        },
        {
            "questionId": "washType",
            "required": True,
            "binding": {"kind": "filter_value", "field": "wash_type"},
        },
        {
            "questionId": "hasHardWater",
            "required": False,
            "binding": {"kind": "query_token", "template": "hard water"},
        },
    ],
}


def test_filter_value_copies_answer():
    wizard = {
        "queryTemplate": None,
        "steps": [
            {
                "questionId": "os",
                "required": True,
                "binding": {"kind": "filter_value", "field": "os"},
            }
        ],
    }
    result = resolve_wizard(wizard, {"os": "macos"})
    assert result["filters"] == {"os": "macos"}
    assert result["derived"] == {"os": "macos"}


def test_filter_bracket_enum_match():
    result = resolve_wizard(WASHING_MACHINE, {"familySize": "couple", "washType": "front-load"})
    assert result["filters"]["capacity_kg"] == 7
    assert result["derived"]["capacity_kg"] == 7
    assert result["query"] == "7kg washing machine"


def test_filter_bracket_numeric_first_match_and_cap():
    wizard = {
        "queryTemplate": None,
        "steps": [
            {
                "questionId": "roomSqFt",
                "required": True,
                "binding": {
                    "kind": "filter_bracket",
                    "field": "tonnage",
                    "cap": 2.0,
                    "brackets": [
                        {"max": 120, "output": 1.0},
                        {"max": 180, "output": 1.5},
                        {"max": 9999, "output": 2.5},
                    ],
                },
            }
        ],
    }
    small = resolve_wizard(wizard, {"roomSqFt": 100})
    assert small["filters"]["tonnage"] == 1.0
    capped = resolve_wizard(wizard, {"roomSqFt": 500})
    assert capped["filters"]["tonnage"] == 2.0  # 2.5 capped at 2.0


def test_query_token_interpolates_and_derived_as():
    wizard = {
        "queryTemplate": "laptop",
        "steps": [
            {
                "questionId": "workload",
                "required": True,
                "binding": {
                    "kind": "query_token",
                    "template": "for {value}",
                    "derivedAs": "workload",
                },
            }
        ],
    }
    result = resolve_wizard(wizard, {"workload": "coding"})
    assert result["query"] == "laptop for coding"
    assert result["derived"]["workload"] == "coding"
    assert result["filters"] == {}


def test_missing_required_input_raises():
    with pytest.raises(InvalidWizardInputError) as exc:
        resolve_wizard(WASHING_MACHINE, {"washType": "top-load"})
    assert exc.value.field == "familySize"


def test_optional_query_token_skipped_when_absent():
    result = resolve_wizard(WASHING_MACHINE, {"familySize": "single", "washType": "top-load"})
    assert "hard water" not in result["query"]
    result_hw = resolve_wizard(
        WASHING_MACHINE, {"familySize": "single", "washType": "top-load", "hasHardWater": True}
    )
    assert result_hw["query"].endswith("hard water")


def test_strip_bindings_recursive():
    payload = {
        "steps": [
            {
                "questionId": "room",
                "binding": {"kind": "filter_bracket", "brackets": [{"max": 1, "output": 1}]},
                "config": {"options": []},
            }
        ],
        "nested": {"binding": "secret"},
    }
    stripped = strip_bindings(payload)
    blob = str(stripped)
    assert "binding" not in blob
    assert "filter_bracket" not in blob
    assert stripped["steps"][0]["questionId"] == "room"
