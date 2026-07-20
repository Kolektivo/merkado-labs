"""Phase 5: verify Moret complete-catalog activation in Labs."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    LABS_PROJECT_REF,
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_moret_rows,
    load_moret_catalog,
)

OUT_JSON = ROOT / "data/processed/moret_postimport_verification.json"
OUT_MD = ROOT / "data/processed/moret_postimport_verification.md"
IMPORT_RESULT = ROOT / "data/processed/moret_import_result.json"
PREIMPORT = ROOT / "data/processed/moret_preimport_labs_snapshot.json"
CATALOG = ROOT / "data/processed/moret_complete_catalog.json"


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    rows = load_existing_moret_rows(client)
    catalog = load_moret_catalog(CATALOG)
    import_result = json.loads(IMPORT_RESULT.read_text(encoding="utf-8"))
    pre = json.loads(PREIMPORT.read_text(encoding="utf-8"))
    prior_ids = {row["external_id"]: row["id"] for row in pre["listings"]}

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

    coords = sum(
        1
        for r in rows
        if r.get("latitude") is not None and r.get("longitude") is not None
    )
    descs = sum(1 for r in rows if r.get("description"))
    priced = sum(
        1
        for r in rows
        if r.get("original_price") is not None and float(r["original_price"]) > 0
    )
    public_eligible = sum(1 for r in rows if r.get("public_eligible") is True)
    public_excluded = len(rows) - public_eligible
    # neighbourhood fields available on select may be limited; query assignment cols
    geo_rows = (
        client.table("property_listings")
        .select(
            "id,external_id,neighbourhood_assignment_status,"
            "neighbourhood_assignment_method,"
            "inferred_neighbourhood_id,neighbourhood_id,source_neighbourhood_text,"
            "original_currency,conversion_method,conversion_provider,field_provenance,"
            "currency,benchmark_price_xcg,source_listing_status,status"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    geo_by_id = {str(r["id"]): r for r in geo_rows}
    map_misses = sum(
        1
        for r in rows
        if r.get("latitude") is not None
        and r.get("longitude") is not None
        and not geo_by_id.get(str(r["id"]), {}).get("inferred_neighbourhood_id")
        and not geo_by_id.get(str(r["id"]), {}).get("neighbourhood_id")
    )

    preserved = {
        ext: prior_ids[ext] == next(r["id"] for r in rows if r["external_id"] == ext)
        for ext in prior_ids
    }
    identities_preserved = all(preserved.values()) and len(preserved) == 5

    cat_by_ext = {item["external_id"]: item for item in catalog["listings"]}
    from_price_ok = 0
    for r in rows:
        cat = cat_by_ext.get(r["external_id"]) or {}
        if cat.get("from_price"):
            from_price_ok += 1

    currencies = Counter(
        str(
            geo_by_id.get(str(r["id"]), {}).get("original_currency")
            or r.get("original_currency")
        )
        for r in rows
    )
    statuses = Counter(
        str(
            geo_by_id.get(str(r["id"]), {}).get("source_listing_status")
            or r.get("source_listing_status")
        )
        for r in rows
    )

    checks = {
        "moret_listings_71": len(rows) == 71,
        "new_listings_66": import_result["import"]["imported_count"] == 66,
        "existing_identities_preserved_5": identities_preserved,
        "duplicate_external_ids_0": len(ext_ids) == len(set(ext_ids)),
        "duplicate_canonical_urls_0": len(urls) == len(set(urls)),
        "missing_events_0": (missing_events.count or 0) == 0,
        "removed_events_0": (removed_events.count or 0) == 0,
        "coordinates_71": coords == 71,
        "descriptions_71": descs == 71,
        "positive_prices_71": priced == 71,
        "first_complete_baseline": bool(
            (run or {}).get("metadata", {}).get("complete_catalog") is True
            and (run or {}).get("metadata", {}).get("first_complete_catalog_baseline") is True
        ),
        "checksum_match": import_result.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM,
        "project_is_labs": ref == LABS_PROJECT_REF,
        "evidence_upload_succeeded": import_result.get("evidence_upload_succeeded") is True,
        "no_live_website_requests": import_result.get("live_website_requests") is False,
    }
    failed = [k for k, ok in checks.items() if not ok]

    payload: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 5,
        "project_ref": ref,
        "source_run_id": run_id,
        "counts": {
            "listings": len(rows),
            "inserted": import_result["import"]["imported_count"],
            "updated": import_result["import"]["updated_count"],
            "unchanged": 0,
            "observations": import_result["import"]["observation_count"],
            "lifecycle_events_this_run": import_result["import"]["event_count"],
            "missing_events": missing_events.count or 0,
            "removed_events": removed_events.count or 0,
            "coordinates": coords,
            "descriptions": descs,
            "positive_prices": priced,
            "public_eligible": public_eligible,
            "public_excluded": public_excluded,
            "evidence_uploads": len(import_result.get("evidence_uploads") or []),
            "evidence_skipped_existing": len(
                import_result.get("evidence_skipped_existing") or []
            ),
            "evidence_upload_failures": len(
                import_result.get("evidence_upload_failures") or []
            ),
            "geospatial_rows_with_neighbourhood_id": sum(
                1
                for r in geo_rows
                if r.get("inferred_neighbourhood_id") or r.get("neighbourhood_id")
            ),
            "map_misses": map_misses,
            "from_price_in_catalog": from_price_ok,
        },
        "currencies": dict(currencies),
        "source_statuses": dict(statuses),
        "identity_preservation": preserved,
        "checks": checks,
        "failed_checks": failed,
        "passed": not failed,
        "import_notes_sample": (import_result.get("import") or {}).get("notes", [])[:20],
        "warnings": [],
        "errors": failed,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")

    lines = [
        "# Moret post-import verification",
        "",
        f"- Generated: `{payload['generated_at']}`",
        f"- Project: `{ref}`",
        f"- Source run: `{run_id}`",
        f"- Passed: `{payload['passed']}`",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload["counts"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Checks", ""])
    for key, ok in checks.items():
        lines.append(f"- {'PASS' if ok else 'FAIL'}: `{key}`")
    if failed:
        lines.extend(["", "## Failed", ""])
        for item in failed:
            lines.append(f"- `{item}`")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
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
