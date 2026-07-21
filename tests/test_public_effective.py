"""Public-safe effective projection and privacy gates."""

from __future__ import annotations

from pathlib import Path

from merkado_labs.enrichment.evidence import ground_evidence
from merkado_labs.enrichment.policy import decide_field
from merkado_labs.enrichment.public_effective import (
    assert_public_payload_is_safe,
    project_public_attributes,
    project_public_display_description,
    resolve_public_effective_neighbourhood,
)
from merkado_labs.enrichment.values import AutoApplyStatus


def _proposal_with(
    *,
    applied: list[dict],
    decisions: list[dict],
) -> dict:
    return {
        "applied_attributes": applied,
        "field_decisions": decisions,
        "token_usage": {"input": 10, "output": 5},
        "supporting_evidence": {"secret": True},
    }


def test_needs_attention_attributes_never_appear_publicly() -> None:
    proposal = _proposal_with(
        applied=[
            {
                "key": "gated_community",
                "effective_value": True,
                "confidence": 0.96,
            }
        ],
        decisions=[
            {
                "key": "gated_community",
                "final_status": "needs_attention",
                "proposed_value": True,
                "confidence": 0.96,
                "evidence_snippet": "Blue Bay Resort",
                "reasons": ["snippet_present_synonym_missing"],
            }
        ],
    )
    assert project_public_attributes(proposal) == []


def test_rejected_attributes_never_appear_publicly() -> None:
    proposal = _proposal_with(
        applied=[{"key": "pool", "effective_value": True, "confidence": 0.99}],
        decisions=[
            {
                "key": "pool",
                "final_status": "rejected",
                "proposed_value": True,
                "confidence": 0.99,
            }
        ],
    )
    assert project_public_attributes(proposal) == []


def test_auto_applied_allowlisted_attributes_are_projected() -> None:
    proposal = _proposal_with(
        applied=[
            {"key": "furnished", "effective_value": True, "confidence": 0.99},
            {"key": "unknown_spa", "effective_value": True, "confidence": 0.99},
        ],
        decisions=[
            {
                "key": "furnished",
                "final_status": "auto_applied",
                "proposed_value": True,
                "confidence": 0.99,
            },
            {
                "key": "unknown_spa",
                "final_status": "auto_applied",
                "proposed_value": True,
                "confidence": 0.99,
            },
        ],
    )
    public = project_public_attributes(proposal)
    assert len(public) == 1
    assert public[0]["key"] == "furnished"
    assert "confidence" not in public[0]


def test_public_payload_strips_private_enrichment_fields() -> None:
    proposal = _proposal_with(
        applied=[{"key": "parking", "effective_value": True}],
        decisions=[{"key": "parking", "final_status": "auto_applied"}],
    )
    payload = {
        "effective_neighbourhood": "Jan Thiel",
        "public_attributes": project_public_attributes(proposal),
        "benchmark_price_xcg": 450000,
        "original_price": 250000,
        "original_currency": "USD",
    }
    assert_public_payload_is_safe(payload)


def test_source_neighbourhood_wins_over_map_and_ai() -> None:
    proposal = _proposal_with(
        applied=[],
        decisions=[
            {
                "key": "neighbourhood_candidate",
                "final_status": "needs_attention",
                "proposed_value": "Mambo Beach",
                "confidence": 0.99,
                "evidence_snippet": "located in Mambo Beach",
                "reasons": ["high_confidence_evidence_backed"],
            }
        ],
    )
    effective = resolve_public_effective_neighbourhood(
        source_name="Jan Thiel",
        map_name="Mambo Beach",
        proposal=proposal,
    )
    assert effective["name"] == "Jan Thiel"
    assert effective["provenance"] == "source"
    assert effective["label"] == "From source"


def test_map_wins_over_conflicting_ai() -> None:
    proposal = _proposal_with(
        applied=[],
        decisions=[
            {
                "key": "neighbourhood_candidate",
                "final_status": "needs_attention",
                "proposed_value": "Piscadera",
                "confidence": 0.99,
                "evidence_snippet": "Piscadera bay villa",
                "reasons": ["confidence_below_field_auto_apply_threshold"],
            }
        ],
    )
    effective = resolve_public_effective_neighbourhood(
        source_name="Curaçao",
        map_name="Jan Thiel",
        proposal=proposal,
    )
    assert effective["name"] == "Jan Thiel"
    assert effective["provenance"] == "map"


def test_ai_fills_neighbourhood_gap_safely() -> None:
    proposal = _proposal_with(
        applied=[],
        decisions=[
            {
                "key": "neighbourhood_candidate",
                "final_status": "auto_applied",
                "proposed_value": "Koraal Specht",
                "confidence": 0.94,
                "evidence_snippet": "home in Koraal Specht",
                "reasons": ["high_confidence_evidence_backed"],
            }
        ],
    )
    effective = resolve_public_effective_neighbourhood(
        source_name=None,
        map_name=None,
        proposal=proposal,
    )
    assert effective["name"] == "Koraal Specht"
    assert effective["provenance"] == "ai_extracted"
    assert effective["label"] == "Extracted from listing text"


def test_generic_curacao_is_not_a_neighbourhood() -> None:
    effective = resolve_public_effective_neighbourhood(
        source_name="Curaçao",
        map_name=None,
        proposal=None,
    )
    assert effective["name"] is None
    assert effective["provenance"] == "unavailable"


def test_source_conflict_ai_neighbourhood_not_used_for_gap_fill() -> None:
    proposal = _proposal_with(
        applied=[],
        decisions=[
            {
                "key": "neighbourhood_candidate",
                "final_status": "needs_attention",
                "proposed_value": "Piscadera",
                "confidence": 0.99,
                "evidence_snippet": "Piscadera",
                "reasons": ["source_conflict"],
            }
        ],
    )
    effective = resolve_public_effective_neighbourhood(
        source_name=None,
        map_name=None,
        proposal=proposal,
    )
    assert effective["name"] is None


def test_blue_bay_curated_location_grounds_gated_community() -> None:
    grounding = ground_evidence(
        key="gated_community",
        evidence_snippet="Blue Bay Golf & Beach Resort Curacao",
        source_text="Apartment at Blue Bay Golf & Beach Resort Curacao with pool.",
    )
    assert grounding.ok_for_auto_apply is True
    assert grounding.reason == "curated_location_knowledge_gated_community"

    decision = decide_field(
        key="gated_community",
        proposed_value=True,
        confidence=0.96,
        evidence_snippet="Blue Bay Golf & Beach Resort Curacao",
        source_text="Apartment at Blue Bay Golf & Beach Resort Curacao with pool.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_unrelated_resort_name_without_gate_synonym_is_rejected() -> None:
    grounding = ground_evidence(
        key="gated_community",
        evidence_snippet="Santa Barbara Resort Curacao",
        source_text="Apartment at Santa Barbara Resort Curacao with pool.",
    )
    assert grounding.ok_for_auto_apply is False
    assert grounding.reason == "gated_without_gate_synonym_rejected"


def test_gated_with_surrounding_gate_can_auto_apply() -> None:
    source = (
        "The resort is well secured with a surrounding gate, security cameras, "
        "and an intercom system."
    )
    decision = decide_field(
        key="gated_community",
        proposed_value=True,
        confidence=0.93,
        evidence_snippet=source,
        source_text=source,
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_ai_matching_map_neighbourhood_is_redundant_duplicate() -> None:
    decision = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Jan Thiel",
        confidence=0.99,
        evidence_snippet="villa in Jan Thiel with sea views",
        source_text="Beautiful villa in Jan Thiel with sea views",
        source_values={"inferred_neighbourhood_name": "Jan Thiel"},
    )
    assert decision.final_status == AutoApplyStatus.REDUNDANT
    assert "already_represented_by_map" in decision.reasons


def test_auto_applied_display_description_is_public_and_minimal() -> None:
    proposal = _proposal_with(
        applied=[],
        decisions=[
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": "Villa with a pool.",
                "confidence": 0.95,
            }
        ],
    )
    assert project_public_display_description(proposal) == {"overview": "Villa with a pool."}


def test_migration_keeps_public_view_read_only_and_private_safe() -> None:
    sql = Path(
        "supabase/migrations/20260720140000_public_property_listings_effective.sql"
    ).read_text(encoding="utf-8")
    assert "security_invoker = false" in sql
    assert "grant select on table public.public_property_listings" in sql
    assert "revoke all on table public.public_property_listings" in sql
    assert "supporting_evidence" not in sql
    assert "token_usage" not in sql
    assert "public_attributes" in sql
    assert "effective_neighbourhood" in sql
    assert "distinct on (pl.id)" in sql
    assert "distinct on (canon_key)" in sql
    assert "listing_enrichment_v3" in sql
    assert "skipped_unchanged" in sql
    # Public attribute objects must not embed confidence.
    assert "'confidence'" not in sql.split("jsonb_build_object(")[1].split(")")[0]


def test_v4_migration_prefers_v4_and_exposes_display_description() -> None:
    sql = Path(
        "supabase/migrations/20260720180000_enrichment_quality_v4_public_effective.sql"
    ).read_text(encoding="utf-8")
    assert "listing_enrichment_v4" in sql
    assert "listing_enrichment_v3" in sql
    assert "display_description" in sql
    assert "security_invoker = false" in sql
    assert "supporting_evidence" not in sql
    assert "token_usage" not in sql
    assert "grant select on table public.public_property_listings" in sql
    assert "public_property_listings_v3_projection" in sql


def test_replay_script_is_bounded_and_openai_free() -> None:
    script = Path("scripts/replay_enrichment_policy.py").read_text(encoding="utf-8")
    assert "--selection-file" in script
    assert "openai_calls" in script
    assert "import openai" not in script
    assert "OpenAI(" not in script
    assert "deterministic_public_effective_activation_replay" in script
    assert "original_policy" in script
    assert "create_labs_client" in script
