"""Deterministically select five representative KW listings for Terra canary."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

OUT = ROOT / "data/processed/kw_terra_canary_selection.json"
DRY = ROOT / "data/processed/kw_catalog_dry_run.json"


def _desc_len(row: dict) -> int:
    return len(row.get("description") or "")


def _has_poolish(row: dict) -> bool:
    blob = " ".join(
        [
            str(row.get("title") or ""),
            str(row.get("description") or ""),
            " ".join(str(x) for x in (row.get("amenities") or [])),
        ]
    ).lower()
    return "pool" in blob or "zwembad" in blob


def _normalize_loc(value: str | None) -> str:
    text = str(value or "").strip().casefold()
    return (
        text.replace("ç", "c")
        .replace("ã", "a")
        .encode("ascii", "ignore")
        .decode("ascii")
    )


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,property_type,status,"
            "source_listing_status,source_neighbourhood_text,bedrooms,bathrooms,"
            "floor_area_m2,original_price,original_currency,public_eligible,"
            "public_exclusion_reason,description,amenities,enrichment_status,"
            "latitude,longitude"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    rows = sorted(rows, key=lambda r: str(r["external_id"]))
    dry = json.loads(DRY.read_text(encoding="utf-8"))
    dry_by_ext = {str(item["external_id"]): item for item in dry.get("listings") or []}
    generic_cura_ids = {
        eid
        for eid, item in dry_by_ext.items()
        if _normalize_loc(item.get("location_text")).startswith("curac")
        or _normalize_loc(item.get("neighbourhood_text")).startswith("curac")
    }

    selected: list[dict] = []
    used: set[str] = set()

    def pick(predicate, reason: str) -> None:
        for row in rows:
            eid = str(row["external_id"])
            if eid in used:
                continue
            if predicate(row):
                used.add(eid)
                selected.append(
                    {
                        "listing_id": row["id"],
                        "external_id": eid,
                        "title": row.get("title"),
                        "category": row.get("listing_type"),
                        "reason_selected": reason,
                        "source_location": row.get("source_neighbourhood_text"),
                        "current_structured_fields": {
                            "status": row.get("status"),
                            "source_listing_status": row.get("source_listing_status"),
                            "property_type": row.get("property_type"),
                            "bedrooms": row.get("bedrooms"),
                            "bathrooms": row.get("bathrooms"),
                            "floor_area_m2": row.get("floor_area_m2"),
                            "original_price": row.get("original_price"),
                            "original_currency": row.get("original_currency"),
                            "public_eligible": row.get("public_eligible"),
                            "amenities": row.get("amenities") or [],
                            "latitude": row.get("latitude"),
                            "longitude": row.get("longitude"),
                        },
                        "description_length": _desc_len(row),
                        "existing_enrichment_status": row.get("enrichment_status"),
                    }
                )
                return
        raise RuntimeError(f"Unable to select listing for: {reason}")

    pick(
        lambda r: r.get("listing_type") == "sale"
        and (r.get("bedrooms") or 0) >= 3
        and _has_poolish(r)
        and _desc_len(r) >= 400
        and r.get("original_price") is not None,
        "Rich sale residential with pool/amenities and long description",
    )
    pick(
        lambda r: r.get("listing_type") == "rent"
        and r.get("original_price") is not None
        and _desc_len(r) >= 200,
        "Rent listing with usable description",
    )
    pick(
        lambda r: str(r["external_id"]) in generic_cura_ids,
        "Generic/ambiguous source location Curaçao (artifact location_text)",
    )
    pick(
        lambda r: (r.get("bedrooms") or 0) >= 6 or (r.get("bathrooms") or 0) >= 5,
        "Multi-unit / high bed or bath values requiring cautious validation",
    )
    pick(
        lambda r: r.get("original_price") is None
        and not r.get("public_eligible")
        and _desc_len(r) >= 100,
        "No-price / public-ineligible listing with useful description",
    )

    assert len(selected) == 5
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "model_required": "gpt-5.6-terra",
        "count": 5,
        "listing_ids": [item["listing_id"] for item in selected],
        "external_ids": [item["external_id"] for item in selected],
        "listings": selected,
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
