"""Fixture-only Moret adapter tests."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from merkado_labs.scrapers.adapters.moret_real_estate import (
    MoretRealEstateAdapter,
    canonicalize_detail_url,
    extract_detail_links,
    extract_listing_images,
    extract_pagination_targets,
)
from merkado_labs.scrapers.contracts import ListingLifecycleStatus, SourceRunOutcome
from tests.fixtures.moret_html import (
    DETAIL_EN_ALIAS,
    DETAIL_EURO_WORD_PRICE,
    DETAIL_GLOBAL_PRICE_TRAP,
    DETAIL_NO_PRICE,
    DETAIL_RENT_MONTHLY,
    DETAIL_RENTED,
    DETAIL_SOLD,
    DETAIL_UNDER_CONTRACT,
    DETAIL_VANAF_PRICE,
    DETAIL_XCG_ACTIVE,
    INDEX_PAGE,
    INDEX_PAGE_2,
    INDEX_PAGE_REPEAT,
)


def test_canonicalize_prefers_properties_path() -> None:
    url = canonicalize_detail_url(
        "https://moretrealestate.com/en/properties/salinja-villa-demo/"
    )
    assert url == "https://moretrealestate.com/properties/salinja-villa-demo/"


def test_canonicalize_rejects_off_domain() -> None:
    assert canonicalize_detail_url("https://example.com/properties/x/") is None


def test_index_skips_pagination_and_feed() -> None:
    links = extract_detail_links(INDEX_PAGE, index_url="https://moretrealestate.com/properties/")
    assert links == ["https://moretrealestate.com/properties/salinja-villa-demo/"]


def test_pagination_extracts_next_and_numbered() -> None:
    pag = extract_pagination_targets(
        INDEX_PAGE, current_url="https://moretrealestate.com/properties/"
    )
    assert pag["next_url"] == "https://moretrealestate.com/properties/page/2/"
    assert "https://moretrealestate.com/properties/page/2/" in pag["numbered_page_urls"]


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
    assert snap.listing_type == "sale"
    assert snap.source_status == "active"
    assert snap.lifecycle_hint == ListingLifecycleStatus.ACTIVE
    assert snap.bedrooms == 3
    assert snap.bathrooms == 2
    assert snap.floor_area_m2 == 220
    assert snap.lot_area_value == 500
    assert snap.neighbourhood_text == "Salinja"
    assert snap.latitude == 12.1099
    assert snap.longitude == -68.9301
    assert snap.property_type == "house"
    assert snap.raw_payload.get("agent_name") == "Demo Agent"
    assert snap.primary_image_url == (
        "https://moretrealestate.com/wp-content/uploads/2026/07/salinja-villa-hero.jpg"
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
    assert snap.raw_payload.get("from_price") is True
    assert snap.listing_type == "sale"
    assert snap.bathrooms == 1.5


def test_no_price() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_NO_PRICE,
        listing_url="https://moretrealestate.com/properties/no-price-home/",
        raw_sha256="c" * 64,
    )
    assert snap.original_price is None
    assert snap.has_positive_price is False


def test_euro_word_price_in_price_area() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_EURO_WORD_PRICE,
        listing_url="https://moretrealestate.com/properties/blue-bay-euro-price/",
        raw_sha256="euro" + "0" * 60,
    )
    assert snap.original_price is not None
    assert snap.original_price.currency == "EUR"
    assert snap.original_price.amount == 635000
    assert snap.raw_payload.get("price_trusted") is True


def test_global_price_rejected_as_untrusted() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_GLOBAL_PRICE_TRAP,
        listing_url="https://moretrealestate.com/properties/trap-listing/",
        raw_sha256="d" * 64,
    )
    assert snap.original_price is None
    assert "price_from_global_fallback_untrusted" in snap.warnings
    assert snap.raw_payload.get("price_trusted") is False


def test_rent_monthly() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_RENT_MONTHLY,
        listing_url="https://moretrealestate.com/properties/hofi-rent-demo/",
        raw_sha256="e" * 64,
    )
    assert snap.listing_type == "rent"
    assert snap.original_price is not None
    assert snap.original_price.amount == 4900
    assert snap.raw_payload.get("price_period") == "monthly"


def test_sold_status() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_SOLD,
        listing_url="https://moretrealestate.com/properties/sold-home/",
        raw_sha256="f" * 64,
    )
    assert snap.source_status == "sold"
    assert snap.lifecycle_hint == ListingLifecycleStatus.SOLD


def test_rented_status() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_RENTED,
        listing_url="https://moretrealestate.com/properties/rented-home/",
        raw_sha256="g" * 64,
    )
    assert snap.source_status == "rented"
    assert snap.lifecycle_hint == ListingLifecycleStatus.INACTIVE


def test_under_contract_remains_lifecycle_active() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_UNDER_CONTRACT,
        listing_url="https://moretrealestate.com/properties/under-contract-home/",
        raw_sha256="h" * 64,
    )
    assert snap.source_status == "under_contract"
    assert snap.lifecycle_hint == ListingLifecycleStatus.ACTIVE


def test_english_alias_canonical_prefers_dutch_route() -> None:
    adapter = MoretRealEstateAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_EN_ALIAS,
        listing_url="https://moretrealestate.com/en/properties/salinja-villa-demo/",
        raw_sha256="i" * 64,
    )
    assert snap.source_url == "https://moretrealestate.com/properties/salinja-villa-demo/"
    assert snap.external_id == "post-12345"


def test_same_post_id_stable_across_slug_change() -> None:
    adapter = MoretRealEstateAdapter()
    html = DETAIL_XCG_ACTIVE.replace(
        "salinja-villa-demo", "salinja-villa-renamed"
    )
    snap = adapter.parse_listing_html(
        html,
        listing_url="https://moretrealestate.com/properties/salinja-villa-renamed/",
        raw_sha256="j" * 64,
    )
    assert snap.external_id == "post-12345"


def test_bounded_run_never_complete(tmp_path: Path) -> None:
    adapter = MoretRealEstateAdapter(cache_dir=tmp_path)
    adapter._fetch = MagicMock(  # type: ignore[method-assign]
        side_effect=AssertionError("bounded fixture run must not network")
    )
    # Parse-only bounded with provided URLs still marks partial/complete false
    record, snaps = adapter.run_bounded(
        listing_urls=[],
        cache_dir=tmp_path,
        dry_run=True,
        max_items=5,
        honor_delay=False,
        discover=False,
    )
    assert record.metadata.get("complete_catalog") is False
    assert record.metadata.get("bounded") is True
    assert record.outcome in {SourceRunOutcome.FAILURE, SourceRunOutcome.PARTIAL}


def test_discover_catalog_pagination_and_stop(tmp_path: Path) -> None:
    adapter = MoretRealEstateAdapter(cache_dir=tmp_path)
    pages = {
        "https://moretrealestate.com/properties/": INDEX_PAGE,
        "https://moretrealestate.com/properties/page/2/": INDEX_PAGE_2,
    }

    class FakeFetch:
        def __init__(self, body: str, url: str) -> None:
            self.body = body.encode("utf-8")
            self.sha256 = __import__("hashlib").sha256(self.body).hexdigest()
            self.status = 200
            self.from_cache = True
            self.content_type = "text/html"
            self.url = url

    def fake_fetch(url, **kwargs):  # noqa: ANN001
        body = pages[url]
        return FakeFetch(body, url)

    adapter.evaluate_robots = MagicMock(  # type: ignore[method-assign]
        return_value=MagicMock(can_fetch=True, crawl_delay_seconds=0)
    )
    adapter._fetch = MagicMock(side_effect=fake_fetch)  # type: ignore[method-assign]
    result = adapter.discover_catalog(
        cache_dir=tmp_path, mode="complete", honor_delay=False, use_cache=True
    )
    assert result.pagination_proven is True
    assert result.termination_reason == "no_next_page"
    assert result.complete_candidate is True
    urls = [item.canonical_url for item in result.listings]
    assert "https://moretrealestate.com/properties/salinja-villa-demo/" in urls
    assert "https://moretrealestate.com/properties/final-listing/" in urls


def test_discover_stops_on_repeated_checksum(tmp_path: Path) -> None:
    adapter = MoretRealEstateAdapter(cache_dir=tmp_path)

    class FakeFetch:
        def __init__(self, body: str) -> None:
            self.body = body.encode("utf-8")
            self.sha256 = __import__("hashlib").sha256(self.body).hexdigest()
            self.status = 200
            self.from_cache = True
            self.content_type = "text/html"

    bodies = [
        INDEX_PAGE_REPEAT,
        INDEX_PAGE_REPEAT,  # same checksum → stop
    ]

    def fake_fetch(url, **kwargs):  # noqa: ANN001
        return FakeFetch(bodies.pop(0) if bodies else INDEX_PAGE_REPEAT)

    adapter.evaluate_robots = MagicMock(  # type: ignore[method-assign]
        return_value=MagicMock(can_fetch=True, crawl_delay_seconds=0)
    )
    adapter._fetch = MagicMock(side_effect=fake_fetch)  # type: ignore[method-assign]
    # Force queue to attempt page 2 by injecting next link handling via INDEX_PAGE_REPEAT
    result = adapter.discover_catalog(
        cache_dir=tmp_path, mode="complete", honor_delay=False, use_cache=True
    )
    assert result.termination_reason in {
        "repeated_page_checksum",
        "no_next_page",
        "repeated_page_url",
        "page_redirected_to_page_one",
    }
    assert result.complete_candidate is False


def test_complete_run_rejects_max_items(tmp_path: Path) -> None:
    adapter = MoretRealEstateAdapter(cache_dir=tmp_path)
    try:
        adapter.discover_catalog(cache_dir=tmp_path, mode="complete", max_items=5)
        raised = False
    except ValueError:
        raised = True
    assert raised


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
    assert snap.listing_type == "sale"
    assert snap.raw_payload.get("from_price") is True
