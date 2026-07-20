"""Fixture tests for Monumentenzorg Curaçao adapter v0.2.0."""

from __future__ import annotations

from pathlib import Path

import pytest

from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (
    ADAPTER_VERSION,
    MonumentenzorgCuracaoAdapter,
    canonicalize_detail_url,
    extract_index_listing_urls,
    extract_sitemap_listing_urls,
    is_heritage_or_excluded_path,
    snapshots_to_catalog_artifact,
)
from merkado_labs.scrapers.contracts import ListingLifecycleStatus, SourceRunOutcome
from merkado_labs.scrapers.lifecycle import compare_complete_success_snapshots
from merkado_labs.scrapers.monumentenzorg_import_preview import build_local_import_preview
from tests.fixtures.monumentenzorg_html import (
    DETAIL_AURA,
    DETAIL_BARGESTRAAT,
    DETAIL_FORT,
    DETAIL_HTML_BY_URL,
    DETAIL_MALFORMED,
    DETAIL_VILLA_MARIA,
    DETAIL_VILLA_WASHINGTON,
    INDEX_HTML,
    SITEMAP_MISMATCH_XML,
    SITEMAP_XML,
)


@pytest.fixture
def adapter(tmp_path: Path) -> MonumentenzorgCuracaoAdapter:
    return MonumentenzorgCuracaoAdapter(cache_dir=tmp_path / "cache")


def test_canonicalize_and_exclusions() -> None:
    assert (
        canonicalize_detail_url("https://www.monumentenzorg.cw/properties/Villa-Maria/")
        == "https://monumentenzorg.cw/properties/villa-maria/"
    )
    assert canonicalize_detail_url("https://monumentenzorg.cw/properties/feed/") is None
    assert canonicalize_detail_url("https://monumentenzorg.cw/properties/x/attachment/") is None
    assert is_heritage_or_excluded_path("https://monumentenzorg.cw/our_property/de-tempel/")
    assert is_heritage_or_excluded_path("https://monumentenzorg.cw/our-properties/")
    assert is_heritage_or_excluded_path("https://monumentenzorg.cw/properties/feed/")


def test_index_sitemap_discovery_and_duplicates(adapter: MonumentenzorgCuracaoAdapter) -> None:
    urls, raw, excluded = extract_index_listing_urls(INDEX_HTML)
    assert len(urls) == 5
    assert raw >= 5
    assert any("feed" in e for e in excluded)
    sm, _ = extract_sitemap_listing_urls(SITEMAP_XML)
    assert set(sm) == set(urls)
    discovery = adapter.discover_catalog(
        cache_dir=adapter.cache_dir,
        mode="complete",
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_XML,
    )
    assert discovery.union_count == 5
    assert discovery.duplicate_count >= 1
    assert discovery.termination_reason == "no_next_page"
    assert discovery.complete_candidate is True


def test_sitemap_index_mismatch_not_complete(adapter: MonumentenzorgCuracaoAdapter) -> None:
    discovery = adapter.discover_catalog(
        cache_dir=adapter.cache_dir,
        mode="complete",
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_MISMATCH_XML,
    )
    assert discovery.complete_candidate is False
    assert any("sitemap_index_mismatch" in e for e in discovery.errors)


def test_parse_numeric_starting_tbd_offers_and_sold(adapter: MonumentenzorgCuracaoAdapter) -> None:
    maria = adapter.parse_listing_html(
        DETAIL_VILLA_MARIA,
        listing_url="https://monumentenzorg.cw/properties/villa-maria/",
        raw_sha256="a" * 64,
    )
    assert maria.external_id == "property-18650"
    assert maria.listing_type == "rent"
    assert maria.original_price is not None
    assert maria.original_price.currency == "ANG"
    assert maria.original_price.amount > 0
    assert maria.raw_payload.get("from_price") is True
    assert maria.bedrooms == 0
    assert maria.bathrooms == 3
    assert maria.latitude is None
    # Similar Listings sold status must not override primary
    assert maria.source_status != "sold_under_reservation"

    barge = adapter.parse_listing_html(
        DETAIL_BARGESTRAAT,
        listing_url="https://monumentenzorg.cw/properties/bargestraat-28-d/",
        raw_sha256="b" * 64,
    )
    assert barge.external_id == "property-19349"
    assert barge.original_price is not None
    assert barge.original_price.currency == "ANG"
    assert barge.public_address_text is None
    assert "no_valid_positive_price" not in barge.warnings

    fort = adapter.parse_listing_html(
        DETAIL_FORT,
        listing_url="https://monumentenzorg.cw/properties/fort-waakzaamheid/",
        raw_sha256="c" * 64,
    )
    assert fort.original_price is None
    assert fort.source_status == "for_rent_price_tbd"
    assert "non_numeric_price_text" in fort.warnings

    aura = adapter.parse_listing_html(
        DETAIL_AURA,
        listing_url="https://monumentenzorg.cw/properties/aura-winkel/",
        raw_sha256="d" * 64,
    )
    assert aura.listing_type == "sale"
    assert aura.source_status == "sold_under_reservation"
    assert aura.lifecycle_hint == ListingLifecycleStatus.SOLD
    assert aura.original_price is None

    wash = adapter.parse_listing_html(
        DETAIL_VILLA_WASHINGTON,
        listing_url="https://monumentenzorg.cw/properties/villawashington/",
        raw_sha256="e" * 64,
    )
    assert wash.source_status == "for_rent_price_tbd"
    assert wash.lifecycle_hint == ListingLifecycleStatus.ACTIVE


def test_images_dedup_and_checksum_stability(adapter: MonumentenzorgCuracaoAdapter) -> None:
    snap = adapter.parse_listing_html(
        DETAIL_VILLA_MARIA,
        listing_url="https://monumentenzorg.cw/properties/villa-maria/",
        raw_sha256="f" * 64,
    )
    assert snap.image_urls
    assert len(snap.image_urls) == len(set(snap.image_urls))
    snap2 = adapter.parse_listing_html(
        DETAIL_VILLA_MARIA,
        listing_url="https://monumentenzorg.cw/properties/villa-maria/",
        raw_sha256="f" * 64,
    )
    assert snap.external_id == snap2.external_id
    assert snap.image_urls == snap2.image_urls
    assert snap.original_price == snap2.original_price


def test_missing_property_id_is_parser_error(adapter: MonumentenzorgCuracaoAdapter) -> None:
    snap = adapter.parse_listing_html(
        DETAIL_MALFORMED,
        listing_url="https://monumentenzorg.cw/properties/broken/",
        raw_sha256="1" * 64,
    )
    assert "missing_wordpress_property_id" in snap.parser_errors


def test_complete_fixture_catalog(adapter: MonumentenzorgCuracaoAdapter) -> None:
    record, snapshots, discovery = adapter.run_catalog(
        cache_dir=adapter.cache_dir,
        dry_run=True,
        honor_delay=False,
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_XML,
        fixture_html_by_url=DETAIL_HTML_BY_URL,
        mode="complete",
    )
    assert record.outcome == SourceRunOutcome.SUCCESS
    assert record.metadata["complete_catalog"] is True
    assert record.is_complete_success is True
    assert record.discovered_count == 5
    assert record.parsed_count == 5
    assert sum(1 for s in snapshots if s.listing_type == "rent") == 4
    assert sum(1 for s in snapshots if s.listing_type == "sale") == 1
    assert sum(1 for s in snapshots if s.has_positive_price) == 2
    assert sum(1 for s in snapshots if not s.has_positive_price) == 3
    assert sum(1 for s in snapshots if s.source_status == "sold_under_reservation") == 1
    assert sum(1 for s in snapshots if s.latitude is not None) == 0
    assert discovery.union_count == 5
    assert ADAPTER_VERSION == "0.2.0"


def test_bounded_run_never_complete(adapter: MonumentenzorgCuracaoAdapter) -> None:
    record, snapshots = adapter.run_bounded(
        listing_urls=list(DETAIL_HTML_BY_URL)[:2],
        cache_dir=adapter.cache_dir,
        dry_run=True,
        max_items=2,
        honor_delay=False,
        fixture_html_by_url=DETAIL_HTML_BY_URL,
    )
    assert record.metadata["complete_catalog"] is False
    assert record.metadata["bounded"] is True
    assert record.is_complete_success is False
    assert record.outcome == SourceRunOutcome.PARTIAL
    assert len(snapshots) == 2


def test_failed_detail_partial(adapter: MonumentenzorgCuracaoAdapter) -> None:
    record, snapshots, _ = adapter.run_catalog(
        cache_dir=adapter.cache_dir,
        dry_run=True,
        honor_delay=False,
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_XML,
        fixture_html_by_url=DETAIL_HTML_BY_URL,
        inject_failures={
            "https://monumentenzorg.cw/properties/villa-maria/": "http_404",
        },
        mode="complete",
    )
    assert record.metadata["complete_catalog"] is False
    assert record.is_complete_success is False
    assert record.outcome == SourceRunOutcome.PARTIAL
    assert record.parsed_count == 4


def test_malformed_detail_partial(adapter: MonumentenzorgCuracaoAdapter) -> None:
    fixtures = dict(DETAIL_HTML_BY_URL)
    fixtures["https://monumentenzorg.cw/properties/villa-maria/"] = DETAIL_MALFORMED
    record, snapshots, _ = adapter.run_catalog(
        cache_dir=adapter.cache_dir,
        dry_run=True,
        honor_delay=False,
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_XML,
        fixture_html_by_url=fixtures,
        mode="complete",
    )
    assert record.metadata["complete_catalog"] is False
    assert record.is_complete_success is False
    assert any("missing_wordpress_property_id" in s.parser_errors for s in snapshots)


def test_partial_run_cannot_drive_lifecycle_absence(
    adapter: MonumentenzorgCuracaoAdapter,
) -> None:
    record, snapshots = adapter.run_bounded(
        listing_urls=list(DETAIL_HTML_BY_URL)[:1],
        cache_dir=adapter.cache_dir,
        dry_run=True,
        max_items=1,
        honor_delay=False,
        fixture_html_by_url=DETAIL_HTML_BY_URL,
    )
    with pytest.raises(ValueError, match="complete successful"):
        compare_complete_success_snapshots(
            previous={},
            current_snapshots={s.external_id: s for s in snapshots},
            run=record,
            removal_threshold=2,
        )


def test_import_preview_public_eligibility(adapter: MonumentenzorgCuracaoAdapter) -> None:
    record, snapshots, discovery = adapter.run_catalog(
        cache_dir=adapter.cache_dir,
        dry_run=True,
        honor_delay=False,
        fixture_index_html=INDEX_HTML,
        fixture_sitemap_xml=SITEMAP_XML,
        fixture_html_by_url=DETAIL_HTML_BY_URL,
        mode="complete",
    )
    artifact = snapshots_to_catalog_artifact(snapshots, run=record, discovery=discovery)
    preview = build_local_import_preview(artifact)
    assert preview["database_access"] is False
    assert preview["complete_catalog"] is True
    assert preview["parsed_count"] == 5
    assert preview["rent_count"] == 4
    assert preview["sale_count"] == 1
    assert preview["numeric_priced_count"] == 2
    assert preview["excluded_no_price_count"] == 3
    assert preview["public_eligible_count"] == 2
    assert preview["readiness_implication"]["operational_ready"] is False
    assert preview["external_id_unique"] is True


def test_complete_rejects_max_items(adapter: MonumentenzorgCuracaoAdapter) -> None:
    with pytest.raises(ValueError, match="rejects max_items"):
        adapter.discover_catalog(
            cache_dir=adapter.cache_dir,
            mode="complete",
            max_items=3,
            fixture_index_html=INDEX_HTML,
            fixture_sitemap_xml=SITEMAP_XML,
        )


def test_adapter_version() -> None:
    assert MonumentenzorgCuracaoAdapter().version == "0.2.0"
