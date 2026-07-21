#!/usr/bin/env python3
"""Dry-run presentation classification counts for Labs listing activity events.

Does not mutate or delete events. Labs project only.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings
from merkado_labs.scrapers.import_pipeline import create_labs_client
from merkado_labs.scrapers.presentation import dry_run_presentation_counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listing-id", help="Optional single listing UUID")
    parser.add_argument("--limit", type=int, default=5000, help="Max events to scan")
    args = parser.parse_args()

    settings = get_settings()
    if settings.supabase_project_ref != "csaefdkpwukshtouyixg":
        raise SystemExit("Refusing non-Labs project")

    client = create_labs_client()
    query = (
        client.table("listing_activity_events")
        .select(
            "id,property_listing_id,event_type,event_at,previous_value,new_value,notes,"
            "presentation_class,suppressed_reason"
        )
        .order("event_at", desc=True)
        .limit(args.limit)
    )
    if args.listing_id:
        query = query.eq("property_listing_id", args.listing_id)
    rows = query.execute().data or []

    # Group by listing for dual-writer detection within each listing timeline.
    by_listing: dict[str, list] = {}
    for row in rows:
        by_listing.setdefault(str(row["property_listing_id"]), []).append(row)

    totals: Counter[str] = Counter()
    for listing_id, events in by_listing.items():
        # Newest-first (matches dashboard).
        events_sorted = sorted(events, key=lambda r: r["event_at"], reverse=True)
        counts = dry_run_presentation_counts(events_sorted)
        for key, value in counts.items():
            totals[key] += value
        totals["listings"] += 1

    print(json.dumps({"scanned_events": len(rows), "counts": dict(totals)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
