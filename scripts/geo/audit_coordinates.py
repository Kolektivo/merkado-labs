"""Audit property listing coordinates without mutating Labs data."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from typing import Any
from urllib.parse import urlparse

from merkado_labs.config import get_settings
from merkado_labs.geo import LABS_PROJECT_REF, coordinate_quality, verify_labs_project


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of a text summary.",
    )
    return parser.parse_args()


def load_listings(client: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    start = 0
    while True:
        response = (
            client.table("property_listings")
            .select("id,latitude,longitude,neighbourhood_id")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def audit(rows: list[dict[str, Any]]) -> dict[str, int]:
    qualities = Counter()
    with_neighbourhood = 0
    missing_neighbourhood = 0
    potentially_inferable = 0

    for row in rows:
        quality = coordinate_quality(row.get("latitude"), row.get("longitude"))
        qualities[quality] += 1
        if row.get("neighbourhood_id"):
            with_neighbourhood += 1
        else:
            missing_neighbourhood += 1
            if quality == "valid_curacao":
                potentially_inferable += 1

    return {
        "total_listings": len(rows),
        "valid_coords": qualities["valid_curacao"],
        "missing_coords": qualities["missing_coords"],
        "invalid_coords": qualities["invalid_coords"],
        "outside_curacao": qualities["outside_curacao"],
        "with_neighbourhood": with_neighbourhood,
        "missing_neighbourhood": missing_neighbourhood,
        "potentially_inferable": potentially_inferable,
    }


def main() -> int:
    args = parse_args()
    settings = get_settings()
    url = verify_labs_project(settings)
    if settings.supabase_publishable_key is None and settings.supabase_secret_key is None:
        raise RuntimeError(
            "SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY is required for the audit."
        )

    from supabase import create_client

    key = (
        settings.supabase_publishable_key.get_secret_value()
        if settings.supabase_publishable_key is not None
        else settings.supabase_secret_key.get_secret_value()  # type: ignore[union-attr]
    )
    client = create_client(url, key)
    result = audit(load_listings(client))
    host = urlparse(url).hostname
    if args.json:
        print(json.dumps({"project_host": host, "project_ref": LABS_PROJECT_REF, **result}, indent=2))
    else:
        print(f"Coordinate audit for {LABS_PROJECT_REF} ({host})")
        for key_name, value in result.items():
            print(f"  {key_name}: {value}")
        print("No data was mutated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
