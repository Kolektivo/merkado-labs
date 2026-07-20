"""Build remaining-79 KW Terra selection + preflight (read-only Labs SELECTs)."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment import compute_input_checksum  # noqa: E402
from merkado_labs.enrichment.jobs import listing_to_enrichment_input  # noqa: E402
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    assert_labs_project_ref,
)

CANARY_EXTERNAL_IDS = frozenset(
    {"001JVD", "ADL-0006", "ZK2423", "JC-003", "ID-002"}
)
OUT_PREFLIGHT = ROOT / "data/processed/kw_terra_remaining79_preflight.json"
OUT_SELECTION = ROOT / "data/processed/kw_terra_remaining79_selection.json"


def main() -> int:
    ref = assert_labs_project_ref()
    settings = get_settings()
    model = (settings.openai_enrichment_model or "").strip()
    if model != "gpt-5.6-terra":
        raise SystemExit(f"Model must be gpt-5.6-terra, got {model!r}")

    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,status,public_eligible,"
            "source_neighbourhood_text,description,enrichment_status,"
            "enrichment_last_input_checksum,bedrooms,bathrooms,original_price,"
            "property_type,source_listing_status,source_url,latitude,longitude,"
            "amenities,floor_area_m2,lot_area_value,lot_area_unit,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "inferred_neighbourhood_id,property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    if len(rows) != 84:
        raise SystemExit(f"Expected 84 KW listings, got {len(rows)}")

    canary_rows = [r for r in rows if str(r["external_id"]) in CANARY_EXTERNAL_IDS]
    if len(canary_rows) != 5:
        raise SystemExit(
            f"Expected 5 canary listings, found {len(canary_rows)}: "
            f"{sorted(r['external_id'] for r in canary_rows)}"
        )
    canary_ids = {str(r["id"]) for r in canary_rows}

    proposals = (
        client.table("ai_enrichment_proposals")
        .select("property_listing_id,status,model,input_checksum,generated_at")
        .in_("property_listing_id", list(canary_ids))
        .eq("model", "gpt-5.6-terra")
        .execute()
        .data
        or []
    )
    completed_canary = [
        p
        for p in proposals
        if p.get("status") in {"succeeded", "needs_review"}
    ]
    # Prefer latest per listing.
    latest_by_listing: dict[str, dict] = {}
    for prop in sorted(
        completed_canary, key=lambda p: str(p.get("generated_at") or "")
    ):
        latest_by_listing[str(prop["property_listing_id"])] = prop
    if len(latest_by_listing) != 5:
        raise SystemExit(
            f"Expected 5 completed Terra canary proposals, found {len(latest_by_listing)}"
        )

    running = (
        client.table("ai_enrichment_jobs")
        .select("id,status,scope_type,created_at")
        .eq("status", "running")
        .execute()
        .data
        or []
    )
    if running:
        raise SystemExit(f"Refusing: running enrichment job(s): {running}")

    remaining = []
    for row in sorted(rows, key=lambda r: str(r["external_id"])):
        eid = str(row["external_id"])
        if eid in CANARY_EXTERNAL_IDS:
            continue
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
        enrichment_input = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(enrichment_input)
        desc = row.get("description") or ""
        limited_reason = None
        if len(desc.strip()) < 40:
            limited_reason = "short_or_empty_description"
        remaining.append(
            {
                "listing_id": row["id"],
                "external_id": eid,
                "title": row.get("title"),
                "listing_type": row.get("listing_type"),
                "public_eligible": row.get("public_eligible"),
                "description_length": len(desc),
                "location": row.get("source_neighbourhood_text"),
                "input_checksum": checksum,
                "current_enrichment_status": row.get("enrichment_status"),
                "previous_checksum": row.get("enrichment_last_input_checksum"),
                "reason_included": (
                    "KW listing not in Terra canary set; eligible for remaining batch"
                    + (f"; {limited_reason}" if limited_reason else "")
                ),
                "limited_input_reason": limited_reason,
            }
        )

    if len(remaining) != 79:
        raise SystemExit(f"Expected 79 remaining listings, got {len(remaining)}")
    remaining_ids = {item["listing_id"] for item in remaining}
    if remaining_ids & canary_ids:
        raise SystemExit("Canary IDs leaked into remaining selection")

    preflight = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "model": model,
        "source_key": "keller_williams_curacao",
        "kw_listing_count": 84,
        "canary_external_ids": sorted(CANARY_EXTERNAL_IDS),
        "canary_listing_ids": sorted(canary_ids),
        "canary_completed_proposals": 5,
        "remaining_count": len(remaining),
        "running_jobs": [],
        "listings": remaining,
    }
    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": "keller_williams_curacao",
        "model_required": "gpt-5.6-terra",
        "count": 79,
        "excluded_canary_external_ids": sorted(CANARY_EXTERNAL_IDS),
        "listing_ids": [item["listing_id"] for item in remaining],
        "external_ids": [item["external_id"] for item in remaining],
        "listings": remaining,
    }
    OUT_PREFLIGHT.write_text(json.dumps(preflight, indent=2) + "\n", encoding="utf-8")
    OUT_SELECTION.write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "kw": 84,
                "canary": 5,
                "remaining": 79,
                "running_jobs": 0,
                "wrote": [OUT_PREFLIGHT.name, OUT_SELECTION.name],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
