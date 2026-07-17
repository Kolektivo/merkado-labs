"""Centralized dated OpenAI enrichment pricing estimates (Labs).

Amounts are indicative list prices for planning only. Prefer showing estimates
over spending. Never auto-run large paid jobs without user confirmation.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

# Update this date when revising rates.
PRICING_AS_OF = "2026-07-17"

# Indicative USD per 1M tokens (input / output). Adjust when model pricing changes.
MODEL_PRICES_USD_PER_1M: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4.1-mini": (Decimal("0.40"), Decimal("1.60")),
    "gpt-4.1": (Decimal("2.00"), Decimal("8.00")),
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
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


def estimate_enrichment_cost(
    *,
    model: str,
    listing_count: int,
    input_tokens_per_listing: int = DEFAULT_INPUT_TOKENS_PER_LISTING,
    output_tokens_per_listing: int = DEFAULT_OUTPUT_TOKENS_PER_LISTING,
) -> EnrichmentCostEstimate:
    """Estimate cost before a paid run. Does not call OpenAI."""

    if listing_count < 0:
        raise ValueError("listing_count must be >= 0")

    prices = MODEL_PRICES_USD_PER_1M.get(model)
    input_tokens = listing_count * input_tokens_per_listing
    output_tokens = listing_count * output_tokens_per_listing
    if prices is None:
        return EnrichmentCostEstimate(
            model=model,
            listing_count=listing_count,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_usd=Decimal("0"),
            pricing_as_of=PRICING_AS_OF,
            notes=(
                f"Pricing unavailable for model {model!r}. "
                "Do not borrow another model's rates; validate before spending."
            ),
        )

    in_price, out_price = prices
    estimated = (
        (Decimal(input_tokens) / Decimal(1_000_000)) * in_price
        + (Decimal(output_tokens) / Decimal(1_000_000)) * out_price
    ).quantize(Decimal("0.0001"))

    return EnrichmentCostEstimate(
        model=model,
        listing_count=listing_count,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_usd=estimated,
        pricing_as_of=PRICING_AS_OF,
        notes="Indicative estimate from centralized Labs pricing config.",
    )
