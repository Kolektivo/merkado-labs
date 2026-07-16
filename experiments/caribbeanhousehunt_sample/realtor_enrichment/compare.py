"""Compare CHH aggregator values with original-realtor enrichment fields."""

from __future__ import annotations

from typing import Any

try:
    from .adapters.remax_bonbini import area_to_m2
except ImportError:
    try:
        from adapters.remax_bonbini import area_to_m2
    except ImportError:
        from realtor_enrichment.adapters.remax_bonbini import area_to_m2  # type: ignore


def _as_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _numbers_close(left: Any, right: Any, *, rel: float = 0.02) -> bool:
    a = _as_number(left)
    b = _as_number(right)
    if a is None or b is None:
        return False
    if a == b:
        return True
    denom = max(abs(a), abs(b), 1.0)
    return abs(a - b) / denom <= rel


def _truthy_equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) and isinstance(right, bool):
        return left is right
    if isinstance(left, bool) and isinstance(right, str):
        return left is (right.casefold() in {"yes", "true", "y"})
    if isinstance(right, bool) and isinstance(left, str):
        return right is (left.casefold() in {"yes", "true", "y"})
    return str(left).strip().casefold() == str(right).strip().casefold()


def chh_value_for_field(chh: dict[str, Any], field_name: str) -> Any:
    """Map enrichment field names onto CHH listing vocabulary."""

    if field_name == "bathrooms":
        return chh.get("bathrooms")  # expected missing on CHH
    if field_name == "bedrooms":
        return chh.get("bedrooms")
    if field_name == "floor_area":
        value = chh.get("floor_area_m2")
        if value is None:
            return None
        return {"value": value, "unit": "m2"}
    if field_name == "lot_area":
        value = chh.get("lot_area_value")
        if value is None:
            return None
        return {"value": value, "unit": chh.get("lot_area_unit")}
    if field_name == "furnished":
        amenities = chh.get("amenities") or []
        for row in amenities:
            if isinstance(row, dict) and row.get("label") == "Furnished":
                return True
        return None
    if field_name == "has_pool":
        amenities = chh.get("amenities") or []
        for row in amenities:
            if isinstance(row, dict) and row.get("label") == "Swimming pool":
                return True
        return None
    if field_name == "sea_view":
        amenities = chh.get("amenities") or []
        for row in amenities:
            if isinstance(row, dict) and row.get("label") == "Sea view":
                return True
        return None
    if field_name == "pets_allowed":
        amenities = chh.get("amenities") or []
        for row in amenities:
            if isinstance(row, dict) and row.get("label") == "Pets allowed":
                return True
        return None
    if field_name == "gated_resort":
        # CHH has resort text but not a verified gated boolean; do not invent.
        return None
    if field_name == "availability_status":
        return chh.get("source_listing_status")
    if field_name == "project_name":
        return chh.get("resort")
    if field_name in {"listing_reference", "year_built"}:
        return None
    return chh.get(field_name)


def compare_field(field_name: str, chh_value: Any, realtor_value: Any) -> str:
    """Return match | enrichment | conflict | realtor_only."""

    if realtor_value in (None, "", [], {}):
        return "skipped"
    if chh_value in (None, "", [], {}):
        return "enrichment" if field_name != "listing_reference" else "realtor_only"

    if field_name in {"bedrooms", "bathrooms", "year_built"}:
        return "match" if _numbers_close(chh_value, realtor_value, rel=0.0) else "conflict"

    if field_name in {"floor_area", "lot_area"}:
        if not isinstance(realtor_value, dict):
            return "conflict"
        realtor_m2 = area_to_m2(realtor_value.get("value"), realtor_value.get("unit"))
        chh_unit = None
        chh_raw = None
        if isinstance(chh_value, dict):
            chh_raw = chh_value.get("value")
            chh_unit = chh_value.get("unit")
        else:
            chh_raw = chh_value
            chh_unit = "m2"
        # Lot area on CHH has unknown unit — never compare numerically until verified.
        if field_name == "lot_area" and chh_unit is None:
            return "conflict"
        chh_m2 = area_to_m2(chh_raw, chh_unit or "m2") if chh_raw is not None else None
        if realtor_m2 is None or chh_m2 is None:
            return "conflict"
        return "match" if _numbers_close(chh_m2, realtor_m2, rel=0.05) else "conflict"

    if field_name in {"furnished", "has_pool", "sea_view", "pets_allowed", "gated_resort"}:
        # CHH amenity presence is positive-only (absence ≠ false).
        if chh_value is True and realtor_value is False:
            return "conflict"
        if chh_value is True and realtor_value is True:
            return "match"
        if chh_value is True and isinstance(realtor_value, str):
            return "match" if "yes" in realtor_value.casefold() else "conflict"
        return "enrichment"

    if field_name == "project_name":
        return "match" if _truthy_equal(chh_value, realtor_value) else "conflict"

    if field_name == "availability_status":
        # Different vocabularies (Immediately vs for sale) — record as enrichment, not auto-conflict.
        return "enrichment"

    return "match" if _truthy_equal(chh_value, realtor_value) else "conflict"
