"""Fixture-only tests for the Keller Williams Curaçao adapter."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    KellerWilliamsCuracaoAdapter,
    extract_detail_links,
)
from merkado_labs.scrapers.contracts import ListingLifecycleStatus
from tests.fixtures import kw_html

SALE_URL = "https://kw-curacao.com/listings/for-sale/ocean-view-villa-JC-0027"


def test_parses_active_usd_sale() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_USD_SALE,
        listing_url=SALE_URL,
        raw_sha256="a" * 64,
        observed_at=datetime(2026, 7, 17, tzinfo=UTC),
    )
    assert snapshot.external_id == "JC-0027"
    assert snapshot.title == "Ocean View Villa"
    assert snapshot.original_price is not None
    assert str(snapshot.original_price.amount) == "795000"
    assert snapshot.original_price.currency == "USD"
    assert snapshot.bedrooms == 3
    assert snapshot.bathrooms == 2.5
    assert str(snapshot.floor_area_m2) == "186.0"
    assert snapshot.neighbourhood_text == "Jan Thiel"
    assert snapshot.lifecycle_hint == ListingLifecycleStatus.ACTIVE
    assert snapshot.listing_type == "sale"
    assert len(snapshot.image_urls) == 2
    assert snapshot.description == "A waterfront villa. Private pool."
    assert snapshot.latitude is None and snapshot.longitude is None


def test_no_price_is_preserved_as_missing() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_NO_PRICE,
        listing_url="https://kw-curacao.com/listings/for-sale/no-price-ID-008",
        raw_sha256="b" * 64,
    )
    assert snapshot.original_price is None
    assert "no_price_extracted" in snapshot.warnings


def test_sold_and_rent_statuses() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    sold = adapter.parse_listing_html(
        kw_html.DETAIL_SOLD,
        listing_url="https://kw-curacao.com/listings/for-sale/sold-condo-UJ32",
        raw_sha256="c" * 64,
    )
    rent = adapter.parse_listing_html(
        kw_html.DETAIL_RENT,
        listing_url="https://kw-curacao.com/listings/for-rent/rental-apartment-ID-008",
        raw_sha256="d" * 64,
    )
    assert sold.lifecycle_hint == ListingLifecycleStatus.SOLD
    assert rent.listing_type == "rent"


def test_silent_listings_are_excluded() -> None:
    discovered = extract_detail_links(
        kw_html.INDEX_PAGE, index_url="https://kw-curacao.com/listings/for-sale/residential"
    )
    assert [item.external_id for item in discovered] == ["JC-0027", "ID-008"]
    with pytest.raises(ValueError, match="silent-listings"):
        KellerWilliamsCuracaoAdapter().parse_listing_html(
            kw_html.DETAIL_USD_SALE,
            listing_url="https://kw-curacao.com/silent-listings/private-home-UJ32",
            raw_sha256="e" * 64,
        )


def test_sample_detail_fixture_extracts_known_fields() -> None:
    html = (Path(__file__).parent / "fixtures" / "kw_sample_detail.html").read_text(
        encoding="utf-8"
    )
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        html,
        listing_url="https://kw-curacao.com/listings/2-bedroom-condo-seaview-JC-0027",
        raw_sha256="f" * 64,
    )
    assert snapshot.external_id == "JC-0027"
    assert snapshot.original_price is not None
    assert str(snapshot.original_price.amount) == "795000"
    assert snapshot.original_price.currency == "USD"
    assert snapshot.bedrooms == 2
    assert snapshot.bathrooms == 2.5
    assert str(snapshot.floor_area_m2) == "186.0"
    assert snapshot.neighbourhood_text == "Piscadera"
