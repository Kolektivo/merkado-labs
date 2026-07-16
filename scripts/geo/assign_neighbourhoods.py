"""Dry-run or apply PostGIS neighbourhood assignment for Labs listings."""

from __future__ import annotations

import argparse
import json

from merkado_labs.config import get_settings
from merkado_labs.geo import (
    LABS_PROJECT_REF,
    apply_listing_neighbourhood_assignments,
    summarize_listing_neighbourhood_assignments,
    verify_labs_project,
)


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
        summary = summarize_listing_neighbourhood_assignments(client)
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

    applied_counts = apply_listing_neighbourhood_assignments(client)
    print(
        json.dumps(
            {
                "mode": "apply",
                "project_ref": LABS_PROJECT_REF,
                "statuses": applied_counts,
                **summarize_listing_neighbourhood_assignments(client),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
