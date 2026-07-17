from __future__ import annotations

from decimal import Decimal

from merkado_labs.enrichment.pricing import estimate_enrichment_cost


def test_estimate_scales_with_listing_count() -> None:
    one = estimate_enrichment_cost(model="gpt-4.1-mini", listing_count=1)
    five = estimate_enrichment_cost(model="gpt-4.1-mini", listing_count=5)
    assert five.input_tokens == one.input_tokens * 5
    assert five.output_tokens == one.output_tokens * 5
    assert five.estimated_usd > one.estimated_usd
    assert five.listing_count == 5


def test_twenty_five_listing_estimate_is_bounded() -> None:
    est = estimate_enrichment_cost(model="gpt-4.1-mini", listing_count=25)
    # Rough planning bound; not a spend authorization.
    assert est.estimated_usd < Decimal("1.00")
    assert "Indicative" in est.notes
