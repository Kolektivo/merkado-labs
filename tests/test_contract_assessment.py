from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from experiments.caribbeanhousehunt_sample.assess_pilot_contract import (
    SYNTHETIC_NOTICE,
    PilotContract,
    load_contract,
    resolve_approved_neighbourhood,
    score_contract,
)


def contract(rent: str = "1000", area: str = "100") -> PilotContract:
    return PilotContract(
        contract_reference="PILOT-TEST-001",
        neighbourhood="Punda",
        monthly_rent_xcg=Decimal(rent),
        floor_area_m2=Decimal(area),
        start_date=date(2026, 7, 1),
        end_date=None,
        property_type="apartment",
        latitude=None,
        longitude=None,
        notes=SYNTHETIC_NOTICE,
    )


@pytest.mark.parametrize(
    ("rent", "classification"),
    [
        ("890", "below_market"),
        ("900", "near_market"),
        ("1100", "near_market"),
        ("1110", "above_market"),
    ],
)
def test_classification_thresholds(rent: str, classification: str) -> None:
    result = score_contract(
        contract(rent),
        {
            "median_value": "10",
            "average_value": "12",
            "quality_status": "usable",
        },
    )
    assert result.classification == classification
    assert result.benchmark_method == "median"


def test_insufficient_evidence_keeps_numeric_difference() -> None:
    result = score_contract(
        contract("1200"),
        {
            "median_value": "10",
            "average_value": "9",
            "quality_status": "insufficient",
        },
    )
    assert result.classification == "insufficient_evidence"
    assert result.difference_percent == Decimal("20")


def test_average_is_used_only_when_median_is_missing() -> None:
    result = score_contract(
        contract(),
        {
            "median_value": None,
            "average_value": "8",
            "quality_status": "limited",
        },
    )
    assert result.benchmark_method == "average"
    assert result.benchmark_value == Decimal("8")


def test_only_approved_aliases_are_resolved() -> None:
    aliases = [
        {
            "source_neighbourhood_id": "source",
            "canonical_neighbourhood_id": "canonical",
            "status": "approved",
        },
        {
            "source_neighbourhood_id": "pending",
            "canonical_neighbourhood_id": "canonical",
            "status": "pending",
        },
    ]
    assert resolve_approved_neighbourhood("source", aliases) == "canonical"
    assert resolve_approved_neighbourhood("pending", aliases) == "pending"


def test_input_rejects_sensitive_or_unknown_fields(tmp_path: Path) -> None:
    path = tmp_path / "pilot_contract.json"
    path.write_text(
        json.dumps(
            {
                "contract_reference": "PILOT-TEST-001",
                "neighbourhood": "Punda",
                "monthly_rent_xcg": 1000,
                "floor_area_m2": 100,
                "start_date": "2026-07-01",
                "party_name": "Must not be stored",
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="forbidden or unknown"):
        load_contract(path)
