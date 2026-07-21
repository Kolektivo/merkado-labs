#!/usr/bin/env python3
"""Audit (and optionally clean) duplicate listing gallery URLs in Labs.

Default is read-only dry-run. Pass ``--apply`` to persist cleaned galleries.

Safety:
- Labs project ``csaefdkpwukshtouyixg`` only
- Never touches production ``jkrfyvukhhsapoivntms``
- Never removes a sole valid cover
- Preserves stable first-seen gallery order / primary via ``build_gallery``
- No scrape, OpenAI, or binary download
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.images import (  # noqa: E402
    build_gallery,
    is_plausible_image_url,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"
PROD_FORBIDDEN = "jkrfyvukhhsapoivntms"
READY = (
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)


def _load_env() -> None:
    env = ROOT / "apps" / "labs-dashboard" / ".env.local"
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    os.environ["SUPABASE_PROJECT_REF"] = LABS


def _guard() -> None:
    if os.environ.get("SUPABASE_PROJECT_REF") != LABS:
        raise SystemExit("Refusing non-Labs project")
    blob = json.dumps(dict(os.environ))
    if PROD_FORBIDDEN in blob:
        raise SystemExit("Production reference present in environment")


def _as_url_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(u) for u in value if isinstance(u, str) and u.strip()]


def _category(row: dict[str, Any]) -> str:
    listing_type = (row.get("listing_type") or "unknown").strip() or "unknown"
    property_type = (row.get("property_type") or "unknown").strip() or "unknown"
    return f"{listing_type}/{property_type}"


def _protect_sole_cover(
    *,
    original_urls: list[str],
    primary: str | None,
    cleaned_urls: list[str],
    cleaned_primary: str | None,
) -> tuple[list[str], str | None]:
    """Never leave a listing with zero images when a valid cover existed."""

    if cleaned_urls:
        return cleaned_urls, cleaned_primary or cleaned_urls[0]
    candidates: list[str] = []
    if primary:
        candidates.append(primary)
    candidates.extend(original_urls)
    for url in candidates:
        text = url.strip()
        if text and is_plausible_image_url(text):
            return [text], text
    return [], None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist cleaned image_urls / primary_image_url (Labs only)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max listings to scan (0 = all)",
    )
    parser.add_argument(
        "--source",
        action="append",
        choices=list(READY),
        help="Limit to one or more Ready source_key values (repeatable)",
    )
    args = parser.parse_args(argv)

    _load_env()
    _guard()

    client = create_labs_client()
    source_filter = tuple(args.source) if args.source else READY
    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(source_filter))
        .execute()
        .data
        or []
    )
    source_ids = {row["id"]: row["source_key"] for row in sources}
    if not source_ids:
        raise SystemExit("No matching property_sources in Labs")

    query = (
        client.table("property_listings")
        .select(
            "id,property_source_id,listing_type,property_type,"
            "primary_image_url,image_urls,status"
        )
        .in_("property_source_id", list(source_ids))
        .neq("status", "removed")
    )
    if args.limit and args.limit > 0:
        query = query.limit(args.limit)
    listings = query.execute().data or []

    by_source: dict[str, Counter[str]] = {key: Counter() for key in source_filter}
    by_category: dict[str, Counter[str]] = defaultdict(Counter)
    samples: list[dict[str, Any]] = []
    updates: list[dict[str, Any]] = []

    for row in listings:
        source = source_ids[row["property_source_id"]]
        category = _category(row)
        original = _as_url_list(row.get("image_urls"))
        primary = row.get("primary_image_url")
        if isinstance(primary, str):
            primary = primary.strip() or None
        else:
            primary = None

        before_count = len(original)
        gallery = build_gallery(original, primary_url=primary)
        cleaned_urls, cleaned_primary = _protect_sole_cover(
            original_urls=original,
            primary=primary,
            cleaned_urls=gallery.urls,
            cleaned_primary=gallery.primary_url,
        )
        after_count = len(cleaned_urls)
        removed = max(0, before_count - after_count)
        changed = cleaned_urls != original or cleaned_primary != primary

        stats = by_source[source]
        stats["listings"] += 1
        stats["images_before"] += before_count
        stats["images_after"] += after_count
        stats["duplicate_slots_removed"] += removed
        stats["listings_with_dupes"] += int(removed > 0)
        stats["listings_changed"] += int(changed)
        stats["build_gallery_duplicates_removed"] += gallery.duplicates_removed

        cat = by_category[category]
        cat["listings"] += 1
        cat["images_before"] += before_count
        cat["images_after"] += after_count
        cat["duplicate_slots_removed"] += removed

        if removed > 0 and len(samples) < 25:
            samples.append(
                {
                    "id": row["id"],
                    "source_key": source,
                    "category": category,
                    "before": before_count,
                    "after": after_count,
                    "primary_before": primary,
                    "primary_after": cleaned_primary,
                    "urls_before_head": original[:3],
                    "urls_after_head": cleaned_urls[:3],
                }
            )

        if args.apply and changed:
            updates.append(
                {
                    "id": row["id"],
                    "image_urls": cleaned_urls,
                    "primary_image_url": cleaned_primary,
                }
            )

    applied = 0
    if args.apply and updates:
        # Small batches; service-role Labs only.
        batch_size = 50
        for offset in range(0, len(updates), batch_size):
            batch = updates[offset : offset + batch_size]
            for item in batch:
                (
                    client.table("property_listings")
                    .update(
                        {
                            "image_urls": item["image_urls"],
                            "primary_image_url": item["primary_image_url"],
                        }
                    )
                    .eq("id", item["id"])
                    .execute()
                )
                applied += 1

    report = {
        "project_ref": LABS,
        "mode": "apply" if args.apply else "dry_run",
        "openai_calls": 0,
        "terra_calls": 0,
        "ai_cost_usd": 0.0,
        "sources": list(source_filter),
        "listings_scanned": len(listings),
        "listings_changed": sum(c["listings_changed"] for c in by_source.values()),
        "duplicate_slots_removed_total": sum(
            c["duplicate_slots_removed"] for c in by_source.values()
        ),
        "by_source": {k: dict(v) for k, v in by_source.items()},
        "by_category": {k: dict(v) for k, v in sorted(by_category.items())},
        "samples": samples,
        "applied_updates": applied,
        "note": (
            "Dry-run by default. --apply rewrites property_listings.image_urls "
            "and primary_image_url using build_gallery identity rules. "
            "Sole valid covers are preserved."
        ),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
