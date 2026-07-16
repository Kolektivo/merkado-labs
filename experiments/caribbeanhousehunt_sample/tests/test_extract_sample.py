"""Focused tests for the bounded CaribbeanHouseHunt sample extractor."""

from __future__ import annotations

from pathlib import Path

import pytest

from experiments.caribbeanhousehunt_sample.extract_sample import (
    CONFIG_URL,
    MAX_LISTINGS,
    MAX_REQUESTS,
    RequestBudget,
    discover_listing_urls,
    normalize_listing,
    parse_area,
    parse_number,
    parse_price,
    select_sample,
)

EXPECTED_FIELDS = {
    "source",
    "source_listing_id",
    "source_url",
    "original_realtor_url",
    "listing_type",
    "property_type",
    "title",
    "price",
    "currency",
    "bedrooms",
    "bathrooms",
    "floor_area_m2",
    "lot_area_m2",
    "address",
    "neighbourhood",
    "latitude",
    "longitude",
    "description_snippet",
    "primary_image_url",
    "realtor_name",
    "observed_at",
    "raw_evidence_file",
    "missing_fields",
    "normalization_notes",
}


def test_numeric_parsing() -> None:
    assert parse_number("1,250") == 1250
    assert parse_number("65.5 m²") == 65.5
    assert parse_number("NULL") is None
    assert parse_number(True) is None


def test_price_and_area_parsing() -> None:
    assert parse_price("$ 1,250,000") == 1_250_000
    assert parse_price(-1) is None
    assert parse_area("111 m2") == 111
    assert parse_area(0) is None


def test_normalization_preserves_currency_and_missing_fields() -> None:
    listing = normalize_listing(
        {
            "id": 42,
            "urlid": 101,
            "status": "for rent",
            "property_type": "apartment",
            "price_naf": "1250",
            "bedrooms": "2",
            "street": "Exampleweg",
            "house_number": "7",
            "lat": "12.1",
            "lng": "-68.9",
            "image_url": "sample.webp",
        },
        "2026-07-15T00:00:00+00:00",
    )

    assert listing["source_listing_id"] == "101"
    assert listing["listing_type"] == "rent"
    assert listing["price"] == 1250
    assert listing["currency"] == "XCG"
    assert listing["address"] == "Exampleweg 7"
    assert listing["bathrooms"] is None
    assert "bathrooms" in listing["missing_fields"]
    assert set(listing) == EXPECTED_FIELDS


def test_select_chh_price_prefers_local_xcg_over_usd() -> None:
    from experiments.caribbeanhousehunt_sample.extract_sample import select_chh_price

    price, currency = select_chh_price(
        {"price_usd": 228_000, "price_naf": 410_400, "price_eur": 198_842}
    )

    assert price == 410_400
    assert currency == "XCG"


def test_looks_like_usd_mislabeled_as_xcg_detects_exact_1_8_swap() -> None:
    from experiments.caribbeanhousehunt_sample.extract_sample import (
        looks_like_usd_mislabeled_as_xcg,
    )

    assert looks_like_usd_mislabeled_as_xcg(410_400, 228_000)
    assert looks_like_usd_mislabeled_as_xcg(585_000, 325_000)
    assert not looks_like_usd_mislabeled_as_xcg(410_400, 390_000)
    assert not looks_like_usd_mislabeled_as_xcg(228_000, 410_400)


def test_source_lot_area_is_not_assumed_to_be_square_metres() -> None:
    listing = normalize_listing(
        {"urlid": 1, "lot_area": 0.27},
        "2026-07-15T00:00:00+00:00",
    )

    assert listing["lot_area_m2"] is None
    assert any("source unit is not confirmed" in note for note in listing["normalization_notes"])


def test_deterministic_sample_selection_and_limit() -> None:
    raw = [{"id": value, "urlid": value} for value in range(20)]

    first = select_sample(raw)
    second = select_sample(list(reversed(raw)))

    assert first == second
    assert [item["urlid"] for item in first] == list(range(19, 7, -1))
    assert len(first) == MAX_LISTINGS
    with pytest.raises(ValueError, match="Listing limit"):
        select_sample(raw, MAX_LISTINGS + 1)


def test_data_url_is_resolved_from_captured_script_pattern() -> None:
    config = "const AppConfig = { cachebust: 'abc123' };"
    manager = "fetch(`/map-assets/data/${AppConfig.cachebust}-${lang}.json`)"

    assert discover_listing_urls(config, manager) == [
        "https://caribbeanhousehunt.com/map-assets/data/abc123-en.json"
    ]


def test_request_limit_is_enforced_before_network(tmp_path: Path) -> None:
    budget = RequestBudget(entries=[{} for _ in range(MAX_REQUESTS)])

    with pytest.raises(RuntimeError, match=str(MAX_REQUESTS)):
        budget.fetch_text(CONFIG_URL, tmp_path / "not-present.txt", "test")
