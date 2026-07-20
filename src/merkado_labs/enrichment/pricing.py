"""Centralized dated OpenAI enrichment pricing estimates (Labs).

Amounts are indicative list prices for planning only. Prefer showing estimates
over spending. Never auto-run large paid jobs without user confirmation.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

# Update this date when revising rates.
PRICING_AS_OF = "2026-07-17"
PRICING_SOURCE = "labs_configured_model_rates_v1"

# USD per 1M tokens: (input, cached_input, output).
# Output includes reasoning tokens when billed as output.
MODEL_PRICES_USD_PER_1M: dict[str, tuple[Decimal, Decimal, Decimal]] = {
    "gpt-4.1-mini": (Decimal("0.40"), Decimal("0.10"), Decimal("1.60")),
    "gpt-4.1": (Decimal("2.00"), Decimal("0.50"), Decimal("8.00")),
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.075"), Decimal("0.60")),
    "gpt-5.6-terra": (Decimal("2.50"), Decimal("0.25"), Decimal("15.00")),
}

# Conservative average tokens observed / assumed per listing enrichment.
DEFAULT_INPUT_TOKENS_PER_LISTING = 1800
DEFAULT_OUTPUT_TOKENS_PER_LISTING = 700


@dataclass(frozen=True)
class EnrichmentCostEstimate:
    model: str
    listing_count: int
    input_tokens: int
    output_tokens: int
    estimated_usd: Decimal
    pricing_as_of: str
    notes: str
    cached_input_tokens: int = 0
    pricing_source: str = PRICING_SOURCE


def model_prices(model: str) -> tuple[Decimal, Decimal, Decimal] | None:
    """Return (input, cached_input, output) USD/1M rates, or None if unknown."""

    return MODEL_PRICES_USD_PER_1M.get(model)


def calculate_usage_cost_usd(
    *,
    model: str,
    input_tokens: int = 0,
    cached_input_tokens: int = 0,
    output_tokens: int = 0,
) -> tuple[Decimal | None, str | None]:
    """Exact cost from observed token categories. Never borrows another model."""

    prices = model_prices(model)
    if prices is None:
        return None, (
            f"Pricing unavailable for model {model!r}. "
            "Do not borrow another model's rates; validate before spending."
        )
    in_price, cached_price, out_price = prices
    # Prefer billing non-cached input separately when cached tokens are reported.
    billable_input = max(int(input_tokens) - int(cached_input_tokens), 0)
    if cached_input_tokens and input_tokens and cached_input_tokens > input_tokens:
        # Provider reported cached > input; bill all input at cached rate.
        billable_input = 0
        cached_tokens = int(input_tokens)
    else:
        cached_tokens = int(cached_input_tokens)
    cost = (
        (Decimal(billable_input) / Decimal(1_000_000)) * in_price
        + (Decimal(cached_tokens) / Decimal(1_000_000)) * cached_price
        + (Decimal(int(output_tokens)) / Decimal(1_000_000)) * out_price
    ).quantize(Decimal("0.0001"))
    return cost, None


def estimate_enrichment_cost(
    *,
    model: str,
    listing_count: int,
    input_tokens_per_listing: int = DEFAULT_INPUT_TOKENS_PER_LISTING,
    output_tokens_per_listing: int = DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    cached_input_tokens_per_listing: int = 0,
) -> EnrichmentCostEstimate:
    """Estimate cost before a paid run. Does not call OpenAI."""

    if listing_count < 0:
        raise ValueError("listing_count must be >= 0")

    input_tokens = listing_count * input_tokens_per_listing
    output_tokens = listing_count * output_tokens_per_listing
    cached_input_tokens = listing_count * cached_input_tokens_per_listing
    estimated, note = calculate_usage_cost_usd(
        model=model,
        input_tokens=input_tokens,
        cached_input_tokens=cached_input_tokens,
        output_tokens=output_tokens,
    )
    if estimated is None:
        return EnrichmentCostEstimate(
            model=model,
            listing_count=listing_count,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_input_tokens=cached_input_tokens,
            estimated_usd=Decimal("0"),
            pricing_as_of=PRICING_AS_OF,
            pricing_source=PRICING_SOURCE,
            notes=note or "Pricing unavailable",
        )

    return EnrichmentCostEstimate(
        model=model,
        listing_count=listing_count,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cached_input_tokens,
        estimated_usd=estimated,
        pricing_as_of=PRICING_AS_OF,
        pricing_source=PRICING_SOURCE,
        notes="Indicative estimate from centralized Labs pricing config.",
    )


def cost_from_token_usage(
    model: str, token_usage: dict[str, Any]
) -> tuple[float | None, str | None]:
    """Helper for job audit rows."""

    in_t = int(token_usage.get("input_tokens") or 0)
    cached_t = int(
        token_usage.get("cached_input_tokens")
        or token_usage.get("input_tokens_cached")
        or 0
    )
    out_t = int(token_usage.get("output_tokens") or 0)
    # Include separately reported reasoning tokens in output billing when present
    # and not already folded into output_tokens by the provider.
    reasoning = token_usage.get("reasoning_tokens")
    if reasoning is not None and "output_tokens" in token_usage:
        # OpenAI Responses API typically includes reasoning inside output_tokens.
        pass
    estimated, note = calculate_usage_cost_usd(
        model=model,
        input_tokens=in_t,
        cached_input_tokens=cached_t,
        output_tokens=out_t,
    )
    if estimated is None:
        return None, note
    return float(estimated), None
