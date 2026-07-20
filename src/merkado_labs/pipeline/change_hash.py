"""Stable hashes for meaningful enrichment inputs and gallery membership."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any


def _normalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): _normalize(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, set | frozenset):
        return sorted((_normalize(item) for item in value), key=lambda item: repr(item))
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        normalized = [_normalize(item) for item in value]
        return sorted(normalized, key=lambda item: json.dumps(item, sort_keys=True, default=str))
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, str):
        return " ".join(value.split())
    return value


def compute_enrichment_input_hash(listing: Mapping[str, Any]) -> str:
    """Hash semantic source fields only; gallery membership is intentionally excluded."""

    payload = {
        "description": listing.get("source_description") or listing.get("description"),
        "features": (
            listing.get("features")
            or listing.get("amenities")
            or listing.get("structured_features")
        ),
        "neighbourhood": (
            listing.get("source_neighbourhood_text")
            or listing.get("neighbourhood_text")
            or listing.get("neighbourhood")
        ),
        "property_type": listing.get("property_type"),
        "facts": listing.get("facts")
        or {
            key: listing.get(key)
            for key in (
                "listing_type",
                "bedrooms",
                "bathrooms",
                "floor_area_m2",
                "lot_area_value",
                "lot_area_unit",
            )
        },
    }
    encoded = json.dumps(
        _normalize(payload),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def compute_image_membership_hash(image_urls: Sequence[str] | None) -> str:
    """Hash sorted unique gallery URLs for tracking, separate from AI selection."""

    urls = sorted({str(url).strip() for url in image_urls or () if str(url).strip()})
    return hashlib.sha256(
        json.dumps(urls, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
