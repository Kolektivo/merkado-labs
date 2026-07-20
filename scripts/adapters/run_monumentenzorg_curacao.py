"""Manual Monumentenzorg Curaçao adapter runner.

Modes:
  --fixture-complete   Offline complete catalog from committed fixtures
  --discover-complete  Live full catalog dry-run (requires --live-fetch)
  --discover           Bounded discovery (requires --max-items)
  --preview-import     Local DB-free import preview from a catalog JSON
  --preview-labs-import  Read-only Labs reconcile preview (no writes)
  --import-from-file --import-db  Controlled offline Labs import
  --dry-run            Explicit dry-run (default for discovery)

Never schedules. Never calls AI. Never live-fetches during import-from-file.
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
    import_monumentenzorg_catalog_from_file,
    run_monumentenzorg_import_preview,
    run_monumentenzorg_labs_import_preview,
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
    parser.add_argument("--preview-labs-import", action="store_true")
    parser.add_argument("--import-from-file", action="store_true")
    parser.add_argument("--import-db", action="store_true")
    parser.add_argument(
        "--skip-evidence-upload",
        action="store_true",
        help="Skip private listing-raw-evidence upload during --import-from-file",
    )
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

    if args.import_db and not args.import_from_file:
        parser.error(
            "--import-db requires --import-from-file for the approved offline import"
        )

    if args.preview_labs_import:
        if args.live_fetch or args.import_from_file or args.import_db:
            parser.error("--preview-labs-import cannot combine with live/import modes")
        result = run_monumentenzorg_labs_import_preview(input_path=args.input)
        payload = result.as_dict()
        out = args.summary_output
        if args.output and args.output != Path(
            "data/processed/monumentenzorg_complete_catalog.json"
        ):
            out = args.output
        dump_json(out, payload)
        print(json.dumps(payload, indent=2, default=str))
        print(
            "READ-ONLY LABS IMPORT PREVIEW complete: "
            f"insert={result.inserts} update={result.updates} "
            f"no_change={result.no_change} absent={result.absent_from_catalog} "
            f"failed={result.failed}"
        )
        return 1 if result.failed else 0

    if args.preview_import:
        if args.live_fetch or args.import_from_file or args.import_db:
            parser.error("--preview-import cannot combine with live/import modes")
        preview = run_monumentenzorg_import_preview(args.input)
        dump_json(args.summary_output, preview)
        print(json.dumps(preview, indent=2))
        return 0

    if args.import_from_file:
        if not args.import_db:
            parser.error("--import-from-file requires --import-db")
        if args.live_fetch or args.discover or args.discover_complete:
            parser.error("file modes cannot combine with live discovery flags")
        print("OFFLINE IMPORT FROM VERIFIED MONUMENTENZORG ARTIFACT")
        payload = import_monumentenzorg_catalog_from_file(
            input_path=args.input,
            cache_dir=args.cache_dir,
            upload_evidence=not args.skip_evidence_upload,
        )
        out = args.output
        if out == Path("data/processed/monumentenzorg_complete_catalog.json"):
            out = Path("data/processed/monumentenzorg_import_result.json")
        dump_json(out, payload)
        print(json.dumps(payload, indent=2, default=str))
        imported = payload.get("import") or {}
        print(
            "OFFLINE IMPORT complete: "
            f"imported={imported.get('imported_count')} "
            f"updated={imported.get('updated_count')} "
            f"observations={imported.get('observation_count')} "
            f"events={imported.get('event_count')} "
            f"evidence_ok={payload.get('evidence_upload_succeeded')}"
        )
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
