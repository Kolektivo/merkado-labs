"""Project and apply first-observed sold/rented status event backfill (Labs only).

Default is dry-run. Never invents timestamps — uses earliest listing_observation
or first_seen_at. Does not create missing/removed events or change prices.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _earliest_status_observation(
    observations: list[dict[str, Any]],
    *,
    wanted: set[str],
) -> datetime | None:
    times: list[datetime] = []
    for obs in observations:
        payload = obs.get("normalized_payload") or {}
        status = str(payload.get("source_status") or "").lower()
        lifecycle = str(payload.get("lifecycle_hint") or "").lower()
        if status in wanted or lifecycle in wanted:
            ts = _parse_ts(obs.get("observed_at"))
            if ts is not None:
                times.append(ts)
    return min(times) if times else None


def project_backfill(client: Any, source_key: str = "remax_curacao") -> dict[str, Any]:
    source = resolve_property_source(client, source_key)
    source_id = str(source["id"])
    listings = (
        client.table("property_listings")
        .select(
            "id,external_id,status,source_listing_status,first_seen_at,sold_at,"
            "first_observed_sold_at,first_observed_rented_at,"
            "first_observed_under_contract_at"
        )
        .eq("property_source_id", source_id)
        .execute()
        .data
        or []
    )
    existing_events = (
        client.table("listing_activity_events")
        .select("property_listing_id,event_type")
        .in_(
            "event_type",
            [
                "source_marked_sold",
                "source_marked_rented",
                "source_marked_under_contract",
            ],
        )
        .execute()
        .data
        or []
    )
    have_event: set[tuple[str, str]] = {
        (str(row["property_listing_id"]), str(row["event_type"]))
        for row in existing_events
    }

    projected: list[dict[str, Any]] = []
    for listing in listings:
        listing_id = str(listing["id"])
        observations = (
            client.table("listing_observations")
            .select("observed_at,normalized_payload")
            .eq("property_listing_id", listing_id)
            .order("observed_at")
            .execute()
            .data
            or []
        )
        first_seen = _parse_ts(listing.get("first_seen_at"))
        source_status = str(listing.get("source_listing_status") or "").lower()
        status = str(listing.get("status") or "").lower()

        def plan(
            *,
            event_type: str,
            wanted: set[str],
            column: str,
            label: str,
            new_status: str,
        ) -> None:
            if (listing_id, event_type) in have_event:
                return
            # Prefer earliest immutable observation evidence over any later
            # first_observed_* stamp (e.g. set during a later refresh).
            event_at = _earliest_status_observation(observations, wanted=wanted)
            if event_at is None:
                event_at = _parse_ts(listing.get(column)) or first_seen
            if event_at is None:
                return
            current_col = _parse_ts(listing.get(column))
            needs_column_fix = current_col is None or (
                event_at is not None and current_col > event_at
            )
            projected.append(
                {
                    "property_listing_id": listing_id,
                    "external_id": listing["external_id"],
                    "event_type": event_type,
                    "event_at": event_at.isoformat(),
                    "column": column,
                    "set_column_if_null": needs_column_fix,
                    "label": label,
                    "new_status": new_status,
                    "derivation_type": "system_calculated",
                    "notes": (
                        f"{label}. Backfilled from earliest Merkado observation; "
                        "not a transaction or agreement date."
                    ),
                }
            )

        if status == "sold" or source_status == "sold":
            plan(
                event_type="source_marked_sold",
                wanted={"sold"},
                column="first_observed_sold_at",
                label="First observed as sold by Merkado",
                new_status="sold",
            )
        if source_status == "rented" or (
            status == "inactive" and source_status == "rented"
        ):
            plan(
                event_type="source_marked_rented",
                wanted={"rented"},
                column="first_observed_rented_at",
                label="First observed as rented by Merkado",
                new_status="inactive",
            )
        if source_status == "under_contract":
            plan(
                event_type="source_marked_under_contract",
                wanted={"under_contract"},
                column="first_observed_under_contract_at",
                label="First observed as under contract by Merkado",
                new_status="active",
            )

    counts = {
        "listings": len(listings),
        "projected_events": len(projected),
        "sold": sum(1 for p in projected if p["event_type"] == "source_marked_sold"),
        "rented": sum(
            1 for p in projected if p["event_type"] == "source_marked_rented"
        ),
        "under_contract": sum(
            1 for p in projected if p["event_type"] == "source_marked_under_contract"
        ),
        "column_updates": sum(1 for p in projected if p["set_column_if_null"]),
    }
    return {"counts": counts, "projected": projected}


def apply_backfill(client: Any, projected: list[dict[str, Any]]) -> dict[str, Any]:
    inserted = 0
    updated = 0
    skipped = 0
    for item in projected:
        listing_id = item["property_listing_id"]
        existing = (
            client.table("listing_activity_events")
            .select("id")
            .eq("property_listing_id", listing_id)
            .eq("event_type", item["event_type"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            skipped += 1
            continue
        client.table("listing_activity_events").insert(
            {
                "property_listing_id": listing_id,
                "event_type": item["event_type"],
                "event_at": item["event_at"],
                "previous_value": None,
                "new_value": {
                    "status": item["new_status"],
                    "first_observed_label": item["label"],
                    "backfill": True,
                },
                "derivation_type": "system_calculated",
                "notes": item["notes"],
            }
        ).execute()
        inserted += 1
        if item["set_column_if_null"]:
            client.table("property_listings").update(
                {item["column"]: item["event_at"]}
            ).eq("id", listing_id).execute()
            updated += 1
    return {"inserted_events": inserted, "column_updates": updated, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-key", default="remax_curacao")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write events/columns. Default is dry-run projection only.",
    )
    args = parser.parse_args()
    client = create_labs_client()
    projection = project_backfill(client, source_key=args.source_key)
    print(json.dumps({"dry_run": not args.apply, **projection["counts"]}, indent=2))
    if not args.apply:
        sample = projection["projected"][:8]
        print(json.dumps({"sample": sample}, indent=2))
        return
    result = apply_backfill(client, projection["projected"])
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
