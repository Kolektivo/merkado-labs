"""Manual Moret Real Estate adapter runner (dry-run default)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.normalization.ecb_rates import EcbEurRateProvider  # noqa: E402
from merkado_labs.scrapers.adapters.moret_real_estate import (  # noqa: E402
    MoretRealEstateAdapter,
)
from merkado_labs.scrapers.import_pipeline import import_snapshots  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--max-items", type=int, default=5)
    parser.add_argument("--cache-dir", type=Path, default=Path("data/raw/moret_real_estate/cache"))
    parser.add_argument("--live-fetch", action="store_true")
    parser.add_argument("--import-db", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not args.urls and not args.discover:
        parser.error("Provide URLs or --discover")
    if not args.live_fetch:
        parser.error("--live-fetch required for network runs")

    dry_run = not args.import_db
    adapter = MoretRealEstateAdapter()
    record, snapshots = adapter.run_bounded(
        listing_urls=args.urls,
        cache_dir=args.cache_dir,
        dry_run=dry_run,
        max_items=args.max_items,
        honor_delay=True,
        discover=args.discover,
    )
    imported = None
    if args.import_db:
        imported = import_snapshots(
            source_key=record.source_key,
            run=record,
            snapshots=snapshots,
            dry_run=False,
            eur_provider=EcbEurRateProvider(),
            apply_geospatial=True,
        )
    payload = {
        "run": {
            "outcome": record.outcome,
            "parsed": record.parsed_count,
            "errors": record.error_count,
            "imported": imported.imported_count if imported else 0,
            "updated": imported.updated_count if imported else 0,
        },
        "listings": [
            {
                "external_id": s.external_id,
                "title": s.title,
                "price": str(s.original_price.amount) if s.original_price else None,
                "currency": s.original_price.currency if s.original_price else None,
                "warnings": list(s.warnings),
                "url": s.source_url,
            }
            for s in snapshots
        ],
    }
    text = json.dumps(payload, indent=2, default=str)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(text)
    return 0 if record.outcome != "failure" else 1


if __name__ == "__main__":
    raise SystemExit(main())
