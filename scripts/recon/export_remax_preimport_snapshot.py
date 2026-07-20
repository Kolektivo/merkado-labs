"""Read-only Labs RE/MAX rollback evidence snapshot (no secrets, no HTML)."""

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
)
from merkado_labs.scrapers.remax_import_preview import (  # noqa: E402
    load_existing_remax_rows,
)

OUT = ROOT / "data/processed/remax_v041_preimport_labs_snapshot.json"
SOURCE_KEY = "remax_curacao"
APPROVED_SEMANTIC_IDS = ("hr2165", "hr2185", "hs3061", "hs3103", "hs3104")


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


def _chunked_select(
    client: Any, table: str, columns: str, listing_ids: list[str]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, len(listing_ids), 50):
        chunk = listing_ids[start : start + 50]
        rows.extend(
            client.table(table)
            .select(columns)
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
    return rows


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    source_id = str(source["id"])
    listings = load_existing_remax_rows(client)
    listing_ids = [str(row["id"]) for row in listings]

    observations = _chunked_select(
        client,
        "listing_observations",
        "id,property_listing_id,observed_at,source_sha256,"
        "evidence_storage_bucket,evidence_storage_path,adapter_version",
        listing_ids,
    )
    price_obs = _chunked_select(
        client,
        "price_observations",
        "id,property_listing_id,observed_at,price,currency,"
        "original_price,original_currency,benchmark_price_xcg",
        listing_ids,
    )
    events = _chunked_select(
        client,
        "listing_activity_events",
        "id,property_listing_id,event_type,event_at,notes,derivation_type",
        listing_ids,
    )
    proposals = _chunked_select(
        client,
        "ai_enrichment_proposals",
        "id,property_listing_id,model,prompt_version,schema_version,status,"
        "input_checksum,generated_at",
        listing_ids,
    )
    # Effective attributes / bathroom / year / project often live on observations
    obs_payloads = _chunked_select(
        client,
        "listing_observations",
        "id,property_listing_id,observed_at,normalized_payload,raw_payload,"
        "structured_evidence",
        listing_ids,
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
        .limit(20)
        .execute()
        .data
        or []
    )

    # Strip raw HTML / secrets from observation payloads
    safe_obs_payloads = []
    for row in obs_payloads:
        structured = row.get("normalized_payload") or {}
        evidence = row.get("structured_evidence") or {}
        raw = row.get("raw_payload") or {}
        if not isinstance(structured, dict):
            structured = {}
        if not isinstance(evidence, dict):
            evidence = {}
        if not isinstance(raw, dict):
            raw = {}
        # Never export raw HTML / large private blobs.
        safe_obs_payloads.append(
            {
                "id": row.get("id"),
                "property_listing_id": row.get("property_listing_id"),
                "observed_at": row.get("observed_at"),
                "listing_agent": raw.get("listing_agent")
                or structured.get("listing_agent")
                or evidence.get("listing_agent"),
                "year_built": raw.get("year_built")
                or structured.get("year_built")
                or evidence.get("year_built"),
                "project_name": raw.get("project_name")
                or structured.get("project_name")
                or evidence.get("project_name"),
                "full_bathrooms": raw.get("full_bathrooms")
                or structured.get("full_bathrooms"),
                "half_bathrooms": raw.get("half_bathrooms")
                or structured.get("half_bathrooms"),
                "coordinates_source": raw.get("coordinates_source")
                or structured.get("coordinates_source"),
                "image_count": (
                    len(structured.get("image_urls") or [])
                    if isinstance(structured.get("image_urls"), list)
                    else raw.get("image_count")
                ),
            }
        )

    compact_listings = []
    for row in listings:
        compact_listings.append(
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
                "coordinates_source": row.get("coordinates_source"),
                "source_neighbourhood_text": row.get("source_neighbourhood_text"),
                "inferred_neighbourhood_id": row.get("inferred_neighbourhood_id"),
                "inferred_neighbourhood_name": row.get("inferred_neighbourhood_name"),
                "neighbourhood_assignment_status": row.get(
                    "neighbourhood_assignment_status"
                ),
                "neighbourhood_assignment_method": row.get(
                    "neighbourhood_assignment_method"
                ),
                "bathrooms": row.get("bathrooms"),
                "bedrooms": row.get("bedrooms"),
                "image_count": len(row.get("image_urls") or [])
                if isinstance(row.get("image_urls"), list)
                else None,
                "primary_image_url": row.get("primary_image_url"),
                "enrichment_status": row.get("enrichment_status"),
                "first_seen_at": row.get("first_seen_at"),
                "last_seen_at": row.get("last_seen_at"),
                "missing_since": row.get("missing_since"),
                "removed_at": row.get("removed_at"),
            }
        )

    semantic_focus = [
        row
        for row in compact_listings
        if str(row.get("external_id")) in APPROVED_SEMANTIC_IDS
    ]
    focus_ids = {str(r["id"]) for r in semantic_focus}
    focus_proposals = [
        p for p in proposals if str(p.get("property_listing_id")) in focus_ids
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
        },
        "row_counts": {
            "property_listings": len(listings),
            "property_source_runs": len(runs),
            "listing_observations": len(observations),
            "price_observations": len(price_obs),
            "listing_activity_events": len(events),
            "ai_enrichment_proposals": len(proposals),
            "with_coordinates": sum(
                1
                for r in listings
                if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "public_eligible": sum(1 for r in listings if r.get("public_eligible")),
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
                    "original_currency",
                    "public_eligible",
                    "latitude",
                    "longitude",
                    "bathrooms",
                ],
            ),
            "observations": _checksum(
                observations,
                ["id", "property_listing_id", "source_sha256", "evidence_storage_path"],
            ),
            "events": _checksum(
                events, ["id", "property_listing_id", "event_type", "event_at"]
            ),
            "proposals": _checksum(
                proposals,
                ["id", "property_listing_id", "model", "status", "input_checksum"],
            ),
        },
        "semantic_focus_external_ids": list(APPROVED_SEMANTIC_IDS),
        "semantic_focus_listings": semantic_focus,
        "semantic_focus_terra_proposals": focus_proposals,
        "listings": compact_listings,
        "observation_field_digest": safe_obs_payloads,
        "source_runs": runs,
        "listing_observation_ids": [row["id"] for row in observations],
        "price_observation_ids": [row["id"] for row in price_obs],
        "activity_event_ids": [row["id"] for row in events],
        "proposal_ids": [row["id"] for row in proposals],
        "notes": [
            "Recovery evidence only — not a database backup or reset mechanism.",
            "No secrets or raw HTML included.",
        ],
    }
    OUT.write_text(
        json.dumps(snapshot, indent=2, default=str) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "wrote": str(OUT).replace("\\", "/"),
                "remax_listings": len(listings),
                "project_ref": ref,
                "coords": snapshot["row_counts"]["with_coordinates"],
                "public_eligible": snapshot["row_counts"]["public_eligible"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
