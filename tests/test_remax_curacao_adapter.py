"""Tests for the RE/MAX Curaçao direct listing adapter."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from merkado_labs.scrapers.adapters.remax_curacao import (
    RemaxCuracaoAdapter,
    extract_labelled_rows,
    extract_listing_reference,
    extract_price,
    parse_area,
)
from merkado_labs.scrapers.contracts import ListingLifecycleStatus, SourceRunOutcome

FIXTURE = Path(__file__).parent / "fixtures" / "remax_sample.html"

SAMPLE_HTML = """
<table>
<tr><td>Bedrooms:</td><td itemprop='numberOfRooms'>2</td></tr>
<tr><td>Bathrooms:</td><td >2</td></tr>
<tr><td>Available:</td><td >Immediately</td></tr>
<tr><td>Living space:</td><td >1,200 sq ft</td></tr>
<tr><td>Lot size:</td><td >5,000 sq ft</td></tr>
<tr><td>Furnished:</td><td >Yes</td></tr>
<tr><td>Pool:</td><td >Yes</td></tr>
<tr><td>Gated resort:</td><td >Yes</td></tr>
<tr><td>Pets allowed:</td><td >No</td></tr>
<tr><td>Sea view:</td><td >Yes</td></tr>
</table>
<p itemprop="price" class="price "> &euro; 480.232</p>
"""


def test_parse_area_keeps_unit_without_conversion() -> None:
    value, unit = parse_area("5,167 sq ft")
    assert value == 5167
    assert unit == "sq_ft"


def test_extract_labelled_rows_deterministic() -> None:
    fields = {row.field_name: row for row in extract_labelled_rows(SAMPLE_HTML)}
    assert fields["bathrooms"].normalized_value == 2
    assert fields["bedrooms"].normalized_value == 2
    assert fields["has_pool"].normalized_value is True
    assert fields["floor_area"].normalized_value["unit"] == "sq_ft"


def test_listing_reference_and_price_from_html() -> None:
    url = "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs3080/x.html"
    ref = extract_listing_reference(url, SAMPLE_HTML)
    assert ref is not None
    assert ref.normalized_value == "hs3080"
    price = extract_price(SAMPLE_HTML)
    assert price is not None
    assert price.normalized_value["currency"] == "EUR"
    assert price.normalized_value["amount"] == "480232"


def test_parse_fixture_listing_is_public_priced() -> None:
    html = FIXTURE.read_text(encoding="utf-8")
    adapter = RemaxCuracaoAdapter()
    snapshot = adapter.parse_listing_html(
        html,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-sale/"
            "hs3080/spacious-fixer-upper-villa-in-cas-grandi.html"
        ),
        raw_sha256="b" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    assert snapshot.source_key == "remax_curacao"
    assert snapshot.external_id == "hs3080"
    assert snapshot.has_positive_price
    assert snapshot.original_price is not None
    assert snapshot.original_price.currency == "EUR"
    assert snapshot.lifecycle_hint == ListingLifecycleStatus.ACTIVE
    assert snapshot.listing_type == "sale"


def test_bounded_run_without_urls_is_success_empty() -> None:
    adapter = RemaxCuracaoAdapter()
    record, snapshots = adapter.run_bounded(
        listing_urls=[],
        cache_dir=Path("data/raw/remax_curacao/cache"),
        dry_run=True,
        max_items=0,
        honor_delay=False,
    )
    assert record.outcome == SourceRunOutcome.SUCCESS
    assert snapshots == []
