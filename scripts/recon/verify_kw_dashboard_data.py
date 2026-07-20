"""Read-only dashboard data checks after KW import + Terra canary."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

SELECTION = ROOT / "data/processed/kw_terra_canary_selection.json"
OUT = ROOT / "data/processed/kw_dashboard_verification.json"


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    listing_ids = selection["listing_ids"]

    kw_count = (
        client.table("property_listings")
        .select("id", count="exact")
        .eq("property_source_id", source["id"])
        .execute()
        .count
    )
    public_count = (
        client.table("property_listings")
        .select("id", count="exact")
        .eq("property_source_id", source["id"])
        .eq("public_eligible", True)
        .execute()
        .count
    )
    canary = (
        client.table("property_listings")
        .select(
            "id,external_id,enrichment_status,enrichment_last_run_at,public_eligible,"
            "original_price,title"
        )
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )
    proposals = (
        client.table("ai_enrichment_proposals")
        .select("property_listing_id,status,model,supporting_evidence")
        .in_("property_listing_id", listing_ids)
        .execute()
        .data
        or []
    )
    events = (
        client.table("listing_activity_events")
        .select("property_listing_id,event_type,notes")
        .in_("property_listing_id", listing_ids)
        .like("event_type", "ai_%")
        .execute()
        .data
        or []
    )

    checks = {
        "kw_listings_84": kw_count == 84,
        "public_eligible_81": public_count == 81,
        "canary_all_have_proposals": len(proposals) >= 5,
        "canary_enrichment_status_needs_review": all(
            row.get("enrichment_status") == "needs_review" for row in canary
        ),
        "canary_have_ai_started": all(
            any(
                e["property_listing_id"] == row["id"]
                and e["event_type"] == "ai_enrichment_started"
                for e in events
            )
            for row in canary
        ),
        "canary_have_ai_completed": all(
            any(
                e["property_listing_id"] == row["id"]
                and e["event_type"] == "ai_enrichment_completed"
                for e in events
            )
            for row in canary
        ),
        "no_price_still_ineligible": all(
            (row.get("original_price") is not None) or (not row.get("public_eligible"))
            for row in canary
        ),
        "proposals_include_timeline_drafts": all(
            isinstance((p.get("supporting_evidence") or {}).get("timeline_drafts"), list)
            for p in proposals
        ),
        "proposals_include_run_audit": all(
            isinstance((p.get("supporting_evidence") or {}).get("run_audit"), dict)
            for p in proposals
        ),
    }
    payload = {
        "kw_count": kw_count,
        "public_count": public_count,
        "canary": canary,
        "proposal_count": len(proposals),
        "ai_event_count": len(events),
        "checks": checks,
        "passed": all(checks.values()),
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"passed": payload["passed"], "checks": checks}, indent=2))
    return 0 if payload["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
