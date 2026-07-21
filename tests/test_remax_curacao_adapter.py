"""Tests for the RE/MAX Curaçao direct listing adapter."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from merkado_labs.scrapers.adapters.remax_curacao import (
    RemaxCuracaoAdapter,
    extract_coordinates,
    extract_images,
    extract_labelled_rows,
    extract_listing_agent,
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


def test_extract_coordinates_from_google_latlng() -> None:
    html = (
        '<script>var latlng = new google.maps.LatLng(12.0897404, -68.8610007);</script>'
    )
    lat, lng, warnings = extract_coordinates(html)
    assert lat == 12.0897404
    assert lng == -68.8610007
    assert warnings == []


def test_extract_listing_agent_from_employee() -> None:
    html = '<strong itemprop="employee">Rick Seisveld </strong>'
    agent = extract_listing_agent(html)
    assert agent is not None
    assert agent.normalized_value == "Rick Seisveld"


def test_extract_images_filters_agent_headshots() -> None:
    html = """
    <a href="//cdn.remax-abc.com/img/cache/2-1770063802-1000x667.jpg"
       rel="objectimages" data-fancybox="gallary">
      <img src="//cdn.remax-abc.com/img/cache/2-1770063802-607x405.jpg" />
    </a>
    <div id="detail_agentlist">
      <img src="//cdn.remax-abc.com/img/cache/img-7333-2-large-1738598875-112x150.jpg"
           class="agent-image_detail" />
    </div>
    """
    urls = extract_images(html)
    assert len(urls) == 1
    assert "1000x667" in urls[0]
    assert "607x405" not in urls[0]
    assert "img-7333" not in urls[0]


def test_extract_images_prefers_fancybox_href_not_img_src() -> None:
    """Lightbox href + resized img src must not both enter the gallery."""

    html = """
    <a class="item active"
       href="//cdn.remax-abc.com/img/cache/11-1775162488-1000x667.jpg"
       rel="objectimages" data-fancybox="gallary" data-itemindex="0">
      <img src="//cdn.remax-abc.com/img/cache/11-1775162488-607x405.jpg" alt="x" />
    </a>
    <a class="item"
       href="//cdn.remax-abc.com/img/cache/12-1775162489-1000x667.jpg"
       rel="objectimages" data-fancybox="gallary" data-itemindex="1">
      <img src="//cdn.remax-abc.com/img/cache/12-1775162490-607x405.jpg" alt="x" />
    </a>
    """
    urls = extract_images(html)
    assert len(urls) == 2
    assert all("1000x667" in u for u in urls)
    assert all("607x405" not in u for u in urls)


def test_extract_images_fixture_no_longer_doubles_gallery() -> None:
    """Sample detail HTML previously yielded 82 URLs (href+src per slide)."""

    html = FIXTURE.read_text(encoding="utf-8")
    urls = extract_images(html)
    assert len(urls) == 42
    assert all("607x405" not in u and "542x405" not in u for u in urls)
    assert all(u.startswith("https://cdn.remax-abc.com/img/cache/") for u in urls)
    assert len(urls) == len(set(urls))


def test_parse_fixture_extracts_coords_agent_and_half_baths() -> None:
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
    assert snapshot.adapter_version == "0.4.1"
    assert snapshot.latitude == 12.0897404
    assert snapshot.longitude == -68.8610007
    assert snapshot.raw_payload.get("listing_agent") == "Rick Seisveld"
    assert snapshot.raw_payload.get("coordinates_source") == "google_maps_latlng"
    assert all("img-" not in (u or "") for u in snapshot.image_urls)


def test_bounded_run_without_urls_is_not_complete_success() -> None:
    adapter = RemaxCuracaoAdapter()
    record, snapshots = adapter.run_bounded(
        listing_urls=[],
        cache_dir=Path("data/raw/remax_curacao/cache"),
        dry_run=True,
        max_items=0,
        honor_delay=False,
    )
    # Empty/capped runs must never be treated as complete catalog success.
    assert record.outcome in {SourceRunOutcome.PARTIAL, SourceRunOutcome.FAILURE}
    assert record.metadata.get("complete_catalog") is False
    assert not record.is_complete_success
    assert snapshots == []
