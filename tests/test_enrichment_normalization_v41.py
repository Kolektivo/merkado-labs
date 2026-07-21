"""Deterministic Dutch/English normalization and policy v4.1 screenshot cases."""

from __future__ import annotations

from merkado_labs.enrichment.normalization import (
    is_generic_property_type,
    is_subjective_accessibility,
    normalize_property_type,
    property_types_equivalent,
)
from merkado_labs.enrichment.policy import POLICY_VERSION, ReasonCode, decide_field
from merkado_labs.enrichment.values import AutoApplyStatus, ConflictStatus


def test_policy_version_is_v41() -> None:
    assert POLICY_VERSION == "enrichment_policy_v4_2"


def test_detached_single_family_home_maps_to_house() -> None:
    assert normalize_property_type("Detached Single Family Home") == "house"
    assert normalize_property_type("woning") == "house"
    assert normalize_property_type("familiewoning") == "house"
    assert property_types_equivalent("house", "Detached Single Family Home")
    assert is_generic_property_type("residential")


def test_hot_water_evidence_auto_applies() -> None:
    evidence = "Hot water in the house"
    decision = decide_field(
        key="water_heater",
        proposed_value=True,
        confidence=0.87,
        evidence_snippet=evidence,
        source_text=f"Amenities include pool. {evidence}. Gated resort.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_unfurnished_evidence_auto_applies() -> None:
    evidence = "Furniture: unfurnished"
    decision = decide_field(
        key="furnished",
        proposed_value=False,
        confidence=0.99,
        evidence_snippet=evidence,
        source_text=f"Type: house. {evidence}. Parking available.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED
    assert decision.resulting_effective is False


def test_detached_type_redundant_with_house_source() -> None:
    evidence = "Type: Detached Single Family Home"
    decision = decide_field(
        key="property_type",
        proposed_value="Detached Single Family Home",
        confidence=0.99,
        evidence_snippet=evidence,
        source_values={"property_type": "house"},
        source_text=evidence,
    )
    assert decision.final_status == AutoApplyStatus.REDUNDANT
    assert ReasonCode.PROPERTY_TYPE_EQUIVALENT in decision.reasons


def test_detached_type_refines_generic_residential() -> None:
    evidence = "Type: Detached Single Family Home"
    decision = decide_field(
        key="property_type",
        proposed_value="Detached Single Family Home",
        confidence=0.99,
        evidence_snippet=evidence,
        source_values={"property_type": "residential"},
        source_text=evidence,
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED
    assert decision.resulting_effective == "house"


def test_excellent_accessibility_rejected_quietly() -> None:
    evidence = "Excellent accessibility"
    decision = decide_field(
        key="accessibility",
        proposed_value="Excellent accessibility",
        confidence=0.81,
        evidence_snippet=evidence,
        source_text=f"Office building with {evidence.lower()} near the ring road.",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert ReasonCode.SUBJECTIVE_ACCESSIBILITY_REJECTED in decision.reasons
    assert decision.conflict_status == ConflictStatus.UNSUPPORTED


def test_buitenterras_palapa_auto_applies() -> None:
    evidence = (
        "Aan de achterzijde van de woning vindt u een buitenterras met een palapa"
    )
    decision = decide_field(
        key="terrace",
        proposed_value=True,
        confidence=0.99,
        evidence_snippet=evidence,
        source_text=f"Moderne familiewoning. {evidence}.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_patio_porch_veranda_auto_apply_as_terrace() -> None:
    for evidence in (
        "step out onto a sprawling covered patio",
        "Large covered porch",
        "Step outside onto the expansive covered veranda",
        "een royaal privéterras van circa 30 m²",
    ):
        decision = decide_field(
            key="terrace",
            proposed_value=True,
            confidence=0.96,
            evidence_snippet=evidence,
            source_text=f"Bright apartment. {evidence}. Quiet street.",
        )
        assert decision.final_status == AutoApplyStatus.AUTO_APPLIED, evidence


def test_source_terrace_false_wins_over_ai_true() -> None:
    evidence = "sunny patio shared with neighbors"
    decision = decide_field(
        key="terrace",
        proposed_value=True,
        confidence=0.99,
        evidence_snippet=evidence,
        source_values={"terrace": False},
        source_text=f"Apartment details. {evidence}.",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert ReasonCode.SOURCE_TERRACE_FALSE_WINS in decision.reasons


def test_specific_source_property_type_rejects_ai_quietly() -> None:
    evidence = "This modern villa has been recently completed"
    decision = decide_field(
        key="property_type",
        proposed_value="villa",
        confidence=0.99,
        evidence_snippet=evidence,
        source_values={"property_type": "house"},
        source_text=evidence,
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert ReasonCode.PROPERTY_TYPE_SOURCE_WINS_QUIET in decision.reasons


def test_negated_amenity_true_rejects_quietly() -> None:
    decision = decide_field(
        key="pool",
        proposed_value=True,
        confidence=0.95,
        evidence_snippet="charming townhouse with a pool",
        source_text="Charming townhouse, no pool, walking distance to the marina.",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert ReasonCode.SOURCE_NEGATION_REJECTS_TRUE in decision.reasons


def test_negated_amenity_false_auto_applies() -> None:
    evidence = "no hot water"
    decision = decide_field(
        key="water_heater",
        proposed_value=False,
        confidence=0.95,
        evidence_snippet=evidence,
        source_text=f"Compact studio with {evidence} and shared laundry.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED
    assert decision.resulting_effective is False


def test_woning_property_type_from_dutch_evidence() -> None:
    evidence = "Moderne familiewoning in Brakkeput Abou met airconditioning"
    decision = decide_field(
        key="property_type",
        proposed_value="woning",
        confidence=0.97,
        evidence_snippet=evidence,
        source_values={"property_type": "house"},
        source_text=evidence,
    )
    assert decision.final_status == AutoApplyStatus.REDUNDANT


def test_pets_allowed_structured_evidence() -> None:
    evidence = "pets_allowed: false"
    decision = decide_field(
        key="pet_suitability",
        proposed_value=False,
        confidence=0.98,
        evidence_snippet=evidence,
        source_text=f"House details include {evidence} and furnished: true.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_subjective_accessibility_helper() -> None:
    assert is_subjective_accessibility("Excellent accessibility")
    assert not is_subjective_accessibility(
        True, "Wheelchair accessible entrance at the rear"
    )
