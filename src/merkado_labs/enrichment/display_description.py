"""Deterministic display-description utilities; no model calls."""

from __future__ import annotations

import re
from typing import Any


def detect_dominant_language(text: str) -> str:
    """Return ``nl`` for common Dutch signals, otherwise ``en``."""

    lowered = (text or "").casefold()
    dutch = sum(
        lowered.count(word)
        for word in (" het ", " een ", " met ", " van ", " in ", " slaapkamers")
    )
    english = sum(
        lowered.count(word)
        for word in (" the ", " with ", " and ", " bedrooms", " located ")
    )
    return "nl" if dutch > english else "en"


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
    """Build safe, source-derived display blocks when no proposal is usable."""

    text = clean_source_description(source_text)
    overview = text[:600].rsplit(" ", 1)[0] if len(text) > 600 else text
    if language == "nl":
        highlights: list[str] = []
    else:
        highlights = []
    return {
        "display_overview": overview,
        "display_layout": None,
        "display_location": None,
        "display_highlights": highlights,
        "display_practical": None,
    }


def validate_display_description(
    proposal_parts: dict[str, Any], source_text: str
) -> tuple[bool, list[str]]:
    """Validate public narrative shape without judging generated wording."""

    reasons: list[str] = []
    if not clean_source_description(source_text):
        reasons.append("missing_source_text")
    limits = {
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
