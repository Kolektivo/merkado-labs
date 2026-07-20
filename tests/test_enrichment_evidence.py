"""Evidence normalization, synonym grounding, and false-positive regression tests."""

from __future__ import annotations

from merkado_labs.enrichment.evidence import (
    ground_evidence,
    normalize_evidence_text,
    truncate_evidence_snippet,
)
from merkado_labs.enrichment.policy import decide_field
from merkado_labs.enrichment.values import AutoApplyStatus

JC003_DESCRIPTION = (
    "Renovated property with private bathrooms / kitchen • Private terrasses "
    "• Laundry room • Spacious porch/backyard."
)

# Realistic KW-Curaçao-style listing snippets (EN/NL/ES mix), invented for
# coverage — not scraped from a live site.
KW_LIKE_POOL_ES = (
    "Hermosa villa con piscina privada y jardín amplio en Jan Thiel."
)
KW_LIKE_GATED_NL = (
    "Gelegen op een beveiligd terrein met 24-uurs bewaking en parking."
)
KW_LIKE_WATER_HEATER = (
    "Fully equipped kitchen with appliances, water heater, and a backup generator."
)
KW_LIKE_SECURITY = "Gated community with security guard at the main entrance."
KW_LIKE_NEGATED_POOL = "Charming townhouse, no pool, walking distance to the marina."
KW_LIKE_NEGATED_PARKING_NL = (
    "Klein appartement zonder parking, dicht bij het centrum."
)
KW_LIKE_NEARBY_POOL = (
    "Apartment within walking distance of a public pool and the beach club."
)


def test_normalize_decodes_entities_and_quotes() -> None:
    raw = "&quot;Private terrasses&quot; with\u201csmart\u201d quotes"
    normalized = normalize_evidence_text(raw)
    assert '"Private terrasses"' in normalized
    assert "smart" in normalized


def test_jc003_terrasses_variant_auto_applies_v41() -> None:
    """v4.1 accepts the recurring terrasses spelling as terrace evidence."""

    decision = decide_field(
        key="terrace",
        proposed_value=True,
        confidence=0.98,
        evidence_snippet="\u201cPrivate terrasses\u201d",
        evidence_source="description",
        model_recommended_action="auto_apply",
        source_text=JC003_DESCRIPTION,
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_canonical_terrace_still_auto_applies() -> None:
    source = "Beautiful villa with a private terrace and swimming pool."
    decision = decide_field(
        key="terrace",
        proposed_value=True,
        confidence=0.96,
        evidence_snippet="private terrace and swimming pool",
        evidence_source="description",
        model_recommended_action="auto_apply",
        source_text=source,
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_terra_and_terrain_rejected_as_terrace() -> None:
    for snippet, source in (
        ("on terra firm near the coast", "Located on terra firm near the coast."),
        ("flat terrain around the house", "Large lot with flat terrain around the house."),
    ):
        grounding = ground_evidence(
            key="terrace", evidence_snippet=snippet, source_text=source
        )
        assert grounding.ok_for_auto_apply is False
        assert grounding.ok_for_attention is False
        assert grounding.reason == "terrace_false_friend_only"


def test_partial_word_evidence_not_enough_without_span() -> None:
    grounding = ground_evidence(
        key="pool",
        evidence_snippet="the property includes a whirlpool tub upstairs",
        source_text="the property includes a whirlpool tub upstairs",
    )
    # Exact span exists but pool synonym must not match whirlpool as pool.
    assert grounding.ok_for_auto_apply is False


def test_spanish_pool_and_garden_synonyms_ground() -> None:
    grounding = ground_evidence(
        key="pool",
        evidence_snippet="villa con piscina privada y jardín amplio",
        source_text=KW_LIKE_POOL_ES,
    )
    assert grounding.ok_for_auto_apply is True


def test_dutch_gated_terrein_synonym_grounds() -> None:
    grounding = ground_evidence(
        key="gated_community",
        evidence_snippet="beveiligd terrein met 24-uurs bewaking",
        source_text=KW_LIKE_GATED_NL,
    )
    assert grounding.ok_for_auto_apply is True


def test_water_heater_and_generator_synonyms_ground() -> None:
    water_heater = ground_evidence(
        key="water_heater",
        evidence_snippet="appliances, water heater, and a backup generator",
        source_text=KW_LIKE_WATER_HEATER,
    )
    assert water_heater.ok_for_auto_apply is True
    generator = ground_evidence(
        key="generator",
        evidence_snippet="water heater, and a backup generator",
        source_text=KW_LIKE_WATER_HEATER,
    )
    assert generator.ok_for_auto_apply is True


def test_security_features_synonym_grounds() -> None:
    grounding = ground_evidence(
        key="security_features",
        evidence_snippet="security guard at the main entrance",
        source_text=KW_LIKE_SECURITY,
    )
    assert grounding.ok_for_auto_apply is True


def test_negation_aware_pool_is_not_grounded_for_auto_apply() -> None:
    grounding = ground_evidence(
        key="pool",
        evidence_snippet="charming townhouse with a pool",
        source_text=KW_LIKE_NEGATED_POOL,
    )
    assert grounding.ok_for_auto_apply is False
    assert grounding.reason == "negation_conflict_with_source"


def test_negation_aware_dutch_zonder_parking_is_not_grounded() -> None:
    grounding = ground_evidence(
        key="parking",
        evidence_snippet="klein appartement met ruime parking",
        source_text=KW_LIKE_NEGATED_PARKING_NL,
    )
    assert grounding.ok_for_auto_apply is False
    assert grounding.reason == "negation_conflict_with_source"


def test_negated_pool_claim_does_not_auto_apply_via_policy() -> None:
    decision = decide_field(
        key="pool",
        proposed_value=True,
        confidence=0.95,
        evidence_snippet="charming townhouse with a pool",
        evidence_source="description",
        model_recommended_action="auto_apply",
        source_text=KW_LIKE_NEGATED_POOL,
    )
    assert decision.final_status != AutoApplyStatus.AUTO_APPLIED


def test_nearby_facility_is_not_a_property_attribute() -> None:
    """A pool 'within walking distance' is not evidence the unit has one."""

    grounding = ground_evidence(
        key="pool",
        evidence_snippet="apartment within walking distance of a public pool",
        source_text=KW_LIKE_NEARBY_POOL,
    )
    assert grounding.ok_for_auto_apply is False
    assert grounding.reason == "nearby_facility_not_property_attribute"


def test_evidence_snippet_truncation_preserves_word_boundary() -> None:
    long_text = "A " * 100 + "villa with a private terrace and a large pool area."
    truncated = truncate_evidence_snippet(long_text, max_length=40)
    assert truncated is not None
    assert len(truncated) <= 41  # +1 for the ellipsis character
    assert not truncated.rstrip("\u2026").endswith(" ")


def test_marketing_language_alone_is_insufficient() -> None:
    grounding = ground_evidence(
        key="pool",
        evidence_snippet="stunning luxury must see opportunity",
        source_text="This is a stunning luxury must see opportunity in Jan Thiel.",
    )
    assert grounding.ok_for_auto_apply is False
