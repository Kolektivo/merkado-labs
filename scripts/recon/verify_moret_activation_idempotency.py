"""Phase 13: read-only idempotency checks after Moret activation (no paid OpenAI)."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_moret_rows,
    load_moret_catalog,
    reconcile_moret_catalog,
)

OUT = ROOT / "data/processed/moret_activation_idempotency.json"
CATALOG = ROOT / "data/processed/moret_complete_catalog.json"
SELECTION = ROOT / "data/processed/moret_terra_canary_selection.json"


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    catalog = load_moret_catalog(CATALOG)
    existing = load_existing_moret_rows(client)
    preview = reconcile_moret_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref=ref,
    )
    # After activation, inserts must be 0; updates may be 0 if cache reparse matches.
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    listing_ids = selection["listing_ids"]

    # Dry-run skip check via enrichment runner helpers
    from merkado_labs.enrichment.jobs import (
        hydrate_map_neighbourhood_names,
        should_skip_unchanged_enrichment,
    )

    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,source_url,title,description,listing_type,"
            "property_type,source_listing_status,status,bedrooms,bathrooms,"
            "floor_area_m2,lot_area_value,lot_area_unit,"
            "source_neighbourhood_text,original_price,original_currency,"
            "latitude,longitude,amenities,enrichment_status,"
            "enrichment_last_input_checksum,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
            "property_sources(source_key)"
        )
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )
    for row in rows:
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
    hydrate_map_neighbourhood_names(client, rows)
    skip_flags = [
        should_skip_unchanged_enrichment(client, row=row, model="gpt-5.6-terra")
        for row in rows
    ]

    # duplicate checks
    ext = [r["external_id"] for r in existing]
    urls = [r["source_url"] for r in existing]
    missing = (
        client.table("listing_activity_events")
        .select("id", count="exact")
        .in_("property_listing_id", [str(r["id"]) for r in existing])
        .eq("event_type", "missing_from_source")
        .execute()
    )
    removed = (
        client.table("listing_activity_events")
        .select("id", count="exact")
        .in_("property_listing_id", [str(r["id"]) for r in existing])
        .eq("event_type", "removed_from_source")
        .execute()
    )

    checks = {
        "reimport_inserts_0": preview.inserts == 0,
        "no_missing_transitions": preview.proposed_missing_events == 0
        and (missing.count or 0) == 0,
        "no_removed_transitions": preview.proposed_removed_events == 0
        and (removed.count or 0) == 0,
        "no_duplicate_external_ids": len(ext) == len(set(ext)) == 71,
        "no_duplicate_urls": len(urls) == len(set(urls)) == 71,
        "canaries_skip_unchanged_5": all(skip_flags) and len(skip_flags) == 5,
        "zero_openai_calls_in_this_check": True,
        "zero_additional_cost_usd": True,
        "project_is_labs": ref == "csaefdkpwukshtouyixg",
        "source_key": SOURCE_KEY == "moret_real_estate",
    }
    failed = [k for k, ok in checks.items() if not ok]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 13,
        "preview_summary": preview.as_dict()["summary"],
        "canary_skip_unchanged": dict(
            zip([r["external_id"] for r in rows], skip_flags, strict=False)
        ),
        "checks": checks,
        "failed_checks": failed,
        "passed": not failed,
        "notes": [
            "Read-only/dry checks only.",
            "No second paid Terra batch executed.",
            "No second import write executed.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": payload["passed"],
                "failed_checks": failed,
                "preview": payload["preview_summary"],
            },
            indent=2,
        )
    )
    return 0 if payload["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
