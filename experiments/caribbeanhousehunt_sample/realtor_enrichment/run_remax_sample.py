"""Controlled RE/MAX BonBini enrichment sample (max 5 listings).

Dry-run performs no database writes. Live mode writes enrichment observations
and field conflicts only — never overwrites property_listings values.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))

from experiments.caribbeanhousehunt_sample.realtor_enrichment.adapters.remax_bonbini import (
    ADAPTER_NAME,
    ADAPTER_VERSION,
    RemaxBonbiniAdapter,
)
from experiments.caribbeanhousehunt_sample.realtor_enrichment.compare import (
    chh_value_for_field,
    compare_field,
)
from experiments.caribbeanhousehunt_sample.realtor_enrichment.robots import (
    USER_AGENT,
    check_robots,
    sleep_for_delay,
)

from merkado_labs.config import Settings

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
DOMAIN = "www.realestate-curacao.com"
MAX_SAMPLE = 5
EVIDENCE_DIR = BASE_DIR / "evidence"
CACHE_DIR = BASE_DIR / "cache"


def verify_labs_project(settings: Settings) -> str:
    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError(f"Refusing Supabase access: expected Labs ref {LABS_PROJECT_REF!r}.")
    if settings.supabase_url is None:
        raise RuntimeError("SUPABASE_URL is required.")
    url = str(settings.supabase_url).rstrip("/")
    expected_host = f"{LABS_PROJECT_REF}.supabase.co"
    host = urlparse(url).hostname or ""
    if host != expected_host:
        raise RuntimeError(f"Refusing Supabase access: SUPABASE_URL must use Labs host {expected_host!r}.")
    return url


def select_sample(listings: list[dict[str, Any]], limit: int = MAX_SAMPLE) -> list[dict[str, Any]]:
    """Pick up to 5 diverse RE/MAX listings that already exist in Labs."""

    preferred = [
        ("apartment", "rent"),
        ("home", "sale"),
        ("apartment", "sale"),
        ("lot", "sale"),
        ("commercial", "sale"),
        ("home", "rent"),
    ]
    chosen: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    def eligible(row: dict[str, Any]) -> bool:
        url = row.get("original_realtor_url") or ""
        host = (urlparse(url).hostname or "").lower()
        return host in {DOMAIN, "realestate-curacao.com"} and bool(url.startswith("https://"))

    pool = [row for row in listings if eligible(row)]
    for property_type, listing_type in preferred:
        for row in pool:
            if row["id"] in used_ids:
                continue
            if row.get("property_type") == property_type and row.get("listing_type") == listing_type:
                chosen.append(row)
                used_ids.add(row["id"])
                break
        if len(chosen) >= limit:
            return chosen[:limit]
    for row in pool:
        if row["id"] in used_ids:
            continue
        chosen.append(row)
        used_ids.add(row["id"])
        if len(chosen) >= limit:
            break
    return chosen[:limit]


def load_labs_remax_listings(client: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    for start in range(0, 5000, page_size):
        response = (
            client.table("property_listings")
            .select(
                "id,external_id,title,property_type,listing_type,source_listing_status,"
                "bedrooms,floor_area_m2,lot_area_value,lot_area_unit,resort,amenities,"
                "original_realtor_url,original_realtor_name,original_realtor_domain,"
                "current_price,currency,status"
            )
            .ilike("original_realtor_domain", "%realestate-curacao.com")
            .eq("status", "active")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
    return rows


def build_observation_rows(
    listing: dict[str, Any],
    result: Any,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    provenanced = result.metadata.get("provenanced_fields") or []
    fetch_sha = result.raw_evidence_sha256 or ""
    for field in provenanced:
        chh_value = chh_value_for_field(listing, field["name"])
        status = compare_field(field["name"], chh_value, field["normalized_value"])
        rows.append(
            {
                "property_listing_id": listing["id"],
                "adapter_name": ADAPTER_NAME,
                "adapter_version": ADAPTER_VERSION,
                "source_domain": result.domain,
                "original_url": result.listing_url,
                "field_name": field["name"],
                "raw_value": field["raw_value"],
                "normalized_value": field["normalized_value"],
                "extraction_method": field["extraction_method"],
                "evidence_selector": field["evidence_selector"],
                "evidence_snippet": field["evidence_snippet"],
                "comparison_status": status,
                "chh_value": chh_value,
                "fetch_sha256": fetch_sha,
                "observed_at": result.observed_at,
            }
        )
    return rows


def conflict_rows(observations: list[dict[str, Any]], listing: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for obs in observations:
        if obs["comparison_status"] != "conflict":
            continue
        rows.append(
            {
                "property_listing_id": listing["id"],
                "field_name": obs["field_name"],
                "aggregator_value": obs["chh_value"],
                "original_source_value": obs["normalized_value"],
                "aggregator_source_name": "CaribbeanHouseHunt.com",
                "original_source_name": listing.get("original_realtor_name") or "RE/MAX BonBini",
                "original_source_url": obs["original_url"],
                "discovery_method": f"{ADAPTER_NAME}:{ADAPTER_VERSION}",
                "observed_at": obs["observed_at"],
                "resolution_status": "unresolved",
                "notes": obs.get("evidence_snippet"),
            }
        )
    return rows


def summarize(run: dict[str, Any]) -> dict[str, Any]:
    field_success: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()
    useful_missing = 0
    request_times: list[float] = []
    fetch_ok = 0
    for item in run["results"]:
        if item.get("status") == "ok":
            fetch_ok += 1
        elapsed = item.get("elapsed_ms")
        if isinstance(elapsed, (int, float)) and elapsed > 0:
            request_times.append(float(elapsed))
        for obs in item.get("observations", []):
            field_success[obs["field_name"]] += 1
            status_counts[obs["comparison_status"]] += 1
            if obs["comparison_status"] in {"enrichment", "realtor_only"}:
                useful_missing += 1
    return {
        "adapter": ADAPTER_NAME,
        "adapter_version": ADAPTER_VERSION,
        "domain": DOMAIN,
        "sample_size": len(run["results"]),
        "fetch_success_rate": round(fetch_ok / max(len(run["results"]), 1), 3),
        "extraction_success_per_field": dict(field_success),
        "useful_missing_fields_found": useful_missing,
        "match_count": status_counts.get("match", 0),
        "conflict_count": status_counts.get("conflict", 0),
        "enrichment_count": status_counts.get("enrichment", 0),
        "realtor_only_count": status_counts.get("realtor_only", 0),
        "average_request_ms": round(sum(request_times) / len(request_times), 1)
        if request_times
        else None,
        "status_counts": dict(status_counts),
    }


def run_sample(*, dry_run: bool, limit: int, apply_writes: bool) -> dict[str, Any]:
    settings = Settings()
    url = verify_labs_project(settings)
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for Labs listing reads/writes.")

    from supabase import create_client

    client = create_client(url, settings.supabase_secret_key.get_secret_value())
    listings = load_labs_remax_listings(client)
    sample = select_sample(listings, limit=limit)
    if not sample:
        raise RuntimeError("No eligible RE/MAX BonBini listings found in Labs.")

    adapter = RemaxBonbiniAdapter(cache_dir=CACHE_DIR)
    # Recheck robots once for the domain using the first URL.
    robots = check_robots(sample[0]["original_realtor_url"], user_agent=USER_AGENT)
    if robots.can_fetch is not True:
        raise RuntimeError(f"Robots policy blocks enrichment: {robots.notes}")

    results = []
    all_observations: list[dict[str, Any]] = []
    all_conflicts: list[dict[str, Any]] = []

    for index, listing in enumerate(sample):
        if index > 0:
            sleep_for_delay(robots)
        chh_fields = {
            "bedrooms": listing.get("bedrooms"),
            "floor_area_m2": listing.get("floor_area_m2"),
            "lot_area_value": listing.get("lot_area_value"),
            "lot_area_unit": listing.get("lot_area_unit"),
            "amenities": listing.get("amenities") or [],
            "resort": listing.get("resort"),
            "source_listing_status": listing.get("source_listing_status"),
        }
        result = adapter.enrich(
            listing["original_realtor_url"],
            aggregator_fields=chh_fields,
            use_cache=True,
            honor_delay=False,  # runner already delays
        )
        observations = build_observation_rows(listing, result) if result.status == "ok" else []
        conflicts = conflict_rows(observations, listing)
        all_observations.extend(observations)
        all_conflicts.extend(conflicts)
        results.append(
            {
                "property_listing_id": listing["id"],
                "external_id": listing.get("external_id"),
                "title": listing.get("title"),
                "property_type": listing.get("property_type"),
                "listing_type": listing.get("listing_type"),
                "original_url": listing.get("original_realtor_url"),
                "status": result.status,
                "notes": result.notes,
                "elapsed_ms": (result.metadata or {}).get("elapsed_ms"),
                "from_cache": (result.metadata or {}).get("from_cache"),
                "fetch_sha256": result.raw_evidence_sha256,
                "observations": observations,
                "conflicts": conflicts,
            }
        )

    run = {
        "observed_at": datetime.now(UTC).isoformat(),
        "dry_run": dry_run or not apply_writes,
        "robots": {
            "robots_url": robots.robots_url,
            "can_fetch": robots.can_fetch,
            "fetch_status": robots.fetch_status,
            "crawl_delay_seconds": robots.crawl_delay_seconds,
            "notes": robots.notes,
        },
        "user_agent": USER_AGENT,
        "results": results,
    }
    run["summary"] = summarize(run)

    writes = {"observations_upserted": 0, "conflicts_inserted": 0}
    if apply_writes and not dry_run:
        if all_observations:
            client.table("listing_enrichment_observations").upsert(
                all_observations,
                on_conflict="property_listing_id,adapter_name,adapter_version,field_name,fetch_sha256",
            ).execute()
            writes["observations_upserted"] = len(all_observations)
    if all_conflicts:
            existing = (
                client.table("listing_field_conflicts")
                .select("property_listing_id,field_name")
                .eq("resolution_status", "unresolved")
                .eq("discovery_method", f"{ADAPTER_NAME}:{ADAPTER_VERSION}")
                .execute()
                .data
                or []
            )
            existing_keys = {
                (str(row["property_listing_id"]), str(row["field_name"]))
                for row in existing
            }
            fresh_conflicts = [
                row
                for row in all_conflicts
                if (str(row["property_listing_id"]), str(row["field_name"]))
                not in existing_keys
            ]
            if fresh_conflicts:
                client.table("listing_field_conflicts").insert(fresh_conflicts).execute()
            writes["conflicts_inserted"] = len(fresh_conflicts)
    run["writes"] = writes

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out = EVIDENCE_DIR / f"remax-bonbini-sample-{stamp}.json"
    # Strip bulky repetition for evidence file readability is unnecessary; keep full.
    out.write_text(json.dumps(run, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    run["evidence_path"] = str(out.relative_to(BASE_DIR.parent))
    return run


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch/extract/compare without writing to Labs Supabase.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write enrichment observations and conflicts to Labs (requires explicit flag).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=MAX_SAMPLE,
        help=f"Max listings in the controlled sample (1-{MAX_SAMPLE}).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.limit < 1 or args.limit > MAX_SAMPLE:
        raise SystemExit(f"--limit must be between 1 and {MAX_SAMPLE}")
    if args.apply and args.dry_run:
        raise SystemExit("Use either --dry-run or --apply, not both.")
    apply_writes = bool(args.apply)
    dry_run = bool(args.dry_run) or not apply_writes
    run = run_sample(dry_run=dry_run, limit=args.limit, apply_writes=apply_writes)
    print(json.dumps(run["summary"], indent=2, sort_keys=True))
    print(json.dumps({"dry_run": run["dry_run"], "writes": run["writes"]}, indent=2))
    print(f"Wrote {run['evidence_path']}")


if __name__ == "__main__":
    main()
