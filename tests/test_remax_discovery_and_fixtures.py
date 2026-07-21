"""RE/MAX index discovery, detail parsing, and fixture-matrix tests."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from merkado_labs.normalization.currency import FixedEurRateProvider, to_benchmark_xcg
from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.adapters.remax_curacao import (
    RemaxCuracaoAdapter,
    canonicalize_detail_url,
    external_id_from_url,
    extract_detail_links,
)
from merkado_labs.scrapers.contracts import ListingLifecycleStatus, SourceRunOutcome
from merkado_labs.scrapers.lifecycle import (
    ListingLifecycleState,
    compare_complete_success_snapshots,
)
from tests.fixtures.remax_html import (
    DETAIL_EUR_ACTIVE,
    DETAIL_MALFORMED,
    DETAIL_NO_PRICE,
    DETAIL_RENT_MONTHLY,
    DETAIL_RENT_PERIOD_UNCLEAR,
    DETAIL_RENT_RENTED_SOLDPRICE,
    DETAIL_SOLD,
    DETAIL_UNUSUAL_TYPE,
    DETAIL_USD,
    DETAIL_XCG,
    INDEX_PAGE_RENT,
    INDEX_PAGE_SALE,
)

SAMPLE = Path(__file__).parent / "fixtures" / "remax_sample.html"


def test_canonicalize_and_external_id() -> None:
    url = canonicalize_detail_url("/en/homes/homes-for-sale//hs2957/blue-bay-villa.html")
    assert url is not None
    assert "//hs" not in url
    assert external_id_from_url(url) == "hs2957"


def test_index_discovery_dedupes_and_keeps_sold_hint() -> None:
    items = extract_detail_links(
        INDEX_PAGE_SALE,
        index_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/",
    )
    ids = [item.external_id for item in items]
    assert ids.count("hs2957") == 1
    sold = next(item for item in items if item.external_id == "hs2907")
    assert sold.source_status_hint == "sold"
    assert sold.listing_type == "sale"


def test_parse_eur_active_fixture_matrix() -> None:
    adapter = RemaxCuracaoAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_EUR_ACTIVE,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs2957/blue-bay-villa.html"
        ),
        raw_sha256="a" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    assert snap.external_id == "hs2957"
    assert snap.original_price is not None
    assert snap.original_price.currency == "EUR"
    assert snap.bedrooms == 4
    assert snap.bathrooms == 3
    assert snap.neighbourhood_text == "Blue Bay Curacao"
    assert snap.primary_image_url is not None
    assert len(snap.raw_payload["image_urls"]) >= 2
    assert snap.lifecycle_hint == ListingLifecycleStatus.ACTIVE
    assert "coordinates_not_present_in_html" in snap.warnings


def test_currency_fixtures_usd_and_xcg() -> None:
    adapter = RemaxCuracaoAdapter()
    usd = adapter.parse_listing_html(
        DETAIL_USD,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs1/x.html",
        raw_sha256="b" * 64,
    )
    xcg = adapter.parse_listing_html(
        DETAIL_XCG,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs2/x.html",
        raw_sha256="c" * 64,
    )
    assert usd.original_price and usd.original_price.currency == "USD"
    assert xcg.original_price and xcg.original_price.currency in {"XCG", "ANG"}
    provider = FixedEurRateProvider(rate=Decimal("2.00"))
    usd_bench = to_benchmark_xcg(usd.original_price, eur_provider=provider)
    assert usd_bench.amount_xcg == Decimal("350000") * Decimal("1.79")


def test_no_price_excluded_from_public_eligibility() -> None:
    adapter = RemaxCuracaoAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_NO_PRICE,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs3/x.html",
        raw_sha256="d" * 64,
    )
    assert not snap.has_positive_price
    ok, reason = evaluate_public_eligibility(
        status="active",
        original_price=None,
        source_enabled=True,
        source_url=snap.source_url,
    )
    assert not ok and reason == "missing_price"


def test_sold_url_and_fixture() -> None:
    adapter = RemaxCuracaoAdapter()
    snap = adapter.parse_listing_html(
        DETAIL_SOLD,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs2907/sold/sold-home.html"
        ),
        raw_sha256="e" * 64,
    )
    assert snap.lifecycle_hint == ListingLifecycleStatus.SOLD
    assert snap.source_status == "sold"


def test_malformed_and_unusual_type() -> None:
    adapter = RemaxCuracaoAdapter()
    malformed = adapter.parse_listing_html(
        DETAIL_MALFORMED,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs9/x.html",
        raw_sha256="f" * 64,
    )
    assert "no_price_extracted" in malformed.warnings
    unusual = adapter.parse_listing_html(
        DETAIL_UNUSUAL_TYPE,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs8/x.html",
        raw_sha256="g" * 64,
    )
    assert unusual.property_type == "commercial"


def test_partial_run_never_drives_absence_transitions() -> None:
    from merkado_labs.scrapers.contracts import SourceRunRecord

    run = SourceRunRecord(
        source_key="remax_curacao",
        adapter_name="remax_curacao",
        adapter_version="0.3.0",
        started_at=datetime(2026, 7, 16, tzinfo=UTC),
        completed_at=datetime(2026, 7, 16, tzinfo=UTC),
        outcome=SourceRunOutcome.PARTIAL,
        discovered_count=1,
        parsed_count=1,
    )
    previous = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.ACTIVE,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=None,
            sold_at=None,
            removed_at=None,
        )
    }
    try:
        compare_complete_success_snapshots(
            previous=previous,
            current_snapshots={},
            run=run,
        )
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_sample_fixture_still_parses_if_present() -> None:
    if not SAMPLE.exists():
        return
    html = SAMPLE.read_text(encoding="utf-8")
    adapter = RemaxCuracaoAdapter()
    snap = adapter.parse_listing_html(
        html,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-sale/"
            "hs3080/spacious-fixer-upper-villa-in-cas-grandi.html"
        ),
        raw_sha256=hashlib.sha256(html.encode()).hexdigest(),
    )
    assert snap.external_id == "hs3080"
    assert snap.has_positive_price


def test_price_observation_append_only_on_change() -> None:
    from merkado_labs.scrapers.import_pipeline import should_append_price_observation

    append, price_changed, currency_changed = should_append_price_observation(
        is_new=True,
        previous_amount=None,
        previous_currency=None,
        new_amount=100.0,
        new_currency="EUR",
    )
    assert append and price_changed and not currency_changed

    append, price_changed, currency_changed = should_append_price_observation(
        is_new=False,
        previous_amount=100.0,
        previous_currency="EUR",
        new_amount=100.0,
        new_currency="EUR",
    )
    assert not append and not price_changed and not currency_changed

    append, price_changed, currency_changed = should_append_price_observation(
        is_new=False,
        previous_amount=100.0,
        previous_currency="EUR",
        new_amount=120.0,
        new_currency="EUR",
    )
    assert append and price_changed and not currency_changed

    append, price_changed, currency_changed = should_append_price_observation(
        is_new=False,
        previous_amount=100.0,
        previous_currency="EUR",
        new_amount=100.0,
        new_currency="USD",
    )
    assert append and not price_changed and currency_changed


def test_rent_index_and_monthly_period() -> None:
    items = extract_detail_links(
        INDEX_PAGE_RENT,
        index_url="https://www.realestate-curacao.com/en/homes/homes-for-rent/",
    )
    assert [item.external_id for item in items].count("hr2057") == 1
    assert all(item.listing_type == "rent" for item in items)

    adapter = RemaxCuracaoAdapter()
    monthly = adapter.parse_listing_html(
        DETAIL_RENT_MONTHLY,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-rent/"
            "hr2057/jan-thiel-apartment.html"
        ),
        raw_sha256="b" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    assert monthly.listing_type == "rent"
    assert monthly.original_price is not None
    assert monthly.original_price.currency == "EUR"
    assert monthly.original_price.amount == Decimal("2709")
    assert monthly.raw_payload.get("price_period") == "month"
    assert "rental_period_unclear" not in monthly.warnings
    assert monthly.lifecycle_hint != ListingLifecycleStatus.SOLD

    rented = adapter.parse_listing_html(
        DETAIL_RENT_RENTED_SOLDPRICE,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-rent/"
            "hr2140/rented/luxury-apartment.html"
        ),
        raw_sha256="d" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    assert rented.listing_type == "rent"
    assert rented.source_status == "rented"
    assert rented.lifecycle_hint == ListingLifecycleStatus.INACTIVE
    assert rented.original_price is not None
    assert rented.original_price.amount == Decimal("1379")

    unclear = adapter.parse_listing_html(
        DETAIL_RENT_PERIOD_UNCLEAR,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-rent/hr2100/punda.html"
        ),
        raw_sha256="c" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    assert unclear.listing_type == "rent"
    assert unclear.raw_payload.get("price_period") is None
    assert "rental_period_unclear" in unclear.warnings


def test_sale_and_rent_external_ids_do_not_collide() -> None:
    sale = canonicalize_detail_url(
        "/en/homes/homes-for-sale/hs2957/villa.html"
    )
    rent = canonicalize_detail_url(
        "/en/homes/homes-for-rent/hr2957/apt.html"
    )
    assert sale is not None and rent is not None
    assert external_id_from_url(sale) == "hs2957"
    assert external_id_from_url(rent) == "hr2957"
    assert external_id_from_url(sale) != external_id_from_url(rent)


def test_discover_index_fetch_error_marks_incomplete(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Index FetchError mid-pagination must fail closed (no complete_catalog)."""

    from merkado_labs.scrapers.http_cache import CachedFetch, FetchError
    from merkado_labs.scrapers.robots import RobotsDecision

    adapter = RemaxCuracaoAdapter()
    monkeypatch.setattr(
        adapter,
        "evaluate_robots",
        lambda _url: RobotsDecision(
            domain="www.realestate-curacao.com",
            robots_url="https://www.realestate-curacao.com/robots.txt",
            fetch_status="ok",
            can_fetch=True,
            crawl_delay_seconds=None,
            notes="test",
        ),
    )

    calls = {"n": 0}

    def fake_fetch(url: str, **_kwargs: object) -> CachedFetch:
        calls["n"] += 1
        if calls["n"] == 1:
            body = INDEX_PAGE_SALE.encode("utf-8")
            return CachedFetch(
                url=url,
                status=200,
                content_type="text/html",
                body=body,
                sha256=hashlib.sha256(body).hexdigest(),
                elapsed_ms=1.0,
                from_cache=False,
                cache_path=None,
            )
        raise FetchError("simulated index timeout")

    monkeypatch.setattr(
        "merkado_labs.scrapers.adapters.remax_curacao.fetch_url",
        fake_fetch,
    )

    discovered, meta = adapter.discover_listing_urls(
        cache_dir=tmp_path,
        sections=("sale",),
        honor_delay=False,
        use_cache=False,
    )
    assert len(discovered) >= 1
    assert meta["truncated"] is True
    assert meta["complete_catalog"] is False
    assert any(
        isinstance(row.get("error"), str) and "timeout" in row["error"]
        for row in meta["index_evidence"]
    )
