#!/usr/bin/env python3
"""Audit (and optionally clean) duplicate listing gallery URLs in Labs.

Default is read-only dry-run. Pass ``--apply`` to persist cleaned galleries.

Safety:
- Labs project ``csaefdkpwukshtouyixg`` only
- Never touches production ``jkrfyvukhhsapoivntms``
- Never removes a sole valid cover
- Preserves stable first-seen gallery order / primary via ``build_gallery``
- High-confidence URL/identity cleanup only (no binary / perceptual downloads)
- No scrape, OpenAI, or binary download
- Idempotent: re-running after apply yields zero changes
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.images import (  # noqa: E402
    _remax_cache_meta,
    build_gallery,
    canonicalize_image_url,
    image_identity_key,
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
    for env in (ROOT / ".env", ROOT / "apps" / "labs-dashboard" / ".env.local"):
        if not env.is_file():
            continue
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


def _classify_removed(original: list[str], cleaned: list[str]) -> Counter[str]:
    """Best-effort classification of removed gallery slots."""

    counts: Counter[str] = Counter()
    cleaned_set = set(cleaned)
    cleaned_identities = {image_identity_key(u) for u in cleaned}
    for url in original:
        if url in cleaned_set:
            continue
        identity = image_identity_key(url)
        canon = canonicalize_image_url(url)
        meta = _remax_cache_meta(canon)
        path = urlparse(canon).path
        if meta is not None and meta.empty_body:
            counts["remax_empty_body_aspect_variant"] += 1
        elif meta is not None:
            counts["remax_named_cache_size_variant"] += 1
        elif "/wp-content/uploads/" in path and identity in cleaned_identities:
            counts["wordpress_size_suffix"] += 1
        elif identity in cleaned_identities and canon not in cleaned_set:
            if "?" in url or "?" in next(
                (c for c in cleaned if image_identity_key(c) == identity), ""
            ):
                counts["resize_or_tracking_query_variant"] += 1
            else:
                counts["canonical_url_variant"] += 1
        elif identity in cleaned_identities:
            counts["exact_or_canonical_duplicate"] += 1
        else:
            counts["other_identity_collapse"] += 1
    return counts


def _uncertain_empty_body_multi_aspect(urls: list[str]) -> list[dict[str, Any]]:
    """Empty-body RE/MAX groups kept distinct due to aspect mismatch."""

    groups: dict[int, list[str]] = defaultdict(list)
    for url in urls:
        meta = _remax_cache_meta(canonicalize_image_url(url))
        if meta is None or not meta.empty_body:
            continue
        groups[meta.timestamp].append(url)
    uncertain: list[dict[str, Any]] = []
    for ts, group in groups.items():
        if len(group) < 2:
            continue
        aspects = sorted(
            {
                round(_remax_cache_meta(canonicalize_image_url(u)).aspect, 3)  # type: ignore[union-attr]
                for u in group
            }
        )
        if len(aspects) > 1:
            uncertain.append(
                {
                    "timestamp": ts,
                    "urls": group,
                    "aspects": aspects,
                    "reason": "empty_body_same_timestamp_distinct_aspects",
                }
            )
    return uncertain


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

    public_before = (
        client.table("property_listings")
        .select("id", count="exact")
        .in_("property_source_id", list(source_ids))
        .eq("public_eligible", True)
        .neq("status", "removed")
        .execute()
    )
    public_eligible_before = public_before.count or 0

    query = (
        client.table("property_listings")
        .select(
            "id,property_source_id,listing_type,property_type,"
            "primary_image_url,image_urls,status,public_eligible"
        )
        .in_("property_source_id", list(source_ids))
        .neq("status", "removed")
    )
    if args.limit and args.limit > 0:
        query = query.limit(args.limit)
    listings = query.execute().data or []

    by_source: dict[str, Counter[str]] = {key: Counter() for key in source_filter}
    by_category: dict[str, Counter[str]] = defaultdict(Counter)
    classification: Counter[str] = Counter()
    samples: list[dict[str, Any]] = []
    uncertain_cases: list[dict[str, Any]] = []
    updates: list[dict[str, Any]] = []
    retained = 0
    removed = 0

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
        slots_removed = max(0, before_count - after_count)
        changed = cleaned_urls != original or cleaned_primary != primary

        class_counts = _classify_removed(original, cleaned_urls) if slots_removed else Counter()
        classification.update(class_counts)

        for item in _uncertain_empty_body_multi_aspect(cleaned_urls):
            uncertain_cases.append(
                {
                    "id": row["id"],
                    "source_key": source,
                    **item,
                }
            )

        stats = by_source[source]
        stats["listings"] += 1
        stats["images_before"] += before_count
        stats["images_after"] += after_count
        stats["duplicate_slots_removed"] += slots_removed
        stats["listings_with_dupes"] += int(slots_removed > 0)
        stats["listings_changed"] += int(changed)
        retained += after_count
        removed += slots_removed

        cat = by_category[category]
        cat["listings"] += 1
        cat["images_before"] += before_count
        cat["images_after"] += after_count
        cat["duplicate_slots_removed"] += slots_removed

        if slots_removed > 0 and len(samples) < 25:
            samples.append(
                {
                    "id": row["id"],
                    "source_key": source,
                    "category": category,
                    "before": before_count,
                    "after": after_count,
                    "primary_before": primary,
                    "primary_after": cleaned_primary,
                    "classification": dict(class_counts),
                    "urls_before_head": original[:4],
                    "urls_after_head": cleaned_urls[:4],
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
        for item in updates:
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

    public_after = (
        client.table("property_listings")
        .select("id", count="exact")
        .in_("property_source_id", list(source_ids))
        .eq("public_eligible", True)
        .neq("status", "removed")
        .execute()
    )
    public_eligible_after = public_after.count or 0

    report = {
        "project_ref": LABS,
        "mode": "apply" if args.apply else "dry_run",
        "openai_calls": 0,
        "terra_calls": 0,
        "ai_cost_usd": 0.0,
        "sources": list(source_filter),
        "listings_scanned": len(listings),
        "listings_affected": sum(c["listings_with_dupes"] for c in by_source.values()),
        "listings_changed": sum(c["listings_changed"] for c in by_source.values()),
        "duplicate_slots_removed_total": sum(
            c["duplicate_slots_removed"] for c in by_source.values()
        ),
        "rows_retained_total": retained,
        "rows_removed_total": removed,
        "classification": dict(classification),
        "by_source": {k: dict(v) for k, v in by_source.items()},
        "by_category": {k: dict(v) for k, v in sorted(by_category.items())},
        "samples": samples,
        "uncertain_cases": uncertain_cases[:50],
        "uncertain_case_count": len(uncertain_cases),
        "public_eligible_before": public_eligible_before,
        "public_eligible_after": public_eligible_after,
        "public_eligible_unchanged": public_eligible_before == public_eligible_after,
        "applied_updates": applied,
        "note": (
            "Dry-run by default. --apply rewrites property_listings.image_urls "
            "and primary_image_url using build_gallery identity rules. "
            "Sole valid covers are preserved. Uncertain empty-body multi-aspect "
            "RE/MAX groups are left unchanged."
        ),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
