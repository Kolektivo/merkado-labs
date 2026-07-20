"""Verify Monumentenzorg complete-catalog activation in Labs."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    LABS_PROJECT_REF,
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_monumentenzorg_rows,
    load_monumentenzorg_catalog,
)

OUT_JSON = ROOT / "data/processed/monumentenzorg_postimport_verification.json"
IMPORT_RESULT = ROOT / "data/processed/monumentenzorg_import_result.json"
CATALOG = ROOT / "data/processed/monumentenzorg_complete_catalog.json"


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    rows = load_existing_monumentenzorg_rows(client)
    catalog = load_monumentenzorg_catalog(CATALOG)
    import_result = json.loads(IMPORT_RESULT.read_text(encoding="utf-8"))

    listing_ids = [str(r["id"]) for r in rows]
    ext_ids = [r["external_id"] for r in rows]
    urls = [r["source_url"] for r in rows]

    missing_events = (
        client.table("listing_activity_events")
        .select("id", count="exact")
        .in_("property_listing_id", listing_ids)
        .eq("event_type", "missing_from_source")
        .execute()
    )
    removed_events = (
        client.table("listing_activity_events")
        .select("id", count="exact")
        .in_("property_listing_id", listing_ids)
        .eq("event_type", "removed_from_source")
        .execute()
    )
    observations = (
        client.table("listing_observations")
        .select("id", count="exact")
        .in_("property_listing_id", listing_ids)
        .execute()
    )
    price_obs = (
        client.table("price_observations")
        .select("id", count="exact")
        .in_("property_listing_id", listing_ids)
        .execute()
    )
    events = (
        client.table("listing_activity_events")
        .select("id", count="exact")
        .in_("property_listing_id", listing_ids)
        .execute()
    )

    run_id = (import_result.get("import") or {}).get("source_run_id")
    run = (
        client.table("property_source_runs")
        .select("*")
        .eq("id", run_id)
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]

    geo_rows = (
        client.table("property_listings")
        .select(
            "id,external_id,neighbourhood_assignment_status,"
            "neighbourhood_assignment_method,"
            "inferred_neighbourhood_id,neighbourhood_id,source_neighbourhood_text,"
            "original_currency,conversion_method,conversion_provider,"
            "currency,benchmark_price_xcg,source_listing_status,status,"
            "field_provenance,public_eligible,public_exclusion_reason,"
            "original_price,latitude,longitude"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    geo_by = {str(r["external_id"]): r for r in geo_rows}

    coords = sum(
        1
        for r in rows
        if r.get("latitude") is not None and r.get("longitude") is not None
    )
    priced = sum(
        1
        for r in rows
        if r.get("original_price") is not None and float(r["original_price"]) > 0
    )
    public_eligible = sum(1 for r in rows if r.get("public_eligible") is True)
    sold = sum(1 for r in rows if r.get("status") == "sold")
    ang = sum(
        1
        for r in geo_rows
        if r.get("original_currency") == "ANG" and r.get("original_price") is not None
    )
    villa = geo_by.get("property-18650") or {}
    bargestraat = geo_by.get("property-19349") or {}
    aura = geo_by.get("property-19596") or {}

    from_price = False
    prov = villa.get("field_provenance") or {}
    if isinstance(prov, dict):
        from_price = bool(
            ((prov.get("price") or {}).get("from_price"))
            or ((prov.get("original_price") or {}).get("from_price"))
        )
    # also accept raw payload via amenities/provenance alternate
    if not from_price and villa.get("external_id") == "property-18650":
        # Check catalog artifact
        cat_villa = next(
            (i for i in catalog["listings"] if i["external_id"] == "property-18650"),
            {},
        )
        from_price = bool((cat_villa.get("raw_payload") or {}).get("from_price"))

    other_counts = {
        sk: int(
            client.table("property_listings")
            .select("id", count="exact")
            .eq(
                "property_source_id",
                resolve_property_source(client, sk)["id"],
            )
            .execute()
            .count
            or 0
        )
        for sk in (
            "keller_williams_curacao",
            "remax_curacao",
            "moret_real_estate",
        )
    }

    # Latest import_result may be the first baseline (5/0) or an amenity repair (0/5).
    imported = int(import_result["import"]["imported_count"])
    updated = int(import_result["import"]["updated_count"])
    checks = {
        "project_is_labs": ref == LABS_PROJECT_REF,
        "listings_5": len(rows) == 5,
        "import_touched_all_five": (imported + updated) >= 5 or imported == 5,
        "duplicate_external_ids_0": len(ext_ids) == len(set(ext_ids)) == 5,
        "duplicate_urls_0": len(urls) == len(set(urls)) == 5,
        "missing_events_0": (missing_events.count or 0) == 0,
        "removed_events_0": (removed_events.count or 0) == 0,
        "coordinates_0": coords == 0,
        "numeric_priced_2": priced == 2,
        "public_eligible_2": public_eligible == 2,
        "sold_1": sold == 1,
        "ang_original_2": ang == 2,
        "bargestraat_eligible": bargestraat.get("public_eligible") is True,
        "villa_maria_eligible": villa.get("public_eligible") is True,
        "villa_maria_from_price_in_catalog": from_price is True,
        "aura_sold_inactive": aura.get("status") == "sold"
        and aura.get("source_listing_status") == "sold_under_reservation",
        "complete_catalog_run": bool((run or {}).get("metadata", {}).get("complete_catalog")),
        "uncapped_run": (run or {}).get("metadata", {}).get("bounded") is False,
        "checksum_match": (run or {}).get("snapshot_checksum") == EXPECTED_CATALOG_CHECKSUM
        or ((run or {}).get("metadata") or {}).get("catalog_checksum")
        == EXPECTED_CATALOG_CHECKSUM,
        "adapter_status_manual": source.get("adapter_status") == "manual",
        "kw_unchanged_84": other_counts["keller_williams_curacao"] == 84,
        "remax_unchanged_220": other_counts["remax_curacao"] == 220,
        "moret_unchanged_71": other_counts["moret_real_estate"] == 71,
        "evidence_upload_ok": import_result.get("evidence_upload_succeeded") is True,
    }
    failed = [k for k, ok in checks.items() if not ok]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": SOURCE_KEY,
        "source_run_id": run_id,
        "counts": {
            "listings": len(rows),
            "observations": observations.count or 0,
            "price_observations": price_obs.count or 0,
            "lifecycle_events": events.count or 0,
            "public_eligible": public_eligible,
            "priced": priced,
            "sold": sold,
            "coordinates": coords,
            "ang_original": ang,
        },
        "statuses": dict(Counter(str(r.get("status")) for r in rows)),
        "source_statuses": dict(
            Counter(str(r.get("source_listing_status")) for r in rows)
        ),
        "currencies": dict(
            Counter(str(r.get("original_currency")) for r in geo_rows if r.get("original_currency"))
        ),
        "checks": checks,
        "failed_checks": failed,
        "passed": not failed,
        "other_source_counts": other_counts,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": payload["passed"],
                "failed_checks": failed,
                "counts": payload["counts"],
            },
            indent=2,
        )
    )
    return 0 if payload["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
