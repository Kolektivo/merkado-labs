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
        "living_room",
        "kitchen",
        "outdoor_kitchen",
        "gas_included",
        "garden_maintenance_included",
        "normalized_amenities",
        "concise_summary",
        "display_overview",
        "display_layout",
        "display_location",
        "display_highlights",
        "display_practical",
        "title_normalization",
        "waterfront",
        "renovation_or_maintenance_mention",
        # Gap-fill only when the structured source value is empty/null.
        "bedrooms",
        "bathrooms",
        "price_period",
    }
)

# Fields retained as immutable listing facts when a non-null source value
# already exists. Empty source bedrooms/bathrooms may be filled from direct
# description evidence; floor_area_m2 stays hard-protected either way.
PROTECTED_AI_PROPOSAL_FIELDS: frozenset[str] = frozenset(
    {"bedrooms", "bathrooms", "floor_area_m2"}
)

# Protected fields that may be gap-filled when the source column is null/empty.
DESCRIPTION_FILLABLE_PROTECTED_FIELDS: frozenset[str] = frozenset(
    {"bedrooms", "bathrooms"}
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
        "living_room",
        "kitchen",
        "outdoor_kitchen",
        "gas_included",
        "garden_maintenance_included",
        "waterfront",
        "price_period",
    }
)

ATTRIBUTE_DISPLAY_LABELS: dict[str, str] = {
    "bedrooms": "Bedrooms",
    "bathrooms": "Bathrooms",
    "price_period": "Price period",
    "floor_area_m2": "Floor area",
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
    "living_room": "Living room",
    "kitchen": "Kitchen",
    "outdoor_kitchen": "Outdoor kitchen",
    "gas_included": "Gas included",
    "garden_maintenance_included": "Garden maintenance included",
    "waterfront": "Waterfront",
    "property_type": "Property type",
    "neighbourhood_candidate": "Neighbourhood (AI)",
    "concise_summary": "Summary",
    "display_overview": "Overview",
    "display_layout": "Layout",
    "display_location": "Location",
    "display_highlights": "Highlights",
    "display_practical": "Practical details",
    "title_normalization": "Normalized title",
    "normalized_amenities": "Normalized amenities",
}

# Synonym → canonical key for local attribute detection / normalization.
ATTRIBUTE_SYNONYMS: dict[str, str] = {
    "swimming pool": "pool",
    "private pool": "pool",
    "has_pool": "pool",
    "private_pool": "pool",
    "zwembad": "pool",
    "fully furnished": "furnished",
    "turn-key furnished": "furnished",
    "turnkey furnished": "furnished",
    "gemeubileerd": "furnished",
    "gemeubileerde": "furnished",
    "volledig gemeubileerd": "furnished",
    "unfurnished": "furnished",
    "ongemeubileerd": "furnished",
    "niet gemeubileerd": "furnished",
    "parking space": "parking",
    "parking spaces": "parking_spaces",
    "parkeerplaats": "parking",
    "parkeerplaatsen": "parking",
    "carport": "parking",
    "gated community": "gated_community",
    "gated resort": "gated_community",
    "gated_resort": "gated_community",
    "a/c": "air_conditioning",
    "ac": "air_conditioning",
    "airco": "air_conditioning",
    "a_c": "air_conditioning",
    "air conditioning": "air_conditioning",
    "ocean view": "sea_view",
    "sea view": "sea_view",
    "zeezicht": "sea_view",
    "uitzicht op zee": "sea_view",
    "panoramisch zeezicht": "sea_view",
    "waterfront": "waterfront",
    "seafront": "waterfront",
    "oceanfront": "waterfront",
    "beachfront": "waterfront",
    "beach front": "waterfront",
    "aan zee": "waterfront",
    "appartement aan zee": "waterfront",
    "woning aan zee": "waterfront",
    "aan het water": "waterfront",
    "beveiligd resort": "gated_community",
    "afgesloten resort": "gated_community",
    "controlled access": "gated_community",
    "bewaakte toegang": "gated_community",
    "zonnepanelen": "solar_panels",
    "solar panels": "solar_panels",
    "solar": "solar_panels",
    "water heater": "water_heater",
    "hot_water": "water_heater",
    "hot water": "water_heater",
    "warm water": "water_heater",
    "warmwater": "water_heater",
    "boiler": "water_heater",
    "pets_allowed": "pet_suitability",
    "pet_friendly": "pet_suitability",
    "huisdieren": "pet_suitability",
    "private_parking": "parking",
    "on_site_parking": "parking",
    "woonkamer": "living_room",
    "living room": "living_room",
    "keuken": "kitchen",
    "buitenkeuken": "outdoor_kitchen",
    "outdoor kitchen": "outdoor_kitchen",
    "side kitchen": "outdoor_kitchen",
    "buitenterras": "terrace",
    "overdekt terras": "terrace",
    "inclusief gas": "gas_included",
    "gas included": "gas_included",
    "tuinonderhoud": "garden_maintenance_included",
    "garden maintenance": "garden_maintenance_included",
}


def normalize_attribute_key(raw: str) -> str:
    """Map a raw term or key onto a canonical attribute key when known."""

    cleaned = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if cleaned in ATTRIBUTE_SYNONYMS:
        return ATTRIBUTE_SYNONYMS[cleaned]
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
