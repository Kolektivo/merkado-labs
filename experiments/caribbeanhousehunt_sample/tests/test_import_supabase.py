"""Focused tests for the bounded Labs Supabase importer."""

from __future__ import annotations

import pytest

from experiments.caribbeanhousehunt_sample.import_supabase import (
    LABS_PROJECT_REF,
    MIN_SNAPSHOT_SIZE,
    _same_value,
    guard_chh_currency_mislabels,
    listing_payload,
    load_sample_artifacts,
    neighbourhood_rows,
    neighbourhood_slug,
    normalize_neighbourhood,
    verify_labs_project,
)
from merkado_labs.config import Settings


def test_latest_snapshot_is_consistent_full_catalog() -> None:
    artifacts = load_sample_artifacts()

    assert len(artifacts.normalized) >= MIN_SNAPSHOT_SIZE
    assert len(artifacts.raw_records) == len(artifacts.normalized)
    assert len(artifacts.raw_by_external_id) == len(artifacts.normalized)
    assert artifacts.snapshot_id == artifacts.snapshot_path.name
    assert artifacts.duplicate_input_ids == ()
    assert len(artifacts.source_sha256) == 64


def test_neighbourhood_normalization_preserves_display_distinction() -> None:
    assert normalize_neighbourhood("  Montaña   Rey ") == "montaña rey"
    assert neighbourhood_slug("Montaña Rey") == "montana-rey"


def test_neighbourhood_slug_collisions_do_not_merge_distinct_names() -> None:
    rows = neighbourhood_rows(
        {"d section": "D section", "d-section": "D-section", "piscadera": "Piscadera"}
    )

    assert len({row["normalized_name"] for row in rows}) == 3
    assert len({row["slug"] for row in rows}) == 3


def test_neighbourhood_slugs_respect_existing_database_reservations() -> None:
    rows = neighbourhood_rows(
        {"blue bay b-section": "Blue Bay B-section"},
        reserved_slugs={"blue-bay-b-section": "blue bay - b-section"},
    )

    assert len(rows) == 1
    assert rows[0]["normalized_name"] == "blue bay b-section"
    assert rows[0]["slug"] != "blue-bay-b-section"
    assert rows[0]["slug"].startswith("blue-bay-b-section-")


def test_database_timestamp_formatting_does_not_trigger_updates() -> None:
    assert _same_value(
        "2026-07-15T13:35:30.42925+00:00",
        "2026-07-15T13:35:30.429250+00:00",
    )


def test_same_value_handles_none_against_numeric() -> None:
    assert _same_value(None, None)
    assert not _same_value(1.5, None)
    assert not _same_value(None, 1.5)
    assert _same_value(1.5, 1.5)


def test_guard_rejects_chh_usd_amount_written_into_price_naf() -> None:
    previous = {"current_price": "410400", "currency": "XCG"}
    item = {"price": 228_000, "currency": "XCG", "normalization_notes": []}

    guarded = guard_chh_currency_mislabels(item, previous)

    assert guarded["price"] == 410_400
    assert guarded["currency"] == "XCG"
    assert guarded["price_guard"] == "chh_usd_mislabeled_as_naf"
    assert any("keeping prior XCG" in note for note in guarded["normalization_notes"])


def test_guard_allows_genuine_xcg_price_drop() -> None:
    previous = {"current_price": 410_400, "currency": "XCG"}
    item = {"price": 390_000, "currency": "XCG"}

    assert guard_chh_currency_mislabels(item, previous) is item


def test_project_guard_requires_exact_labs_ref_and_host() -> None:
    settings = Settings(
        supabase_project_ref=LABS_PROJECT_REF,
        supabase_url=f"https://{LABS_PROJECT_REF}.supabase.co",
    )
    assert verify_labs_project(settings).endswith(".supabase.co")

    with pytest.raises(RuntimeError, match="Labs host"):
        verify_labs_project(
            Settings(
                supabase_project_ref=LABS_PROJECT_REF,
                supabase_url="https://example.supabase.co",
            )
        )
    with pytest.raises(RuntimeError, match="expected Labs ref"):
        verify_labs_project(
            Settings(
                supabase_project_ref="not-labs",
                supabase_url=f"https://{LABS_PROJECT_REF}.supabase.co",
            )
        )


def test_listing_payload_keeps_asset_unlinked_and_id_provisional() -> None:
    artifacts = load_sample_artifacts()
    item = artifacts.normalized[0]
    payload = listing_payload(item, "source-id", None, artifacts.observed_at)

    assert payload["property_asset_id"] is None
    assert payload["external_id"] == item["source_listing_id"]
    assert payload["external_id_status"] == "provisional"
    assert payload["first_seen_at"] == artifacts.observed_at
    assert payload["original_realtor_name"]
    assert payload["original_realtor_domain"]
    assert payload["attribution_method"] == "chh_bulk_json"
    assert isinstance(payload["amenities"], list)
    assert payload["field_provenance"]
    assert payload["data_completeness_score"] is not None


def test_import_record_enriches_legacy_normalized_rows_from_raw() -> None:
    from experiments.caribbeanhousehunt_sample.import_supabase import _as_import_record

    raw = {
        "urlid": 1,
        "id": 9,
        "url_page": "https://example-realtor.com/listing/1",
        "realtor_name": "Example Realty",
        "realtor_id": 7,
        "realtor_filtername": "example",
        "status": "for sale",
        "property_type": "home",
        "bedrooms": 3,
        "floor_area": 120,
        "lot_area": None,
        "neighborhood": "Jan Thiel",
        "lat": 12.0,
        "lng": -68.8,
        "image_url": "x.webp",
        "description": "Legacy row",
        "street": "",
        "house_number": "",
        "resort": "",
        "coordinates_source": "html_page",
        "amenity": [1],
        "price_usd": 250000,
        "price_naf": None,
        "price_eur": None,
        "property_title": "Legacy Home",
    }
    legacy_normalized = {
        "urlid": "1",
        "original_realtor_url": raw["url_page"],
        "listing_type": "sale",
        "property_type": "home",
        "price": 250000,
        "currency": "USD",
        "bedrooms": 3,
        "floor_area_m2": 120,
        "neighbourhood": "Jan Thiel",
        "latitude": 12.0,
        "longitude": -68.8,
        "primary_image_url": (
            "https://caribbeanhousehunt.com/map-assets/property-images/x.webp"
        ),
    }
    item = _as_import_record(legacy_normalized, raw)
    assert item["original_realtor_name"] == "Example Realty"
    assert item["original_realtor_domain"] == "example-realtor.com"
    assert item["amenities"][0]["label"] == "Waterfront"
    assert item["description"] == "Legacy row"
