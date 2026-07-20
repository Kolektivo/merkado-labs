"""Audit stored listing image galleries in Labs (read-only, no OpenAI, no scrape).

Image galleries are already persisted on property_listings.image_urls for Ready
sources. This script reports coverage and contamination heuristics without
changing lifecycle or calling paid APIs.
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.images import build_gallery  # noqa: E402
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
        gallery = build_gallery(urls, primary_url=row.get("primary_image_url"))
        n = len(gallery.urls)
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
        by_source[source]["images"] += n
        by_source[source]["duplicates_removed"] += gallery.duplicates_removed
        by_source[source]["invalid_removed"] += gallery.invalid_removed
        by_source[source]["contamination_removed"] += gallery.contamination_removed
        by_source[source]["truncated"] += int(gallery.truncated)
        totals["listings"] += 1
        totals["images"] += n

    report = {
        "project_ref": LABS,
        "openai_calls": 0,
        "terra_calls": 0,
        "ai_cost_usd": 0.0,
        "totals": dict(totals),
        "by_source": {k: dict(v) for k, v in by_source.items()},
        "note": (
            "Galleries are already stored on property_listings.image_urls. "
            "UI previously rendered only primary_image_url."
        ),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
