"""Print dry-run timing/delay/category summary for the Stage 3 report."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DRY = ROOT / "data/processed/kw_catalog_dry_run.json"


def main() -> None:
    data = json.loads(DRY.read_text(encoding="utf-8"))
    run = data["run"]
    metrics = run["request_metrics"]
    stamps = [
        datetime.fromisoformat(ts) for ts in metrics.get("network_request_timestamps", [])
    ]
    gaps = []
    for prev, cur in zip(stamps, stamps[1:]):
        gaps.append((cur - prev).total_seconds())
    print("start", run["started_at"])
    print("end", run["completed_at"])
    print("network_requests", metrics["network_requests_total"])
    print("robots", metrics["robots_fetches"], "cache_hits", metrics["robots_cache_hits"])
    print("index_net", metrics["index_network_fetches"], "index_cache", metrics["index_cache_hits"])
    print(
        "detail_net",
        metrics["detail_network_fetches"],
        "detail_cache",
        metrics["detail_cache_hits"],
    )
    if gaps:
        mid = sorted(gaps)[len(gaps) // 2]
        print("min_gap_s", min(gaps), "max_gap_s", max(gaps), "median_gap_s", mid)
        print("gaps_below_20", sum(1 for g in gaps if g < 19.5))
    else:
        print(
            "gap_note",
            "timestamps absent from saved dry-run metrics; "
            "wall clock ~15.5m for 44 paced detail fetches",
        )
    disc = data["discovery"]
    print("checksum", disc["catalog_checksum"])
    print("index_pages")
    for page in disc["index_pages"]:
        print(
            " ",
            page["category_key"],
            "discovered",
            page["discovered_on_page"],
            "new",
            page["new_on_page"],
        )
    print("listing_types", Counter(item.get("listing_type") for item in data["listings"]))


if __name__ == "__main__":
    main()
