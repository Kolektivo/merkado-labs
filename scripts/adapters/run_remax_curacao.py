"""Manual RE/MAX Curaçao adapter runner.

Scheduling is intentionally not enabled. Default mode is dry-run (no DB writes).

``--preview-import`` reconciles a local complete catalog against Labs with
read-only SELECTs only (no website requests, writes, uploads, or events).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.normalization.currency import (  # noqa: E402
    ManualEurRateProvider,
    to_benchmark_xcg,
)
from merkado_labs.normalization.ecb_rates import EcbEurRateProvider  # noqa: E402
from merkado_labs.normalization.eligibility import evaluate_public_eligibility  # noqa: E402
from merkado_labs.scrapers.adapters.remax_curacao import RemaxCuracaoAdapter  # noqa: E402
from merkado_labs.scrapers.import_pipeline import import_snapshots  # noqa: E402
from merkado_labs.scrapers.import_simulation import (  # noqa: E402
    project_test_rate_recalculations,
    simulate_import,
)
from merkado_labs.scrapers.remax_import_preview import (  # noqa: E402
    import_remax_catalog_from_file,
    run_remax_import_preview,
)


def _build_provider(args: argparse.Namespace):
    if args.fx_provider == "ecb":
        if args.eur_rate is not None:
            raise SystemExit("--eur-rate cannot be combined with --fx-provider ecb")
        return EcbEurRateProvider()
    if args.fx_provider == "manual":
        if args.eur_rate is None:
            raise SystemExit("--fx-provider manual requires --eur-rate")
        return ManualEurRateProvider(
            rate=Decimal(args.eur_rate),
            provider_id="manual_test",
            notes="Manual/test EUR→XCG rate (not an ECB reference)",
        )
    raise SystemExit(f"Unknown --fx-provider {args.fx_provider!r}")


def _quality_report(snapshots: list[Any], *, eur_provider) -> dict[str, Any]:
    def completeness(pred) -> dict[str, Any]:
        total = len(snapshots)
        ok = sum(1 for snap in snapshots if pred(snap))
        return {"count": ok, "of": total, "pct": round(100.0 * ok / total, 1) if total else 0.0}

    currencies = Counter(
        snap.original_price.currency if snap.original_price else None for snap in snapshots
    )
    property_types = Counter(snap.property_type for snap in snapshots)
    listing_types = Counter(snap.listing_type for snap in snapshots)
    statuses = Counter(snap.source_status for snap in snapshots)
    lifecycle = Counter(
        snap.lifecycle_hint.value if snap.lifecycle_hint else None for snap in snapshots
    )
    periods = Counter(snap.raw_payload.get("price_period") for snap in snapshots)
    warnings = Counter(w for snap in snapshots for w in snap.warnings)
    errors = Counter(e for snap in snapshots for e in snap.parser_errors)

    eligible = 0
    for snap in snapshots:
        status = snap.lifecycle_hint.value if snap.lifecycle_hint else "active"
        ok, _ = evaluate_public_eligibility(
            status=status,
            original_price=snap.original_price.amount if snap.original_price else None,
            source_enabled=True,
            source_url=snap.source_url,
            has_critical_parser_error=bool(snap.parser_errors),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        if ok:
            eligible += 1

    fx = None
    pending = 0
    for snap in snapshots:
        if snap.original_price and snap.original_price.currency == "EUR":
            bench = to_benchmark_xcg(snap.original_price, eur_provider=eur_provider)
            if fx is None and bench.provenance:
                fx = bench.provenance
            if bench.pending:
                pending += 1

    return {
        "totals": {
            "parsed": len(snapshots),
            "sale": listing_types.get("sale", 0),
            "rent": listing_types.get("rent", 0),
            "publicly_eligible_projected": eligible,
            "publicly_excluded_projected": len(snapshots) - eligible,
            "no_price": sum(1 for s in snapshots if not s.has_positive_price),
            "eur_benchmark_pending": pending,
        },
        "currency_distribution": dict(currencies),
        "property_type_distribution": dict(property_types),
        "listing_type_distribution": dict(listing_types),
        "source_status_distribution": dict(statuses),
        "lifecycle_distribution": dict(lifecycle),
        "rental_period_distribution": dict(periods),
        "completeness": {
            "price": completeness(lambda s: s.has_positive_price),
            "rental_period": completeness(
                lambda s: s.listing_type != "rent" or bool(s.raw_payload.get("price_period"))
            ),
            "bedrooms": completeness(lambda s: s.bedrooms is not None),
            "bathrooms": completeness(lambda s: s.bathrooms is not None),
            "living_area": completeness(lambda s: s.floor_area_m2 is not None),
            "lot_area": completeness(lambda s: s.lot_area_value is not None),
            "neighbourhood": completeness(lambda s: bool(s.neighbourhood_text)),
            "coordinates": completeness(
                lambda s: s.latitude is not None and s.longitude is not None
            ),
            "source_listing_date": completeness(lambda s: s.source_listed_at is not None),
            "realtor_attribution": completeness(
                lambda s: bool(s.raw_payload.get("realtor_name"))
            ),
            "images": completeness(lambda s: bool(s.raw_payload.get("image_urls"))),
            "description": completeness(lambda s: bool(s.description)),
            "description_gt_300": completeness(
                lambda s: bool(s.description) and len(s.description or "") > 300
            ),
            "description_gt_800": completeness(
                lambda s: bool(s.description) and len(s.description or "") > 800
            ),
            "source_description_checksum": completeness(
                lambda s: bool(s.source_description_checksum)
            ),
            "amenities": completeness(lambda s: bool(s.amenities)),
            "evidence_storage_path": completeness(
                lambda s: bool(s.evidence_storage_path)
            ),
        },
        "description_stats": {
            "avg_len": (
                round(
                    sum(len(s.description or "") for s in snapshots) / len(snapshots),
                    1,
                )
                if snapshots
                else 0
            ),
            "max_len": max((len(s.description or "") for s in snapshots), default=0),
            "min_len": min((len(s.description or "") for s in snapshots), default=0),
        },
        "segments": {
            "active": sum(1 for s in snapshots if str(s.lifecycle_hint) == "active"),
            "sold": sum(1 for s in snapshots if str(s.lifecycle_hint) == "sold"),
            "inactive_rented": sum(
                1 for s in snapshots if str(s.lifecycle_hint) == "inactive"
            ),
            "under_contract": sum(
                1 for s in snapshots if s.source_status == "under_contract"
            ),
            "priced": sum(1 for s in snapshots if s.has_positive_price),
            "no_price": sum(1 for s in snapshots if not s.has_positive_price),
        },
        "warning_categories": dict(warnings),
        "parser_error_categories": dict(errors),
        "fx_quote": fx,
    }


def _load_existing_remax_rows() -> list[dict[str, Any]]:
    try:
        from merkado_labs.scrapers.import_pipeline import (
            create_labs_client,
            resolve_property_source,
        )

        client = create_labs_client()
        source = resolve_property_source(client, "remax_curacao")
        rows: list[dict[str, Any]] = []
        page_size = 1000
        start = 0
        while True:
            page = (
                client.table("property_listings")
                .select(
                    "id,external_id,listing_type,status,original_price,original_currency,"
                    "benchmark_price_xcg,conversion_provider,conversion_rate,conversion_method,"
                    "public_eligible,source_url"
                )
                .eq("property_source_id", source["id"])
                .range(start, start + page_size - 1)
                .execute()
                .data
                or []
            )
            rows.extend(page)
            if len(page) < page_size:
                break
            start += page_size
        return rows
    except Exception as error:  # noqa: BLE001
        return [{"_error": str(error)}]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "urls",
        nargs="*",
        help="Optional listing detail URLs. Omit with --discover.",
    )
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Discover listing URLs from sale/rent index pages",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse only; do not write to Labs (default unless --import-db)",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=5,
        help="Max listings to parse. Use 0 for unlimited (required for a complete catalog run).",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Max index pages per section. Omit for unlimited.",
    )
    parser.add_argument(
        "--sections",
        default="sale,rent",
        help="Comma-separated: sale,rent",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("data/raw/remax_curacao/cache"),
    )
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument(
        "--live-fetch",
        action="store_true",
        help="Allow network fetches with robots delay",
    )
    parser.add_argument(
        "--import-db",
        action="store_true",
        help="Write Labs rows (requires credentials). Default is dry-run parse only.",
    )
    parser.add_argument(
        "--fx-provider",
        choices=("ecb", "manual"),
        default="ecb",
        help="EUR→XCG provider. Default: ecb (approved production policy).",
    )
    parser.add_argument(
        "--eur-rate",
        type=str,
        default=None,
        help="Manual EUR→XCG rate for --fx-provider manual only (never a silent fallback).",
    )
    parser.add_argument(
        "--simulate-import",
        action="store_true",
        help="Project import effects against current Labs rows without writing.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to write the full JSON report.",
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
        "--import-from-file",
        action="store_true",
        help=(
            "Import verified v0.4.1 catalog JSON using local cache HTML only. "
            "No live website requests. Requires --import-db."
        ),
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/processed/remax_v041_reparsed_catalog.json"),
        help="Local catalog JSON for --preview-import / --import-from-file",
    )
    parser.add_argument(
        "--no-evidence-upload",
        dest="upload_evidence",
        action="store_false",
        help="Skip raw HTML evidence upload during --import-from-file (default).",
    )
    parser.add_argument(
        "--evidence-upload",
        dest="upload_evidence",
        action="store_true",
        help="Upload raw HTML evidence during --import-from-file.",
    )
    parser.set_defaults(upload_evidence=False)
    args = parser.parse_args()

    if args.preview_import:
        if (
            args.import_db
            or args.live_fetch
            or args.discover
            or args.import_from_file
            or args.urls
        ):
            parser.error(
                "--preview-import cannot be combined with import/live/discover modes"
            )
        print("READ-ONLY IMPORT PREVIEW")
        result = run_remax_import_preview(input_path=args.input, write_reports=True)
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
        if args.live_fetch or args.discover or args.urls:
            parser.error(
                "--import-from-file cannot be combined with live/discover/URL modes"
            )
        print("OFFLINE IMPORT FROM VERIFIED ARTIFACT")
        upload_evidence = args.upload_evidence
        payload = import_remax_catalog_from_file(
            input_path=args.input,
            cache_dir=args.cache_dir,
            upload_evidence=upload_evidence,
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

    if not args.urls and not args.discover:
        args.discover = True

    if args.import_db and args.dry_run:
        parser.error("Use either --import-db or --dry-run, not both")

    # Default to dry-run when not importing.
    do_import = bool(args.import_db)
    dry_run = not do_import

    sections = tuple(
        part.strip() for part in args.sections.split(",") if part.strip() in {"sale", "rent"}
    )
    max_items = None if args.max_items == 0 else args.max_items
    provider = _build_provider(args)

    adapter = RemaxCuracaoAdapter(cache_dir=args.cache_dir)
    record, snapshots = adapter.run_bounded(
        listing_urls=args.urls or None,
        cache_dir=args.cache_dir,
        dry_run=dry_run,
        max_items=max_items,
        max_pages=args.max_pages,
        sections=sections or ("sale",),
        use_cache=not args.no_cache,
        honor_delay=bool(args.live_fetch),
        discover=args.discover or not args.urls,
    )

    # Attach FX quote once for the run report.
    fx_quote = None
    fx_error = None
    try:
        fx_quote = provider.get_eur_to_xcg_quote().as_provenance()
    except Exception as error:  # noqa: BLE001
        fx_error = str(error)

    import_result = None
    evidence_uploads = {"attempted": 0, "uploaded": 0, "errors": 0}
    if do_import:
        # Upload private raw HTML evidence before/alongside import (Labs only).
        try:
            from merkado_labs.scrapers.http_cache import fetch_url
            from merkado_labs.scrapers.raw_storage import upload_raw_html
            from merkado_labs.scrapers.robots import USER_AGENT

            for snap in snapshots:
                evidence_uploads["attempted"] += 1
                try:
                    fetched = fetch_url(
                        snap.source_url,
                        cache_dir=args.cache_dir,
                        user_agent=USER_AGENT,
                        use_cache=True,
                    )
                    upload_raw_html(
                        source_key=snap.source_key,
                        external_id=snap.external_id,
                        checksum=snap.raw_sha256,
                        html_bytes=fetched.body,
                        content_type=fetched.content_type or "text/html; charset=utf-8",
                    )
                    evidence_uploads["uploaded"] += 1
                except Exception:  # noqa: BLE001
                    evidence_uploads["errors"] += 1
        except Exception as error:  # noqa: BLE001
            evidence_uploads["errors"] += 1
            evidence_uploads["setup_error"] = str(error)

        import_result = import_snapshots(
            source_key=record.source_key,
            run=record,
            snapshots=snapshots,
            dry_run=False,
            eur_provider=provider,
            apply_geospatial=True,
        )

    quality = _quality_report(snapshots, eur_provider=provider)

    simulation = None
    recalculation_projection = None
    if args.simulate_import or dry_run:
        existing_rows = _load_existing_remax_rows()
        if existing_rows and "_error" not in existing_rows[0]:
            existing_map = {str(row["external_id"]): row for row in existing_rows}
            sim = simulate_import(
                snapshots=snapshots,
                existing_by_external_id=existing_map,
                run=record,
                eur_provider=provider,
            )
            simulation = {
                "new_listings": sim.new_listings,
                "updated_listings": sim.updated_listings,
                "unchanged_existing_outside_catalog": sim.unchanged_listings,
                "new_listing_observations": sim.new_listing_observations,
                "new_price_observations": sim.new_price_observations,
                "first_seen_events": sim.first_seen_events,
                "price_changed_events": sim.price_changed_events,
                "currency_changed_events": sim.currency_changed_events,
                "benchmark_recalculated_events": sim.benchmark_recalculated_events,
                "source_marked_sold_events": sim.source_marked_sold_events,
                "no_price_exclusions": sim.no_price_exclusions,
                "publicly_eligible": sim.publicly_eligible,
                "publicly_excluded": sim.publicly_excluded,
                "sold_count": sim.sold_count,
                "rented_inactive_count": sim.rented_inactive_count,
                "under_contract_count": sim.under_contract_count,
                "parser_warning_listings": sim.parser_warning_listings,
                "parser_error_listings": sim.parser_error_listings,
                "benchmark_pending_count": sim.benchmark_pending_count,
                "existing_test_rate_recalculations": sim.existing_test_rate_recalculations,
                "notes": sim.notes,
                "lifecycle_safety": (
                    "First complete imported baseline will not mark listings missing/removed "
                    "merely because prior bounded samples were smaller; absence transitions "
                    "require a complete successful import outcome."
                ),
            }
            recalculation_projection = project_test_rate_recalculations(existing_rows)
        else:
            simulation = {"error": existing_rows[0].get("_error") if existing_rows else "no_rows"}

    unique_ids = {snap.external_id for snap in snapshots}
    unique_urls = {snap.source_url for snap in snapshots}
    payload = {
        "run": {
            "source_key": record.source_key,
            "adapter": record.adapter_name,
            "version": record.adapter_version,
            "outcome": record.outcome,
            "discovered": record.discovered_count,
            "parsed": record.parsed_count,
            "imported": import_result.imported_count if import_result else 0,
            "updated": import_result.updated_count if import_result else 0,
            "excluded_no_price": record.excluded_no_price_count,
            "warnings": record.warning_count,
            "errors": record.error_count,
            "notes": record.notes,
            "metadata": record.metadata,
            "import_notes": list(import_result.notes) if import_result else [],
            "source_run_id": import_result.source_run_id if import_result else None,
            "dry_run": dry_run,
            "fx_provider": args.fx_provider,
            "fx_quote": fx_quote,
            "fx_error": fx_error,
            "evidence_uploads": evidence_uploads,
        },
        "catalog_integrity": {
            "unique_external_ids": len(unique_ids),
            "unique_urls": len(unique_urls),
            "duplicate_ids_removed": record.discovered_count - len(unique_ids),
            "sale_ids": sum(1 for s in snapshots if s.listing_type == "sale"),
            "rent_ids": sum(1 for s in snapshots if s.listing_type == "rent"),
            "id_prefix_collision_hs_hr": bool(
                {i[2:] for i in unique_ids if i.startswith("hs")}
                & {i[2:] for i in unique_ids if i.startswith("hr")}
            ),
            "off_domain_urls": [
                s.source_url
                for s in snapshots
                if "realestate-curacao.com" not in s.source_url
            ],
            "discovery": (record.metadata or {}).get("discovery"),
        },
        "quality": quality,
        "import_simulation": simulation,
        "existing_sample_recalculation_projection": recalculation_projection,
        "listings": [
            {
                "external_id": snap.external_id,
                "url": snap.source_url,
                "title": snap.title,
                "listing_type": snap.listing_type,
                "property_type": snap.property_type,
                "status_hint": snap.lifecycle_hint,
                "source_status": snap.source_status,
                "neighbourhood_text": snap.neighbourhood_text,
                "bedrooms": snap.bedrooms,
                "bathrooms": snap.bathrooms,
                "floor_area_m2": (
                    str(snap.floor_area_m2) if snap.floor_area_m2 is not None else None
                ),
                "lot_area": (
                    {
                        "value": str(snap.lot_area_value),
                        "unit": snap.lot_area_unit,
                    }
                    if snap.lot_area_value is not None
                    else None
                ),
                "latitude": snap.latitude,
                "longitude": snap.longitude,
                "price": (
                    {
                        "amount": str(snap.original_price.amount),
                        "currency": snap.original_price.currency,
                        "period": snap.raw_payload.get("price_period"),
                    }
                    if snap.original_price
                    else None
                ),
                "public_priced": snap.has_positive_price,
                "images": len(snap.raw_payload.get("image_urls") or []),
                "has_description": bool(snap.description),
                "amenities": len(snap.amenities),
                "warnings": list(snap.warnings),
                "parser_errors": list(snap.parser_errors),
            }
            for snap in snapshots
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
