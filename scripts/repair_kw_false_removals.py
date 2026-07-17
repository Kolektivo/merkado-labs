#!/usr/bin/env python3
"""Repair Keller Williams listings falsely marked removed by bounded runs.

Read-only by default (--apply to write). Labs project only.
Does not delete immutable history; appends a clearly identified system repair event.
Does not claim source relisted; restores status from last valid pre-false-missing state.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from merkado_labs.config import get_settings
from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from supabase import create_client

REPAIR_CODE = "kw_bounded_run_false_removal_v1"
REPAIR_VERSION = "2026-07-17.1"
SOURCE_KEY = "keller_williams_curacao"
FALSE_RUN_IDS = (
    # max_items=5 runs mislabeled success that drove absence transitions
    "8e15e748-1850-4304-860a-3584b457bee6",
    "82781fdf-ac53-457a-9d36-5a34b45dcc20",
)


def _client():
    settings = get_settings()
    if settings.supabase_url is None or settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY required")
    return create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )


def _preview_rows(client) -> list[dict]:
    sources = (
        client.table("property_sources")
        .select("id,source_key,enabled,adapter_status")
        .eq("source_key", SOURCE_KEY)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sources:
        raise RuntimeError(f"Source {SOURCE_KEY} not found")
    source = sources[0]
    listings = (
        client.table("property_listings")
        .select(
            "id,external_id,status,source_listing_status,public_eligible,"
            "public_exclusion_reason,original_price,original_currency,source_url,"
            "title,missing_since,removed_at,consecutive_successful_absences,"
            "last_successfully_seen_at,latitude,longitude,description,"
            "original_realtor_name,original_realtor_url"
        )
        .eq("property_source_id", source["id"])
        .eq("status", "removed")
        .execute()
        .data
        or []
    )
    rows: list[dict] = []
    for listing in listings:
        events = (
            client.table("listing_activity_events")
            .select("id,event_type,event_at,previous_value,new_value,notes,source_run_id")
            .eq("property_listing_id", listing["id"])
            .in_("event_type", ["missing_from_source", "removed_from_source"])
            .order("event_at")
            .execute()
            .data
            or []
        )
        first_missing = next(
            (e for e in events if e["event_type"] == "missing_from_source"), None
        )
        prev_status = None
        if first_missing and isinstance(first_missing.get("previous_value"), dict):
            prev_status = first_missing["previous_value"].get("status")
        if not prev_status:
            # Deterministic fallback from source observation status only.
            src = (listing.get("source_listing_status") or "").casefold()
            if src in {"active", "available", "for sale", "for rent"}:
                prev_status = "active"
            elif "under contract" in src:
                prev_status = "unknown"
            else:
                prev_status = "active"
        eligible_before, reason_before = evaluate_public_eligibility(
            status=listing["status"],
            original_price=(
                Decimal(str(listing["original_price"]))
                if listing.get("original_price") is not None
                else None
            ),
            source_enabled=bool(source.get("enabled", True)),
            source_url=listing.get("source_url"),
            source_adapter_status=source.get("adapter_status"),
            has_source_attribution=bool(
                listing.get("original_realtor_name") or listing.get("source_url")
            ),
        )
        eligible_after, reason_after = evaluate_public_eligibility(
            status=prev_status,
            original_price=(
                Decimal(str(listing["original_price"]))
                if listing.get("original_price") is not None
                else None
            ),
            source_enabled=bool(source.get("enabled", True)),
            source_url=listing.get("source_url"),
            source_adapter_status=source.get("adapter_status"),
            has_source_attribution=bool(
                listing.get("original_realtor_name") or listing.get("source_url")
            ),
        )
        caused_by_false_runs = any(
            str(e.get("source_run_id") or "") in FALSE_RUN_IDS for e in events
        )
        rows.append(
            {
                "listing_id": listing["id"],
                "external_id": listing["external_id"],
                "title": listing.get("title"),
                "source_url": listing.get("source_url"),
                "previous_status": listing["status"],
                "repaired_status": prev_status,
                "source_listing_status": listing.get("source_listing_status"),
                "evidence": {
                    "last_successfully_seen_at": listing.get("last_successfully_seen_at"),
                    "missing_since": listing.get("missing_since"),
                    "removed_at": listing.get("removed_at"),
                    "false_absence_events": events,
                    "caused_by_bounded_success_runs": caused_by_false_runs,
                    "false_run_ids": list(FALSE_RUN_IDS),
                },
                "eligibility_before": {
                    "public_eligible": listing.get("public_eligible"),
                    "public_exclusion_reason": listing.get("public_exclusion_reason"),
                    "computed_eligible": eligible_before,
                    "computed_reason": reason_before,
                },
                "eligibility_after": {
                    "public_eligible": eligible_after,
                    "public_exclusion_reason": None if eligible_after else reason_after,
                    "computed_eligible": eligible_after,
                    "computed_reason": reason_after,
                },
                "preserve": {
                    "original_price": listing.get("original_price"),
                    "original_currency": listing.get("original_currency"),
                    "latitude": listing.get("latitude"),
                    "longitude": listing.get("longitude"),
                    "description_present": bool(listing.get("description")),
                },
            }
        )
    return rows


def apply_repair(client, rows: list[dict], *, now: datetime) -> list[dict]:
    applied: list[dict] = []
    for row in rows:
        if not row["evidence"]["caused_by_bounded_success_runs"]:
            # Still repair if removed + Active source status after bounded bug window.
            if (row.get("source_listing_status") or "").casefold() not in {
                "active",
                "available",
                "under contract",
            }:
                continue
        repaired_status = row["repaired_status"]
        eligible = row["eligibility_after"]["computed_eligible"]
        reason = row["eligibility_after"]["computed_reason"]
        update = {
            "status": repaired_status,
            "missing_since": None,
            "removed_at": None,
            "consecutive_successful_absences": 0,
            "public_eligible": eligible,
            "public_exclusion_reason": None if eligible else reason,
            "updated_at": now.isoformat(),
        }
        client.table("property_listings").update(update).eq("id", row["listing_id"]).execute()
        event = {
            "property_listing_id": row["listing_id"],
            "event_type": "material_field_changed",
            "event_at": now.isoformat(),
            "previous_value": {
                "status": row["previous_status"],
                "missing_since": row["evidence"]["missing_since"],
                "removed_at": row["evidence"]["removed_at"],
                "repair": True,
            },
            "new_value": {
                "status": repaired_status,
                "missing_since": None,
                "removed_at": None,
                "repair_code": REPAIR_CODE,
                "repair_version": REPAIR_VERSION,
            },
            "derivation_type": "system_calculated",
            "confidence": 1.0,
            "notes": (
                f"SYSTEM_REPAIR:{REPAIR_CODE} restored status from last valid "
                "pre-false-absence state. Bounded max_items runs were misclassified "
                "as complete success; this is not a source relist signal."
            ),
        }
        client.table("listing_activity_events").insert(event).execute()
        applied.append(
            {
                **row,
                "events_added": [event],
                "applied_at": now.isoformat(),
            }
        )
    # Correct mislabeled bounded KW source runs (do not delete).
    for run_id in FALSE_RUN_IDS:
        client.table("property_source_runs").update(
            {
                "outcome": "partial",
                "notes": (
                    "Bounded sequential manual run; scheduling disabled; Crawl-delay 20 seconds. "
                    f"SYSTEM_REPAIR:{REPAIR_CODE} outcome corrected from success→partial "
                    "(max_items cap; incomplete catalog)."
                ),
                "metadata": {
                    "bounded": True,
                    "complete_catalog": False,
                    "repair_code": REPAIR_CODE,
                    "repair_version": REPAIR_VERSION,
                    "outcome_corrected_from": "success",
                },
            }
        ).eq("id", run_id).execute()
    return applied


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write repairs (default dry-run)")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("data/processed/kw_false_removal_repair_report.json"),
    )
    args = parser.parse_args()
    settings = get_settings()
    if settings.supabase_project_ref != "csaefdkpwukshtouyixg":
        print("Refusing to run: not Labs project csaefdkpwukshtouyixg", file=sys.stderr)
        return 2
    client = _client()
    now = datetime.now(UTC)
    preview = _preview_rows(client)
    report = {
        "repair_code": REPAIR_CODE,
        "repair_version": REPAIR_VERSION,
        "timestamp": now.isoformat(),
        "mode": "apply" if args.apply else "preview",
        "source_key": SOURCE_KEY,
        "candidate_count": len(preview),
        "false_run_ids": list(FALSE_RUN_IDS),
        "listings": preview,
    }
    if args.apply:
        applied = apply_repair(client, preview, now=now)
        report["applied_count"] = len(applied)
        report["listings"] = applied
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "candidate_count": len(preview), "report": str(args.report)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
