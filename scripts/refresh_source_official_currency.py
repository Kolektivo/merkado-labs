#!/usr/bin/env python3
"""Refresh source-official alternate currencies for Ready RE/MAX + KW listings.

Default is dry-run (no DB writes). Use ``--apply`` to persist official
alternate prices and public XCG preference on existing Labs identities only.

Constraints:
- Labs project ref ``csaefdkpwukshtouyixg`` only
- Ready sources: ``remax_curacao``, ``keller_williams_curacao``
- Existing listings only (no new identities, missing/removal, AI, image refetch)
- Official alternate backfill does NOT emit ``price_changed`` lifecycle events
- Idempotent on a second run

Usage (PowerShell):
  $env:PYTHONPATH="src"; python scripts/refresh_source_official_currency.py
  $env:PYTHONPATH="src"; python scripts/refresh_source_official_currency.py --limit 5
  $env:PYTHONPATH="src"; python scripts/refresh_source_official_currency.py --apply --listing-ids <uuid>
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.normalization.currency import (  # noqa: E402
    FixedEurRateProvider,
    normalize_currency_code,
    resolve_public_benchmark_xcg,
)
from merkado_labs.normalization.ecb_rates import EcbEurRateProvider  # noqa: E402
from merkado_labs.scrapers.adapters.keller_williams_curacao import (  # noqa: E402
    KellerWilliamsCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.remax_curacao import RemaxCuracaoAdapter  # noqa: E402
from merkado_labs.scrapers.adapters.remax_naf_session import (  # noqa: E402
    capture_naf_official_alternate,
    has_official_xcg_alternate,
)
from merkado_labs.scrapers.contracts import (  # noqa: E402
    SOURCE_OFFICIAL_PROVENANCE,
    MoneyAmount,
    OfficialAlternatePrice,
)
from merkado_labs.scrapers.http_cache import FetchError, fetch_url  # noqa: E402
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    is_official_alternate_only_update,
    should_append_price_observation,
)
from merkado_labs.scrapers.robots import USER_AGENT, sleep_for_delay  # noqa: E402

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
FORBIDDEN_PROJECT_REF = "jkrfyvukhhsapoivntms"
ALLOWED_SOURCES = ("remax_curacao", "keller_williams_curacao")
DEFAULT_REPORT = ROOT / "data" / "processed" / "source_official_currency_refresh.json"


def _require_labs() -> str:
    settings = get_settings()
    ref = settings.supabase_project_ref
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project ref {ref!r}")
    if ref == FORBIDDEN_PROJECT_REF:
        raise SystemExit("Refusing production project ref")
    if settings.supabase_url and LABS_PROJECT_REF not in str(settings.supabase_url):
        raise SystemExit(f"Refusing non-Labs SUPABASE_URL: {settings.supabase_url}")
    return ref


def _alts_payload(
    alts: list[OfficialAlternatePrice] | tuple[OfficialAlternatePrice, ...],
) -> list[dict[str, Any]]:
    return [alt.as_dict() for alt in alts]


def _normalize_stored_alts(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        currency = normalize_currency_code(item.get("currency"))
        amount = item.get("amount")
        if currency is None or amount is None:
            continue
        out.append(
            {
                "amount": str(amount),
                "currency": currency,
                "provenance": item.get("provenance") or SOURCE_OFFICIAL_PROVENANCE,
                "evidence": item.get("evidence"),
                "source_label": item.get("source_label"),
            }
        )
    return out


def _alts_signature(alts: list[dict[str, Any]]) -> list[str]:
    return sorted(f"{a['currency']}|{a['amount']}" for a in alts)


def _to_official_alts(raw: list[dict[str, Any]]) -> list[OfficialAlternatePrice]:
    out: list[OfficialAlternatePrice] = []
    for item in raw:
        try:
            amount = Decimal(str(item["amount"]))
        except Exception:  # noqa: BLE001
            continue
        currency = normalize_currency_code(item.get("currency"))
        if currency is None or amount <= 0:
            continue
        out.append(
            OfficialAlternatePrice(
                amount=amount,
                currency=currency,
                provenance=str(item.get("provenance") or SOURCE_OFFICIAL_PROVENANCE),
                evidence=item.get("evidence"),
                source_label=item.get("source_label"),
            )
        )
    return out


def _create_client() -> Any:
    settings = get_settings()
    if settings.supabase_url is None or settings.supabase_secret_key is None:
        raise SystemExit("Labs Supabase credentials are required")
    from supabase import create_client

    return create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )


def _load_candidates(
    client: Any,
    *,
    source_filter: str | None,
    listing_ids: list[str] | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    sources = (
        client.table("property_sources")
        .select("id,source_key,enabled,adapter_status")
        .in_("source_key", list(ALLOWED_SOURCES))
        .execute()
        .data
        or []
    )
    source_by_id = {row["id"]: row for row in sources}
    allowed_ids = [
        row["id"]
        for row in sources
        if row.get("enabled")
        and row.get("adapter_status") != "retired"
        and (source_filter is None or row.get("source_key") == source_filter)
    ]
    if not allowed_ids:
        return []

    query = (
        client.table("property_listings")
        .select(
            "id,property_source_id,external_id,source_url,status,"
            "original_price,original_currency,current_price,currency,"
            "benchmark_price_xcg,conversion_method,conversion_rate,"
            "conversion_provider,official_alternate_prices,image_urls"
        )
        .in_("property_source_id", allowed_ids)
    )
    if listing_ids:
        query = query.in_("id", listing_ids)
    rows = query.execute().data or []
    out: list[dict[str, Any]] = []
    for row in rows:
        src = source_by_id.get(row["property_source_id"]) or {}
        row["source_key"] = src.get("source_key")
        out.append(row)
    out.sort(key=lambda r: (r.get("source_key") or "", r.get("external_id") or ""))
    if limit is not None:
        out = out[:limit]
    return out


def _capture_remax(
    row: dict[str, Any],
    *,
    cache_dir: Path,
    honor_delay: bool,
) -> dict[str, Any]:
    adapter = RemaxCuracaoAdapter(cache_dir=cache_dir)
    url = row["source_url"]
    # Currency-only path: fetch HTML + optional NAF session; never rebuild gallery.
    robots = adapter.evaluate_robots(url)
    if robots.can_fetch is not True:
        return {
            "ok": False,
            "error": "robots_disallow",
            "official_alternates": [],
            "anchor_amount": row.get("original_price"),
            "anchor_currency": row.get("original_currency"),
            "warnings": ["robots_disallow"],
        }
    if honor_delay:
        sleep_for_delay(robots)
    try:
        fetched = fetch_url(
            url,
            cache_dir=cache_dir,
            user_agent=USER_AGENT,
            use_cache=False,
        )
    except FetchError as error:
        return {
            "ok": False,
            "error": str(error),
            "official_alternates": [],
            "anchor_amount": row.get("original_price"),
            "anchor_currency": row.get("original_currency"),
            "warnings": [f"fetch_failed:{error}"],
        }
    html = fetched.body.decode("utf-8", errors="replace")
    # Parse default view for identity / inline alts. Refresh retains stored Labs
    # asking; NAF session amount is always stored as an official alternate.
    snap = adapter.parse_listing_html(
        html,
        listing_url=url,
        raw_sha256=fetched.sha256,
        http_status=fetched.status,
        content_type=fetched.content_type or "text/html",
    )
    warnings = list(snap.warnings)
    alts = list(snap.official_alternate_prices)
    if not has_official_xcg_alternate(alts):
        naf = capture_naf_official_alternate(
            url,
            expected_external_id=row.get("external_id") or snap.external_id,
            default_html=html,
            honor_delay=honor_delay,
        )
        if naf.alternate is not None:
            alts.append(naf.alternate)
        elif not naf.skipped:
            warnings.extend(naf.warnings or ("naf_session_capture_failed",))

    # Prefer stored Labs asking as the refresh identity (no price_changed).
    anchor_amount = row.get("original_price")
    anchor_currency = row.get("original_currency")
    if snap.original_price is not None and anchor_amount is None:
        anchor_amount = float(snap.original_price.amount)
        anchor_currency = snap.original_price.currency

    # Drop alts that duplicate the retained asking identity.
    filtered: list[OfficialAlternatePrice] = []
    for alt in alts:
        same_currency = normalize_currency_code(alt.currency) == normalize_currency_code(
            anchor_currency
        )
        same_amount = (
            anchor_amount is not None and alt.amount == Decimal(str(anchor_amount))
        )
        if same_currency and same_amount:
            continue
        filtered.append(alt)

    return {
        "ok": True,
        "error": None,
        "official_alternates": filtered,
        "anchor_amount": anchor_amount,
        "anchor_currency": anchor_currency,
        "parsed_external_id": snap.external_id,
        "warnings": warnings,
        "image_refetch": False,
    }


def _capture_kw(
    row: dict[str, Any],
    *,
    cache_dir: Path,
    honor_delay: bool,
) -> dict[str, Any]:
    adapter = KellerWilliamsCuracaoAdapter(cache_dir=cache_dir)
    url = row["source_url"]
    robots = adapter.evaluate_robots(url)
    if robots.can_fetch is not True:
        return {
            "ok": False,
            "error": "robots_disallow",
            "official_alternates": [],
            "anchor_amount": row.get("original_price"),
            "anchor_currency": row.get("original_currency"),
            "warnings": ["robots_disallow"],
        }
    if honor_delay:
        sleep_for_delay(robots)
    try:
        fetched = fetch_url(
            url,
            cache_dir=cache_dir,
            user_agent=USER_AGENT,
            use_cache=False,
        )
    except FetchError as error:
        return {
            "ok": False,
            "error": str(error),
            "official_alternates": [],
            "anchor_amount": row.get("original_price"),
            "anchor_currency": row.get("original_currency"),
            "warnings": [f"fetch_failed:{error}"],
        }
    html = fetched.body.decode("utf-8", errors="replace")
    snap = adapter.parse_listing_html(
        html,
        listing_url=url,
        raw_sha256=fetched.sha256,
        http_status=fetched.status,
        content_type=fetched.content_type or "text/html",
    )
    anchor_amount = row.get("original_price")
    anchor_currency = row.get("original_currency")
    if snap.original_price is not None and anchor_amount is None:
        anchor_amount = float(snap.original_price.amount)
        anchor_currency = snap.original_price.currency
    return {
        "ok": True,
        "error": None,
        "official_alternates": list(snap.official_alternate_prices),
        "anchor_amount": anchor_amount,
        "anchor_currency": anchor_currency,
        "parsed_external_id": snap.external_id,
        "warnings": list(snap.warnings),
        "image_refetch": False,
    }


def _project_row(
    row: dict[str, Any],
    capture: dict[str, Any],
    *,
    eur_provider: Any,
) -> dict[str, Any]:
    before_alts = _normalize_stored_alts(row.get("official_alternate_prices"))
    after_alts = _alts_payload(capture.get("official_alternates") or [])
    # Merge: keep prior official alts when capture fails; replace when capture ok.
    if capture.get("ok") and after_alts:
        merged_alts = after_alts
    elif capture.get("ok") and not after_alts:
        merged_alts = before_alts
    else:
        merged_alts = before_alts

    anchor_amount = capture.get("anchor_amount", row.get("original_price"))
    anchor_currency = capture.get("anchor_currency") or row.get("original_currency")
    identity_ok = (row.get("external_id") or "") == (
        capture.get("parsed_external_id") or row.get("external_id") or ""
    )

    _, price_changed, currency_changed = should_append_price_observation(
        is_new=False,
        previous_amount=row.get("original_price"),
        previous_currency=row.get("original_currency"),
        new_amount=float(anchor_amount) if anchor_amount is not None else -1.0,
        new_currency=str(anchor_currency or ""),
    )
    alt_only = is_official_alternate_only_update(
        previous_amount=row.get("original_price"),
        previous_currency=row.get("original_currency"),
        new_amount=float(anchor_amount) if anchor_amount is not None else None,
        new_currency=str(anchor_currency) if anchor_currency else None,
    )

    public_xcg_before = row.get("benchmark_price_xcg")
    public_method_before = row.get("conversion_method")
    public_xcg_after = public_xcg_before
    public_method_after = public_method_before
    conversion_provider_after = row.get("conversion_provider")
    conversion_rate_after = row.get("conversion_rate")
    benchmark_payload: dict[str, Any] | None = None

    if anchor_amount is not None and anchor_currency:
        original = MoneyAmount(
            amount=Decimal(str(anchor_amount)),
            currency=str(anchor_currency),
        )
        official = _to_official_alts(merged_alts)
        public = resolve_public_benchmark_xcg(
            original,
            eur_provider=eur_provider,
            official_alternates=official,
        )
        if not public.pending and public.amount_xcg is not None:
            public_xcg_after = float(public.amount_xcg)
            public_method_after = (
                public.conversion_method.value if public.conversion_method else None
            )
            conversion_provider_after = public.conversion_provider
            conversion_rate_after = (
                float(public.conversion_rate)
                if public.conversion_rate is not None
                else None
            )
            benchmark_payload = {
                "benchmark_price_xcg": public_xcg_after,
                "conversion_method": public_method_after,
                "conversion_rate": conversion_rate_after,
                "conversion_provider": conversion_provider_after,
                "conversion_rate_at": (
                    public.conversion_rate_at.isoformat()
                    if public.conversion_rate_at
                    else None
                ),
            }

    alts_changed = _alts_signature(before_alts) != _alts_signature(merged_alts)
    bench_changed = (
        (public_xcg_before is None) != (public_xcg_after is None)
        or (
            public_xcg_before is not None
            and public_xcg_after is not None
            and abs(float(public_xcg_before) - float(public_xcg_after)) > 1e-6
        )
        or public_method_before != public_method_after
    )
    anchor_recovered = (
        row.get("original_price") is None
        and anchor_amount is not None
        and anchor_currency is not None
    )
    would_write = bool(
        capture.get("ok")
        and identity_ok
        and (alts_changed or bench_changed or anchor_recovered)
    )
    # Refresh never emits price_changed — asking identity is retained.
    timeline_events = {
        "price_changed": False,
        "currency_changed": False,
        "benchmark_recalculated": False,
        "note": "official_alternate_backfill_is_provenance_only",
    }

    return {
        "listing_id": row["id"],
        "source_key": row.get("source_key"),
        "external_id": row.get("external_id"),
        "source_url": row.get("source_url"),
        "identity_ok": identity_ok,
        "capture_ok": bool(capture.get("ok")),
        "capture_error": capture.get("error"),
        "warnings": capture.get("warnings") or [],
        "before": {
            "original_price": row.get("original_price"),
            "original_currency": row.get("original_currency"),
            "official_alternate_prices": before_alts,
            "benchmark_price_xcg": public_xcg_before,
            "conversion_method": public_method_before,
            "conversion_provider": row.get("conversion_provider"),
        },
        "after": {
            "original_price": anchor_amount,
            "original_currency": anchor_currency,
            "official_alternate_prices": merged_alts,
            "benchmark_price_xcg": public_xcg_after,
            "conversion_method": public_method_after,
            "conversion_provider": conversion_provider_after,
        },
        "diff": {
            "anchor_unchanged": alt_only,
            "alts_changed": alts_changed,
            "benchmark_changed": bench_changed,
            "price_changed_flag": price_changed,
            "currency_changed_flag": currency_changed,
        },
        "timeline_events": timeline_events,
        "would_write": would_write,
        "image_refetch": False,
        "ai": False,
        "benchmark_update": benchmark_payload,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist official alternate + public XCG updates (default: dry-run)",
    )
    parser.add_argument("--dry-run", action="store_true", default=True, help=argparse.SUPPRESS)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--listing-ids",
        type=str,
        default=None,
        help="Comma-separated property_listings.id values",
    )
    parser.add_argument(
        "--source",
        choices=ALLOWED_SOURCES,
        default=None,
        help="Limit to one Ready source",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=ROOT / "data" / "raw" / "currency_refresh_cache",
    )
    parser.add_argument(
        "--no-delay",
        action="store_true",
        help="Skip source-friendly delays (tests only)",
    )
    parser.add_argument(
        "--fx-provider",
        choices=("ecb", "fixed"),
        default="ecb",
    )
    parser.add_argument("--eur-rate", type=str, default=None)
    args = parser.parse_args()

    ref = _require_labs()
    apply = bool(args.apply)
    listing_ids = (
        [part.strip() for part in args.listing_ids.split(",") if part.strip()]
        if args.listing_ids
        else None
    )
    if args.fx_provider == "fixed":
        if args.eur_rate is None:
            raise SystemExit("--fx-provider fixed requires --eur-rate")
        eur_provider = FixedEurRateProvider(
            rate=Decimal(args.eur_rate), provider_id="refresh_fixed"
        )
    else:
        eur_provider = EcbEurRateProvider()

    client = _create_client()
    candidates = _load_candidates(
        client,
        source_filter=args.source,
        listing_ids=listing_ids,
        limit=args.limit,
    )

    projections: list[dict[str, Any]] = []
    writes = 0
    for row in candidates:
        source_key = row.get("source_key")
        print(f"refresh {source_key} {row.get('external_id')} ...", flush=True)
        if source_key == "remax_curacao":
            capture = _capture_remax(
                row,
                cache_dir=args.cache_dir / "remax",
                honor_delay=not args.no_delay,
            )
        elif source_key == "keller_williams_curacao":
            capture = _capture_kw(
                row,
                cache_dir=args.cache_dir / "kw",
                honor_delay=not args.no_delay,
            )
        else:
            continue
        projected = _project_row(row, capture, eur_provider=eur_provider)
        projections.append(projected)

        if apply and projected["would_write"]:
            update: dict[str, Any] = {
                "official_alternate_prices": projected["after"]["official_alternate_prices"],
                "updated_at": datetime.now(UTC).isoformat(),
            }
            # Asking identity is retained when already present. Allow one-time
            # recovery when Labs had null original_price and the parser now
            # extracts an explicit source amount (e.g. "Starting from EUR …").
            before_price = projected["before"].get("original_price")
            after_price = projected["after"].get("original_price")
            after_currency = projected["after"].get("original_currency")
            if before_price is None and after_price is not None and after_currency:
                update["original_price"] = after_price
                update["original_currency"] = after_currency
                update["public_eligible"] = True
            if projected.get("benchmark_update"):
                update.update(projected["benchmark_update"])
            client.table("property_listings").update(update).eq(
                "id", row["id"]
            ).execute()
            # Provenance-only: do not insert listing_activity_events.
            writes += 1
            projected["applied"] = True
        else:
            projected["applied"] = False

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "apply" if apply else "dry_run",
        "project_ref": ref,
        "allowed_sources": list(ALLOWED_SOURCES),
        "source_filter": args.source,
        "limit": args.limit,
        "listing_ids": listing_ids,
        "candidate_count": len(candidates),
        "would_write_count": sum(1 for p in projections if p.get("would_write")),
        "applied_count": writes,
        "price_changed_events_emitted": 0,
        "constraints": {
            "no_new_listings": True,
            "no_missing_removal": True,
            "no_ai": True,
            "no_image_refetch": True,
            "official_alt_backfill_not_price_changed": True,
            "idempotent": True,
        },
        "listings": projections,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(
        json.dumps(
            {
                "mode": report["mode"],
                "candidates": report["candidate_count"],
                "would_write": report["would_write_count"],
                "applied": report["applied_count"],
                "price_changed_events": 0,
                "report": str(args.report),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
