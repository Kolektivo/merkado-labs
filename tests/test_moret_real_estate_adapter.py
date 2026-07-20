"""Fixture-only Moret adapter tests."""

from __future__ import annotations

from pathlib import Path

from merkado_labs.scrapers.adapters.moret_real_estate import (
    MoretRealEstateAdapter,
    canonicalize_detail_url,
    extract_detail_links,
    extract_listing_images,
)
from tests.fixtures.moret_html import (
    DETAIL_NO_PRICE,
    DETAIL_VANAF_PRICE,
    DETAIL_XCG_ACTIVE,
    INDEX_PAGE,
)


def test_canonicalize_prefers_properties_path() -> None:
    url = canonicalize_detail_url(
        "https://moretrealestate.com/en/properties/salinja-villa-demo/"
    )
    assert url == "https://moretrealestate.com/properties/salinja-villa-demo/"


def test_index_skips_pagination_and_feed() -> None:
    links = extract_detail_links(INDEX_PAGE, index_url="https://moretrealestate.com/properties/")
    assert links == ["https://moretrealestate.com/properties/salinja-villa-demo/"]


def test_parse_xcg_active() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_XCG_ACTIVE,
        listing_url="https://moretrealestate.com/properties/salinja-villa-demo/",
        raw_sha256="a" * 64,
    )
    assert snap.external_id == "post-12345"
    assert snap.original_price is not None
    assert snap.original_price.currency == "XCG"
    assert snap.original_price.amount == 750000
    assert snap.bedrooms == 3
    assert snap.bathrooms == 2
    assert snap.primary_image_url == (
        "https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-hero.jpg"
    )
    assert snap.image_urls == (
        "https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-hero.jpg",
        "https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-pool.jpg",
    )
    assert all("Logo" not in url for url in snap.image_urls)
    assert all("related-other" not in url for url in snap.image_urls)


def test_extract_images_skips_logo_prefers_gallery() -> None:
    images = extract_listing_images(DETAIL_XCG_ACTIVE)
    assert images[0].endswith("salinja-villa-hero.jpg")
    assert "Logo.png" not in "".join(images)


def test_vanaf_price_warning() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_VANAF_PRICE,
        listing_url="https://moretrealestate.com/properties/sint-jorisbaai-exclusief-wonen/",
        raw_sha256="b" * 64,
    )
    assert snap.original_price is not None
    assert "price_marked_from_vanaf" in snap.warnings


def test_no_price() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_NO_PRICE,
        listing_url="https://moretrealestate.com/properties/no-price-home/",
        raw_sha256="c" * 64,
    )
    assert snap.original_price is None
    assert snap.has_positive_price is False


def test_sample_detail_fixture_if_present() -> None:
    path = Path("tests/fixtures/moret_sample_detail.html")
    if not path.exists():
        return
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        path.read_text(encoding="utf-8"),
        listing_url="https://moretrealestate.com/properties/sint-jorisbaai-exclusief-wonen/",
        raw_sha256="d" * 64,
    )
    assert snap.title
    assert snap.external_id.startswith("post-")
    assert snap.primary_image_url
    assert "Logo" not in (snap.primary_image_url or "")
    assert len(snap.image_urls) >= 2
    assert all("Logo" not in url for url in snap.image_urls)
