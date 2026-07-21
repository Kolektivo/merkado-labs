"""Deterministic display-description utilities; no model calls."""

from __future__ import annotations

import re
from typing import Any

from merkado_labs.enrichment.presentation import (
    build_fallback_display_summary,
    build_fallback_display_title,
    resolve_public_display_summary,
    resolve_public_display_title,
)

# Re-export presentation title/summary helpers for callers that historically
# imported display-description utilities.
__all__ = (
    "build_fallback_display_description",
    "build_fallback_display_summary",
    "build_fallback_display_title",
    "clean_source_description",
    "detect_dominant_language",
    "resolve_public_display_summary",
    "resolve_public_display_title",
    "validate_display_description",
)


def detect_dominant_language(text: str) -> str:
    """Return a coarse source-language hint (en/nl/es/pap/mixed)."""

    lowered = f" {text or ''} ".casefold()
    dutch = sum(
        lowered.count(word)
        for word in (" het ", " een ", " met ", " van ", " slaapkamers", " gemeubileerd")
    )
    english = sum(
        lowered.count(word)
        for word in (" the ", " with ", " and ", " bedrooms", " located ", " furnished")
    )
    spanish = sum(
        lowered.count(word)
        for word in (" el ", " la ", " con ", " habitaciones", " amueblado")
    )
    papiamentu = sum(
        lowered.count(word)
        for word in (" e ", " den ", " ku ", " kas ", " benta")
    )
    scores = {
        "nl": dutch,
        "en": english,
        "es": spanish,
        "pap": papiamentu,
    }
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_lang, top_score = ranked[0]
    second_score = ranked[1][1]
    if top_score == 0:
        return "en"
    if second_score > 0 and top_score - second_score <= 1:
        return "mixed"
    return top_lang


def clean_source_description(text: str) -> str:
    """Normalize whitespace and remove lightweight contact boilerplate."""

    cleaned = re.sub(r"\s+", " ", text or "").strip()
    cleaned = re.sub(
        r"\b(?:call|contact|whatsapp|email)\s+(?:us|for|via)?\b.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip(" -|")
    return cleaned


def build_fallback_display_description(source_text: str, language: str) -> dict[str, Any]:
    """Build safe, source-derived display blocks when no proposal is usable.

    Fallbacks prefer English presentation fields. Source-language copy may be
    used for overview only when no better English template exists.
    """

    text = clean_source_description(source_text)
    overview = text[:600].rsplit(" ", 1)[0] if len(text) > 600 else text
    return {
        "display_overview": overview,
        "display_layout": None,
        "display_location": None,
        "display_highlights": [],
        "display_practical": None,
        "source_language": language or detect_dominant_language(text),
    }


def validate_display_description(
    proposal_parts: dict[str, Any], source_text: str
) -> tuple[bool, list[str]]:
    """Validate public narrative shape without judging generated wording."""

    reasons: list[str] = []
    if not clean_source_description(source_text):
        reasons.append("missing_source_text")
    limits = {
        "display_title": 120,
        "display_summary": 180,
        "display_overview": 600,
        "display_layout": 400,
        "display_location": 300,
        "display_practical": 400,
    }
    for key, limit in limits.items():
        value = proposal_parts.get(key)
        if value is not None and (not isinstance(value, str) or len(value) > limit):
            reasons.append(f"invalid_{key}")
        if isinstance(value, str) and re.search(r"<[^>]+>", value):
            reasons.append("html_not_allowed")
    highlights = proposal_parts.get("display_highlights")
    if highlights is not None:
        if not isinstance(highlights, list) or len(highlights) > 6:
            reasons.append("invalid_display_highlights")
        elif any(not isinstance(item, str) or len(item) > 160 for item in highlights):
            reasons.append("invalid_display_highlights")
    return not reasons, reasons
