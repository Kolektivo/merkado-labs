"""Tests for RE/MAX BonBini adapter extraction and comparison."""

from __future__ import annotations

from pathlib import Path

from experiments.caribbeanhousehunt_sample.realtor_enrichment.adapters.remax_bonbini import (
    RemaxBonbiniAdapter,
    extract_labelled_rows,
    extract_listing_reference,
    parse_area,
)
from experiments.caribbeanhousehunt_sample.realtor_enrichment.compare import (
    chh_value_for_field,
    compare_field,
)
from experiments.caribbeanhousehunt_sample.realtor_enrichment.run_remax_sample import (
    select_sample,
)

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
"""


def test_parse_area_keeps_unit_without_conversion() -> None:
    value, unit = parse_area("5,167 sq ft")
    assert value == 5167
    assert unit == "sq_ft"


def test_extract_labelled_rows_deterministic() -> None:
    fields = {row.name: row for row in extract_labelled_rows(SAMPLE_HTML)}
    assert fields["bathrooms"].normalized_value == 2
    assert fields["bedrooms"].normalized_value == 2
    assert fields["has_pool"].normalized_value is True
    assert fields["furnished"].normalized_value is True
    assert fields["pets_allowed"].normalized_value is False
    assert fields["floor_area"].normalized_value["unit"] == "sq_ft"
    assert fields["floor_area"].extraction_method == "labelled_html"


def test_listing_reference_from_url() -> None:
    field = extract_listing_reference(
        "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs3080/x.html",
        SAMPLE_HTML,
    )
    assert field is not None
    assert field.normalized_value == "hs3080"
    assert field.extraction_method == "url_path"


def test_compare_bathrooms_enrichment_when_chh_missing() -> None:
    assert compare_field("bathrooms", None, 2) == "enrichment"


def test_compare_bedrooms_match_and_conflict() -> None:
    assert compare_field("bedrooms", 2, 2) == "match"
    assert compare_field("bedrooms", 2, 3) == "conflict"


def test_compare_lot_area_unknown_chh_unit_is_conflict() -> None:
    status = compare_field(
        "lot_area",
        {"value": 0.32, "unit": None},
        {"value": 5000, "unit": "sq_ft", "raw": "5,000 sq ft"},
    )
    assert status == "conflict"


def test_compare_floor_area_with_unit_conversion() -> None:
    # 1200 sq ft ≈ 111.484 m2
    status = compare_field(
        "floor_area",
        {"value": 111.5, "unit": "m2"},
        {"value": 1200, "unit": "sq_ft", "raw": "1,200 sq ft"},
    )
    assert status == "match"


def test_chh_amenity_positive_only() -> None:
    chh = {
        "amenities": [{"code": 11, "label": "Swimming pool", "label_status": "mapped"}]
    }
    assert chh_value_for_field(chh, "has_pool") is True
    assert chh_value_for_field({"amenities": []}, "has_pool") is None


def test_select_sample_caps_and_prefers_diversity() -> None:
    listings = [
        {
            "id": "1",
            "property_type": "apartment",
            "listing_type": "rent",
            "original_realtor_url": "https://www.realestate-curacao.com/a",
        },
        {
            "id": "2",
            "property_type": "home",
            "listing_type": "sale",
            "original_realtor_url": "https://www.realestate-curacao.com/b",
        },
        {
            "id": "3",
            "property_type": "lot",
            "listing_type": "sale",
            "original_realtor_url": "https://www.realestate-curacao.com/c",
        },
        {
            "id": "4",
            "property_type": "commercial",
            "listing_type": "sale",
            "original_realtor_url": "https://example.com/nope",
        },
    ]
    sample = select_sample(listings, limit=5)
    assert len(sample) == 3
    assert {row["id"] for row in sample} == {"1", "2", "3"}


def test_adapter_enrich_uses_cache(tmp_path: Path) -> None:
    cache = tmp_path / "cache"
    cache.mkdir()
    url = "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs9999/demo.html"
    import hashlib

    key = hashlib.sha256(url.encode()).hexdigest()
    (cache / f"{key}.html").write_text(SAMPLE_HTML, encoding="utf-8")
    adapter = RemaxBonbiniAdapter(cache_dir=cache)
    # Bypass robots network by monkeypatching evaluate_robots
    from experiments.caribbeanhousehunt_sample.realtor_enrichment.robots import (
        RobotsDecision,
    )

    adapter.evaluate_robots = lambda listing_url: RobotsDecision(  # type: ignore[method-assign]
        domain="www.realestate-curacao.com",
        robots_url="https://www.realestate-curacao.com/robots.txt",
        fetch_status="ok",
        can_fetch=True,
        crawl_delay_seconds=0.0,
        notes="test",
    )
    result = adapter.enrich(url, use_cache=True, honor_delay=False)
    assert result.status == "ok"
    assert result.metadata["from_cache"] is True
    names = {field.name for field in result.fields}
    assert "bathrooms" in names
    assert "listing_reference" in names
