"""Controlled PoC: robots audit for a small set of original realtor domains.

Does not crawl listing pages. Does not bypass auth or bot protection.
Writes local evidence only under this package's evidence/ folder.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from base import PolicyBlockedAdapter, select_adapter  # noqa: E402
from robots import check_robots  # noqa: E402


def all_adapters():
    return [PolicyBlockedAdapter()]


EVIDENCE_DIR = BASE_DIR / "evidence"
SNAPSHOTS_DIR = BASE_DIR.parent / "snapshots"
DEFAULT_SAMPLE_SIZE = 8


def latest_snapshot_source() -> Path:
    candidates = sorted(
        path
        for path in SNAPSHOTS_DIR.glob("*/source.json")
        if (path.parent / "metadata.json").is_file()
    )
    if not candidates:
        raise FileNotFoundError("No local CHH snapshot source.json found")
    return candidates[-1]


def sample_listing_urls(raw_records: list[dict], limit: int) -> list[dict]:
    """Pick one URL per domain, capped for a controlled audit."""

    chosen: list[dict] = []
    seen_domains: set[str] = set()
    for record in raw_records:
        url = record.get("url_page")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        domain = (urlparse(url).hostname or "").lower()
        if not domain or domain in seen_domains:
            continue
        seen_domains.add(domain)
        chosen.append(
            {
                "urlid": record.get("urlid"),
                "realtor_name": record.get("realtor_name"),
                "url_page": url,
                "domain": domain,
            }
        )
        if len(chosen) >= limit:
            break
    return chosen


def run_poc(*, sample_size: int = DEFAULT_SAMPLE_SIZE) -> dict:
    """Audit robots policy for a small domain sample; no listing-body fetch."""

    source_path = latest_snapshot_source()
    raw = json.loads(source_path.read_text(encoding="utf-8"))
    samples = sample_listing_urls(raw, sample_size)
    adapters = all_adapters()
    results = []
    for sample in samples:
        robots = check_robots(sample["url_page"])
        adapter = select_adapter(sample["url_page"], adapters)
        # PoC stops at robots + adapter selection; no page body download.
        results.append(
            {
                **sample,
                "adapter": adapter.name,
                "robots": {
                    "robots_url": robots.robots_url,
                    "fetch_status": robots.fetch_status,
                    "can_fetch": robots.can_fetch,
                    "crawl_delay_seconds": robots.crawl_delay_seconds,
                    "notes": robots.notes,
                },
                "enrichment_status": (
                    "eligible_for_future_adapter"
                    if robots.can_fetch is True and adapter.name == "policy_review_required"
                    else "blocked_or_review_required"
                    if robots.can_fetch is not True
                    else "adapter_ready"
                ),
            }
        )

    summary = {
        "observed_at": datetime.now(UTC).isoformat(),
        "snapshot": source_path.parent.name,
        "sample_size": len(results),
        "status_counts": dict(Counter(row["enrichment_status"] for row in results)),
        "robots_can_fetch_true": sum(1 for row in results if row["robots"]["can_fetch"] is True),
        "robots_can_fetch_false": sum(
            1 for row in results if row["robots"]["can_fetch"] is False
        ),
        "robots_inconclusive": sum(
            1 for row in results if row["robots"]["can_fetch"] is None
        ),
        "results": results,
        "limitations": [
            "No original listing HTML was downloaded in this PoC.",
            "Missing robots.txt is treated as inconclusive, not permission.",
            "No domain-specific factual extractor is registered yet.",
            "CaribbeanHouseHunt remains the aggregator source; realtors are originals.",
        ],
    }
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    out = EVIDENCE_DIR / f"robots-poc-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.json"
    out.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary["evidence_path"] = str(out.relative_to(BASE_DIR.parent))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sample-size",
        type=int,
        default=DEFAULT_SAMPLE_SIZE,
        help="Max distinct realtor domains to audit (default 8).",
    )
    args = parser.parse_args()
    if args.sample_size < 1 or args.sample_size > 20:
        raise SystemExit("sample-size must be between 1 and 20 for this controlled PoC")
    summary = run_poc(sample_size=args.sample_size)
    print(json.dumps({k: summary[k] for k in summary if k != "results"}, indent=2))
    print(f"Wrote {summary['evidence_path']}")


if __name__ == "__main__":
    main()
