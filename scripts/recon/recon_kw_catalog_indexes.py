"""Index-only Keller Williams catalog reconnaissance (no DB / no imports).

Fetches the five approved public category index pages sequentially with the
declared Crawl-Delay (20s). Does not fetch detail pages, does not write to
Supabase, does not upload evidence, and does not create lifecycle events.

Requires explicit --live-fetch. Wait for a separate approval before running.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.adapters.keller_williams_curacao import (  # noqa: E402
    ADAPTER_VERSION,
    APPROVED_CATEGORIES,
    DEFAULT_REQUEST_DELAY_SECONDS,
    KellerWilliamsCuracaoAdapter,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live-fetch",
        action="store_true",
        help="Required gate: allow live HTTPS GETs to kw-curacao.com index URLs only",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("data/raw/keller_williams_curacao/cache"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/processed/kw_catalog_index_recon.json"),
    )
    parser.add_argument(
        "--honor-delay",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Honor Crawl-Delay 20s between requests (default: true)",
    )
    parser.add_argument(
        "--use-cache",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Reuse disk cache (default: false for fresh recon)",
    )
    args = parser.parse_args()

    if not args.live_fetch:
        parser.error("--live-fetch is required; this script performs live index GETs")

    adapter = KellerWilliamsCuracaoAdapter(cache_dir=args.cache_dir)
    started = datetime.now(UTC)
    discovery = adapter.discover_catalog(
        cache_dir=args.cache_dir,
        honor_delay=args.honor_delay,
        use_cache=args.use_cache,
        max_pages_per_section=None,
        max_items=None,
    )
    completed = datetime.now(UTC)

    payload = {
        "mode": "index_only_recon",
        "source_key": "keller_williams_curacao",
        "adapter_version": ADAPTER_VERSION,
        "started_at": started.isoformat(),
        "completed_at": completed.isoformat(),
        "crawl_delay_seconds": DEFAULT_REQUEST_DELAY_SECONDS,
        "approved_category_urls": [url for _, _, url in APPROVED_CATEGORIES],
        "no_supabase_writes": True,
        "no_evidence_uploads": True,
        "no_lifecycle_events": True,
        "no_detail_fetches": True,
        "discovery_complete": discovery.discovery_complete,
        "truncated": discovery.truncated,
        "discovered_count": len(discovery.listings),
        "duplicate_external_ids": discovery.duplicate_external_ids,
        "duplicate_canonical_urls": discovery.duplicate_canonical_urls,
        "skipped_silent": discovery.skipped_silent,
        "skipped_off_domain": discovery.skipped_off_domain,
        "skipped_no_external_id": discovery.skipped_no_external_id,
        "unresolved_no_external_id_urls": discovery.unresolved_no_external_id_urls,
        "page_loops": discovery.page_loops,
        "unexpected_empty_pages": discovery.unexpected_empty_pages,
        "categories_seen": sorted(discovery.categories_seen),
        "catalog_checksum": discovery.catalog_checksum,
        "errors": discovery.errors,
        "warnings": discovery.warnings,
        "index_pages": discovery.index_pages,
        "listings": [
            {
                "external_id": item.external_id,
                "url": item.url,
                "listing_type": item.listing_type,
                "category_key": item.category_key,
                "index_url": item.index_url,
            }
            for item in discovery.listings
        ],
        "partial_conditions": [
            "any approved category missing or fetch-failed",
            "page loop or repeated checksum",
            "unexpected empty first page",
            "explicit next/page link present but traversal uncertain",
            "max_pages/max_items caps (not used in this recon)",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: payload[k] for k in (
        "mode",
        "adapter_version",
        "discovery_complete",
        "discovered_count",
        "duplicate_external_ids",
        "errors",
        "warnings",
        "catalog_checksum",
        "no_supabase_writes",
        "no_evidence_uploads",
        "no_lifecycle_events",
    )}, indent=2))
    print(f"wrote {args.output}")
    return 0 if not discovery.errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
