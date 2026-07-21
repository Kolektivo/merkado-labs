"""Unit tests for Dutch display-description helpers (no OpenAI calls)."""

from __future__ import annotations

from merkado_labs.enrichment.nl_description import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    DutchDescriptionProposal,
    compute_presentation_input_hash,
    extract_english_presentation_blocks,
    has_valid_dutch_description,
    validate_dutch_description,
)


def test_presentation_input_hash_stable_and_changes_with_english() -> None:
    english = {
        "overview": "A 3-bedroom villa with a pool in Jan Thiel.",
        "layout": "Open living area.",
        "location": "Near the beach.",
        "highlights": ["Pool"],
        "practical": "Air conditioning.",
    }
    a = compute_presentation_input_hash(
        english_blocks=english,
        source_title="Villa",
        source_description="Mooie villa met zwembad",
        source_language="nl",
        listing_type="sale",
        property_type="villa",
        bedrooms=3,
        bathrooms=2,
    )
    b = compute_presentation_input_hash(
        english_blocks=english,
        source_title="Villa",
        source_description="Mooie villa met zwembad",
        source_language="nl",
        listing_type="sale",
        property_type="villa",
        bedrooms=3,
        bathrooms=2,
    )
    assert a == b
    assert len(a) == 64
    changed = compute_presentation_input_hash(
        english_blocks={**english, "overview": "Different overview."},
        source_title="Villa",
        source_description="Mooie villa met zwembad",
        source_language="nl",
        listing_type="sale",
        property_type="villa",
        bedrooms=3,
        bathrooms=2,
    )
    assert changed != a


def test_extract_english_blocks_from_field_decisions() -> None:
    proposal = {
        "source_language": "nl",
        "field_decisions": [
            {
                "key": "display_title",
                "final_status": "auto_applied",
                "resulting_effective": "3-Bedroom Villa in Jan Thiel",
            },
            {
                "key": "display_summary",
                "final_status": "auto_applied",
                "resulting_effective": "Villa with pool near the beach.",
            },
            {
                "key": "display_overview",
                "final_status": "auto_applied",
                "resulting_effective": "This villa offers three bedrooms and a pool.",
            },
            {
                "key": "display_layout",
                "final_status": "auto_applied",
                "resulting_effective": "Open plan living.",
            },
            {
                "key": "display_highlights",
                "final_status": "auto_applied",
                "resulting_effective": ["Pool", "Garden"],
            },
        ],
    }
    blocks = extract_english_presentation_blocks(proposal)
    assert blocks is not None
    assert "three bedrooms" in blocks["overview"]
    assert blocks["layout"] == "Open plan living."
    assert blocks["highlights"] == ["Pool", "Garden"]


def test_validate_dutch_rejects_html_and_short_overview() -> None:
    english = {"overview": "A solid English overview of the home."}
    bad = DutchDescriptionProposal(overview="<p>kort</p>")
    ok, reasons = validate_dutch_description(bad, english_blocks=english)
    assert not ok
    assert "html_not_allowed" in reasons or "overview_too_short" in reasons

    good = DutchDescriptionProposal(
        overview=(
            "Deze villa biedt drie slaapkamers en een zwembad in Jan Thiel, "
            "met een open woonkamer en tuin."
        ),
        layout="Open woonruimte.",
        highlights=["Zwembad"],
    )
    ok2, reasons2 = validate_dutch_description(good, english_blocks=english)
    assert ok2, reasons2
    assert has_valid_dutch_description(
        {
            "language": "nl",
            "overview": good.overview,
            "layout": good.layout,
            "highlights": good.highlights,
        }
    )


def test_prompt_contract_versions() -> None:
    assert PROMPT_VERSION == "listing_description_nl_v1"
    assert SCHEMA_VERSION == "listing_description_nl_schema_v1"
