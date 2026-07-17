"""Manual Keller Williams Curaçao adapter runner.

Scheduling is intentionally disabled. Runs are dry-run by default and live
requests require --live-fetch; use no parallel detail requests (20s delay).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.normalization.ecb_rates import EcbEurRateProvider  # noqa: E402
from merkado_labs.scrapers.adapters.keller_williams_curacao import (  # noqa: E402
    KellerWilliamsCuracaoAdapter,
)
from merkado_labs.scrapers.import_pipeline import import_snapshots  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*", help="KW detail URLs to fetch sequentially")
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Discover from known first-page indexes only; pagination remains recon-only",
    )
    parser.add_argument(
        "--max-items", type=int, default=5, help="Bounded detail limit (default: 5)"
    )
    parser.add_argument(
        "--cache-dir", type=Path, default=Path("data/raw/keller_williams_curacao/cache")
    )
    parser.add_argument(
        "--live-fetch", action="store_true", help="Allow live HTTP requests after robots checks"
    )
    parser.add_argument(
        "--import-db", action="store_true", help="Write Labs rows; implies live fetch"
    )
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    args = parser.parse_args()

    if not args.urls and not args.discover:
        parser.error("Provide detail URLs or use --discover")
    if args.max_items < 1:
        parser.error("--max-items must be at least 1")
    if not args.live_fetch:
        parser.error(
            "--live-fetch is required for detail requests (dry-run does not mean network-free)"
        )

    dry_run = not args.import_db
    adapter = KellerWilliamsCuracaoAdapter(cache_dir=args.cache_dir)
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
            "source_key": record.source_key,
            "outcome": record.outcome,
            "parsed": record.parsed_count,
            "warnings": record.warning_count,
            "errors": record.error_count,
            "notes": record.notes,
            "dry_run": dry_run,
            "imported": imported.imported_count if imported else 0,
        },
        "listings": [
            {
                "external_id": snap.external_id,
                "url": snap.source_url,
                "title": snap.title,
                "price": str(snap.original_price.amount) if snap.original_price else None,
                "currency": snap.original_price.currency if snap.original_price else None,
                "warnings": list(snap.warnings),
            }
            for snap in snapshots
        ],
    }
    output = json.dumps(payload, indent=2, default=str)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    print(output)
    return 0 if record.outcome != "failure" else 1


if __name__ == "__main__":
    raise SystemExit(main())
