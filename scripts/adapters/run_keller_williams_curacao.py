"""Manual Keller Williams Curaçao adapter runner.

Scheduling is intentionally disabled. Runs are dry-run by default and live
requests require --live-fetch; use no parallel detail requests (20s delay).

``run_bounded`` remains permanently partial. ``--discover-catalog`` prepares
the separate full-catalog path and still requires --live-fetch for network I/O.

``--preview-import`` reconciles a local complete catalog against Labs with
read-only SELECTs only (no website requests, writes, uploads, or events).
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
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    import_kw_catalog_from_file,
    run_kw_import_preview,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*", help="KW detail URLs to fetch sequentially")
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Bounded first-page discovery helper; always partial",
    )
    parser.add_argument(
        "--discover-catalog",
        action="store_true",
        help="Traverse approved category indexes (and details unless --index-only)",
    )
    parser.add_argument(
        "--index-only",
        action="store_true",
        help="With --discover-catalog: stop after index discovery (no detail GETs)",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=None,
        help="Optional item cap (forces partial / bounded)",
    )
    parser.add_argument(
        "--max-pages-per-section",
        type=int,
        default=None,
        help="Optional per-section page cap (forces partial)",
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
    parser.add_argument(
        "--import-from-file",
        action="store_true",
        help=(
            "Import verified Stage-3 catalog JSON using local cache HTML only. "
            "No live website requests. Requires --import-db."
        ),
    )
    parser.add_argument(
        "--preview-import",
        action="store_true",
        help=(
            "Read-only import reconciliation against Labs from a local catalog JSON. "
            "No website requests, DB writes, storage uploads, or events."
        ),
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/processed/kw_catalog_dry_run.json"),
        help="Local catalog JSON for --preview-import / --import-from-file",
    )
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    args = parser.parse_args()

    if args.preview_import:
        if (
            args.import_db
            or args.live_fetch
            or args.discover_catalog
            or args.discover
            or args.import_from_file
        ):
            parser.error(
                "--preview-import cannot be combined with import/live/discover modes"
            )
        print("READ-ONLY IMPORT PREVIEW")
        result = run_kw_import_preview(input_path=args.input, write_reports=True)
        payload = result.as_dict()
        output = json.dumps(payload, indent=2, default=str)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output, encoding="utf-8")
        print(output)
        print(
            "READ-ONLY IMPORT PREVIEW complete: "
            f"insert={result.inserts} update={result.updates} "
            f"no_change={result.no_change} absent={result.absent_from_catalog} "
            f"failed={result.failed}"
        )
        return 1 if result.failed else 0

    if args.import_from_file:
        if not args.import_db:
            parser.error("--import-from-file requires --import-db")
        if args.live_fetch or args.discover_catalog or args.discover or args.urls:
            parser.error(
                "--import-from-file cannot be combined with live/discover/URL modes"
            )
        print("OFFLINE IMPORT FROM VERIFIED ARTIFACT")
        payload = import_kw_catalog_from_file(
            input_path=args.input,
            cache_dir=args.cache_dir,
        )
        output = json.dumps(payload, indent=2, default=str)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output, encoding="utf-8")
        print(output)
        imported = payload.get("import") or {}
        print(
            "OFFLINE IMPORT complete: "
            f"imported={imported.get('imported_count')} "
            f"updated={imported.get('updated_count')} "
            f"observations={imported.get('observation_count')} "
            f"events={imported.get('event_count')}"
        )
        return 0

    if args.import_db and args.index_only:
        parser.error("--import-db cannot be combined with --index-only")
    if args.discover_catalog:
        if not args.live_fetch and not args.import_db:
            parser.error("--live-fetch is required for catalog discovery network I/O")
    elif not args.urls and not args.discover:
        parser.error(
            "Provide detail URLs, --discover, --discover-catalog, "
            "--preview-import, or --import-from-file"
        )
    elif not args.live_fetch and not args.import_db:
        parser.error(
            "--live-fetch is required for detail requests (dry-run does not mean network-free)"
        )

    if args.max_items is not None and args.max_items < 1:
        parser.error("--max-items must be at least 1 when provided")

    dry_run = not args.import_db
    adapter = KellerWilliamsCuracaoAdapter(cache_dir=args.cache_dir)

    if args.discover_catalog:
        if args.index_only:
            discovery = adapter.discover_catalog(
                cache_dir=args.cache_dir,
                honor_delay=True,
                use_cache=True,
                max_pages_per_section=args.max_pages_per_section,
                max_items=args.max_items,
            )
            payload = {
                "mode": "discover_catalog_index_only",
                "discovery_complete": discovery.discovery_complete,
                "discovered": len(discovery.listings),
                "duplicates": discovery.duplicate_external_ids,
                "errors": discovery.errors,
                "warnings": discovery.warnings,
                "catalog_checksum": discovery.catalog_checksum,
                "index_pages": discovery.index_pages,
                "no_supabase_writes": True,
                "no_evidence_uploads": True,
                "no_lifecycle_events": True,
            }
            output = json.dumps(payload, indent=2, default=str)
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(output, encoding="utf-8")
            print(output)
            return 0 if not discovery.errors else 1

        record, snapshots, discovery = adapter.run_catalog(
            cache_dir=args.cache_dir,
            dry_run=dry_run,
            honor_delay=True,
            use_cache=True,
            max_pages_per_section=args.max_pages_per_section,
            max_items=args.max_items,
        )
    else:
        max_items = args.max_items if args.max_items is not None else 5
        record, snapshots = adapter.run_bounded(
            listing_urls=args.urls,
            cache_dir=args.cache_dir,
            dry_run=dry_run,
            max_items=max_items,
            honor_delay=True,
            discover=args.discover,
        )
        discovery = None

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
            "adapter_version": record.adapter_version,
            "outcome": record.outcome,
            "complete_catalog": record.metadata.get("complete_catalog"),
            "discovered": record.discovered_count,
            "parsed": record.parsed_count,
            "no_price": record.excluded_no_price_count,
            "warnings": record.warning_count,
            "errors": record.error_count,
            "duplicates": record.metadata.get("duplicate_external_ids"),
            "unresolved_external_ids": len(
                discovery.unresolved_no_external_id_urls if discovery is not None else []
            ),
            "started_at": record.started_at.isoformat() if record.started_at else None,
            "completed_at": (
                record.completed_at.isoformat() if record.completed_at else None
            ),
            "notes": record.notes,
            "dry_run": dry_run,
            "imported": imported.imported_count if imported else 0,
            "manual_unscheduled": True,
            "no_supabase_writes": dry_run,
            "no_evidence_uploads": dry_run,
            "no_lifecycle_events": True,
            "request_metrics": record.metadata.get("request_metrics")
            or adapter.request_metrics.as_dict(),
        },
        "listings": [
            {
                "external_id": snap.external_id,
                "url": snap.source_url,
                "title": snap.title,
                "listing_type": snap.listing_type,
                "source_status": snap.source_status,
                "lifecycle_hint": (
                    snap.lifecycle_hint.value if snap.lifecycle_hint else None
                ),
                "price": str(snap.original_price.amount) if snap.original_price else None,
                "currency": snap.original_price.currency if snap.original_price else None,
                "location_text": snap.location_text,
                "neighbourhood_text": snap.neighbourhood_text,
                "bedrooms": snap.bedrooms,
                "bathrooms": snap.bathrooms,
                "floor_area_m2": str(snap.floor_area_m2) if snap.floor_area_m2 else None,
                "lot_area_value": (
                    str(snap.lot_area_value) if snap.lot_area_value else None
                ),
                "lot_area_unit": snap.lot_area_unit,
                "property_type": snap.property_type,
                "latitude": snap.latitude,
                "longitude": snap.longitude,
                "image_count": len(snap.image_urls),
                "has_description": bool(snap.description),
                "raw_sha256": snap.raw_sha256,
                "warnings": list(snap.warnings),
                "structured_evidence": snap.structured_evidence,
                "fields": [
                    {
                        "field_name": field.field_name,
                        "raw_value": field.raw_value,
                        "normalized_value": field.normalized_value,
                        "extraction_method": field.extraction_method,
                        "evidence_selector": field.evidence_selector,
                        "inferred": field.inferred,
                        "confidence": field.confidence,
                        "inference_reason": field.inference_reason,
                    }
                    for field in snap.fields
                ],
            }
            for snap in snapshots
        ],
    }
    if discovery is not None:
        payload["discovery"] = {
            "complete": discovery.discovery_complete,
            "catalog_checksum": discovery.catalog_checksum,
            "categories_seen": sorted(discovery.categories_seen),
            "index_pages": discovery.index_pages,
            "errors": discovery.errors,
            "warnings": discovery.warnings,
            "duplicate_external_ids": discovery.duplicate_external_ids,
            "unresolved_no_external_id_urls": discovery.unresolved_no_external_id_urls,
            "skipped_silent": discovery.skipped_silent,
            "skipped_off_domain": discovery.skipped_off_domain,
        }
    output = json.dumps(payload, indent=2, default=str)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    print(output)
    return 0 if record.outcome != "failure" else 1


if __name__ == "__main__":
    raise SystemExit(main())
