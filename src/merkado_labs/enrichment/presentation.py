"""Deterministic English public-presentation helpers (no model calls).

Hierarchy for public titles:
  AI display_title → template from bedrooms/type/neighbourhood →
  "Property in {neighbourhood}" → "Property Listing"
"""

from __future__ import annotations

import re
from typing import Any

MAX_DISPLAY_TITLE_LENGTH = 120
MAX_DISPLAY_SUMMARY_LENGTH = 180
MIN_DISPLAY_SUMMARY_TARGET = 120

ENGLISH_PRESENTATION_KEYS: tuple[str, ...] = (
    "display_title",
    "display_summary",
    "display_overview",
)

_PROPERTY_TYPE_LABELS: dict[str, str] = {
    "apartment": "Apartment",
    "appartement": "Apartment",
    "condo": "Apartment",
    "condominium": "Apartment",
    "house": "House",
    "huis": "House",
    "woning": "House",
    "villa": "Villa",
    "townhouse": "Townhouse",
    "town_house": "Townhouse",
    "land": "Land",
    "lot": "Land",
    "commercial": "Commercial Property",
    "office": "Office",
    "studio": "Studio",
    "penthouse": "Penthouse",
    "bungalow": "Bungalow",
}


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _auto_applied_value(proposal: dict[str, Any] | None, key: str) -> Any:
    """Return a value only when policy auto-applied it (not raw model output)."""

    if not proposal:
        return None
    for item in proposal.get("field_decisions") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("key") or "") != key:
            continue
        if item.get("final_status") != "auto_applied":
            continue
        value = item.get("resulting_effective", item.get("proposed_value"))
        if value not in (None, "", []):
            return value
    for item in proposal.get("applied_attributes") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("key") or "") != key:
            continue
        value = item.get("effective_value")
        if value not in (None, "", []):
            return value
    return None


def has_complete_english_presentation(proposal: dict[str, Any] | None) -> bool:
    """True when display_title, display_summary, and overview are auto-applied."""

    title = _clean_text(_auto_applied_value(proposal, "display_title"))
    summary = _clean_text(_auto_applied_value(proposal, "display_summary"))
    overview = _auto_applied_value(proposal, "display_overview")
    if overview is None:
        # Accept cohesive prose stored under display_description for flexibility.
        overview = _auto_applied_value(proposal, "display_description")
    overview_text = _clean_text(overview)
    return bool(title and summary and overview_text)


def requires_english_presentation_migration(
    *,
    prompt_version: str | None = None,
    schema_version: str | None = None,
    proposal: dict[str, Any] | None = None,
    current_prompt_version: str | None = None,
    current_schema_version: str | None = None,
) -> bool:
    """True when prior enrichment lacks the current English presentation contract.

    Complete English presentation (even from an older prompt row that was
    rematerialized) does not require migration. Incomplete current-version
    proposals and any older contract without the three public fields do.
    """

    if has_complete_english_presentation(proposal):
        return False
    if (
        current_prompt_version
        and current_schema_version
        and prompt_version == current_prompt_version
        and schema_version == current_schema_version
    ):
        # Same contract version but incomplete public fields → repair.
        return True
    return True


def _normalize_property_type_label(property_type: str | None) -> str | None:
    raw = _clean_text(property_type)
    if not raw:
        return None
    key = raw.casefold().replace("-", "_").replace(" ", "_")
    if key in _PROPERTY_TYPE_LABELS:
        return _PROPERTY_TYPE_LABELS[key]
    # Title-case simple tokens; drop unhelpful generics.
    if key in {"residential", "property", "real_estate", "other", "unknown", "n/a", "na"}:
        return None
    return raw[:1].upper() + raw[1:]


def _bedroom_prefix(bedrooms: Any) -> str | None:
    try:
        count = int(float(bedrooms))
    except (TypeError, ValueError):
        return None
    if count < 0:
        return None
    if count == 0:
        return "Studio"
    return f"{count}-Bedroom"


def build_fallback_display_title(
    *,
    bedrooms: Any = None,
    property_type: str | None = None,
    neighbourhood: str | None = None,
    feature: str | None = None,
) -> str:
    """Build a deterministic English title; never returns blank."""

    parts: list[str] = []
    bed = _bedroom_prefix(bedrooms)
    type_label = _normalize_property_type_label(property_type)
    if bed == "Studio" and (not type_label or type_label.casefold() == "studio"):
        parts.append("Studio")
    else:
        if bed and bed != "Studio":
            parts.append(bed)
        elif bed == "Studio" and type_label and type_label.casefold() != "studio":
            parts.append("Studio")
        if type_label and type_label.casefold() != "studio":
            parts.append(type_label)
    feature_clean = _clean_text(feature)
    if feature_clean and feature_clean.casefold() not in " ".join(parts).casefold():
        parts.append(feature_clean)
    nb = _clean_text(neighbourhood)
    if parts and nb:
        title = f"{' '.join(parts)} in {nb}"
    elif parts:
        title = " ".join(parts)
    elif nb:
        title = f"Property in {nb}"
    else:
        title = "Property Listing"
    return title[:MAX_DISPLAY_TITLE_LENGTH]


def build_fallback_display_summary(
    *,
    bedrooms: Any = None,
    property_type: str | None = None,
    neighbourhood: str | None = None,
    source_text: str | None = None,
) -> str:
    """Short English summary (target 120–180 chars); never blank."""

    title_like = build_fallback_display_title(
        bedrooms=bedrooms,
        property_type=property_type,
        neighbourhood=neighbourhood,
    )
    cleaned = re.sub(r"\s+", " ", source_text or "").strip()
    if cleaned:
        snippet = cleaned[:MAX_DISPLAY_SUMMARY_LENGTH]
        if len(cleaned) > MAX_DISPLAY_SUMMARY_LENGTH:
            snippet = snippet.rsplit(" ", 1)[0]
        # Prefer a bit more than a title when source text exists.
        if len(snippet) >= MIN_DISPLAY_SUMMARY_TARGET // 2:
            return snippet[:MAX_DISPLAY_SUMMARY_LENGTH]
    base = f"{title_like} on Curaçao."
    if len(base) < MIN_DISPLAY_SUMMARY_TARGET and neighbourhood:
        base = (
            f"{title_like} in {neighbourhood}, Curaçao. "
            "Details are drawn from the source listing description."
        )
    elif len(base) < MIN_DISPLAY_SUMMARY_TARGET:
        base = (
            f"{title_like} on Curaçao. "
            "Details are drawn from the source listing description."
        )
    return base[:MAX_DISPLAY_SUMMARY_LENGTH]


def resolve_public_display_title(
    *,
    display_title: str | None = None,
    bedrooms: Any = None,
    property_type: str | None = None,
    neighbourhood: str | None = None,
    source_title: str | None = None,
) -> str:
    """Public title chain ending in an English generic — never blank.

    Source title is intentionally not preferred for public display (may be
    Dutch/mixed); it is only used as a last structured hint before generics.
    """

    ai = _clean_text(display_title)
    if ai:
        return ai[:MAX_DISPLAY_TITLE_LENGTH]
    templated = build_fallback_display_title(
        bedrooms=bedrooms,
        property_type=property_type,
        neighbourhood=neighbourhood,
    )
    if templated != "Property Listing":
        return templated
    nb = _clean_text(neighbourhood)
    if nb:
        return f"Property in {nb}"[:MAX_DISPLAY_TITLE_LENGTH]
    # Do not surface raw non-English source titles as the public headline.
    _ = source_title  # retained for call-site compatibility / future rules
    return "Property Listing"


def resolve_public_display_summary(
    *,
    display_summary: str | None = None,
    effective_summary: str | None = None,
    bedrooms: Any = None,
    property_type: str | None = None,
    neighbourhood: str | None = None,
    source_text: str | None = None,
) -> str:
    """Public summary chain; prefers English presentation fields."""

    for candidate in (display_summary, effective_summary):
        text = _clean_text(candidate)
        if text:
            return text[:MAX_DISPLAY_SUMMARY_LENGTH]
    return build_fallback_display_summary(
        bedrooms=bedrooms,
        property_type=property_type,
        neighbourhood=neighbourhood,
        source_text=source_text,
    )
