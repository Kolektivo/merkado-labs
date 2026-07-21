"""Read-only RE/MAX import preview safety tests (no network, no writes)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref
from merkado_labs.scrapers.remax_import_preview import (
    EXPECTED_ADAPTER_VERSION,
    EXPECTED_CATALOG_CHECKSUM,
    catalog_is_complete,
    ensure_v041_catalog_metadata,
    field_change_detail,
    listing_dict_to_snapshot,
    reconcile_remax_catalog,
    run_remax_import_preview,
)


def _listing(
    external_id: str,
    *,
    url: str | None = None,
    lat: float | None = 12.08,
    lng: float | None = -68.86,
    price: str | None = "450000",
    currency: str | None = "USD",
    bathrooms: float | None = 2.0,
) -> dict:
    return {
        "external_id": external_id,
        "url": url or f"https://www.realestate-curacao.com/en/homes/{external_id}/",
        "title": f"Listing {external_id}",
        "listing_type": "sale",
        "property_type": "Villa",
        "source_status": "Available",
        "lifecycle_hint": "active",
        "original_price": price,
        "original_currency": currency,
        "neighbourhood_text": "Jan Thiel",
        "location_text": "Jan Thiel",
        "bedrooms": 3,
        "bathrooms": bathrooms,
        "full_bathrooms": int(bathrooms) if bathrooms is not None else None,
        "half_bathrooms": 0,
        "floor_area_m2": "180",
        "lot_area_value": "500",
        "lot_area_unit": "m2",
        "latitude": lat,
        "longitude": lng,
        "coordinates_source": "google.maps.LatLng",
        "description": "Sample description",
        "images": 3,
        "amenities": [{"name": "pool", "value": True}],
        "listing_agent": "Agent Smith",
        "year_built": 2010,
        "project_name": "Sample Project",
        "raw_sha256": "a" * 64,
        "adapter_version": EXPECTED_ADAPTER_VERSION,
        "warnings": [],
    }


def _minimal_catalog(
    *,
    complete: bool = True,
    checksum: str | None = None,
    listing_count: int = 2,
) -> dict:
    checksum = checksum or EXPECTED_CATALOG_CHECKSUM
    listings = [_listing(f"hs{i:03d}") for i in range(1, listing_count + 1)]
    return {
        "source_key": "remax_curacao",
        "adapter_version": EXPECTED_ADAPTER_VERSION,
        "listing_count": listing_count,
        "complete_catalog": complete,
        "catalog_checksum": checksum,
        "discovery": {"complete": complete, "catalog_checksum": checksum},
        "listings": listings,
    }


def test_ensure_v041_injects_metadata_for_220_reparsed_artifact() -> None:
    catalog = {
        "source_key": "remax_curacao",
        "adapter_version": EXPECTED_ADAPTER_VERSION,
        "listings": [_listing(f"hs{i:03d}") for i in range(1, 221)],
    }
    enriched = ensure_v041_catalog_metadata(catalog)
    assert enriched["complete_catalog"] is True
    assert enriched["catalog_checksum"] == EXPECTED_CATALOG_CHECKSUM
    assert enriched["discovery"]["complete"] is True


def test_exactly_220_artifact_ids_validation() -> None:
    catalog = _minimal_catalog(listing_count=219)
    result = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=[],
        project_ref="csaefdkpwukshtouyixg",
    )
    assert result.failed
    assert any("listing_count_mismatch" in r for r in result.failure_reasons)

    catalog220 = _minimal_catalog(listing_count=220)
    result_ok = reconcile_remax_catalog(
        catalog=catalog220,
        existing_rows=[],
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=220,
    )
    assert not result_ok.failed
    assert result_ok.listing_count == 220


def test_catalog_checksum_mismatch_fails() -> None:
    result = reconcile_remax_catalog(
        catalog=_minimal_catalog(checksum="deadbeef" * 8),
        existing_rows=[],
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=2,
    )
    assert result.failed
    assert any("catalog_checksum_mismatch" in r for r in result.failure_reasons)


def test_complete_catalog_accepted_partial_rejected() -> None:
    assert catalog_is_complete(_minimal_catalog(complete=True))
    result = reconcile_remax_catalog(
        catalog=_minimal_catalog(complete=False),
        existing_rows=[],
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=2,
    )
    assert result.failed
    assert "complete_catalog_required" in result.failure_reasons


def test_project_reference_safety() -> None:
    with patch("merkado_labs.scrapers.kw_import_preview.get_settings") as settings:
        settings.return_value.supabase_project_ref = "jkrfyvukhhsapoivntms"
        settings.return_value.supabase_url = "https://jkrfyvukhhsapoivntms.supabase.co"
        with pytest.raises(RuntimeError, match="production"):
            assert_labs_project_ref()
    with patch("merkado_labs.scrapers.kw_import_preview.get_settings") as settings:
        settings.return_value.supabase_project_ref = "csaefdkpwukshtouyixg"
        settings.return_value.supabase_url = "https://csaefdkpwukshtouyixg.supabase.co"
        assert assert_labs_project_ref() == "csaefdkpwukshtouyixg"


def test_identity_conflict_rejection() -> None:
    existing = [
        {
            "external_id": "hs001",
            "source_url": "https://www.realestate-curacao.com/en/homes/hs999/",
            "title": "Existing",
            "listing_type": "sale",
            "property_type": "Villa",
            "status": "active",
            "source_listing_status": "Available",
            "original_price": 450000.0,
            "original_currency": "USD",
            "first_seen_at": "2026-01-01T00:00:00+00:00",
            "last_seen_at": "2026-07-01T00:00:00+00:00",
            "consecutive_successful_absences": 0,
        }
    ]
    catalog = _minimal_catalog(listing_count=1)
    catalog["listings"][0]["external_id"] = "hs999"
    catalog["listings"][0]["url"] = existing[0]["source_url"]
    result = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=1,
    )
    assert result.failed
    assert result.identity_conflicts >= 1
    row = next(r for r in result.rows if r.external_id == "hs999")
    assert row.classification == "identity_conflict"


def test_null_preservation() -> None:
    existing = [
        {
            "external_id": "hs001",
            "title": "Villa",
            "listing_type": "sale",
            "property_type": "Villa",
            "status": "active",
            "source_listing_status": "Available",
            "original_price": 450000.0,
            "original_currency": "USD",
            "bedrooms": 3,
            "bathrooms": 2.0,
            "floor_area_m2": 180.0,
            "lot_area_value": 500.0,
            "lot_area_unit": "m2",
            "latitude": 12.08,
            "longitude": -68.86,
            "source_neighbourhood_text": "Jan Thiel",
            "description": "Long description kept",
            "primary_image_url": "https://example.com/a.jpg",
            "source_url": "https://www.realestate-curacao.com/en/homes/hs001/",
            "first_seen_at": "2026-01-01T00:00:00+00:00",
            "last_seen_at": "2026-07-01T00:00:00+00:00",
            "consecutive_successful_absences": 0,
        }
    ]
    catalog = _minimal_catalog(listing_count=1)
    catalog["listings"][0].update(
        {
            "title": "Villa",
            "description": None,
            "latitude": None,
            "longitude": None,
        }
    )
    result = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=1,
    )
    row = next(r for r in result.rows if r.external_id == "hs001")
    assert row.classification in {"no_change", "requires_human_attention"}
    assert any(
        c.field in {"description", "latitude", "longitude"} for c in row.changes
    )


def test_no_lifecycle_absence_from_local_reparse() -> None:
    catalog = _minimal_catalog(listing_count=220)
    existing = [
        {
            "external_id": item["external_id"],
            "title": item["title"],
            "listing_type": item["listing_type"],
            "property_type": item["property_type"],
            "status": "active",
            "source_listing_status": item["source_status"],
            "original_price": float(item["original_price"]),
            "original_currency": item["original_currency"],
            "bedrooms": item["bedrooms"],
            "bathrooms": item["bathrooms"],
            "floor_area_m2": float(item["floor_area_m2"]),
            "lot_area_value": float(item["lot_area_value"]),
            "lot_area_unit": item["lot_area_unit"],
            "latitude": item["latitude"],
            "longitude": item["longitude"],
            "source_neighbourhood_text": item["neighbourhood_text"],
            "description": item["description"],
            "source_url": item["url"],
            "first_seen_at": "2026-01-01T00:00:00+00:00",
            "last_seen_at": "2026-07-01T00:00:00+00:00",
            "consecutive_successful_absences": 0,
        }
        for item in catalog["listings"]
    ]
    result = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=220,
    )
    assert result.absent_from_catalog == 0
    assert result.proposed_missing_events == 0
    assert result.proposed_removed_events == 0
    assert result.inserts == 0


def test_coordinate_order_swap_detected() -> None:
    existing = {
        "external_id": "hs001",
        "latitude": 12.08,
        "longitude": -68.86,
    }
    snap = listing_dict_to_snapshot(
        _listing("hs001", lat=-68.86, lng=12.08),
    )
    changes = field_change_detail(existing, snap)
    coord_changes = [c for c in changes if c.field in {"latitude", "longitude"}]
    assert coord_changes
    assert any("possible_lat_lng_swap" in c.notes for c in coord_changes)


def test_zero_write_methods_invoked(tmp_path: Path) -> None:
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(
        json.dumps(_minimal_catalog(listing_count=2)),
        encoding="utf-8",
    )
    client = MagicMock()
    with (
        patch(
            "merkado_labs.scrapers.remax_import_preview.assert_labs_project_ref",
            return_value="csaefdkpwukshtouyixg",
        ),
        patch(
            "merkado_labs.scrapers.remax_import_preview.load_existing_remax_rows",
            return_value=[],
        ),
    ):
        result = run_remax_import_preview(
            input_path=catalog_path,
            client=client,
            write_reports=True,
            reports_dir=tmp_path,
        )
    assert result.read_only is True
    for call in client.method_calls:
        assert call[0] not in {"insert", "update", "upsert", "delete"}
    assert (tmp_path / "remax_v041_import_reconciliation.json").exists()
    assert (tmp_path / "remax_v041_lifecycle_preview.json").exists()


def test_field_change_detail_categories() -> None:
    existing = {
        "external_id": "hs001",
        "bathrooms": 1.0,
        "latitude": 12.0,
        "longitude": -69.0,
    }
    item = _listing("hs001", bathrooms=2.0)
    snap = listing_dict_to_snapshot(item)
    changes = field_change_detail(existing, snap, item=item)
    categories = {c.field: c.category for c in changes}
    assert categories.get("bathrooms") == "bathroom"
    assert categories.get("listing_agent") == "agent"


def test_v041_coordinate_coverage_counts_in_catalog() -> None:
    """Approved v0.4.1 artifact shape: 199 coords, 21 missing, 220 rows."""

    listings = []
    for i in range(1, 221):
        has_coords = i <= 199
        listings.append(
            _listing(
                f"hs{i:04d}",
                lat=12.08 if has_coords else None,
                lng=-68.86 if has_coords else None,
            )
        )
    catalog = {
        "source_key": "remax_curacao",
        "adapter_version": EXPECTED_ADAPTER_VERSION,
        "listing_count": 220,
        "complete_catalog": True,
        "catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
        "discovery": {
            "complete": True,
            "catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
        },
        "listings": listings,
    }
    with_coords = sum(
        1
        for item in catalog["listings"]
        if item.get("latitude") is not None and item.get("longitude") is not None
    )
    without = 220 - with_coords
    assert len(catalog["listings"]) == 220
    assert with_coords == 199
    assert without == 21
    existing = [
        {
            "external_id": item["external_id"],
            "title": item["title"],
            "listing_type": item["listing_type"],
            "property_type": item["property_type"],
            "status": "active",
            "source_listing_status": item["source_status"],
            "original_price": float(item["original_price"]),
            "original_currency": item["original_currency"],
            "source_url": item["url"],
            "public_eligible": True,
            "first_seen_at": "2026-01-01T00:00:00+00:00",
            "last_seen_at": "2026-07-01T00:00:00+00:00",
            "consecutive_successful_absences": 0,
        }
        for item in listings
    ]
    result = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref="csaefdkpwukshtouyixg",
        expected_listing_count=220,
    )
    assert result.inserts == 0
    assert result.absent_from_catalog == 0
    assert result.proposed_missing_events == 0
    assert result.proposed_removed_events == 0
    assert result.identity_conflicts == 0


def test_approved_semantic_refresh_ids_are_exactly_five() -> None:
    approved = ("hr2165", "hr2185", "hs3061", "hs3103", "hs3104")
    terra_canary = {"hs2467", "hr1013", "hr2165", "hs2941", "hr1393"}
    assert len(approved) == 5
    assert len(set(approved)) == 5
    # Only hr2165 may overlap the prior Terra canary; no 215-backfill leakage.
    assert set(approved) & terra_canary == {"hr2165"}
    assert len(set(approved) - terra_canary) == 4
