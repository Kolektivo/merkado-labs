"""Deterministic Dutch/English normalization for enrichment policy v4.1.

Zero AI cost: operates only on stored proposals, evidence snippets, and
retained source text. Canonical property-type vocabulary is shared with
scraper adapters — do not invent a parallel taxonomy.
"""

from __future__ import annotations

import re
from typing import Any

# Broad source buckets that AI may refine into a specific canonical type.
GENERIC_PROPERTY_TYPES: frozenset[str] = frozenset(
    {
        "residential",
        "property",
        "real_estate",
        "realestate",
        "other",
        "unknown",
        "n/a",
        "na",
    }
)

# Canonical allowlist used by Labs listings / public projection.
CANONICAL_PROPERTY_TYPES: frozenset[str] = frozenset(
    {
        "house",
        "villa",
        "apartment",
        "condo",
        "townhouse",
        "bungalow",
        "penthouse",
        "studio",
        "commercial",
        "office",
        "retail",
        "warehouse",
        "land",
        "lots_and_land",
        "mixed_use",
        "residential",
    }
)

_PROPERTY_TYPE_ALIASES: dict[str, str] = {
    # English house family
    "house": "house",
    "home": "house",
    "detached_single_family_home": "house",
    "detached_single_family": "house",
    "detached_single_home": "house",
    "single_family_home": "house",
    "single_family": "house",
    "family_home": "house",
    "family_house": "house",
    "two_story_house": "house",
    "two_storey_house": "house",
    # Dutch house family
    "woning": "house",
    "woonhuis": "house",
    "familiewoning": "house",
    "moderne_familiewoning": "house",
    "eengezinswoning": "house",
    "vrijstaande_woning": "house",
    # Villa / apartment / etc.
    "villa": "villa",
    "detached_villa": "villa",
    "apartment": "apartment",
    "appartement": "apartment",
    "bovenappartement": "apartment",
    "upper_apartment": "apartment",
    "condo": "condo",
    "condominium": "condo",
    "townhouse": "townhouse",
    "rijtjeshuis": "townhouse",
    "bungalow": "bungalow",
    "penthouse": "penthouse",
    "studio": "studio",
    "studio_or_room": "studio",
    "kamer": "studio",
    # Commercial / land
    "commercial": "commercial",
    "commercieel": "commercial",
    "commercieel_pand": "commercial",
    "office": "office",
    "kantoor": "office",
    "kantoorpand": "office",
    "commercial_office": "office",
    "retail": "retail",
    "winkel": "retail",
    "winkelruimte": "retail",
    "warehouse": "warehouse",
    "magazijn": "warehouse",
    "loods": "warehouse",
    "land": "land",
    "lot": "land",
    "lots_and_land": "lots_and_land",
    "undeveloped_land": "lots_and_land",
    "grond": "land",
    "bouwgrond": "land",
    "mixed_use": "mixed_use",
    "mixed_use_property": "mixed_use",
    "residential": "residential",
    "resort": "residential",
    "estate": "villa",
}

_FUZZY_PROPERTY_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"detached\s+single[\s-]*family", re.I), "house"),
    (re.compile(r"single[\s-]*family\s+home", re.I), "house"),
    (re.compile(r"\bfamiliewoning\b", re.I), "house"),
    (re.compile(r"\bwoning\b|\bwoonhuis\b", re.I), "house"),
    (re.compile(r"\bappartement\b|\bapartment\b", re.I), "apartment"),
    (re.compile(r"\bvilla\b", re.I), "villa"),
    (re.compile(r"\bcommercial\b|\bcommercieel\b", re.I), "commercial"),
    (re.compile(r"\boffice\b|\bkantoor\b", re.I), "office"),
    (re.compile(r"\bwarehouse\b|\bmagazijn\b|\bloods\b", re.I), "warehouse"),
    (re.compile(r"\bland\b|\bgrond\b|\bbouwgrond\b|\blot\b", re.I), "land"),
    (re.compile(r"\bpenthouse\b", re.I), "penthouse"),
    (re.compile(r"\bbungalow\b", re.I), "bungalow"),
    (re.compile(r"\btownhouse\b", re.I), "townhouse"),
)

# Location/marketing "accessibility" that must never become disability access.
SUBJECTIVE_ACCESSIBILITY_RE = re.compile(
    r"\b("
    r"excellent\s+accessibility|perfect\s+location|ideal\s+location|"
    r"great\s+location|easy\s+access|good\s+accessibility|"
    r"superb\s+accessibility|prime\s+location|convenient\s+location|"
    r"access\s+roads?|two\s+access\s+roads|"
    r"uitstekende\s+bereikbaarheid|goede\s+bereikbaarheid|"
    r"perfecte\s+ligging|ideale\s+ligging"
    r")\b",
    re.I,
)

DISABILITY_ACCESSIBILITY_RE = re.compile(
    r"\b("
    r"wheelchair|disability|disabled\s+access|accessible\s+entrance|"
    r"rolstoel|mindervaliden|toegankelijk\s+voor\s+mindervaliden|"
    r"barrier[\s-]?free|ada\s+compliant"
    r")\b",
    re.I,
)

SUBJECTIVE_MARKETING_RE = re.compile(
    r"\b("
    r"beautiful\s+view|stunning\s+view|luxurious|luxury|"
    r"spacious(?!\s+\d)|ideal\s+investment|safe\s+neighbourhood|"
    r"safe\s+neighborhood|family[\s-]?friendly|must[\s-]?see|"
    r"unique\s+opportunity|dream\s+home"
    r")\b",
    re.I,
)


def _slug_type(value: str) -> str:
    text = value.strip().casefold()
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^\w\s/+-]", " ", text, flags=re.UNICODE)
    text = re.sub(r"[\s/+-]+", "_", text).strip("_")
    return text


def normalize_property_type(value: Any) -> str | None:
    """Map free-text / Dutch / English property types onto the canonical set."""

    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    slug = _slug_type(raw)
    if slug in _PROPERTY_TYPE_ALIASES:
        return _PROPERTY_TYPE_ALIASES[slug]
    if slug in CANONICAL_PROPERTY_TYPES:
        return slug
    for pattern, canonical in _FUZZY_PROPERTY_PATTERNS:
        if pattern.search(raw):
            return canonical
    return slug or None


def is_generic_property_type(value: Any) -> bool:
    normalized = normalize_property_type(value)
    if normalized is None:
        return True
    return normalized in GENERIC_PROPERTY_TYPES


def property_types_equivalent(left: Any, right: Any) -> bool:
    a = normalize_property_type(left)
    b = normalize_property_type(right)
    if not a or not b:
        return False
    if a == b:
        return True
    # lots_and_land ↔ land
    landish = {"land", "lots_and_land"}
    if a in landish and b in landish:
        return True
    # office is a commercial subtype — treat as equivalent when one side is
    # the broad commercial bucket.
    if {a, b} <= {"commercial", "office", "retail", "warehouse"}:
        if "commercial" in {a, b}:
            return True
    return False


def is_subjective_accessibility(value: Any, evidence: str | None = None) -> bool:
    """True when the claim is location/marketing access, not disability access."""

    blob = f"{value or ''}\n{evidence or ''}"
    if DISABILITY_ACCESSIBILITY_RE.search(blob):
        return False
    return bool(SUBJECTIVE_ACCESSIBILITY_RE.search(blob))


def is_subjective_marketing_claim(value: Any, evidence: str | None = None) -> bool:
    blob = f"{value or ''}\n{evidence or ''}"
    if DISABILITY_ACCESSIBILITY_RE.search(blob):
        return False
    return bool(SUBJECTIVE_MARKETING_RE.search(blob))


def normalize_proposed_value(key: str, value: Any) -> Any:
    """Light deterministic coercion before policy evaluation."""

    if key == "property_type":
        return normalize_property_type(value) or value
    if isinstance(value, str):
        lowered = value.strip().casefold()
        if key in {
            "furnished",
            "pool",
            "terrace",
            "balcony",
            "garden",
            "parking",
            "garage",
            "gated_community",
            "air_conditioning",
            "sea_view",
            "solar_panels",
            "generator",
            "water_heater",
            "living_room",
            "kitchen",
            "outdoor_kitchen",
            "gas_included",
            "garden_maintenance_included",
        }:
            if lowered in {
                "unfurnished",
                "not furnished",
                "niet gemeubileerd",
                "ongemeubileerd",
                "non-furnished",
            }:
                return False
            if lowered in {
                "furnished",
                "fully furnished",
                "gemeubileerd",
                "volledig gemeubileerd",
            }:
                return True
            if key == "pet_suitability" and lowered in {
                "false",
                "no",
                "not allowed",
                "niet toegestaan",
            }:
                return False
            if key == "pet_suitability" and lowered in {
                "true",
                "yes",
                "allowed",
                "toegestaan",
            }:
                return True
    return value
