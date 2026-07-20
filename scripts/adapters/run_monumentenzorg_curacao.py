"""Manual Monumentenzorg Curaçao adapter runner (dry-run / non-writing by default).

Modes:
  --fixture-complete   Offline complete catalog from committed fixtures
  --discover-complete  Live full catalog dry-run (requires --live-fetch)
  --discover           Bounded discovery (requires --max-items)
  --preview-import     Database-free import preview from a local catalog JSON
  --dry-run            Explicit dry-run (default)

Never writes to Supabase. Never schedules. Never calls AI.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.normalization.eligibility import evaluate_public_eligibility  # noqa: E402
from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (  # noqa: E402
    ADAPTER_VERSION,
    BASE_URL,
    PROPERTIES_INDEX_URL,
    SOURCE_KEY,
    MonumentenzorgCuracaoAdapter,
    snapshots_to_catalog_artifact,
)
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    dump_json,
    run_monumentenzorg_import_preview,
)


def _quality_metrics(snapshots: list[Any]) -> dict[str, Any]:
    listing_types = Counter(s.listing_type for s in snapshots)
    statuses = Counter(s.source_status for s in snapshots)
    eligible = 0
    for snap in snapshots:
        status = snap.lifecycle_hint.value if snap.lifecycle_hint else "unknown"
        ok, _ = evaluate_public_eligibility(
            status=status,
            original_price=snap.original_price.amount if snap.original_price else None,
            source_enabled=True,
            source_url=snap.source_url,
            has_critical_parser_error=bool(snap.parser_errors),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        if ok and snap.has_positive_price:
            eligible += 1
    return {
        "listing_type": dict(listing_types),
        "source_status": dict(statuses),
        "public_eligible_projected": eligible,
        "priced": sum(1 for s in snapshots if s.has_positive_price),
        "no_price": sum(1 for s in snapshots if not s.has_positive_price),
        "coordinates": sum(
            1 for s in snapshots if s.latitude is not None and s.longitude is not None
        ),
        "sold_under_reservation": sum(
            1 for s in snapshots if s.source_status == "sold_under_reservation"
        ),
    }


def _run_fixture_complete(cache_dir: Path, output: Path) -> dict[str, Any]:
    sys.path.insert(0, str(ROOT))
    from tests.fixtures.monumentenzorg_html import (  # noqa: WPS433
        DETAIL_HTML_BY_URL,
        INDEX_HTML,
        SITEMAP_XML,
    )

    adapter = MonumentenzorgCuracaoAdapter(cache_dir=cache_dir)
    record, snapshots, discovery = adapter.run_catalog(
        cache_dir=cache_dir,
        dry_run=True,
        honor_delay=False,
        use_cache=True,
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_XML,
        fixture_html_by_url=DETAIL_HTML_BY_URL,
        mode="complete",
    )
    artifact = snapshots_to_catalog_artifact(snapshots, run=record, discovery=discovery)
    dump_json(output, artifact)
    return {
        "mode": "fixture_complete",
        "outcome": record.outcome.value,
        "complete_catalog": record.metadata.get("complete_catalog"),
        "is_complete_success": record.is_complete_success,
        "discovered": record.discovered_count,
        "parsed": record.parsed_count,
        "excluded_no_price": record.excluded_no_price_count,
        "quality": _quality_metrics(snapshots),
        "discovery": discovery.as_dict(),
        "output": str(output).replace("\\", "/"),
        "adapter_version": ADAPTER_VERSION,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture-complete", action="store_true")
    parser.add_argument("--discover-complete", action="store_true")
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--max-items", type=int, default=None)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("data/raw/monumentenzorg_curacao/cache"),
    )
    parser.add_argument("--live-fetch", action="store_true")
    parser.add_argument("--preview-import", action="store_true")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/processed/monumentenzorg_complete_catalog.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/processed/monumentenzorg_complete_catalog.json"),
    )
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=Path("data/processed/monumentenzorg_run_summary.json"),
    )
    args = parser.parse_args()

    if args.preview_import:
        preview = run_monumentenzorg_import_preview(args.input)
        dump_json(args.summary_output, preview)
        print(json.dumps(preview, indent=2))
        return 0

    if args.fixture_complete:
        summary = _run_fixture_complete(args.cache_dir, args.output)
        dump_json(args.summary_output, summary)
        print(json.dumps(summary, indent=2))
        return 0 if summary.get("complete_catalog") else 2

    if args.discover or args.discover_complete:
        if not args.live_fetch:
            print("Live modes require --live-fetch", file=sys.stderr)
            return 2
        if args.discover_complete and args.max_items is not None:
            print("complete catalog rejects --max-items", file=sys.stderr)
            return 2
        adapter = MonumentenzorgCuracaoAdapter(cache_dir=args.cache_dir)
        if args.discover_complete:
            record, snapshots, discovery = adapter.run_catalog(
                cache_dir=args.cache_dir,
                dry_run=True,
                honor_delay=True,
                use_cache=True,
                mode="complete",
            )
        else:
            record, snapshots = adapter.run_bounded(
                listing_urls=[],
                cache_dir=args.cache_dir,
                dry_run=True,
                max_items=args.max_items or 5,
                honor_delay=True,
                use_cache=True,
            )
            discovery = None
        artifact = snapshots_to_catalog_artifact(snapshots, run=record, discovery=discovery)
        dump_json(args.output, artifact)
        summary = {
            "mode": "live_complete" if args.discover_complete else "live_bounded",
            "generated_at": datetime.now(UTC).isoformat(),
            "base_url": BASE_URL,
            "index": PROPERTIES_INDEX_URL,
            "source_key": SOURCE_KEY,
            "adapter_version": ADAPTER_VERSION,
            "outcome": record.outcome.value,
            "complete_catalog": record.metadata.get("complete_catalog"),
            "is_complete_success": record.is_complete_success,
            "discovered": record.discovered_count,
            "parsed": record.parsed_count,
            "excluded_no_price": record.excluded_no_price_count,
            "quality": _quality_metrics(snapshots),
            "request_metrics": record.metadata.get("request_metrics"),
            "discovery": discovery.as_dict() if discovery else None,
            "output": str(args.output).replace("\\", "/"),
        }
        dump_json(args.summary_output, summary)
        print(json.dumps(summary, indent=2))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
