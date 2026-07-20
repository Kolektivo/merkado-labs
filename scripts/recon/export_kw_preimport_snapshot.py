"""Read-only Labs KW rollback evidence snapshot (no secrets, no HTML)."""

from __future__ import annotations

import hashlib
import json
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
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
    load_existing_kw_rows,
)

OUT = ROOT / "data/processed/kw_preimport_labs_snapshot.json"


def _checksum(rows: list[dict[str, Any]], keys: list[str]) -> str:
    ordered = sorted(
        rows, key=lambda r: str(r.get("id") or r.get("external_id") or "")
    )
    payload = json.dumps(
        [{k: row.get(k) for k in keys} for row in ordered],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    source_id = str(source["id"])
    listings = load_existing_kw_rows(client)

    listing_ids = [str(row["id"]) for row in listings]
    observations = []
    price_obs = []
    events = []
    if listing_ids:
        for start in range(0, len(listing_ids), 50):
            chunk = listing_ids[start : start + 50]
            observations.extend(
                client.table("listing_observations")
                .select(
                    "id,property_listing_id,observed_at,source_sha256,"
                    "evidence_storage_bucket,evidence_storage_path,adapter_version"
                )
                .in_("property_listing_id", chunk)
                .execute()
                .data
                or []
            )
            price_obs.extend(
                client.table("price_observations")
                .select(
                    "id,property_listing_id,observed_at,price,currency,"
                    "original_price,original_currency,benchmark_price_xcg"
                )
                .in_("property_listing_id", chunk)
                .execute()
                .data
                or []
            )
            events.extend(
                client.table("listing_activity_events")
                .select(
                    "id,property_listing_id,event_type,event_at,notes,derivation_type"
                )
                .in_("property_listing_id", chunk)
                .execute()
                .data
                or []
            )

    runs = (
        client.table("property_source_runs")
        .select(
            "id,source_key,adapter_version,outcome,discovered_count,parsed_count,"
            "imported_count,updated_count,excluded_no_price_count,started_at,"
            "completed_at,snapshot_checksum,metadata"
        )
        .eq("source_key", "keller_williams_curacao")
        .order("started_at", desc=True)
        .execute()
        .data
        or []
    )
    ai_jobs = (
        client.table("ai_enrichment_jobs")
        .select("id,status,model,scope_type,processed_count,succeeded_count,failed_count,created_at")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    ai_proposals = []
    if listing_ids:
        for start in range(0, len(listing_ids), 50):
            chunk = listing_ids[start : start + 50]
            ai_proposals.extend(
                client.table("ai_enrichment_proposals")
                .select(
                    "id,property_listing_id,model,status,input_checksum,generated_at"
                )
                .in_("property_listing_id", chunk)
                .execute()
                .data
                or []
            )

    false_removal = [
        event
        for event in events
        if event.get("event_type")
        in {"missing_from_source", "removed_from_source", "relisted"}
        or (
            isinstance(event.get("notes"), str)
            and "false" in event["notes"].lower()
        )
    ]

    compact_listings = [
        {
            "id": row["id"],
            "external_id": row["external_id"],
            "source_url": row.get("source_url"),
            "status": row.get("status"),
            "source_listing_status": row.get("source_listing_status"),
            "listing_type": row.get("listing_type"),
            "title": row.get("title"),
            "original_price": row.get("original_price"),
            "original_currency": row.get("original_currency"),
            "public_eligible": row.get("public_eligible"),
            "public_exclusion_reason": row.get("public_exclusion_reason"),
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
            "source_neighbourhood_text": row.get("source_neighbourhood_text"),
            "first_seen_at": row.get("first_seen_at"),
            "last_seen_at": row.get("last_seen_at"),
            "missing_since": row.get("missing_since"),
            "removed_at": row.get("removed_at"),
            "sold_at": row.get("sold_at"),
        }
        for row in listings
    ]

    snapshot = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "READ_ONLY_ROLLBACK_EVIDENCE",
        "target_project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "property_source": {
            "id": source_id,
            "source_key": source.get("source_key"),
            "display_name": source.get("display_name") or source.get("name"),
            "enabled": source.get("enabled"),
            "adapter_status": source.get("adapter_status"),
            "removal_threshold": source.get("removal_threshold"),
        },
        "row_counts": {
            "property_listings": len(listings),
            "property_source_runs": len(runs),
            "listing_observations": len(observations),
            "price_observations": len(price_obs),
            "listing_activity_events": len(events),
            "ai_enrichment_jobs_recent": len(ai_jobs),
            "ai_enrichment_proposals_for_kw": len(ai_proposals),
        },
        "checksums": {
            "listings": _checksum(
                compact_listings,
                [
                    "id",
                    "external_id",
                    "source_url",
                    "status",
                    "original_price",
                    "public_eligible",
                    "latitude",
                    "longitude",
                ],
            ),
            "observations": _checksum(
                observations,
                ["id", "property_listing_id", "source_sha256", "evidence_storage_path"],
            ),
            "events": _checksum(
                events, ["id", "property_listing_id", "event_type", "event_at"]
            ),
        },
        "public_eligibility": {
            "eligible": sum(1 for row in listings if row.get("public_eligible")),
            "ineligible": sum(1 for row in listings if not row.get("public_eligible")),
        },
        "previous_false_removal_repair_events": false_removal[:50],
        "ai_state": {
            "jobs": ai_jobs,
            "proposals": ai_proposals,
        },
        "listings": compact_listings,
        "source_runs": runs,
        "listing_observation_ids": [row["id"] for row in observations],
        "price_observation_ids": [row["id"] for row in price_obs],
        "activity_event_ids": [row["id"] for row in events],
        "notes": [
            "Recovery evidence only — not a database backup or reset mechanism.",
            "No secrets or raw HTML included.",
        ],
    }
    OUT.write_text(json.dumps(snapshot, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "wrote": str(OUT).replace("\\", "/"),
                "kw_listings": len(listings),
                "project_ref": ref,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
