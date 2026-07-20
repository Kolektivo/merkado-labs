"""Automatic enrichment policy, attributes, neighbourhood, and timeline tests."""

from __future__ import annotations

from merkado_labs.enrichment import EnrichmentProposal, proposal_to_attribute_dicts
from merkado_labs.enrichment.attributes import (
    analyze_attribute_candidates,
    extract_local_attribute_hits,
)
from merkado_labs.enrichment.fields import normalize_attribute_key
from merkado_labs.enrichment.neighbourhood import is_generic_neighbourhood
from merkado_labs.enrichment.policy import (
    AUTO_APPLY_CONFIDENCE_THRESHOLD,
    FIELD_AUTO_APPLY_THRESHOLDS,
    NEEDS_ATTENTION_CONFIDENCE_THRESHOLD,
    POLICY_VERSION,
    ReasonCode,
    decide_field,
    evaluate_proposal_attributes,
)
from merkado_labs.enrichment.timeline import (
    AI_ENRICHMENT_COMPLETED,
    build_enrichment_completed_event,
    build_enrichment_skipped_event,
    dedupe_event_drafts,
    display_model_name,
)
from merkado_labs.enrichment.values import (
    AiValue,
    AutoApplyStatus,
    ConflictStatus,
    SourceValue,
    ValueType,
    resolve_effective_value,
)


def test_high_confidence_attribute_auto_applies() -> None:
    source = "large swimming pool and covered terrace"
    decision = decide_field(
        key="pool",
        proposed_value="present",
        confidence=0.98,
        evidence_snippet=source,
        evidence_source="description",
        model_recommended_action="auto_apply",
        source_text=f"Villa with {source}.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED
    assert decision.resulting_effective is True
    assert decision.confidence >= AUTO_APPLY_CONFIDENCE_THRESHOLD


def test_medium_confidence_needs_attention() -> None:
    source = "fully furnished apartment with bright living room"
    decision = decide_field(
        key="furnished",
        proposed_value="present",
        confidence=0.7,
        evidence_snippet=source,
        evidence_source="description",
        source_text=source,
    )
    assert decision.final_status == AutoApplyStatus.NEEDS_ATTENTION


def test_source_conflict_never_auto_applies() -> None:
    source = "this apartment offers sea views and parking"
    decision = decide_field(
        key="property_type",
        proposed_value="apartment",
        confidence=0.99,
        evidence_snippet=source,
        evidence_source="description",
        source_values={"property_type": "villa"},
        source_text=source,
    )
    assert decision.final_status == AutoApplyStatus.NEEDS_ATTENTION
    assert decision.conflict_status == ConflictStatus.SOURCE_CONFLICT


def test_forbidden_field_rejected() -> None:
    decision = decide_field(
        key="original_price",
        proposed_value=100000,
        confidence=0.99,
        evidence_snippet="asking price is clearly stated as one hundred thousand",
        evidence_source="description",
        source_text="asking price is clearly stated as one hundred thousand",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert decision.conflict_status == ConflictStatus.FORBIDDEN


def test_evidence_required() -> None:
    decision = decide_field(
        key="pool",
        proposed_value="present",
        confidence=0.99,
        evidence_snippet=None,
        source_text="villa with swimming pool",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert decision.conflict_status == ConflictStatus.WEAK_EVIDENCE


def test_ungrounded_evidence_rejected() -> None:
    decision = decide_field(
        key="pool",
        proposed_value="present",
        confidence=0.99,
        evidence_snippet="private swimming pool with sundeck area",
        evidence_source="description",
        source_text="Compact studio near the beach with parking only.",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert "evidence_not_grounded" in decision.reasons


def test_unknown_attribute_rejected_from_attention_queue() -> None:
    decision = decide_field(
        key="wine_cellar_xyz",
        proposed_value=True,
        confidence=0.99,
        evidence_snippet="private wine cellar with climate control system",
        evidence_source="description",
        source_text="private wine cellar with climate control system",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert decision.conflict_status == ConflictStatus.UNSUPPORTED
    assert "flexible" in decision.reasons[0]


def test_source_wins_over_ai_in_effective_value() -> None:
    effective = resolve_effective_value(
        key="bedrooms",
        value_type=ValueType.NUMBER,
        source=SourceValue(key="bedrooms", value=3),
        ai=AiValue(
            key="bedrooms",
            value=4,
            value_type=ValueType.NUMBER,
            confidence=0.99,
            evidence_snippet="four bedrooms mentioned in the text",
            evidence_source="description",
            conflict=False,
        ),
    )
    assert effective.value == 3
    assert effective.conflict_status == ConflictStatus.SOURCE_CONFLICT


def test_pool_furnished_parking_extraction_and_false_positive() -> None:
    text = (
        "Beautiful villa with large swimming pool, fully furnished, "
        "and 2 parking spaces near the beach. Not a puddle."
    )
    hits = extract_local_attribute_hits(text)
    assert hits["pool"]["value"] is True
    assert hits["furnished"]["value"] is True
    assert hits["parking_spaces"]["value"] == 2
    assert normalize_attribute_key("swimming pool") == "pool"
    assert normalize_attribute_key("Air Conditioning") == "air_conditioning"
    weak = decide_field(
        key="pool",
        proposed_value=True,
        confidence=0.99,
        evidence_snippet="pool",
        source_text=text,
    )
    assert weak.final_status == AutoApplyStatus.REJECTED


def test_attribute_frequency_report_no_auto_schema() -> None:
    listings = [
        {"description": "Villa with pool and solar panels", "title": "Villa"},
        {"description": "Apartment fully furnished with balcony", "title": "Apt"},
        {"description": "House with pool and garden", "title": "House"},
    ]
    candidates = analyze_attribute_candidates(listings)
    assert candidates
    keys = {c.key for c in candidates}
    assert "pool" in keys
    for c in candidates:
        assert c.recommendation in {
            "display_only",
            "possible_future_filter",
            "ignore_noisy",
            "needs_taxonomy_decision",
        }


def test_neighbourhood_policy_cases() -> None:
    explicit = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Mambo Beach",
        confidence=0.95,
        evidence_snippet="located in Mambo Beach near the boulevard",
        evidence_source="description",
        source_values={
            "source_neighbourhood_text": "Jan Thiel",
            "location_explicit": True,
        },
        source_text="located in Mambo Beach near the boulevard",
    )
    assert explicit.final_status == AutoApplyStatus.NEEDS_ATTENTION

    generic = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Curaçao",
        confidence=0.9,
        evidence_snippet="beautiful home located on Curaçao island",
        evidence_source="description",
        source_text="beautiful home located on Curaçao island",
    )
    assert generic.final_status == AutoApplyStatus.NEEDS_ATTENTION

    conflict = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Pietermaai",
        confidence=0.9,
        evidence_snippet="Pietermaai in the title conflicts with Willemstad body text",
        evidence_source="title",
        source_values={
            "title_location_mention": "Pietermaai",
            "description_location_mention": "Willemstad",
        },
        source_text="Pietermaai in the title conflicts with Willemstad body text",
    )
    assert conflict.conflict_status == ConflictStatus.TITLE_DESCRIPTION_CONFLICT


def test_timeline_events_and_dedupe() -> None:
    assert display_model_name("gpt-5.6-terra") == "GPT-5.6 Terra"
    completed = build_enrichment_completed_event(
        model="gpt-5.6-terra",
        fields_proposed=8,
        fields_auto_applied=6,
        fields_needs_attention=2,
        input_checksum="a" * 64,
    )
    assert completed.event_type == AI_ENRICHMENT_COMPLETED
    assert "6 applied automatically" in completed.summary
    assert "2 need attention" in completed.summary
    skipped = build_enrichment_skipped_event(
        model="gpt-5.6-terra", input_checksum="a" * 64
    )
    unique = dedupe_event_drafts([completed, completed, skipped])
    assert len(unique) == 2


def test_evaluate_proposal_idempotent_structure() -> None:
    snippet = "private swimming pool with sundeck area"
    attrs = [
        {
            "key": "pool",
            "value": "present",
            "confidence": 0.99,
            "evidence_snippet": snippet,
            "evidence_source": "description",
            "recommended_action": "auto_apply",
        },
        {
            "key": "pool",
            "value": "present",
            "confidence": 0.99,
            "evidence_snippet": snippet,
            "evidence_source": "description",
            "recommended_action": "auto_apply",
        },
    ]
    first = evaluate_proposal_attributes(attrs, source_text=f"Villa with {snippet}.")
    second = evaluate_proposal_attributes(attrs, source_text=f"Villa with {snippet}.")
    assert len(first.auto_applied) == len(second.auto_applied) == 2
    assert first.as_dict()["auto_applied_count"] == 2


def test_policy_version_is_v3() -> None:
    assert POLICY_VERSION == "enrichment_policy_v3"


def test_reason_codes_are_stable_machine_readable_strings() -> None:
    assert ReasonCode.FORBIDDEN_FIELD == "forbidden_field"
    assert ReasonCode.CONFIDENCE_TOO_LOW == "confidence_too_low"
    assert ReasonCode.EVIDENCE_NOT_GROUNDED == "evidence_not_grounded"
    # Every FieldDecision.reasons entry should be a plain machine-readable
    # snake_case token, never a free-text sentence.
    decision = decide_field(
        key="original_price",
        proposed_value=100000,
        confidence=0.99,
        evidence_snippet="asking price is clearly stated as one hundred thousand",
        source_text="asking price is clearly stated as one hundred thousand",
    )
    for reason in decision.reasons:
        assert " " not in reason


def test_too_low_confidence_is_rejected_not_needs_attention() -> None:
    """v3: below the attention bar is noise, not a human decision."""

    source = "large swimming pool and covered terrace"
    decision = decide_field(
        key="pool",
        proposed_value="present",
        confidence=0.2,
        evidence_snippet=source,
        evidence_source="description",
        source_text=f"Villa with {source}.",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert decision.confidence is not None
    assert decision.confidence < NEEDS_ATTENTION_CONFIDENCE_THRESHOLD
    assert ReasonCode.CONFIDENCE_TOO_LOW in decision.reasons


def test_missing_confidence_is_rejected() -> None:
    source = "large swimming pool and covered terrace"
    decision = decide_field(
        key="pool",
        proposed_value="present",
        confidence=None,
        evidence_snippet=source,
        evidence_source="description",
        source_text=f"Villa with {source}.",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED


def test_neighbourhood_never_auto_applies_even_when_clean() -> None:
    """No conflict, no source, high confidence — still capped at attention."""

    assert FIELD_AUTO_APPLY_THRESHOLDS["neighbourhood_candidate"] > 1.0
    decision = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Mambo Beach",
        confidence=0.99,
        evidence_snippet="clearly located in Mambo Beach near the boulevard",
        evidence_source="description",
        source_text="clearly located in Mambo Beach near the boulevard",
    )
    assert decision.final_status == AutoApplyStatus.NEEDS_ATTENTION


def test_neighbourhood_matching_source_is_rejected_not_attention() -> None:
    """Source already carries the neighbourhood — do not queue AI echo."""

    decision = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Toni Kunchi",
        confidence=0.99,
        evidence_snippet="apartment located in Toni Kunchi near the resort",
        evidence_source="description",
        source_values={
            "source_neighbourhood_text": "Toni Kunchi Curacao",
            "location_explicit": True,
        },
        source_text="apartment located in Toni Kunchi near the resort",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert ReasonCode.ALREADY_REPRESENTED_BY_SOURCE in decision.reasons


def test_neighbourhood_with_map_and_no_source_is_rejected_not_attention() -> None:
    """Map already supplies the effective neighbourhood."""

    decision = decide_field(
        key="neighbourhood_candidate",
        proposed_value="Zakito",
        confidence=0.99,
        evidence_snippet="villa located in Zakito with sea views",
        evidence_source="description",
        source_values={
            "source_neighbourhood_text": "Curacao",
            "location_explicit": False,
            "inferred_neighbourhood_name": "Zakito",
        },
        source_text="villa located in Zakito with sea views",
    )
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert ReasonCode.ALREADY_REPRESENTED_BY_MAP in decision.reasons


def test_amenity_auto_applies_at_field_default_threshold() -> None:
    """Amenities keep the 0.85 default bar (unlike neighbourhood)."""

    assert FIELD_AUTO_APPLY_THRESHOLDS.get("pool", AUTO_APPLY_CONFIDENCE_THRESHOLD) == (
        AUTO_APPLY_CONFIDENCE_THRESHOLD
    )


def test_local_generic_neighbourhood_helper_used_by_policy() -> None:
    assert is_generic_neighbourhood("Curaçao") is True
    assert is_generic_neighbourhood("Jan Thiel") is False


def test_gated_community_without_real_evidence_is_rejected_not_attention() -> None:
    """resort_or_gated_candidate must never create needs_attention noise from
    a placeholder evidence string — see proposal_to_attribute_dicts."""

    proposal = EnrichmentProposal.model_validate(
        {
            "resort_or_gated_candidate": "present",
            "resort_or_gated_evidence": None,
            "overall_confidence": 0.9,
        }
    )
    items = proposal_to_attribute_dicts(proposal)
    gated_item = next(item for item in items if item["key"] == "gated_community")
    evaluation = evaluate_proposal_attributes(
        [gated_item], source_text="Villa in a quiet gated community with a pool."
    )
    decision = evaluation.decisions[0]
    assert decision.final_status == AutoApplyStatus.REJECTED
    assert decision.final_status != AutoApplyStatus.NEEDS_ATTENTION


def test_gated_community_with_real_grounded_evidence_can_auto_apply() -> None:
    proposal = EnrichmentProposal.model_validate(
        {
            "resort_or_gated_candidate": "present",
            "resort_or_gated_evidence": "quiet gated community with 24/7 security",
            "overall_confidence": 0.95,
        }
    )
    items = proposal_to_attribute_dicts(proposal)
    gated_item = next(item for item in items if item["key"] == "gated_community")
    evaluation = evaluate_proposal_attributes(
        [gated_item],
        source_text="Villa in a quiet gated community with 24/7 security and a pool.",
    )
    decision = evaluation.decisions[0]
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED
