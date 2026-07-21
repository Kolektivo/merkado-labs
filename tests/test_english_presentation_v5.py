"""English public presentation contract (v5) — titles, skip/repair, migration."""

from __future__ import annotations

from merkado_labs.enrichment import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    EnrichmentProposal,
    has_complete_english_presentation,
    proposal_to_attribute_dicts,
    requires_english_presentation_migration,
)
from merkado_labs.enrichment.jobs import should_skip_unchanged_enrichment
from merkado_labs.enrichment.policy import POLICY_VERSION, decide_field, evaluate_proposal_attributes
from merkado_labs.enrichment.presentation import (
    build_fallback_display_summary,
    build_fallback_display_title,
    resolve_public_display_title,
)
from merkado_labs.enrichment.public_effective import (
    project_public_display_description,
    project_public_display_summary,
    project_public_display_title,
)
from merkado_labs.enrichment.values import AutoApplyStatus


def _complete_proposal_body(**overrides) -> dict:
    body = {
        "source_language": "nl",
        "display_title": "3-Bedroom Villa with Pool in Jan Thiel",
        "display_summary": (
            "Spacious three-bedroom villa with a private pool in Jan Thiel, "
            "Curaçao, suited for comfortable island living."
        ),
        "display_overview": (
            "This three-bedroom villa in Jan Thiel offers a private pool and "
            "an open living area. The home is finished for year-round use."
        ),
        "field_decisions": [
            {
                "key": "display_title",
                "final_status": "auto_applied",
                "resulting_effective": "3-Bedroom Villa with Pool in Jan Thiel",
            },
            {
                "key": "display_summary",
                "final_status": "auto_applied",
                "resulting_effective": (
                    "Spacious three-bedroom villa with a private pool in Jan Thiel, "
                    "Curaçao, suited for comfortable island living."
                ),
            },
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": (
                    "This three-bedroom villa in Jan Thiel offers a private pool and "
                    "an open living area. The home is finished for year-round use."
                ),
            },
        ],
        "applied_attributes": [
            {
                "key": "display_title",
                "effective_value": "3-Bedroom Villa with Pool in Jan Thiel",
            },
            {
                "key": "display_summary",
                "effective_value": (
                    "Spacious three-bedroom villa with a private pool in Jan Thiel, "
                    "Curaçao, suited for comfortable island living."
                ),
            },
            {
                "key": "display_overview",
                "effective_value": (
                    "This three-bedroom villa in Jan Thiel offers a private pool and "
                    "an open living area. The home is finished for year-round use."
                ),
            },
        ],
    }
    body.update(overrides)
    return body


def test_versions_are_v5() -> None:
    assert PROMPT_VERSION == "listing_enrichment_v5"
    assert SCHEMA_VERSION == "listing_enrichment_schema_v5"
    assert POLICY_VERSION == "enrichment_policy_v5"


def test_fallback_title_hierarchy() -> None:
    assert (
        build_fallback_display_title(
            bedrooms=3, property_type="villa", neighbourhood="Jan Thiel"
        )
        == "3-Bedroom Villa in Jan Thiel"
    )
    assert (
        build_fallback_display_title(neighbourhood="Pietermaai")
        == "Property in Pietermaai"
    )
    assert build_fallback_display_title() == "Property Listing"
    assert resolve_public_display_title(
        display_title="AI Title in Blue Bay",
        bedrooms=2,
        property_type="apartment",
        neighbourhood="Otrobanda",
        source_title="Prachtige woning te koop",
    ) == "AI Title in Blue Bay"
    # Source Dutch title must not become the public headline.
    assert (
        resolve_public_display_title(
            source_title="Prachtige gemeubileerde woning",
            bedrooms=2,
            property_type="house",
            neighbourhood="Mambo Beach",
        )
        == "2-Bedroom House in Mambo Beach"
    )


def test_fallback_summary_never_blank() -> None:
    summary = build_fallback_display_summary(
        bedrooms=2,
        property_type="apartment",
        neighbourhood="Pietermaai",
    )
    assert summary
    assert "Pietermaai" in summary or "Apartment" in summary


def test_complete_presentation_helper() -> None:
    complete = _complete_proposal_body()
    assert has_complete_english_presentation(complete) is True
    incomplete = _complete_proposal_body(
        field_decisions=[
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": "Overview only",
            }
        ],
        applied_attributes=[],
    )
    assert has_complete_english_presentation(incomplete) is False


def test_old_contract_requires_migration() -> None:
    v4_body = {
        "source_language": "nl",
        "concise_summary": "Villa met zwembad.",
        "display_overview": "Villa met zwembad in Jan Thiel.",
        "field_decisions": [
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": "Villa met zwembad in Jan Thiel.",
            },
            {
                "key": "concise_summary",
                "final_status": "auto_applied",
                "resulting_effective": "Villa met zwembad.",
            },
        ],
    }
    assert (
        requires_english_presentation_migration(
            prompt_version="listing_enrichment_v4",
            schema_version="listing_enrichment_schema_v4",
            proposal=v4_body,
            current_prompt_version=PROMPT_VERSION,
            current_schema_version=SCHEMA_VERSION,
        )
        is True
    )
    assert (
        requires_english_presentation_migration(
            prompt_version=PROMPT_VERSION,
            schema_version=SCHEMA_VERSION,
            proposal=_complete_proposal_body(),
            current_prompt_version=PROMPT_VERSION,
            current_schema_version=SCHEMA_VERSION,
        )
        is False
    )


def test_display_fields_auto_apply_without_needs_attention() -> None:
    decision = decide_field(
        key="display_title",
        proposed_value="2-Bedroom Apartment in Pietermaai",
        confidence=None,
        evidence_snippet=None,
        source_values={
            "title": "Appartement te huur",
            "source_description": "Mooi appartement in Pietermaai met 2 slaapkamers.",
            "cleaned_listing_text": "Mooi appartement in Pietermaai met 2 slaapkamers.",
            "bedrooms": 2,
            "property_type": "apartment",
        },
        source_text="Mooi appartement in Pietermaai met 2 slaapkamers.",
    )
    assert decision.final_status == AutoApplyStatus.AUTO_APPLIED


def test_synonym_duplicate_is_redundant_not_rejected() -> None:
    evaluation = evaluate_proposal_attributes(
        [
            {
                "key": "furnished",
                "value": True,
                "confidence": 0.95,
                "evidence_snippet": "fully furnished apartment",
                "evidence_source": "description",
                "extraction_reason": "explicit_source_mention",
                "recommended_action": "auto_apply",
            },
            {
                "key": "gemeubileerd",
                "value": True,
                "confidence": 0.9,
                "evidence_snippet": "gemeubileerd appartement",
                "evidence_source": "description",
                "extraction_reason": "synonym_match",
                "recommended_action": "auto_apply",
            },
        ],
        source_text="fully furnished apartment / gemeubileerd appartement in Mambo",
    )
    statuses = {d.final_status for d in evaluation.decisions}
    assert AutoApplyStatus.REDUNDANT in statuses
    assert AutoApplyStatus.NEEDS_ATTENTION not in statuses


def test_dutch_to_english_proposal_shape() -> None:
    proposal = EnrichmentProposal.model_validate(
        {
            "source_language": "nl",
            "concise_summary": "Quiet villa with pool in Jan Thiel.",
            "display_title": "3-Bedroom Villa with Pool in Jan Thiel",
            "display_summary": (
                "Quiet three-bedroom villa with a pool in Jan Thiel, Curaçao."
            ),
            "display_overview": (
                "A quiet three-bedroom villa with a private pool in Jan Thiel."
            ),
            "display_layout": None,
            "display_location": None,
            "display_highlights": [],
            "display_practical": None,
            "key_strengths": ["pool"],
            "trade_offs": [],
            "normalized_property_type_candidate": "villa",
            "normalized_transaction_type_check": "sale",
            "neighbourhood_candidate": "Jan Thiel",
            "neighbourhood_candidate_confidence": 0.9,
            "neighbourhood_evidence": "Jan Thiel",
            "location_mentions": ["Jan Thiel"],
            "resort_or_gated_candidate": "unknown",
            "resort_or_gated_evidence": None,
            "attributes": [],
            "missing_important_fields": [],
            "contradictions": [],
            "ambiguous_statements": [],
            "data_quality_warnings": [],
            "fields_requiring_human_review": [],
            "overall_confidence": 0.9,
        }
    )
    assert proposal.display_title.startswith("3-Bedroom")
    assert proposal.source_language == "nl"
    attrs = {item["key"] for item in proposal_to_attribute_dicts(proposal)}
    assert "display_title" in attrs
    assert "display_summary" in attrs
    assert "display_overview" in attrs


def test_public_projection_exposes_english_fields() -> None:
    body = _complete_proposal_body()
    assert project_public_display_title(body) == (
        "3-Bedroom Villa with Pool in Jan Thiel"
    )
    assert project_public_display_summary(body)
    description = project_public_display_description(body)
    assert description is not None
    assert description.get("language") == "en"
    assert description.get("overview")


def test_source_title_not_in_proposal_overwrite_path() -> None:
    """Proposal helpers never emit a protected source title field."""

    proposal = EnrichmentProposal(
        display_title="2-Bedroom Apartment in Pietermaai",
        display_summary="Bright apartment in Pietermaai on Curaçao.",
        display_overview="Bright two-bedroom apartment in Pietermaai.",
        source_language="nl",
    )
    keys = {item["key"] for item in proposal_to_attribute_dicts(proposal)}
    assert "title" not in keys
    assert "description" not in keys


class _ProposalClient:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._eq: dict = {}
        self._in: dict = {}

    def table(self, _name: str):
        self._eq = {}
        self._in = {}
        return self

    def select(self, *_a, **_k):
        return self

    def eq(self, key: str, value):
        self._eq[key] = value
        return self

    def in_(self, key: str, values):
        self._in[key] = list(values)
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = list(self._rows)
        for key, expected in self._eq.items():
            rows = [r for r in rows if r.get(key) == expected]
        for key, allowed in self._in.items():
            rows = [r for r in rows if r.get(key) in allowed]
        return type("R", (), {"data": rows[:1]})()


def _skip_test_row() -> dict:
    """Row with map-filled neighbourhood so operational-only is false."""

    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "external_id": "hs3080",
        "source_key": "remax_curacao",
        "source_url": "https://example.com/hs3080",
        "title": "Villa te koop",
        "description": "Villa met zwembad in Cas Grandi.",
        "listing_type": "sale",
        "property_type": "villa",
        "status": "active",
        "source_listing_status": "Available",
        "bedrooms": 3,
        "bathrooms": 2.0,
        "latitude": 12.1,
        "longitude": -68.9,
        "inferred_neighbourhood_id": "00000000-0000-0000-0000-000000000099",
        "inferred_neighbourhood_name": "Cas Grandi",
        "neighbourhood_assignment_status": "inferred",
        "neighbourhood_assignment_method": "point_in_polygon",
        "source_neighbourhood_text": "Curacao",
        "amenities": [],
    }


def test_skip_when_complete_english_presentation() -> None:
    row = _skip_test_row()
    from merkado_labs.enrichment.jobs import listing_to_enrichment_input
    from merkado_labs.enrichment import compute_input_checksum

    checksum = compute_input_checksum(listing_to_enrichment_input(row))
    client = _ProposalClient(
        [
            {
                "id": "p1",
                "status": "succeeded",
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "input_checksum": checksum,
                "model": "gpt-5.6-terra",
                "property_listing_id": row["id"],
                "proposal": _complete_proposal_body(),
            }
        ]
    )
    assert (
        should_skip_unchanged_enrichment(
            client, row=row, model="gpt-5.6-terra"
        )
        is True
    )


def test_repair_when_current_contract_incomplete() -> None:
    row = _skip_test_row()
    from merkado_labs.enrichment.jobs import listing_to_enrichment_input
    from merkado_labs.enrichment import compute_input_checksum

    checksum = compute_input_checksum(listing_to_enrichment_input(row))
    incomplete = {
        "field_decisions": [
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": "Overview only",
            }
        ]
    }
    client = _ProposalClient(
        [
            {
                "id": "p1",
                "status": "succeeded",
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "input_checksum": checksum,
                "model": "gpt-5.6-terra",
                "property_listing_id": row["id"],
                "proposal": incomplete,
            }
        ]
    )
    assert (
        should_skip_unchanged_enrichment(
            client, row=row, model="gpt-5.6-terra"
        )
        is False
    )


def test_old_prompt_requires_migration_not_skipped() -> None:
    row = _skip_test_row()
    from merkado_labs.enrichment.jobs import listing_to_enrichment_input
    from merkado_labs.enrichment import compute_input_checksum

    checksum = compute_input_checksum(listing_to_enrichment_input(row))
    v4_body = {
        "field_decisions": [
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": "Villa met zwembad.",
            },
            {
                "key": "concise_summary",
                "final_status": "auto_applied",
                "resulting_effective": "Villa met zwembad.",
            },
        ]
    }
    client = _ProposalClient(
        [
            {
                "id": "p1",
                "status": "succeeded",
                "prompt_version": "listing_enrichment_v4",
                "schema_version": "listing_enrichment_schema_v4",
                "input_checksum": checksum,
                "model": "gpt-5.6-terra",
                "property_listing_id": row["id"],
                "proposal": v4_body,
            }
        ]
    )
    assert (
        should_skip_unchanged_enrichment(
            client, row=row, model="gpt-5.6-terra"
        )
        is False
    )
