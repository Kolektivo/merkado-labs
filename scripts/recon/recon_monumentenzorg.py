"""Monumentenzorg Curaçao public-catalog reconnaissance utility.

Kept separate from the production adapter runner. Prefer the adapter for
fixture/live dry-runs; use this script only for ad-hoc domain/robots/sitemap
probes. Preserves certifi TLS, ≥2s delay, and local cache conventions.

Does not import to Labs, call AI, or disable TLS verification.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (  # noqa: E402
    ADAPTER_VERSION,
    BASE_URL,
    ESTATE_PROPERTY_SITEMAP_URL,
    PROPERTIES_INDEX_URL,
    SOURCE_KEY,
    MonumentenzorgCuracaoAdapter,
)
from merkado_labs.scrapers.http_cache import fetch_url  # noqa: E402
from merkado_labs.scrapers.robots import USER_AGENT  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("data/raw/monumentenzorg_curacao/cache"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/processed/monumentenzorg_recon_probe.json"),
    )
    parser.add_argument("--live-fetch", action="store_true")
    args = parser.parse_args()
    if not args.live_fetch:
        print("Pass --live-fetch to probe the public site.", file=sys.stderr)
        return 2

    adapter = MonumentenzorgCuracaoAdapter(cache_dir=args.cache_dir)
    robots = adapter.evaluate_robots(PROPERTIES_INDEX_URL, honor_delay=True)
    robots_body = fetch_url(
        f"{BASE_URL}/robots.txt",
        cache_dir=args.cache_dir,
        user_agent=USER_AGENT,
        use_cache=True,
        use_certifi=True,
    ).body.decode("utf-8", "replace")
    discovery = adapter.discover_catalog(
        cache_dir=args.cache_dir,
        mode="complete",
        honor_delay=True,
        use_cache=True,
    )
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "adapter_version": ADAPTER_VERSION,
        "base_url": BASE_URL,
        "index": PROPERTIES_INDEX_URL,
        "sitemap": ESTATE_PROPERTY_SITEMAP_URL,
        "robots": {
            "can_fetch": robots.can_fetch,
            "crawl_delay_seconds": robots.crawl_delay_seconds,
            "fetch_status": robots.fetch_status,
            "preview": robots_body[:500],
        },
        "discovery": discovery.as_dict(),
        "tls": "certifi",
        "heritage_excluded": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"wrote": str(args.output), "union": discovery.union_count}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
