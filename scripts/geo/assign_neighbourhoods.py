"""Dry-run or apply PostGIS neighbourhood assignment for Labs listings."""

from __future__ import annotations

import argparse
import json
from typing import Any

from merkado_labs.config import get_settings
from merkado_labs.geo import LABS_PROJECT_REF, verify_labs_project


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Summarize assignment outcomes without writing.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist inferred neighbourhoods and statuses (Labs only).",
    )
    return parser.parse_args()


def summarize(client: Any) -> dict[str, int]:
    response = client.rpc("summarize_listing_neighbourhood_assignments").execute()
    counts = {
        row["assignment_status"]: int(row["listing_count"])
        for row in (response.data or [])
    }
    total = sum(counts.values())
    return {
        "total": total,
        "assigned_successfully": counts.get("inferred", 0) + counts.get("matched", 0),
        "inferred": counts.get("inferred", 0),
        "already_had_matching_neighbourhood": counts.get("matched", 0),
        "conflicting_neighbourhood": counts.get("conflict", 0),
        "outside_all_polygons": counts.get("outside_polygons", 0),
        "source_only": counts.get("source_only", 0),
        "missing_coords": counts.get("missing_coords", 0),
        "invalid_coords": counts.get("invalid_coords", 0),
        "outside_curacao": counts.get("outside_curacao", 0),
        "unprocessed": counts.get("unprocessed", 0),
        **{f"status_{key}": value for key, value in sorted(counts.items())},
    }


def main() -> int:
    args = parse_args()
    if args.dry_run == args.apply:
        raise SystemExit("Specify exactly one of --dry-run or --apply.")

    settings = get_settings()
    url = verify_labs_project(settings)
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for neighbourhood assignment.")
    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError("Refusing remote writes: project ref mismatch.")

    from supabase import create_client

    client = create_client(url, settings.supabase_secret_key.get_secret_value())

    if args.dry_run:
        summary = summarize(client)
        print(
            json.dumps(
                {
                    "mode": "dry-run",
                    "project_ref": LABS_PROJECT_REF,
                    **summary,
                },
                indent=2,
            )
        )
        return 0

    apply_response = client.rpc("apply_listing_neighbourhood_assignments").execute()
    applied_counts = {
        row["assignment_status"]: int(row["listing_count"])
        for row in (apply_response.data or [])
    }
    print(
        json.dumps(
            {
                "mode": "apply",
                "project_ref": LABS_PROJECT_REF,
                "statuses": applied_counts,
                **summarize(client),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
