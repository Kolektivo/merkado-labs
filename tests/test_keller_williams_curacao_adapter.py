"""Fixture-only tests for the Keller Williams Curaçao adapter."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    ADAPTER_VERSION,
    APPROVED_CATEGORY_KEYS,
    KellerWilliamsCuracaoAdapter,
    catalog_checksum_for,
    external_id_from_url,
    extract_detail_links,
    extract_next_page_url,
)
from merkado_labs.scrapers.contracts import ListingLifecycleStatus, SourceRunOutcome
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
    assert snapshot.latitude == 12.085
    assert snapshot.longitude == -68.880
    assert snapshot.adapter_version == ADAPTER_VERSION


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
    discovered, stats = extract_detail_links(
        kw_html.INDEX_PAGE, index_url="https://kw-curacao.com/listings/for-sale/residential"
    )
    assert [item.external_id for item in discovered] == ["JC-0027", "ID-008"]
    assert stats["skipped_silent"] >= 1
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


def test_evidence_backed_external_id_patterns() -> None:
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/villa-east-jan-thiel-JvD-S046"
        )
        == "JVD-S046"
    )
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/bungalow-001JvD"
        )
        == "001JVD"
    )
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/townhouses-SR029JvD"
        )
        == "SR029JVD"
    )
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/garden-apartment-038SR-JvD"
        )
        == "038SR-JVD"
    )
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/rental-apartment-in-the-bloksteeg-in-punda-JvD-046S"
        )
        == "JVD-046S"
    )
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/kaya-seru-waterloo-016"
        )
        == "RLOO-016"
    )
    assert (
        external_id_from_url(
            "https://kw-curacao.com/listings/2-bedroom-condo-seaview-JC-0027"
        )
        == "JC-0027"
    )


def test_next_page_termination_and_extraction() -> None:
    page1 = "https://kw-curacao.com/listings/for-sale/residential"
    assert (
        extract_next_page_url(kw_html.INDEX_SALE_RESIDENTIAL_PAGE1, current_url=page1)
        == "https://kw-curacao.com/listings/for-sale/residential?page=2"
    )
    assert (
        extract_next_page_url(
            kw_html.INDEX_SALE_RESIDENTIAL_PAGE3_FINAL, current_url=page1
        )
        is None
    )


def test_discover_catalog_covers_all_approved_categories_and_pagination() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential=kw_html.INDEX_SALE_RESIDENTIAL_PAGE1,
        residential_page2=kw_html.INDEX_SALE_RESIDENTIAL_PAGE2,
        residential_page3=kw_html.INDEX_SALE_RESIDENTIAL_PAGE3_FINAL,
    )
    discovery = adapter.discover_catalog(
        cache_dir=Path("."),
        honor_delay=False,
        html_by_url=html_by_url,
    )
    assert discovery.categories_seen == APPROVED_CATEGORY_KEYS
    ids = {item.external_id for item in discovery.listings}
    assert {
        "JC-0027",
        "JVD-S046",
        "001JVD",
        "SR029JVD",
        "038SR-JVD",
        "UJ35",
        "PJ010",
        "PJ009",
        "UJ33",
        "UJ32",
        "ID-008",
        "JVD-046S",
        "SW004",
    } <= ids
    assert discovery.duplicate_external_ids >= 1  # JC-0027 across pages/categories
    assert discovery.skipped_silent >= 1
    assert discovery.skipped_off_domain >= 1
    assert discovery.page_loops == 0
    assert discovery.unresolved_no_external_id_urls == []
    assert any(
        warning.startswith("no_id_prefix_duplicate:") for warning in discovery.warnings
    )
    assert discovery.discovery_complete
    assert discovery.catalog_checksum == catalog_checksum_for(discovery.listings)


def test_repeated_page_loop_fails_closed() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential=kw_html.INDEX_SALE_RESIDENTIAL_PAGE1,
        residential_page2=kw_html.INDEX_SALE_RESIDENTIAL_LOOP_PAGE2,
    )
    discovery = adapter.discover_catalog(
        cache_dir=Path("."),
        honor_delay=False,
        html_by_url=html_by_url,
    )
    assert discovery.page_loops >= 1
    assert not discovery.discovery_complete


def test_unexpected_empty_category_is_tracked() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(lots=kw_html.INDEX_EMPTY)
    discovery = adapter.discover_catalog(
        cache_dir=Path("."),
        honor_delay=False,
        html_by_url=html_by_url,
    )
    assert discovery.unexpected_empty_pages >= 1
    assert not discovery.discovery_complete


def test_capped_catalog_run_is_partial() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential=kw_html.INDEX_SALE_RESIDENTIAL_PAGE1,
        residential_page2=kw_html.INDEX_SALE_RESIDENTIAL_PAGE2,
        residential_page3=kw_html.INDEX_SALE_RESIDENTIAL_PAGE3_FINAL,
    )
    detail_html = {
        "https://kw-curacao.com/listings/ocean-view-villa-JC-0027": kw_html.DETAIL_USD_SALE,
        "https://kw-curacao.com/listings/villa-east-jan-thiel-JvD-S046": kw_html.DETAIL_USD_SALE,
        "https://kw-curacao.com/listings/bungalow-001JvD": kw_html.DETAIL_USD_SALE,
    }
    record, snapshots, discovery = adapter.run_catalog(
        cache_dir=Path("."),
        dry_run=True,
        honor_delay=False,
        max_items=3,
        html_by_url=html_by_url,
        detail_html_by_url=detail_html,
    )
    assert discovery.truncated
    assert record.outcome == SourceRunOutcome.PARTIAL
    assert record.metadata["complete_catalog"] is False
    assert record.metadata["bounded"] is True
    assert not record.is_complete_success
    assert len(snapshots) <= 3


def test_complete_catalog_success_fixture_path() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential="""
        <a href="/listings/ocean-view-villa-JC-0027">a</a>
        """,
        lots="""
        <a href="/listings/flat-lot-harmonie-PJ009">b</a>
        """,
        commercial="""
        <a href="/listings/workshop-schottegatweg-UJ32">c</a>
        """,
        rent_residential="""
        <a href="/listings/rental-apartment-ID-008">d</a>
        """,
        rent_commercial="""
        <a href="/listings/retail-unit-SW004">e</a>
        """,
    )
    detail_html = {
        "https://kw-curacao.com/listings/ocean-view-villa-JC-0027": kw_html.DETAIL_USD_SALE,
        "https://kw-curacao.com/listings/flat-lot-harmonie-PJ009": kw_html.DETAIL_USD_SALE,
        "https://kw-curacao.com/listings/workshop-schottegatweg-UJ32": kw_html.DETAIL_USD_SALE,
        "https://kw-curacao.com/listings/rental-apartment-ID-008": kw_html.DETAIL_RENT,
        "https://kw-curacao.com/listings/retail-unit-SW004": kw_html.DETAIL_RENT,
    }
    record, snapshots, discovery = adapter.run_catalog(
        cache_dir=Path("."),
        dry_run=True,
        honor_delay=False,
        html_by_url=html_by_url,
        detail_html_by_url=detail_html,
    )
    assert discovery.discovery_complete
    assert record.outcome == SourceRunOutcome.SUCCESS
    assert record.metadata["complete_catalog"] is True
    assert record.is_complete_success
    assert record.discovered_count == 5
    assert record.parsed_count == 5
    assert len(snapshots) == 5


def test_failed_detail_fetch_is_partial() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential='<a href="/listings/ocean-view-villa-JC-0027">a</a>',
        lots='<a href="/listings/flat-lot-harmonie-PJ009">b</a>',
        commercial='<a href="/listings/workshop-schottegatweg-UJ32">c</a>',
        rent_residential='<a href="/listings/rental-apartment-ID-008">d</a>',
        rent_commercial='<a href="/listings/retail-unit-SW004">e</a>',
    )
    detail_html = {
        "https://kw-curacao.com/listings/ocean-view-villa-JC-0027": kw_html.DETAIL_USD_SALE,
        "https://kw-curacao.com/listings/flat-lot-harmonie-PJ009": kw_html.DETAIL_MALFORMED,
        # missing commercial + rent details => failed fetches
    }
    record, snapshots, _discovery = adapter.run_catalog(
        cache_dir=Path("."),
        dry_run=True,
        honor_delay=False,
        html_by_url=html_by_url,
        detail_html_by_url=detail_html,
    )
    assert record.outcome == SourceRunOutcome.PARTIAL
    assert record.metadata["complete_catalog"] is False
    assert not record.is_complete_success
    assert len(snapshots) < 5


def test_suspicious_catalog_shrinkage_is_partial() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential='<a href="/listings/ocean-view-villa-JC-0027">a</a>',
        lots='<a href="/listings/flat-lot-harmonie-PJ009">b</a>',
        commercial='<a href="/listings/workshop-schottegatweg-UJ32">c</a>',
        rent_residential='<a href="/listings/rental-apartment-ID-008">d</a>',
        rent_commercial='<a href="/listings/retail-unit-SW004">e</a>',
    )
    detail_html = {
        url: kw_html.DETAIL_USD_SALE
        for url in [
            "https://kw-curacao.com/listings/ocean-view-villa-JC-0027",
            "https://kw-curacao.com/listings/flat-lot-harmonie-PJ009",
            "https://kw-curacao.com/listings/workshop-schottegatweg-UJ32",
            "https://kw-curacao.com/listings/rental-apartment-ID-008",
            "https://kw-curacao.com/listings/retail-unit-SW004",
        ]
    }
    record, _snapshots, _discovery = adapter.run_catalog(
        cache_dir=Path("."),
        dry_run=True,
        honor_delay=False,
        html_by_url=html_by_url,
        detail_html_by_url=detail_html,
        prior_catalog_count=40,
        suspicious_shrink_ratio=0.5,
    )
    assert record.outcome == SourceRunOutcome.PARTIAL
    assert record.metadata["suspicious_shrinkage"] is True
    assert record.metadata["complete_catalog"] is False


def test_run_bounded_is_always_partial() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    record, snapshots = adapter.run_bounded(
        listing_urls=[],
        cache_dir=Path("."),
        dry_run=True,
        max_items=5,
        honor_delay=False,
        discover=False,
    )
    # No URLs => failure/partial path, never complete success.
    assert record.metadata["complete_catalog"] is False
    assert record.metadata["bounded"] is True
    assert not record.is_complete_success
    assert snapshots == []


def test_changed_category_and_url_warnings() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    html_by_url = kw_html.approved_catalog_html_by_url(
        residential='<a href="/listings/shared-listing-JC-0027">res</a>',
        lots='<a href="/listings/shared-listing-renamed-JC-0027">lots</a>',
    )
    discovery = adapter.discover_catalog(
        cache_dir=Path("."),
        honor_delay=False,
        html_by_url=html_by_url,
    )
    assert any(warning.startswith("changed_url:JC-0027:") for warning in discovery.warnings)
    assert any(warning.startswith("multi_category:JC-0027:") for warning in discovery.warnings)


def test_off_domain_rejection_in_parser() -> None:
    with pytest.raises(ValueError):
        KellerWilliamsCuracaoAdapter().parse_listing_html(
            kw_html.DETAIL_USD_SALE,
            listing_url="https://example.com/listings/ocean-view-villa-JC-0027",
            raw_sha256="g" * 64,
        )


FIXTURE_LEXICON = (
    ("Jan Thiel", "jan thiel"),
    ("Mambo Beach", "mambo beach"),
    ("Piscadera", "piscadera"),
    ("Otrobanda", "otrobanda"),
    ("Hoenderberg", "hoenderberg"),
    ("Harmonie", "harmonie"),
)


def test_explicit_location_and_enriched_fields() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_USD_SALE,
        listing_url=SALE_URL,
        raw_sha256="a" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.location_text == "Jan Thiel"
    assert snapshot.neighbourhood_text == "Jan Thiel"
    assert snapshot.property_type == "residential"
    assert snapshot.lot_area_value is not None
    assert float(snapshot.lot_area_value) == 450.0
    assert snapshot.latitude == 12.085
    assert snapshot.longitude == -68.880
    assert snapshot.raw_payload.get("agent_name") == "Jarno Ceresa"
    assert snapshot.raw_payload.get("full_bathrooms") == 2.0
    assert snapshot.raw_payload.get("half_bathrooms") == 1.0
    assert snapshot.bathrooms == 2.5
    assert "agent.jpg" not in snapshot.image_urls
    assert len(snapshot.image_urls) == 2
    neigh_fields = [f for f in snapshot.fields if f.field_name == "neighbourhood_text"]
    assert neigh_fields and neigh_fields[0].inferred is False


def test_title_derived_neighbourhood_when_location_generic() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_TITLE_NEIGHBOURHOOD,
        listing_url="https://kw-curacao.com/listings/for-sale/luxury-villa-ID-100",
        raw_sha256="h" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.location_text == "Curaçao"
    assert snapshot.neighbourhood_text == "Mambo Beach"
    assert "generic_location_text" in snapshot.warnings
    neigh_fields = [f for f in snapshot.fields if f.field_name == "neighbourhood_text"]
    assert neigh_fields and neigh_fields[0].inferred is True


def test_description_derived_neighbourhood_candidate() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_DESCRIPTION_NEIGHBOURHOOD,
        listing_url="https://kw-curacao.com/listings/for-sale/family-home-ID-101",
        raw_sha256="i" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.location_text is None
    assert snapshot.neighbourhood_text == "Piscadera"
    evidence = snapshot.structured_evidence["location_evidence"]
    assert evidence["description_alias"]["canonical_name"] == "Piscadera"


def test_dedicated_location_wins_over_inference() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_USD_SALE,
        listing_url="https://kw-curacao.com/listings/for-sale/ocean-view-villa-near-piscadera-JC-0027",
        raw_sha256="j" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.neighbourhood_text == "Jan Thiel"
    assert snapshot.location_text == "Jan Thiel"


def test_title_description_neighbourhood_conflict() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_NEIGHBOURHOOD_CONFLICT,
        listing_url="https://kw-curacao.com/listings/for-sale/conflict-home-ID-102",
        raw_sha256="k" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert any(w.startswith("neighbourhood_alias_conflict:") for w in snapshot.warnings)
    assert snapshot.neighbourhood_text == "Jan Thiel"


def test_no_valid_neighbourhood_match() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_MALFORMED,
        listing_url="https://kw-curacao.com/listings/for-sale/broken-ID-103",
        raw_sha256="l" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.neighbourhood_text is None
    assert "missing_neighbourhood" in snapshot.warnings


def test_coordinates_retained_separately() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_LOTS,
        listing_url="https://kw-curacao.com/listings/for-sale/lot-harmonie-UJ33",
        raw_sha256="m" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.latitude == 12.10
    assert snapshot.longitude == -68.95
    assert snapshot.lot_area_value is not None
    assert float(snapshot.lot_area_value) == 907.0
    assert snapshot.floor_area_m2 is None
    assert snapshot.property_type == "lots_and_land"


def test_under_contract_status() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_UNDER_CONTRACT,
        listing_url="https://kw-curacao.com/listings/for-sale/family-UJ35",
        raw_sha256="n" * 64,
        neighbourhood_lexicon=FIXTURE_LEXICON,
    )
    assert snapshot.source_status == "Under Contract"
    assert snapshot.lifecycle_hint == ListingLifecycleStatus.ACTIVE
    assert "under_contract_label" in snapshot.warnings


def test_original_price_not_converted_value() -> None:
    snapshot = KellerWilliamsCuracaoAdapter().parse_listing_html(
        kw_html.DETAIL_USD_SALE,
        listing_url=SALE_URL,
        raw_sha256="o" * 64,
    )
    assert snapshot.original_price is not None
    assert snapshot.original_price.currency == "USD"
    assert str(snapshot.original_price.amount) == "795000"


def test_robots_fetched_at_most_once_per_host(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    calls: list[str] = []

    def fake_check(url: str) -> object:
        from merkado_labs.scrapers.robots import RobotsDecision

        calls.append(url)
        return RobotsDecision(
            domain="kw-curacao.com",
            robots_url="https://kw-curacao.com/robots.txt",
            fetch_status="ok",
            can_fetch=True,
            crawl_delay_seconds=20.0,
            notes="fixture",
        )

    monkeypatch.setattr(
        "merkado_labs.scrapers.adapters.base.check_robots",
        fake_check,
    )
    first = adapter.evaluate_robots("https://kw-curacao.com/listings/for-sale/residential")
    second = adapter.evaluate_robots("https://kw-curacao.com/listings/a-home-JC-0027")
    third = adapter.evaluate_robots("https://www.kw-curacao.com/listings/b-home-ID-008")
    assert first.can_fetch is True
    assert second is first
    assert third is not first  # www is a distinct host
    assert len(calls) == 2
    assert adapter.request_metrics.robots_fetches == 2
    assert adapter.request_metrics.robots_cache_hits == 1
