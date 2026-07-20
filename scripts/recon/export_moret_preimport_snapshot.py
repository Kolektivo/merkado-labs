"""Phase 2: export current five Moret Labs rows for recovery (no secrets/HTML)."""

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
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_moret_rows,
)

OUT = ROOT / "data/processed/moret_preimport_labs_snapshot.json"


def _checksum(rows: list[dict[str, Any]], keys: list[str]) -> str:
    ordered = sorted(rows, key=lambda r: str(r.get("id") or r.get("external_id") or ""))
    payload = json.dumps(
        [{k: row.get(k) for k in keys} for row in ordered],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    listings = load_existing_moret_rows(client)
    listing_ids = [str(row["id"]) for row in listings]

    observations: list[dict[str, Any]] = []
    price_obs: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for start in range(0, len(listing_ids), 50):
        chunk = listing_ids[start : start + 50]
        if not chunk:
            break
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
        .eq("source_key", SOURCE_KEY)
        .order("started_at", desc=True)
        .execute()
        .data
        or []
    )
    ai_jobs = (
        client.table("ai_enrichment_jobs")
        .select("id,status,model,created_at,property_source_id")
        .eq("property_source_id", source["id"])
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )

    slim_listings = []
    for row in listings:
        slim_listings.append(
            {
                "id": row.get("id"),
                "external_id": row.get("external_id"),
                "source_url": row.get("source_url"),
                "title": row.get("title"),
                "original_price": row.get("original_price"),
                "original_currency": row.get("original_currency"),
                "benchmark_price_xcg": row.get("benchmark_price_xcg"),
                "listing_type": row.get("listing_type"),
                "status": row.get("status"),
                "source_listing_status": row.get("source_listing_status"),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "source_neighbourhood_text": row.get("source_neighbourhood_text"),
                "source_description_checksum": row.get("source_description_checksum"),
                "primary_image_url": row.get("primary_image_url"),
                "image_urls": row.get("image_urls"),
                "public_eligible": row.get("public_eligible"),
                "enrichment_status": row.get("enrichment_status"),
                "enrichment_last_input_checksum": row.get(
                    "enrichment_last_input_checksum"
                ),
                "original_realtor_name": row.get("original_realtor_name"),
                "original_realtor_domain": row.get("original_realtor_domain"),
                "original_realtor_external_id": row.get("original_realtor_external_id"),
            }
        )

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 2,
        "target_project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "source_key": SOURCE_KEY,
        "listing_count": len(slim_listings),
        "listings": slim_listings,
        "observations": observations,
        "price_observations": price_obs,
        "lifecycle_events": events,
        "source_runs": runs,
        "enrichment_jobs": ai_jobs,
        "checksums": {
            "listings": _checksum(
                slim_listings,
                [
                    "id",
                    "external_id",
                    "source_url",
                    "original_price",
                    "original_currency",
                    "listing_type",
                    "source_description_checksum",
                ],
            ),
            "observations": _checksum(
                observations, ["id", "property_listing_id", "source_sha256"]
            ),
            "events": _checksum(
                events, ["id", "property_listing_id", "event_type", "event_at"]
            ),
        },
        "contains_credentials": False,
        "contains_raw_html": False,
        "notes": [
            "Recovery snapshot before complete-catalog import.",
            "No secrets, raw HTML, or private keys included.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "wrote": str(OUT).replace("\\", "/"),
                "listing_count": len(slim_listings),
                "observations": len(observations),
                "events": len(events),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
