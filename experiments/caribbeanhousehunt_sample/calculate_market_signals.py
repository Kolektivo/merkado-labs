"""Calculate monthly XCG rent per m² signals from normalized Labs listings."""

from __future__ import annotations

import argparse
import calendar
import json
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import date, datetime
from decimal import Decimal
from statistics import median
from typing import Any
from urllib.parse import urlparse

from merkado_labs.config import Settings

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
SIGNAL_TYPE = "monthly_rent_per_m2"
CURRENCY = "XCG"
UNIT = "XCG_per_m2_month"
DEFAULT_CALCULATION_VERSION = "v2"
MIN_RENT_PER_M2 = Decimal("1")
MAX_RENT_PER_M2 = Decimal("150")
PAGE_SIZE = 500


def verify_labs_project(settings: Settings) -> str:
    """Return the allowlisted Labs URL or stop before database access."""

    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError(f"Refusing database access outside Labs ref {LABS_PROJECT_REF!r}.")
    if settings.supabase_url is None:
        raise RuntimeError("SUPABASE_URL is required.")
    url = str(settings.supabase_url).rstrip("/")
    parsed = urlparse(url)
    expected_host = f"{LABS_PROJECT_REF}.supabase.co"
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise RuntimeError(f"Refusing database access outside Labs host {expected_host!r}.")
    return url


def batches(values: list[Any], size: int = 100) -> Iterable[list[Any]]:
    """Yield bounded API batches."""

    for start in range(0, len(values), size):
        yield values[start : start + size]


@dataclass(frozen=True)
class Evidence:
    """One listing and latest price observation included in a signal."""

    property_listing_id: str
    price_observation_id: str
    neighbourhood_id: str
    neighbourhood_name: str
    external_id: str
    source_url: str
    observed_price: Decimal
    floor_area_m2: Decimal
    calculated_value: Decimal
    original_neighbourhood_id: str | None = None
    original_neighbourhood_name: str | None = None


@dataclass(frozen=True)
class Rejection:
    """One otherwise qualifying listing excluded by a documented rule."""

    property_listing_id: str
    external_id: str
    neighbourhood_name: str
    reason: str
    calculated_value: Decimal | None


def parse_args() -> argparse.Namespace:
    """Parse calculation options."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Calculate without database writes.")
    parser.add_argument(
        "--period",
        help="Calendar month in YYYY-MM format; defaults to the latest qualifying observation.",
    )
    parser.add_argument(
        "--calculation-version",
        default=DEFAULT_CALCULATION_VERSION,
        help="Version used in the idempotency key.",
    )
    return parser.parse_args()


def month_bounds(value: str) -> tuple[date, date]:
    """Return inclusive calendar-month boundaries."""

    try:
        period_start = datetime.strptime(value, "%Y-%m").date().replace(day=1)
    except ValueError as error:
        raise ValueError("Period must use YYYY-MM.") from error
    period_end = period_start.replace(
        day=calendar.monthrange(period_start.year, period_start.month)[1]
    )
    return period_start, period_end


def quality_status(sample_size: int) -> str:
    """Classify signal quality from its evidence count."""

    if sample_size < 3:
        return "insufficient"
    if sample_size < 5:
        return "limited"
    if sample_size < 10:
        return "usable"
    return "strong"


def _decimal(value: Any) -> Decimal:
    """Convert a database numeric value without binary-float drift."""

    return Decimal(str(value))


def _numeric(value: Decimal) -> float:
    """Create a JSON-compatible numeric value at stable precision."""

    return float(value.quantize(Decimal("0.000001")))


def fetch_all(query: Any) -> list[dict[str, Any]]:
    """Fetch a PostgREST query without silently accepting its row cap."""

    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        page = query.range(start, start + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def listing_audit(listings: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize distinct values, coverage, and base qualification."""

    def counts(field: str) -> dict[str, int]:
        values = Counter(
            "<null>" if row.get(field) is None else str(row[field]) for row in listings
        )
        return dict(sorted(values.items()))

    qualifying = [row for row in listings if is_base_qualifying(row)]
    return {
        "total_listings": len(listings),
        "distinct": {
            "listing_type": counts("listing_type"),
            "currency": counts("currency"),
            "status": counts("status"),
        },
        "coverage": {
            "current_price_present": sum(row.get("current_price") is not None for row in listings),
            "current_price_positive": sum(
                row.get("current_price") is not None
                and _decimal(row["current_price"]) > 0
                for row in listings
            ),
            "floor_area_m2_present": sum(
                row.get("floor_area_m2") is not None for row in listings
            ),
            "floor_area_m2_positive": sum(
                row.get("floor_area_m2") is not None
                and _decimal(row["floor_area_m2"]) > 0
                for row in listings
            ),
            "neighbourhood_id_present": sum(
                row.get("neighbourhood_id") is not None for row in listings
            ),
        },
        "qualifying_listing_count": len(qualifying),
    }


def is_base_qualifying(row: dict[str, Any]) -> bool:
    """Apply the required listing-level qualification rules."""

    return (
        row.get("listing_type") == "rent"
        and row.get("status") == "active"
        and row.get("currency") == CURRENCY
        and row.get("current_price") is not None
        and _decimal(row["current_price"]) > 0
        and row.get("floor_area_m2") is not None
        and _decimal(row["floor_area_m2"]) > 0
        and row.get("neighbourhood_id") is not None
    )


def select_evidence(
    listings: list[dict[str, Any]],
    prices: list[dict[str, Any]],
    period_start: date,
    period_end: date,
) -> tuple[list[Evidence], list[Rejection]]:
    """Select one latest in-period price per listing and reject invalid extremes."""

    prices_by_listing: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in prices:
        observed_date = datetime.fromisoformat(
            str(row["observed_at"]).replace("Z", "+00:00")
        ).date()
        if period_start <= observed_date <= period_end:
            prices_by_listing[str(row["property_listing_id"])].append(row)

    included: list[Evidence] = []
    rejected: list[Rejection] = []
    for listing in listings:
        listing_id = str(listing["id"])
        neighbourhood = listing.get("neighbourhood") or {}
        neighbourhood_name = str(neighbourhood.get("name") or "")
        observations = sorted(
            prices_by_listing.get(listing_id, []),
            key=lambda row: (
                str(row["observed_at"]),
                str(row.get("created_at") or ""),
                str(row["id"]),
            ),
            reverse=True,
        )
        if not observations:
            rejected.append(
                Rejection(
                    listing_id,
                    str(listing["external_id"]),
                    neighbourhood_name,
                    "no price observation in calculation period",
                    None,
                )
            )
            continue

        latest = observations[0]
        if latest.get("currency") != CURRENCY:
            rejected.append(
                Rejection(
                    listing_id,
                    str(listing["external_id"]),
                    neighbourhood_name,
                    "latest price observation currency is not XCG",
                    None,
                )
            )
            continue
        observed_price = _decimal(latest["price"])
        floor_area = _decimal(listing["floor_area_m2"])
        if observed_price <= 0:
            rejected.append(
                Rejection(
                    listing_id,
                    str(listing["external_id"]),
                    neighbourhood_name,
                    "latest observed price is not greater than zero",
                    None,
                )
            )
            continue
        calculated = observed_price / floor_area
        if calculated < MIN_RENT_PER_M2:
            reason = f"rent per m² is below {MIN_RENT_PER_M2} XCG guardrail"
        elif calculated > MAX_RENT_PER_M2:
            reason = f"rent per m² exceeds {MAX_RENT_PER_M2} XCG guardrail"
        else:
            included.append(
                Evidence(
                    property_listing_id=listing_id,
                    price_observation_id=str(latest["id"]),
                    neighbourhood_id=str(listing["neighbourhood_id"]),
                    neighbourhood_name=neighbourhood_name,
                    external_id=str(listing["external_id"]),
                    source_url=str(listing["source_url"]),
                    observed_price=observed_price,
                    floor_area_m2=floor_area,
                    calculated_value=calculated,
                )
            )
            continue
        rejected.append(
            Rejection(
                listing_id,
                str(listing["external_id"]),
                neighbourhood_name,
                reason,
                calculated,
            )
        )
    return included, rejected


def resolve_approved_aliases(alias_rows: list[dict[str, Any]]) -> dict[str, str]:
    """Resolve approved aliases to terminal canonical neighbourhoods."""

    direct = {
        str(row["source_neighbourhood_id"]): str(row["canonical_neighbourhood_id"])
        for row in alias_rows
        if row.get("status") == "approved"
    }
    resolved: dict[str, str] = {}
    for source in direct:
        current = source
        visited: set[str] = set()
        while current in direct:
            if current in visited:
                raise RuntimeError("Approved neighbourhood aliases contain a cycle.")
            visited.add(current)
            current = direct[current]
        resolved[source] = current
    return resolved


def apply_approved_aliases(
    evidence: list[Evidence],
    alias_rows: list[dict[str, Any]],
    neighbourhood_names: dict[str, str],
) -> tuple[list[Evidence], int]:
    """Group evidence by approved aliases while retaining original listing identity."""

    resolved = resolve_approved_aliases(alias_rows)
    grouped: list[Evidence] = []
    aliased_count = 0
    for item in evidence:
        canonical_id = resolved.get(item.neighbourhood_id, item.neighbourhood_id)
        if canonical_id == item.neighbourhood_id:
            grouped.append(item)
            continue
        aliased_count += 1
        grouped.append(
            replace(
                item,
                neighbourhood_id=canonical_id,
                neighbourhood_name=neighbourhood_names[canonical_id],
                original_neighbourhood_id=(
                    item.original_neighbourhood_id or item.neighbourhood_id
                ),
                original_neighbourhood_name=(
                    item.original_neighbourhood_name or item.neighbourhood_name
                ),
            )
        )
    return grouped, aliased_count


def build_signal_rows(
    evidence: list[Evidence],
    rejected: list[Rejection],
    period_start: date,
    period_end: date,
    calculation_version: str,
) -> list[dict[str, Any]]:
    """Aggregate evidence into one signal payload per neighbourhood."""

    grouped: defaultdict[str, list[Evidence]] = defaultdict(list)
    rejected_counts = Counter(item.neighbourhood_name for item in rejected)
    for item in evidence:
        grouped[item.neighbourhood_id].append(item)

    rows = []
    for neighbourhood_id, items in sorted(
        grouped.items(), key=lambda pair: pair[1][0].neighbourhood_name
    ):
        values = sorted(item.calculated_value for item in items)
        sample_size = len(values)
        rows.append(
            {
                "signal_type": SIGNAL_TYPE,
                "neighbourhood_id": neighbourhood_id,
                "neighbourhood_name": items[0].neighbourhood_name,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "currency": CURRENCY,
                "unit": UNIT,
                "sample_size": sample_size,
                "average_value": _numeric(sum(values) / sample_size),
                "median_value": _numeric(median(values)),
                "minimum_value": _numeric(values[0]),
                "maximum_value": _numeric(values[-1]),
                "calculation_version": calculation_version,
                "quality_status": quality_status(sample_size),
                "metadata": {
                    "selection": "latest in-period price observation per listing",
                    "filters": {
                        "listing_type": "rent",
                        "status": "active",
                        "currency": CURRENCY,
                        "current_price_greater_than": 0,
                        "floor_area_m2_greater_than": 0,
                        "known_neighbourhood": True,
                    },
                    "guardrails": {
                        "minimum_inclusive": _numeric(MIN_RENT_PER_M2),
                        "maximum_inclusive": _numeric(MAX_RENT_PER_M2),
                    },
                    "rejected_in_neighbourhood": rejected_counts[items[0].neighbourhood_name],
                },
            }
        )
    return rows


def verify_before_write(settings: Settings) -> None:
    """Re-check the allowlisted project immediately before a database write."""

    verify_labs_project(settings)


def persist_signals(
    client: Any,
    settings: Settings,
    signal_rows: list[dict[str, Any]],
    evidence: list[Evidence],
) -> tuple[int, int]:
    """Idempotently upsert signals and their exact evidence."""

    signal_ids: dict[str, str] = {}
    for row in signal_rows:
        payload = {key: value for key, value in row.items() if key != "neighbourhood_name"}
        verify_before_write(settings)
        stored = (
            client.table("market_signals")
            .upsert(
                payload,
                on_conflict=(
                    "signal_type,neighbourhood_id,period_start,period_end,"
                    "currency,unit,calculation_version"
                ),
            )
            .execute()
            .data
            or []
        )
        if len(stored) != 1:
            raise RuntimeError("Expected one market signal row after upsert.")
        signal_ids[str(row["neighbourhood_id"])] = str(stored[0]["id"])

    evidence_rows = [
        {
            "market_signal_id": signal_ids[item.neighbourhood_id],
            "property_listing_id": item.property_listing_id,
            "price_observation_id": item.price_observation_id,
            "observed_price": _numeric(item.observed_price),
            "floor_area_m2": _numeric(item.floor_area_m2),
            "calculated_value": _numeric(item.calculated_value),
        }
        for item in evidence
    ]
    for evidence_batch in batches(evidence_rows):
        verify_before_write(settings)
        client.table("signal_evidence").upsert(
            evidence_batch,
            on_conflict="market_signal_id,property_listing_id",
        ).execute()
    return len(signal_rows), len(evidence_rows)


def main() -> None:
    """Audit, calculate, and optionally persist the monthly signal."""

    args = parse_args()
    if args.calculation_version == "v1" and not args.dry_run:
        raise RuntimeError("Calculation version v1 is immutable; use a new version.")
    settings = Settings()
    url = verify_labs_project(settings)
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for signal calculation.")

    from supabase import create_client

    client = create_client(url, settings.supabase_secret_key.get_secret_value())
    listings = fetch_all(
        client.table("property_listings").select(
            "id,external_id,source_url,listing_type,current_price,currency,floor_area_m2,"
            "neighbourhood_id,status,neighbourhood:neighbourhoods(name)"
        )
    )
    audit = listing_audit(listings)
    qualifying = [row for row in listings if is_base_qualifying(row)]

    prices: list[dict[str, Any]] = []
    for listing_ids in batches([str(row["id"]) for row in qualifying]):
        prices.extend(
            fetch_all(
                client.table("price_observations")
                .select("id,property_listing_id,observed_at,price,currency,created_at")
                .in_("property_listing_id", listing_ids)
            )
        )
    if not prices:
        raise RuntimeError("No price observations exist for qualifying listings.")

    if args.period:
        period_start, period_end = month_bounds(args.period)
    else:
        latest_observed = max(
            datetime.fromisoformat(str(row["observed_at"]).replace("Z", "+00:00"))
            for row in prices
        )
        period_start, period_end = month_bounds(latest_observed.strftime("%Y-%m"))

    evidence, rejected = select_evidence(qualifying, prices, period_start, period_end)
    groups_before_aliases = len({item.neighbourhood_id for item in evidence})
    aliased_evidence_count = 0
    approved_alias_count = 0
    if args.calculation_version != "v1":
        alias_rows = fetch_all(
            client.table("neighbourhood_aliases").select(
                "source_neighbourhood_id,canonical_neighbourhood_id,status"
            )
        )
        approved_alias_count = sum(row.get("status") == "approved" for row in alias_rows)
        neighbourhood_names = {
            str(row["id"]): str(row["name"])
            for row in fetch_all(client.table("neighbourhoods").select("id,name"))
        }
        evidence, aliased_evidence_count = apply_approved_aliases(
            evidence, alias_rows, neighbourhood_names
        )
    groups_after_aliases = len({item.neighbourhood_id for item in evidence})
    signal_rows = build_signal_rows(
        evidence,
        rejected,
        period_start,
        period_end,
        args.calculation_version,
    )
    for row in signal_rows:
        row["metadata"]["approved_aliases_applied"] = approved_alias_count
        row["metadata"]["evidence_rows_grouped_by_alias"] = aliased_evidence_count
    if not signal_rows:
        raise RuntimeError("No neighbourhood signals remain after validation.")

    quality_counts = Counter(row["quality_status"] for row in signal_rows)
    top_neighbourhoods = sorted(
        (
            {
                "neighbourhood": row["neighbourhood_name"],
                "sample_size": row["sample_size"],
                "quality_status": row["quality_status"],
            }
            for row in signal_rows
        ),
        key=lambda row: (-row["sample_size"], row["neighbourhood"]),
    )[:10]
    summary = {
        "project_ref": LABS_PROJECT_REF,
        "dry_run": args.dry_run,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "calculation_version": args.calculation_version,
        "audit": audit,
        "signals": len(signal_rows),
        "evidence_rows": len(evidence),
        "neighbourhood_groups_before_aliases": groups_before_aliases,
        "neighbourhood_groups_after_aliases": groups_after_aliases,
        "approved_alias_count": approved_alias_count,
        "aliased_evidence_count": aliased_evidence_count,
        "quality_status_counts": dict(sorted(quality_counts.items())),
        "top_10_neighbourhoods": top_neighbourhoods,
        "rejected": [
            {
                "external_id": item.external_id,
                "neighbourhood": item.neighbourhood_name,
                "calculated_value": (
                    _numeric(item.calculated_value) if item.calculated_value is not None else None
                ),
                "reason": item.reason,
            }
            for item in rejected
        ],
    }
    if not args.dry_run:
        created_signals, created_evidence = persist_signals(
            client, settings, signal_rows, evidence
        )
        summary["signals_written"] = created_signals
        summary["evidence_rows_written"] = created_evidence
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
