"""Phase 5 Monumentenzorg activation preflight (read-only; no writes; no OpenAI)."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    EXPECTED_INSERTS,
    EXPECTED_LISTING_COUNT,
    EXPECTED_UPDATES,
    LABS_PROJECT_REF,
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_monumentenzorg_rows,
    load_monumentenzorg_catalog,
    reconcile_monumentenzorg_catalog,
)

OUT = ROOT / "data/processed/monumentenzorg_activation_preflight.json"
CATALOG = ROOT / "data/processed/monumentenzorg_complete_catalog.json"
CANARY_IDS = ("property-19349", "property-18650")


def _git() -> dict[str, Any]:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    status = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )
    return {
        "head": head,
        "adapter_merged_main": "1268f65e94e48ecd6f5f6515e0ae0a8245150872",
        "dirty": bool(status.strip()),
        "intentional_working_tree_expected": True,
    }


def _table_counts(client: Any, source_id: str) -> dict[str, int]:
    listing_ids = [
        str(r["id"])
        for r in (
            client.table("property_listings")
            .select("id")
            .eq("property_source_id", source_id)
            .execute()
            .data
            or []
        )
    ]

    def _count(table: str, column: str = "property_listing_id") -> int:
        if not listing_ids and table != "property_source_runs":
            return 0
        q = client.table(table).select("id", count="exact")
        if table == "property_source_runs":
            q = q.eq("source_key", SOURCE_KEY)
        else:
            q = q.in_(column, listing_ids or ["00000000-0000-0000-0000-000000000000"])
        return int(q.execute().count or 0)

    return {
        "property_listings": len(listing_ids),
        "property_source_runs": _count("property_source_runs"),
        "listing_observations": _count("listing_observations"),
        "price_observations": _count("price_observations"),
        "listing_activity_events": _count("listing_activity_events"),
        "ai_enrichment_jobs": int(
            client.table("ai_enrichment_jobs")
            .select("id", count="exact")
            .eq("property_source_id", source_id)
            .execute()
            .count
            or 0
        ),
    }


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    listings = load_existing_monumentenzorg_rows(client)
    catalog = load_monumentenzorg_catalog(CATALOG)
    preview = reconcile_monumentenzorg_catalog(
        catalog=catalog,
        existing_rows=listings,
        project_ref=ref,
    )

    pipeline_active = (
        client.table("property_pipeline_runs")
        .select("id,status")
        .in_("status", ["queued", "running", "stopping"])
        .execute()
        .data
        or []
    )
    ai_active = (
        client.table("ai_enrichment_jobs")
        .select("id,status,property_source_id")
        .in_("status", ["queued", "running", "pending"])
        .execute()
        .data
        or []
    )
    mz_ai_active = [
        row
        for row in ai_active
        if str(row.get("property_source_id")) == str(source["id"])
    ]
    complete_runs = (
        client.table("property_source_runs")
        .select("id,adapter_version,outcome,metadata,started_at")
        .eq("source_key", SOURCE_KEY)
        .order("started_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    prior_complete = [
        row
        for row in complete_runs
        if (row.get("metadata") or {}).get("complete_catalog") is True
    ]

    by_cat = {item["external_id"]: item for item in catalog["listings"]}
    canary_in_catalog = all(ext in by_cat for ext in CANARY_IDS)
    priced = [i for i in catalog["listings"] if i.get("has_positive_price")]
    no_price = [i for i in catalog["listings"] if not i.get("has_positive_price")]
    coords = sum(
        1
        for i in catalog["listings"]
        if i.get("latitude") is not None and i.get("longitude") is not None
    )
    critical_warnings = [
        w
        for i in catalog["listings"]
        for w in (i.get("parser_errors") or [])
    ]

    other_sources = (
        client.table("property_listings")
        .select("id", count="exact")
        .neq("property_source_id", source["id"])
        .execute()
    )

    stop_reasons: list[str] = []
    if ref != LABS_PROJECT_REF:
        stop_reasons.append("target_not_labs")
    if catalog.get("catalog_checksum") != EXPECTED_CATALOG_CHECKSUM:
        stop_reasons.append("checksum_differs")
    if len(listings) != 0:
        stop_reasons.append(f"labs_count_not_zero:{len(listings)}")
    if preview.failed:
        stop_reasons.extend(preview.failure_reasons)
    if preview.inserts != EXPECTED_INSERTS or preview.updates != EXPECTED_UPDATES:
        stop_reasons.append(
            f"import_preview_drift:insert={preview.inserts},update={preview.updates}"
        )
    if preview.proposed_missing_events or preview.proposed_removed_events:
        stop_reasons.append("missing_or_removed_proposed")
    if preview.identity_conflicts:
        stop_reasons.append("identity_conflicts")
    if prior_complete:
        stop_reasons.append("prior_complete_catalog_exists")
    if pipeline_active or mz_ai_active:
        stop_reasons.append("active_runs_present")
    if not canary_in_catalog:
        stop_reasons.append("canary_ids_missing_from_catalog")
    if len(catalog.get("listings") or []) != EXPECTED_LISTING_COUNT:
        stop_reasons.append("catalog_listing_count_mismatch")
    if len(priced) != 2 or len(no_price) != 3:
        stop_reasons.append(
            f"price_mix_unexpected:priced={len(priced)},no_price={len(no_price)}"
        )
    if coords != 0:
        stop_reasons.append(f"unexpected_coordinates:{coords}")
    if critical_warnings:
        stop_reasons.append("critical_parser_errors_present")

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 5,
        "git": _git(),
        "labs_project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "forbidden_project_ref": "jkrfyvukhhsapoivntms",
        "target_is_labs": ref == LABS_PROJECT_REF,
        "production_ref_loaded": False,
        "source_key": SOURCE_KEY,
        "property_source_id": str(source["id"]),
        "adapter_status": source.get("adapter_status"),
        "adapter_version_artifact": catalog.get("adapter_version"),
        "table_counts": _table_counts(client, str(source["id"])),
        "other_source_listing_count": int(other_sources.count or 0),
        "catalog": {
            "path": str(CATALOG).replace("\\", "/"),
            "checksum": catalog.get("catalog_checksum"),
            "expected_checksum": EXPECTED_CATALOG_CHECKSUM,
            "checksum_match": catalog.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM,
            "complete_catalog": catalog.get("complete_catalog"),
            "outcome": (catalog.get("run") or {}).get("outcome"),
            "listing_count": len(catalog.get("listings") or []),
            "unique_external_ids": len(
                {item["external_id"] for item in catalog.get("listings") or []}
            ),
            "rent_count": sum(
                1 for i in catalog["listings"] if i.get("listing_type") == "rent"
            ),
            "sale_count": sum(
                1 for i in catalog["listings"] if i.get("listing_type") == "sale"
            ),
            "numeric_priced": len(priced),
            "no_valid_price": len(no_price),
            "coordinates": coords,
            "critical_parser_errors": critical_warnings,
        },
        "labs_state": {
            "monumentenzorg_listing_count": len(listings),
            "expected_count_before_import": 0,
            "external_ids": [row["external_id"] for row in listings],
            "prior_complete_catalog_exists": bool(prior_complete),
            "active_pipeline_runs": len(pipeline_active),
            "active_ai_jobs": len(ai_active),
            "active_monumentenzorg_ai_jobs": len(mz_ai_active),
        },
        "import_preview": preview.as_dict()["summary"],
        "expected_reconciliation": {
            "inserts": EXPECTED_INSERTS,
            "updates": EXPECTED_UPDATES,
            "absent": 0,
            "listing_count": EXPECTED_LISTING_COUNT,
            "public_eligible": 2,
        },
        "terra_canary_external_ids": list(CANARY_IDS),
        "terra_canary_count": 2,
        "terra_canary_in_catalog": canary_in_catalog,
        "stop_reasons": stop_reasons,
        "proceed": not stop_reasons,
        "notes": [
            "No live Monumentenzorg scrape in preflight.",
            "No database writes in this preflight.",
            "First complete catalog will establish the baseline.",
            "Heritage /our_property/ remains out of scope.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"proceed": payload["proceed"], "stop_reasons": stop_reasons}, indent=2))
    return 0 if payload["proceed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
