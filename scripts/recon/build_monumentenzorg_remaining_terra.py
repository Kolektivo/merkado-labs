"""Build remaining Monumentenzorg Terra selection excluding canaries."""

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
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
)

CANARY = frozenset({"property-19349", "property-18650"})
OUT = ROOT / "data/processed/monumentenzorg_remaining_terra_selection.json"
TOTAL_CEILING = 0.30


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,status,public_eligible,"
            "enrichment_status,original_price,original_currency"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    remaining = [r for r in rows if r["external_id"] not in CANARY]
    if len(rows) != 5:
        raise SystemExit(f"Expected 5 Monumentenzorg listings, got {len(rows)}")
    if len(remaining) != 3:
        raise SystemExit(f"Expected 3 remaining listings, got {len(remaining)}")
    if any(r["external_id"] in CANARY for r in remaining):
        raise SystemExit("Canary leaked into remaining selection")

    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "model_required": "gpt-5.6-terra",
        "prompt_version": "listing_enrichment_v3",
        "schema_version": "listing_enrichment_schema_v3",
        "policy_version": "enrichment_policy_v3",
        "allow_canary": False,
        "count": len(remaining),
        "listing_ids": [str(r["id"]) for r in remaining],
        "external_ids": [r["external_id"] for r in remaining],
        "listings": [
            {
                "listing_id": str(r["id"]),
                "external_id": r["external_id"],
                "title": r.get("title"),
                "listing_type": r.get("listing_type"),
                "status": r.get("status"),
                "public_eligible": r.get("public_eligible"),
                "enrichment_status": r.get("enrichment_status"),
            }
            for r in remaining
        ],
        "excluded_canary_external_ids": sorted(CANARY),
        "hard_total_budget_usd_including_canary": TOTAL_CEILING,
        "job_label": "monumentenzorg_remaining_terra_backfill",
    }
    OUT.write_text(json.dumps(selection, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "count": selection["count"],
                "external_ids": selection["external_ids"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
