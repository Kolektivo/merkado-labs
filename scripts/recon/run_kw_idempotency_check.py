"""Zero-cost resume check for all 84 KW listings (no paid calls expected)."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment import compute_input_checksum  # noqa: E402
from merkado_labs.enrichment.jobs import (  # noqa: E402
    create_enrichment_job,
    listing_to_enrichment_input,
    process_enrichment_job,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

OUT = ROOT / "data/processed/kw_terra_idempotency_check.json"


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
            "id,external_id,source_url,title,description,listing_type,property_type,"
            "source_listing_status,status,bedrooms,bathrooms,floor_area_m2,"
            "lot_area_value,lot_area_unit,source_neighbourhood_text,original_price,"
            "original_currency,latitude,longitude,amenities,enrichment_status,"
            "enrichment_last_input_checksum,neighbourhood_assignment_status,"
            "neighbourhood_assignment_method,neighbourhood_assignment_confidence,"
            "inferred_neighbourhood_id,property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    if len(rows) != 84:
        raise SystemExit(f"Expected 84 KW listings, got {len(rows)}")

    preflight = []
    for row in rows:
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
        enrichment_input = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(enrichment_input)
        preflight.append(
            {
                "listing_id": row["id"],
                "external_id": row["external_id"],
                "enrichment_status": row.get("enrichment_status"),
                "stored_checksum": row.get("enrichment_last_input_checksum"),
                "current_checksum": checksum,
                "would_skip": (
                    bool(row.get("enrichment_last_input_checksum"))
                    and row.get("enrichment_last_input_checksum") == checksum
                    and row.get("enrichment_status")
                    in {
                        "succeeded",
                        "skipped_unchanged",
                        "needs_review",
                        "failed",
                    }
                ),
            }
        )
    would_skip = sum(1 for item in preflight if item["would_skip"])
    if would_skip != 84:
        raise SystemExit(
            f"Idempotency preflight expected 84 skips, got {would_skip}. "
            f"Mismatches: {[i for i in preflight if not i['would_skip']][:10]}"
        )

    # Count proposals/events before.
    listing_ids = [str(r["id"]) for r in rows]
    props_before = (
        client.table("ai_enrichment_proposals")
        .select("id")
        .in_("property_listing_id", listing_ids)
        .eq("model", model)
        .execute()
        .data
        or []
    )
    events_before = (
        client.table("listing_activity_events")
        .select("id")
        .in_("property_listing_id", listing_ids)
        .like("event_type", "ai_enrichment%")
        .execute()
        .data
        or []
    )

    job_id = create_enrichment_job(
        client,
        scope_type="manual_selection",
        scope_filter={
            "listing_ids": listing_ids,
            "source_key": "keller_williams_curacao",
            "idempotency_check": True,
        },
        listing_ids=listing_ids,
        model=model,
        requested_by="kw_terra_idempotency_check",
        property_source_id=str(source["id"]),
    )
    result = process_enrichment_job(
        job_id,
        listing_ids=listing_ids,
        batch_size=1,
        force=False,
        model=model,
        client=client,
        persist_timeline=True,
        max_estimated_cost_usd=0.01,
        resume=True,
    )

    props_after = (
        client.table("ai_enrichment_proposals")
        .select("id")
        .in_("property_listing_id", listing_ids)
        .eq("model", model)
        .execute()
        .data
        or []
    )
    events_after = (
        client.table("listing_activity_events")
        .select("id")
        .in_("property_listing_id", listing_ids)
        .like("event_type", "ai_enrichment%")
        .execute()
        .data
        or []
    )

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "model": model,
        "preflight_would_skip": would_skip,
        "job_id": job_id,
        "result": result,
        "proposals_before": len(props_before),
        "proposals_after": len(props_after),
        "events_before": len(events_before),
        "events_after": len(events_after),
        "zero_openai_calls": result.get("succeeded", 0) == 0
        and result.get("failed", 0) == 0
        and result.get("skipped", 0) == 84
        and float(result.get("exact_cost_usd") or 0) == 0,
        "zero_new_cost": float(result.get("exact_cost_usd") or 0) == 0,
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, default=str))
    if not payload["zero_openai_calls"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
