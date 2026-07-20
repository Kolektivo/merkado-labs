"""Allowed and forbidden AI enrichment fields.

Unknown attribute keys may live in a flexible attribute bag; they must not
become first-class database columns automatically.
"""

from __future__ import annotations

# Fields AI may extract or normalize when evidenced in source text.
ALLOWED_AI_FIELDS: frozenset[str] = frozenset(
    {
        "property_type",
        "neighbourhood_candidate",
        "pool",
        "furnished",
        "parking",
        "parking_spaces",
        "garage",
        "gated_community",
        "gated",
        "air_conditioning",
        "sea_view",
        "garden",
        "balcony",
        "terrace",
        "solar_panels",
        "solar",
        "generator",
        "water_heater",
        "security_features",
        "pet_suitability",
        "accessibility",
        "appliance_inclusion",
        "normalized_amenities",
        "concise_summary",
        "title_normalization",
        "waterfront",
        "renovation_or_maintenance_mention",
    }
)

# Identity / money / legal facts AI must never change or invent.
FORBIDDEN_AI_FIELDS: frozenset[str] = frozenset(
    {
        "original_price",
        "price",
        "currency",
        "original_currency",
        "benchmark_price_xcg",
        "benchmark_conversion",
        "external_id",
        "source_url",
        "source_status",
        "source_listing_status",
        "sold_state",
        "rented_state",
        "listing_date",
        "source_listed_at",
        "coordinates",
        "latitude",
        "longitude",
        "ownership",
        "legal_status",
        "title_status",
        "kadaster",
        "confirmed_address",
        "street",
        "house_number",
        "confirmed_transaction_price",
        "confirmed_neighbourhood",
    }
)

# Structured source fields that block AI overwrite when present.
PROTECTED_SOURCE_STRUCTURED_FIELDS: frozenset[str] = frozenset(
    {
        "bedrooms",
        "bathrooms",
        "floor_area_m2",
        "lot_area_value",
        "source_neighbourhood_text",
        "location_text",
        "property_type",
        "listing_type",
    }
)

# Canonical attribute keys for reusable property attributes (not DB columns).
CANONICAL_ATTRIBUTE_KEYS: frozenset[str] = frozenset(
    {
        "pool",
        "furnished",
        "parking",
        "parking_spaces",
        "garage",
        "gated_community",
        "air_conditioning",
        "sea_view",
        "garden",
        "balcony",
        "terrace",
        "solar_panels",
        "generator",
        "water_heater",
        "security_features",
        "pet_suitability",
        "accessibility",
        "appliance_inclusion",
        "waterfront",
    }
)

ATTRIBUTE_DISPLAY_LABELS: dict[str, str] = {
    "pool": "Pool",
    "furnished": "Furnished",
    "parking": "Parking",
    "parking_spaces": "Parking spaces",
    "garage": "Garage",
    "gated_community": "Gated community",
    "gated": "Gated community",
    "air_conditioning": "Air conditioning",
    "sea_view": "Sea view",
    "garden": "Garden",
    "balcony": "Balcony",
    "terrace": "Terrace",
    "solar_panels": "Solar panels",
    "solar": "Solar panels",
    "generator": "Generator",
    "water_heater": "Water heater",
    "security_features": "Security",
    "pet_suitability": "Pets",
    "accessibility": "Accessibility",
    "appliance_inclusion": "Appliances included",
    "waterfront": "Waterfront",
    "property_type": "Property type",
    "neighbourhood_candidate": "Neighbourhood (AI)",
    "concise_summary": "Summary",
    "title_normalization": "Normalized title",
    "normalized_amenities": "Normalized amenities",
}

# Synonym → canonical key for local attribute detection / normalization.
ATTRIBUTE_SYNONYMS: dict[str, str] = {
    "swimming pool": "pool",
    "private pool": "pool",
    "zwembad": "pool",
    "fully furnished": "furnished",
    "gemeubileerd": "furnished",
    "parking space": "parking",
    "parking spaces": "parking_spaces",
    "carport": "parking",
    "gated community": "gated_community",
    "gated resort": "gated_community",
    "a/c": "air_conditioning",
    "ac": "air_conditioning",
    "airco": "air_conditioning",
    "air conditioning": "air_conditioning",
    "ocean view": "sea_view",
    "sea view": "sea_view",
    "zonnepanelen": "solar_panels",
    "solar panels": "solar_panels",
    "solar": "solar_panels",
    "water heater": "water_heater",
    "boiler": "water_heater",
}


def normalize_attribute_key(raw: str) -> str:
    """Map a raw term or key onto a canonical attribute key when known."""

    cleaned = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if cleaned in CANONICAL_ATTRIBUTE_KEYS or cleaned in ALLOWED_AI_FIELDS:
        if cleaned == "gated":
            return "gated_community"
        if cleaned == "solar":
            return "solar_panels"
        return cleaned
    phrase = (raw or "").strip().lower()
    if phrase in ATTRIBUTE_SYNONYMS:
        return ATTRIBUTE_SYNONYMS[phrase]
    return cleaned


def is_forbidden_field(key: str) -> bool:
    return normalize_attribute_key(key) in FORBIDDEN_AI_FIELDS or key in FORBIDDEN_AI_FIELDS


def is_allowed_ai_field(key: str) -> bool:
    normalized = normalize_attribute_key(key)
    if is_forbidden_field(normalized):
        return False
    return normalized in ALLOWED_AI_FIELDS or normalized in CANONICAL_ATTRIBUTE_KEYS
