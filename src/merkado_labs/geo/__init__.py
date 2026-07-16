"""Shared geospatial helpers for Labs neighbourhood tooling."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any
from urllib.parse import urlparse

from merkado_labs.config import Settings

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"

# Bounding-box guard only. Point-in-polygon assignment is authoritative.
CURACAO_LAT_MIN = 11.90
CURACAO_LAT_MAX = 12.50
CURACAO_LON_MIN = -69.30
CURACAO_LON_MAX = -68.60

BOUNDARY_SOURCE_NAME = (
    "CLIMAAXKorsou Phase 2 — CBS Census 2023 neighbourhoods "
    "(Meteorological Department Curaçao)"
)
BOUNDARY_SOURCE_URL = "https://doi.org/10.5281/zenodo.19273186"
BOUNDARY_LICENCE = "CC-BY-4.0"
BOUNDARY_DATASET_RECORD = "19273186"
BOUNDARY_ZIP_NAME = "05_foundation.zip"
BOUNDARY_GPKG_RELATIVE = ("05_foundation", "neighbourhoods.gpkg")


def verify_labs_project(settings: Settings) -> str:
    """Return a validated Labs URL or stop before any database operation."""

    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError(
            f"Refusing Supabase access: expected Labs ref {LABS_PROJECT_REF!r}."
        )
    if settings.supabase_url is None:
        raise RuntimeError("SUPABASE_URL is required.")

    url = str(settings.supabase_url).rstrip("/")
    parsed = urlparse(url)
    expected_host = f"{LABS_PROJECT_REF}.supabase.co"
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise RuntimeError(
            f"Refusing Supabase access: SUPABASE_URL must use Labs host {expected_host!r}."
        )
    return url


def normalize_neighbourhood_name(value: str) -> str:
    """Normalize a neighbourhood name for matching without inventing display text."""

    cleaned = unicodedata.normalize("NFKC", value).replace("\u00a0", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.casefold()


def neighbourhood_slug(value: str) -> str:
    """Create a stable ASCII slug from a neighbourhood display name."""

    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.casefold()).strip("-") or "neighbourhood"


def unique_slug(display_name: str, normalized_name: str, used: set[str]) -> str:
    """Allocate a unique slug, disambiguating collisions with a short hash."""

    base = neighbourhood_slug(display_name)
    slug = base
    if slug in used:
        suffix = hashlib.sha256(normalized_name.encode()).hexdigest()[:8]
        slug = f"{base}-{suffix}"
    used.add(slug)
    return slug


def title_case_neighbourhood(value: str) -> str:
    """Present CBS uppercase names in a readable title case without inventing names."""

    cleaned = re.sub(r"\s+", " ", value.strip())
    if not cleaned.isupper():
        return cleaned
    return " ".join(
        part.capitalize() if part.isalpha() else part for part in cleaned.split(" ")
    )


def coordinate_quality(latitude: float | None, longitude: float | None) -> str:
    """Classify coordinates with the same bounding-box guard used in Postgres."""

    if latitude is None or longitude is None:
        return "missing_coords"
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return "invalid_coords"
    if (
        latitude < CURACAO_LAT_MIN
        or latitude > CURACAO_LAT_MAX
        or longitude < CURACAO_LON_MIN
        or longitude > CURACAO_LON_MAX
    ):
        return "outside_curacao"
    return "valid_curacao"


def gpkg_blob_to_wkb(blob: bytes) -> bytes:
    """Strip the GeoPackage Binary header and return standard WKB."""

    if len(blob) < 8 or blob[0:2] != b"GP":
        raise ValueError("Geometry blob is not GeoPackage Binary.")
    flags = blob[3]
    envelope_indicator = (flags >> 1) & 0x07
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    if envelope_indicator not in envelope_sizes:
        raise ValueError(f"Unsupported GeoPackage envelope indicator {envelope_indicator}.")
    if flags & 0x10:
        raise ValueError("Geometry blob is marked empty.")
    header_len = 8 + envelope_sizes[envelope_indicator]
    return blob[header_len:]


def apply_listing_neighbourhood_assignments(client: Any) -> dict[str, int]:
    """Persist point-in-polygon neighbourhood matches for all Labs listings.

    Safe to re-run: source ``neighbourhood_id`` is never overwritten. Returns
    stored assignment status counts after apply.
    """

    response = client.rpc("apply_listing_neighbourhood_assignments").execute()
    return {
        str(row["assignment_status"]): int(row["listing_count"])
        for row in (response.data or [])
    }


def summarize_listing_neighbourhood_assignments(client: Any) -> dict[str, int]:
    """Return preview assignment status counts without writing."""

    response = client.rpc("summarize_listing_neighbourhood_assignments").execute()
    counts = {
        str(row["assignment_status"]): int(row["listing_count"])
        for row in (response.data or [])
    }
    total = sum(counts.values())
    return {
        "total": total,
        "assigned_successfully": counts.get("inferred", 0) + counts.get("matched", 0),
        "inferred": counts.get("inferred", 0),
        "already_had_matching_neighbourhood": counts.get("matched", 0),
        "conflicting_neighbourhood": counts.get("conflict", 0),
        "outside_all_polygons": counts.get("outside_polygons", 0),
        "source_only": counts.get("source_only", 0),
        "missing_coords": counts.get("missing_coords", 0),
        "invalid_coords": counts.get("invalid_coords", 0),
        "outside_curacao": counts.get("outside_curacao", 0),
        "unprocessed": counts.get("unprocessed", 0),
        **{f"status_{key}": value for key, value in sorted(counts.items())},
    }
