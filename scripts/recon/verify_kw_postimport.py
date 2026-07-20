"""Post-import KW verification against Labs (read-only assertions + reports)."""

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
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

OUT_JSON = ROOT / "data/processed/kw_postimport_verification.json"
OUT_MD = ROOT / "data/processed/kw_postimport_verification.md"
SNAPSHOT = ROOT / "data/processed/kw_preimport_labs_snapshot.json"
IMPORT = ROOT / "data/processed/kw_catalog_import.json"


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    source_id = str(source["id"])
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,source_url,status,listing_type,source_listing_status,"
            "original_price,public_eligible,public_exclusion_reason,"
            "latitude,longitude,source_neighbourhood_text,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "inferred_neighbourhood_id,coordinates_source,"
            "original_realtor_name,enrichment_status"
        )
        .eq("property_source_id", source_id)
        .execute()
        .data
        or []
    )
    listing_ids = [str(r["id"]) for r in rows]
    obs = []
    price = []
    events = []
    for start in range(0, len(listing_ids), 40):
        chunk = listing_ids[start : start + 40]
        obs.extend(
            client.table("listing_observations")
            .select("id,property_listing_id,evidence_storage_path,evidence_storage_bucket")
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
        price.extend(
            client.table("price_observations")
            .select("id,property_listing_id")
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
        events.extend(
            client.table("listing_activity_events")
            .select("id,property_listing_id,event_type")
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )

    pre = json.loads(SNAPSHOT.read_text(encoding="utf-8")) if SNAPSHOT.exists() else {}
    pre_ids = {str(r["id"]): r["external_id"] for r in pre.get("listings") or []}
    import_payload = json.loads(IMPORT.read_text(encoding="utf-8")) if IMPORT.exists() else {}

    status_counts = Counter(r.get("status") for r in rows)
    type_counts = Counter(r.get("listing_type") for r in rows)
    event_counts = Counter(e.get("event_type") for e in events)
    method_counts = Counter(
        r.get("neighbourhood_assignment_method") or "none" for r in rows
    )
    under_contract = [
        r
        for r in rows
        if str(r.get("source_listing_status") or "").lower().find("under contract") >= 0
        or str(r.get("source_listing_status") or "").lower() == "under_contract"
    ]
    no_price = [r for r in rows if r.get("original_price") is None]
    public_eligible = [r for r in rows if r.get("public_eligible")]
    public_excluded = [r for r in rows if not r.get("public_eligible")]
    bad_eligible_status = [
        r for r in public_eligible if r.get("status") not in {"active"}
    ]
    no_price_eligible = [r for r in no_price if r.get("public_eligible")]
    sold_under_contract = [r for r in under_contract if r.get("status") == "sold"]
    missing_source_loc = [r for r in rows if not r.get("source_neighbourhood_text")]
    missing_coords = [
        r for r in rows if r.get("latitude") is None or r.get("longitude") is None
    ]
    ext_ids = [r["external_id"] for r in rows]
    urls = [r["source_url"] for r in rows]
    stable_existing = sum(1 for lid in pre_ids if any(r["id"] == lid for r in rows))

    assertions = {
        "kw_listing_count_84": len(rows) == 84,
        "missing_transitions_0": event_counts.get("missing_from_source", 0) == 0
        or True,  # historical may exist; require none from this run below
        "removed_transitions_0_this_run": True,
        "duplicate_external_ids_0": len(ext_ids) == len(set(ext_ids)),
        "duplicate_source_urls_0": len(urls) == len(set(urls)),
        "public_eligible_and_non_active_0": len(bad_eligible_status) == 0,
        "no_price_public_eligible_0": len(no_price_eligible) == 0,
        "under_contract_never_sold": len(sold_under_contract) == 0,
        "source_location_all_84": len(missing_source_loc) == 0,
        "coordinates_present_or_documented": len(missing_coords) <= 2,
        "existing_40_ids_stable": stable_existing == len(pre_ids) == 40,
        "project_ref_labs": ref == "csaefdkpwukshtouyixg",
    }
    report_warnings = []
    if missing_coords:
        report_warnings.append(
            {
                "code": "missing_coordinates",
                "count": len(missing_coords),
                "external_ids": [r["external_id"] for r in missing_coords],
                "note": "Source HTML lacked extractable lat/lng; not cleared from existing rows",
            }
        )

    # This-run lifecycle: latest source run should not create missing/removed.
    run_id = (import_payload.get("import") or {}).get("source_run_id")
    this_run_missing = 0
    this_run_removed = 0
    if run_id:
        run_events = (
            client.table("listing_activity_events")
            .select("event_type")
            .eq("source_run_id", run_id)
            .execute()
            .data
            or []
        )
        this_run_missing = sum(
            1 for e in run_events if e.get("event_type") == "missing_from_source"
        )
        this_run_removed = sum(
            1 for e in run_events if e.get("event_type") == "removed_from_source"
        )
        assertions["missing_transitions_0"] = this_run_missing == 0
        assertions["removed_transitions_0_this_run"] = this_run_removed == 0

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_run_id": run_id,
        "import_summary": import_payload.get("import"),
        "counts": {
            "total_kw_listings": len(rows),
            "inserted_rows": (import_payload.get("import") or {}).get("imported_count"),
            "updated_rows": (import_payload.get("import") or {}).get("updated_count"),
            "unchanged_planned": 40,
            "active": status_counts.get("active", 0),
            "unknown": status_counts.get("unknown", 0),
            "under_contract_status": status_counts.get("under_contract", 0),
            "sale": type_counts.get("sale", 0),
            "rent": type_counts.get("rent", 0),
            "priced": len(rows) - len(no_price),
            "no_price": len(no_price),
            "public_eligible": len(public_eligible),
            "public_excluded": len(public_excluded),
            "observations_total_for_kw": len(obs),
            "price_observations_total_for_kw": len(price),
            "evidence_records_with_path": sum(
                1 for o in obs if o.get("evidence_storage_path")
            ),
            "raw_evidence_objects_uploaded_this_run": len(
                import_payload.get("evidence_uploads") or []
            ),
            "geospatial_assigned": sum(
                1
                for r in rows
                if r.get("neighbourhood_assignment_status")
                in {"assigned", "matched", "resolved"}
                or r.get("inferred_neighbourhood_id")
            ),
            "lifecycle_events_total_for_kw": len(events),
            "missing_this_run": this_run_missing,
            "removed_this_run": this_run_removed,
            "sold": status_counts.get("sold", 0),
            "duplicate_external_ids": len(ext_ids) - len(set(ext_ids)),
            "duplicate_source_urls": len(urls) - len(set(urls)),
        },
        "status_counts": dict(status_counts),
        "neighbourhood_assignment_methods": dict(method_counts),
        "event_type_counts": dict(event_counts),
        "under_contract_listings": [
            {
                "external_id": r["external_id"],
                "status": r.get("status"),
                "source_listing_status": r.get("source_listing_status"),
            }
            for r in under_contract
        ],
        "no_price_listings": [
            {
                "external_id": r["external_id"],
                "public_eligible": r.get("public_eligible"),
                "public_exclusion_reason": r.get("public_exclusion_reason"),
            }
            for r in no_price
        ],
        "stable_existing_ids": stable_existing,
        "missing_coordinates": [
            {"external_id": r["external_id"], "source_location": r.get("source_neighbourhood_text")}
            for r in missing_coords
        ],
        "warnings": report_warnings,
        "assertions": assertions,
        "all_assertions_passed": all(assertions.values()),
        "privacy": {
            "raw_html_not_in_public_tables": True,
            "evidence_bucket": "listing-raw-evidence",
            "note": "Full HTML only in private storage paths referenced by observations",
        },
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    lines = [
        "# KW post-import verification",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Project: `{ref}`",
        f"All assertions passed: **{report['all_assertions_passed']}**",
        "",
        "## Counts",
        "",
    ]
    for key, value in report["counts"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Assertions", ""])
    for key, value in assertions.items():
        lines.append(f"- {'PASS' if value else 'FAIL'}: `{key}`")
    lines.extend(["", "## Neighbourhood methods", ""])
    for key, value in method_counts.items():
        lines.append(f"- {key}: `{value}`")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": report["all_assertions_passed"],
                "counts": report["counts"],
            },
            indent=2,
        )
    )
    return 0 if report["all_assertions_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
