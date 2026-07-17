"""Deterministic matching tests (no network, no OpenAI)."""

from __future__ import annotations

from decimal import Decimal

from merkado_labs.matching import (
    ListingMatchCandidate,
    SearchRequestProfile,
    rank_listings,
    score_listing,
    what_fits_me_to_request,
)


def _listing(**overrides: object) -> ListingMatchCandidate:
    base = dict(
        listing_id="l1",
        external_id="hs1",
        listing_type="sale",
        property_type="villa",
        status="active",
        public_eligible=True,
        benchmark_price_xcg=Decimal("500000"),
        bedrooms=3,
        bathrooms=2,
        floor_area_m2=Decimal("180"),
        neighbourhood_text="Salinja",
        amenities=("pool", "parking"),
        title="Villa with pool",
    )
    base.update(overrides)
    return ListingMatchCandidate(**base)  # type: ignore[arg-type]


def test_hard_filter_excludes_over_budget() -> None:
    request = SearchRequestProfile(max_price=Decimal("400000"), transaction_type="sale")
    result = score_listing(request, _listing())
    assert result.hard_pass is False
    assert result.match_score == 0.0


def test_preferred_neighbourhood_boosts_score() -> None:
    request = SearchRequestProfile(
        max_price=Decimal("800000"),
        preferred_neighbourhoods=("Salinja",),
        min_bedrooms=2,
    )
    result = score_listing(request, _listing())
    assert result.hard_pass is True
    assert result.match_score >= 0.7
    assert any("preferred" in r.lower() for r in result.match_reasons)


def test_excluded_neighbourhood_blocks() -> None:
    request = SearchRequestProfile(excluded_neighbourhoods=("Salinja",))
    result = score_listing(request, _listing())
    assert result.hard_pass is False


def test_inactive_not_eligible() -> None:
    request = SearchRequestProfile()
    result = score_listing(request, _listing(status="sold", public_eligible=False))
    assert result.hard_pass is False


def test_rank_orders_by_score() -> None:
    request = SearchRequestProfile(
        max_price=Decimal("900000"),
        preferred_neighbourhoods=("Salinja",),
    )
    a = _listing(listing_id="a", neighbourhood_text="Salinja")
    b = _listing(listing_id="b", neighbourhood_text="Westpunt", bedrooms=4)
    ranked = rank_listings(request, [b, a], limit=10)
    assert ranked[0].listing_id == "a"


def test_what_fits_me_mapping() -> None:
    profile = what_fits_me_to_request(
        budget_max_xcg=Decimal("750000"),
        min_bedrooms=2,
        preferred_neighbourhoods=["Piscadera"],
        renovation_willingness="none",
    )
    assert profile.max_price == Decimal("750000")
    assert profile.min_bedrooms == 2
    assert "move-in ready" in profile.preferences
