from __future__ import annotations

from merkado_labs.enrichment.display_description import (
    build_fallback_display_description,
    clean_source_description,
    detect_dominant_language,
    validate_display_description,
)


def test_cleanup_language_and_fallback() -> None:
    text = "  Mooie woning met zwembad.   Neem contact met ons op voor meer. "
    cleaned = clean_source_description(text)
    assert "Neem contact" not in cleaned
    assert detect_dominant_language(cleaned) == "nl"
    fallback = build_fallback_display_description(cleaned, "nl")
    assert fallback["display_overview"] == cleaned


def test_display_description_rejects_html_and_oversized_parts() -> None:
    ok, reasons = validate_display_description(
        {"display_overview": "<b>Villa</b>", "display_highlights": ["Pool"]},
        "Villa with a pool and terrace.",
    )
    assert ok is False
    assert "html_not_allowed" in reasons
