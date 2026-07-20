"""Manual Moret Real Estate adapter runner (dry-run / non-writing by default).

Modes:
  --index-only          Discover catalog indexes only (no detail fetches)
  --discover-complete   Full pagination discovery + detail dry-run
  --discover            Bounded discovery (requires --max-items)
  --dry-run             Explicit dry-run (default when not importing)
  --input / --import-from-file  Offline catalog file modes (zero website requests)
  --preview-import      Read-only Labs reconciliation from a local catalog
  --import-from-file --import-db  Controlled offline Labs import (no live fetch)

A complete run rejects --max-items. Default remains non-writing unless the
approved offline import flags are supplied together.
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

from merkado_labs.normalization.ecb_rates import EcbEurRateProvider  # noqa: E402
from merkado_labs.normalization.eligibility import evaluate_public_eligibility  # noqa: E402
from merkado_labs.scrapers.adapters.moret_real_estate import (  # noqa: E402
    ADAPTER_VERSION,
    BASE_URL,
    PROPERTIES_INDEX_URL,
    SOURCE_KEY,
    MoretRealEstateAdapter,
    audit_robots_text,
    dump_json,
    snapshots_to_catalog_artifact,
)
from merkado_labs.scrapers.http_cache import fetch_url  # noqa: E402
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    import_moret_catalog_from_file,
    run_moret_import_preview,
)
from merkado_labs.scrapers.robots import USER_AGENT  # noqa: E402


def _quality_metrics(snapshots: list[Any]) -> dict[str, Any]:
    warnings = Counter(w for s in snapshots for w in s.warnings)
    errors = Counter(e for s in snapshots for e in s.parser_errors)
    listing_types = Counter(s.listing_type for s in snapshots)
    statuses = Counter(s.source_status for s in snapshots)
    eligible = 0
    for snap in snapshots:
        status = snap.lifecycle_hint.value if snap.lifecycle_hint else "unknown"
        ok, _ = evaluate_public_eligibility(
            status=status if status != "under_contract" else "active",
            original_price=snap.original_price.amount if snap.original_price else None,
            source_enabled=True,
            source_url=snap.source_url,
            has_critical_parser_error=bool(snap.parser_errors),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        # under_contract remains lifecycle active for eligibility when priced
        if snap.source_status == "under_contract" and snap.has_positive_price:
            ok = True
        activeish = snap.source_status in {"active", "under_contract", "reserved"}
        if ok and snap.has_positive_price and activeish:
            eligible += 1
        elif ok:
            eligible += 1

    def cov(pred) -> dict[str, Any]:
        total = len(snapshots)
        n = sum(1 for s in snapshots if pred(s))
        return {"count": n, "of": total, "pct": round(100.0 * n / total, 1) if total else 0.0}

    return {
        "listing_type": dict(listing_types),
        "source_status": dict(statuses),
        "public_eligible_projected": eligible,
        "priced": sum(1 for s in snapshots if s.has_positive_price),
        "no_price": sum(1 for s in snapshots if not s.has_positive_price),
        "from_price": sum(1 for s in snapshots if s.raw_payload.get("from_price")),
        "coverage": {
            "title": cov(lambda s: bool(s.title)),
            "description": cov(lambda s: bool(s.description)),
            "images": cov(lambda s: bool(s.image_urls)),
            "bedrooms": cov(lambda s: s.bedrooms is not None),
            "bathrooms": cov(lambda s: s.bathrooms is not None),
            "floor_area": cov(lambda s: s.floor_area_m2 is not None),
            "lot_area": cov(lambda s: s.lot_area_value is not None),
            "location": cov(lambda s: bool(s.location_text or s.neighbourhood_text)),
            "coordinates": cov(lambda s: s.latitude is not None and s.longitude is not None),
            "property_type": cov(lambda s: bool(s.property_type)),
            "agent": cov(lambda s: bool(s.raw_payload.get("agent_name"))),
            "listing_type": cov(lambda s: s.listing_type in {"sale", "rent"}),
            "trusted_price": cov(lambda s: bool(s.raw_payload.get("price_trusted"))),
        },
        "warning_categories": dict(warnings),
        "parser_error_categories": dict(errors),
    }


def run_access_audit(*, cache_dir: Path) -> dict[str, Any]:
    adapter = MoretRealEstateAdapter(cache_dir=cache_dir)
    robots = adapter.evaluate_robots(PROPERTIES_INDEX_URL, honor_delay=True)
    robots_body = ""
    robots_url = f"{BASE_URL}/robots.txt"
    try:
        fetched_robots = fetch_url(
            robots_url, cache_dir=cache_dir, user_agent=USER_AGENT, use_cache=True
        )
        robots_body = fetched_robots.body.decode("utf-8", errors="replace")
    except Exception as error:  # noqa: BLE001
        robots_body = f"# fetch_error:{error}"
    robots_audit = audit_robots_text(robots_body)
    index = adapter._fetch(
        PROPERTIES_INDEX_URL,
        cache_dir=cache_dir,
        honor_delay=True,
        use_cache=True,
        kind="index",
    )
    html = index.body.decode("utf-8", errors="replace")
    from merkado_labs.scrapers.adapters.moret_real_estate import (
        CANONICAL_LINK_RE,
        HTML_LANG_RE,
        NEXT_LINK_RE,
        extract_pagination_targets,
    )

    pag = extract_pagination_targets(html, current_url=PROPERTIES_INDEX_URL)
    lang_m = HTML_LANG_RE.search(html)
    can_m = CANONICAL_LINK_RE.search(html)
    next_m = NEXT_LINK_RE.search(html)
    server_rendered = "property_listing" in html and "data-link=" in html
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "robots": {
            "url": robots_url,
            "fetch_status": robots.fetch_status,
            "can_fetch_properties": robots.can_fetch,
            "crawl_delay_seconds": robots.crawl_delay_seconds,
            "notes": robots.notes,
            **robots_audit,
        },
        "index": {
            "url": PROPERTIES_INDEX_URL,
            "http_status": index.status,
            "sha256": index.sha256,
            "from_cache": index.from_cache,
            "canonical_url": can_m.group("href") if can_m else None,
            "html_lang": lang_m.group("lang") if lang_m else None,
            "next_link": next_m.group("href") if next_m else None,
            "pagination": pag,
            "server_rendered_listings": server_rendered,
        },
        "request_delay_policy_seconds": max(2.0, robots.crawl_delay_seconds or 0),
        "stop_if_properties_disallowed": robots_audit.get("properties_disallowed")
        or robots.can_fetch is not True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--discover-complete", action="store_true")
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--max-items", type=int, default=None)
    parser.add_argument("--cache-dir", type=Path, default=Path("data/raw/moret_real_estate/cache"))
    parser.add_argument("--live-fetch", action="store_true")
    parser.add_argument("--import-db", action="store_true")
    parser.add_argument("--preview-import", action="store_true")
    parser.add_argument("--import-from-file", action="store_true")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/processed/moret_complete_catalog.json"),
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--access-audit", action="store_true")
    parser.add_argument("--write-artifacts", action="store_true")
    parser.add_argument(
        "--skip-evidence-upload",
        action="store_true",
        help="Skip private listing-raw-evidence upload during --import-from-file",
    )
    args = parser.parse_args()

    if args.import_db and not args.import_from_file:
        parser.error(
            "--import-db requires --import-from-file for the approved offline import"
        )

    if args.preview_import:
        if (
            args.live_fetch
            or args.discover
            or args.discover_complete
            or args.index_only
            or args.import_from_file
            or args.import_db
        ):
            parser.error("--preview-import cannot combine with live/import modes")
        print("READ-ONLY IMPORT PREVIEW")
        result = run_moret_import_preview(input_path=args.input)
        payload = result.as_dict()
        text = json.dumps(payload, indent=2, default=str)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text + "\n", encoding="utf-8")
        print(text)
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
        if args.live_fetch or args.discover or args.discover_complete or args.index_only:
            parser.error("file modes cannot combine with live discovery flags")
        print("OFFLINE IMPORT FROM VERIFIED MORET ARTIFACT")
        payload = import_moret_catalog_from_file(
            input_path=args.input,
            cache_dir=args.cache_dir,
            upload_evidence=not args.skip_evidence_upload,
        )
        text = json.dumps(payload, indent=2, default=str)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text + "\n", encoding="utf-8")
        print(text)
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

    if args.access_audit:
        if not args.live_fetch:
            parser.error("--live-fetch required for access audit")
        payload = run_access_audit(cache_dir=args.cache_dir)
        if args.write_artifacts:
            dump_json(Path("data/processed/moret_source_access_audit.json"), payload)
            md = [
                "# Moret source access audit",
                "",
                f"- Generated: `{payload['generated_at']}`",
                f"- Robots status: `{payload['robots']['fetch_status']}`",
                f"- Crawl-delay: `{payload['robots']['crawl_delay_seconds']}`",
                f"- Can fetch properties: `{payload['robots']['can_fetch_properties']}`",
                f"- Disallows: `{payload['robots']['disallowed_paths']}`",
                f"- Sitemaps: `{payload['robots']['sitemap_urls']}`",
                f"- Index status: `{payload['index']['http_status']}`",
                f"- Canonical: `{payload['index']['canonical_url']}`",
                f"- Lang: `{payload['index']['html_lang']}`",
                f"- Next: `{payload['index']['next_link']}`",
                f"- Server-rendered: `{payload['index']['server_rendered_listings']}`",
                f"- Delay policy (seconds): `{payload['request_delay_policy_seconds']}`",
            ]
            Path("data/processed/moret_source_access_audit.md").write_text(
                "\n".join(md) + "\n", encoding="utf-8"
            )
        text = json.dumps(payload, indent=2, default=str)
        if args.output:
            args.output.write_text(text, encoding="utf-8")
        print(text)
        if payload.get("stop_if_properties_disallowed"):
            return 2
        return 0

    needs_network = bool(
        args.live_fetch
        or args.discover
        or args.discover_complete
        or args.index_only
        or args.urls
    )
    if needs_network and not args.live_fetch:
        parser.error("--live-fetch required for network runs")

    if args.discover_complete or args.index_only:
        if args.max_items is not None:
            parser.error("complete/index-only runs reject --max-items")
        adapter = MoretRealEstateAdapter(cache_dir=args.cache_dir)
        record, snapshots, discovery = adapter.run_catalog(
            cache_dir=args.cache_dir,
            dry_run=True,
            honor_delay=True,
            use_cache=True,
            index_only=args.index_only,
        )
        payload: dict[str, Any] = {
            "run": {
                "outcome": (
                    record.outcome.value
                    if hasattr(record.outcome, "value")
                    else record.outcome
                ),
                "adapter_version": ADAPTER_VERSION,
                "discovered": record.discovered_count,
                "parsed": record.parsed_count,
                "errors": record.error_count,
                "complete_catalog": record.metadata.get("complete_catalog"),
                "pagination_proven": discovery.pagination_proven,
                "termination_reason": discovery.termination_reason,
                "request_metrics": record.metadata.get("request_metrics"),
            },
            "discovery": {
                "index_page_count": len(discovery.index_pages),
                "index_pages": discovery.index_pages,
                "raw_link_count": discovery.raw_link_count,
                "bilingual_duplicate_count": discovery.bilingual_duplicate_count,
                "rejected_non_detail_count": discovery.rejected_non_detail_count,
                "category_signals": discovery.category_signals,
                "complete_candidate": discovery.complete_candidate,
                "errors": discovery.errors,
                "urls": [i.canonical_url for i in discovery.listings],
            },
            "quality": _quality_metrics(snapshots) if snapshots else {},
            "catalog": snapshots_to_catalog_artifact(
                record=record, snapshots=snapshots, discovery=discovery
            )
            if snapshots
            else None,
        }
        if args.write_artifacts:
            if args.index_only:
                dump_json(Path("data/processed/moret_index_recon.json"), payload)
                dump_json(
                    Path("data/processed/moret_discovered_urls.json"),
                    {
                        "generated_at": datetime.now(UTC).isoformat(),
                        "count": len(discovery.listings),
                        "urls": [i.canonical_url for i in discovery.listings],
                        "termination_reason": discovery.termination_reason,
                        "pagination_proven": discovery.pagination_proven,
                        "complete_candidate": discovery.complete_candidate,
                    },
                )
                md = [
                    "# Moret index reconnaissance",
                    "",
                    f"- Index pages: `{len(discovery.index_pages)}`",
                    f"- Discovered URLs: `{len(discovery.listings)}`",
                    f"- Termination: `{discovery.termination_reason}`",
                    f"- Pagination proven: `{discovery.pagination_proven}`",
                    f"- Complete candidate: `{discovery.complete_candidate}`",
                    f"- Bilingual duplicates observed: `{discovery.bilingual_duplicate_count}`",
                    f"- Rejected non-detail: `{discovery.rejected_non_detail_count}`",
                    f"- Category signals: `{discovery.category_signals}`",
                ]
                Path("data/processed/moret_index_recon.md").write_text(
                    "\n".join(md) + "\n", encoding="utf-8"
                )
            else:
                catalog = snapshots_to_catalog_artifact(
                    record=record, snapshots=snapshots, discovery=discovery
                )
                dump_json(Path("data/processed/moret_complete_catalog.json"), catalog)
                dump_json(
                    Path("data/processed/moret_catalog_integrity.json"),
                    {
                        "generated_at": datetime.now(UTC).isoformat(),
                        "complete_catalog": catalog["complete_catalog"],
                        "outcome": catalog["outcome"],
                        "catalog_checksum": catalog["catalog_checksum"],
                        "snapshot_checksum": catalog["snapshot_checksum"],
                        "pagination_proven": discovery.pagination_proven,
                        "termination_reason": discovery.termination_reason,
                        "discovered": len(discovery.listings),
                        "parsed": len(snapshots),
                        "identity_conflicts": record.metadata.get("identity_conflicts"),
                        "request_statistics": catalog["request_statistics"],
                    },
                )
                quality = _quality_metrics(snapshots)
                dump_json(Path("data/processed/moret_field_coverage.json"), quality)
                cov_lines = ["# Moret field coverage", ""]
                for key, val in quality.get("coverage", {}).items():
                    cov_lines.append(f"- {key}: {val['count']}/{val['of']} ({val['pct']}%)")
                Path("data/processed/moret_field_coverage.md").write_text(
                    "\n".join(cov_lines) + "\n", encoding="utf-8"
                )
        text = json.dumps(payload, indent=2, default=str)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text, encoding="utf-8")
        print(text)
        return 0 if record.outcome != "failure" else 1

    # Bounded path
    if not args.urls and not args.discover:
        parser.error("Provide URLs, --discover, --discover-complete, or --index-only")
    max_items = args.max_items if args.max_items is not None else 5
    adapter = MoretRealEstateAdapter(cache_dir=args.cache_dir)
    record, snapshots = adapter.run_bounded(
        listing_urls=args.urls,
        cache_dir=args.cache_dir,
        dry_run=True,
        max_items=max_items,
        honor_delay=True,
        discover=args.discover,
    )
    payload = {
        "run": {
            "outcome": record.outcome.value if hasattr(record.outcome, "value") else record.outcome,
            "parsed": record.parsed_count,
            "errors": record.error_count,
            "bounded": True,
            "complete_catalog": False,
            "adapter_version": ADAPTER_VERSION,
        },
        "listings": [
            {
                "external_id": s.external_id,
                "title": s.title,
                "price": str(s.original_price.amount) if s.original_price else None,
                "currency": s.original_price.currency if s.original_price else None,
                "listing_type": s.listing_type,
                "source_status": s.source_status,
                "primary_image_url": s.primary_image_url,
                "image_count": len(s.image_urls),
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
    _ = EcbEurRateProvider  # retained for future import path symmetry
    _ = SOURCE_KEY
    return 0 if str(record.outcome) != "failure" else 1


if __name__ == "__main__":
    raise SystemExit(main())
