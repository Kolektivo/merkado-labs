"""Environment-configurable AI budget controls for daily property automation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from merkado_labs.pipeline.sources import CURACAO_TZ


def _env_decimal(name: str, default: str) -> Decimal:
    value = Decimal(os.getenv(name, default))
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    return value


def _env_int(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    return value


PROPERTY_AI_DAILY_BUDGET_USD = _env_decimal("PROPERTY_AI_DAILY_BUDGET_USD", "2")
PROPERTY_AI_MONTHLY_BUDGET_USD = _env_decimal("PROPERTY_AI_MONTHLY_BUDGET_USD", "25")
MAX_LISTINGS_PER_DAILY_RUN = _env_int(
    "PROPERTY_AI_MAX_LISTINGS_PER_DAILY_RUN",
    int(os.getenv("MAX_LISTINGS_PER_DAILY_RUN", "25")),
)


@dataclass(frozen=True)
class BudgetUsage:
    spent_on: date
    daily_cost_usd: Decimal
    monthly_cost_usd: Decimal
    daily_listings_count: int
    monthly_listings_count: int


@dataclass(frozen=True)
class BudgetDecision:
    allowed: bool
    status: str
    reason: str | None
    approved_listings: int
    estimated_cost_usd: Decimal
    daily_remaining_usd: Decimal
    monthly_remaining_usd: Decimal


def load_budget_usage(client: Any, *, spent_on: date | None = None) -> BudgetUsage:
    """Load current-day and calendar-month usage from the Labs spend ledger."""

    day = spent_on or datetime.now(ZoneInfo(CURACAO_TZ)).date()
    rows = (
        client.table("property_pipeline_ai_spend")
        .select("spent_on,listings_count,cost_usd")
        .execute()
        .data
        or []
    )
    daily_cost = Decimal("0")
    monthly_cost = Decimal("0")
    daily_listings = 0
    monthly_listings = 0
    for row in rows:
        try:
            row_day = date.fromisoformat(str(row.get("spent_on")))
        except ValueError:
            continue
        cost = Decimal(str(row.get("cost_usd") or 0))
        listings = int(row.get("listings_count") or 0)
        if row_day.year == day.year and row_day.month == day.month:
            monthly_cost += cost
            monthly_listings += listings
        if row_day == day:
            daily_cost += cost
            daily_listings += listings
    return BudgetUsage(day, daily_cost, monthly_cost, daily_listings, monthly_listings)


def decide_ai_budget(
    *,
    usage: BudgetUsage,
    requested_listings: int,
    estimated_cost_usd: Decimal | float | str = Decimal("0"),
    daily_budget_usd: Decimal = PROPERTY_AI_DAILY_BUDGET_USD,
    monthly_budget_usd: Decimal = PROPERTY_AI_MONTHLY_BUDGET_USD,
    max_listings: int = MAX_LISTINGS_PER_DAILY_RUN,
) -> BudgetDecision:
    """Return a deferral decision without affecting scrape/import success."""

    requested = max(0, int(requested_listings))
    estimated = max(Decimal("0"), Decimal(str(estimated_cost_usd)))
    daily_remaining = max(Decimal("0"), daily_budget_usd - usage.daily_cost_usd)
    monthly_remaining = max(Decimal("0"), monthly_budget_usd - usage.monthly_cost_usd)

    remaining_listings = max(0, max_listings - usage.daily_listings_count)
    # Approve a prefix when some headroom remains; otherwise defer entirely.
    approved = min(requested, remaining_listings)
    reason = None
    if requested == 0:
        approved = 0
    elif remaining_listings <= 0:
        approved = 0
        reason = f"listing_limit:daily_cap={max_listings}"
    elif daily_remaining <= 0:
        approved = 0
        reason = "daily_budget:exhausted"
    elif monthly_remaining <= 0:
        approved = 0
        reason = "monthly_budget:exhausted"
    else:
        # Scale listing approvals by remaining USD when an estimate is provided.
        if estimated > 0 and requested > 0:
            per_listing = estimated / Decimal(requested)
            if per_listing > 0:
                by_daily = int(daily_remaining // per_listing)
                by_monthly = int(monthly_remaining // per_listing)
                approved = min(approved, by_daily, by_monthly)
        if approved <= 0:
            approved = 0
            reason = (
                f"daily_budget:{estimated}>{daily_remaining}"
                if estimated > daily_remaining
                else f"monthly_budget:{estimated}>{monthly_remaining}"
            )
        elif approved < requested:
            reason = f"partial_budget:approved={approved}/{requested}"

    allowed = approved > 0 or requested == 0
    status = "approved" if reason is None else "budget_deferred"
    if reason and reason.startswith("partial_budget:") and approved > 0:
        status = "partial"
        allowed = True

    return BudgetDecision(
        allowed=allowed,
        status=status,
        reason=reason,
        approved_listings=approved if allowed else 0,
        estimated_cost_usd=estimated,
        daily_remaining_usd=daily_remaining,
        monthly_remaining_usd=monthly_remaining,
    )


def record_ai_spend(
    client: Any,
    *,
    pipeline_run_id: str,
    listings_count: int,
    cost_usd: Decimal | float | str,
    spent_on: date | None = None,
) -> dict[str, Any]:
    """Append actual AI spend after enrichment completes."""

    payload = {
        "pipeline_run_id": pipeline_run_id,
        "spent_on": (
            spent_on or datetime.now(ZoneInfo(CURACAO_TZ)).date()
        ).isoformat(),
        "listings_count": max(0, int(listings_count)),
        "cost_usd": float(max(Decimal("0"), Decimal(str(cost_usd)))),
    }
    rows = client.table("property_pipeline_ai_spend").insert(payload).execute().data or []
    return rows[0] if rows else payload
