"""Audit stored listing image galleries in Labs (read-only, no OpenAI, no scrape).

Image galleries are already persisted on property_listings.image_urls for Ready
sources. This script reports coverage, exact/identity duplicates, and RE/MAX
near-dupe heuristics without changing lifecycle or calling paid APIs.
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.images import (  # noqa: E402
    build_gallery,
    canonicalize_image_url,
    image_identity_key,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"
READY = (
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)


def _load_env() -> None:
    env = ROOT / "apps" / "labs-dashboard" / ".env.local"
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
    os.environ["SUPABASE_PROJECT_REF"] = LABS


def _raw_near_dupe_slots(urls: list[str]) -> int:
    """Count how many raw slots collapse under identity (before build_gallery)."""

    if len(urls) < 2:
        return 0
    seen: set[str] = set()
    dupes = 0
    for raw in urls:
        if not isinstance(raw, str) or not raw.strip():
            continue
        key = image_identity_key(canonicalize_image_url(raw))
        if key in seen:
            dupes += 1
        else:
            seen.add(key)
    return dupes


def _remax_size_pair_hint(urls: list[str]) -> int:
    """Heuristic: distinct WxH paths that share RE/MAX identity body+ts."""

    pairs = 0
    by_key: dict[str, set[str]] = {}
    for raw in urls:
        if not isinstance(raw, str):
            continue
        low = raw.casefold()
        if "remax-abc.com" not in low or "/img/cache/" not in low:
            continue
        canon = canonicalize_image_url(raw)
        key = image_identity_key(canon)
        path = urlparse(canon).path
        by_key.setdefault(key, set()).add(path)
    for paths in by_key.values():
        if len(paths) > 1:
            pairs += len(paths) - 1
    return pairs


def main() -> int:
    _load_env()
    if os.environ.get("SUPABASE_PROJECT_REF") != LABS:
        raise SystemExit("Refusing non-Labs project")
    if "jkrfyvukhhsapoivntms" in json.dumps(dict(os.environ)):
        raise SystemExit("Production reference present in environment")

    client = create_labs_client()
    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(READY))
        .execute()
        .data
        or []
    )
    source_ids = {row["id"]: row["source_key"] for row in sources}
    listings = (
        client.table("property_listings")
        .select("id,property_source_id,primary_image_url,image_urls,status")
        .in_("property_source_id", list(source_ids))
        .neq("status", "removed")
        .execute()
        .data
        or []
    )

    by_source: dict[str, Counter[str]] = {key: Counter() for key in READY}
    totals = Counter()
    for row in listings:
        source = source_ids[row["property_source_id"]]
        urls = row.get("image_urls") or []
        if not isinstance(urls, list):
            urls = []
        raw_count = len([u for u in urls if isinstance(u, str) and u.strip()])
        gallery = build_gallery(urls, primary_url=row.get("primary_image_url"))
        n = len(gallery.urls)
        identity_dupes = _raw_near_dupe_slots(
            [u for u in urls if isinstance(u, str)]
        )
        remax_pairs = _remax_size_pair_hint(
            [u for u in urls if isinstance(u, str)]
        )
        bucket = (
            "0"
            if n == 0
            else "1"
            if n == 1
            else "2_5"
            if n <= 5
            else "6_10"
            if n <= 10
            else "gt_10"
        )
        by_source[source][bucket] += 1
        by_source[source]["listings"] += 1
        by_source[source]["images_raw"] += raw_count
        by_source[source]["images"] += n
        by_source[source]["duplicates_removed"] += gallery.duplicates_removed
        by_source[source]["identity_duplicate_slots"] += identity_dupes
        by_source[source]["remax_size_pair_slots"] += remax_pairs
        by_source[source]["invalid_removed"] += gallery.invalid_removed
        by_source[source]["contamination_removed"] += gallery.contamination_removed
        by_source[source]["truncated"] += int(gallery.truncated)
        totals["listings"] += 1
        totals["images_raw"] += raw_count
        totals["images"] += n
        totals["identity_duplicate_slots"] += identity_dupes
        totals["remax_size_pair_slots"] += remax_pairs

    report = {
        "project_ref": LABS,
        "openai_calls": 0,
        "terra_calls": 0,
        "ai_cost_usd": 0.0,
        "totals": dict(totals),
        "by_source": {k: dict(v) for k, v in by_source.items()},
        "note": (
            "Galleries are stored on property_listings.image_urls. "
            "identity_duplicate_slots / remax_size_pair_slots estimate near-dupes "
            "before cleanup; use scripts/audit_dedupe_listing_images.py for dry-run."
        ),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
