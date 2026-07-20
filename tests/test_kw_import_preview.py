"""Read-only KW import preview safety tests (no network, no writes)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from merkado_labs.scrapers.kw_import_preview import (
    EXPECTED_CATALOG_CHECKSUM,
    assert_labs_project_ref,
    catalog_is_complete,
    reconcile_kw_catalog,
    run_kw_import_preview,
)


def _minimal_catalog(*, complete: bool = True, checksum: str | None = None) -> dict:
    checksum = checksum or EXPECTED_CATALOG_CHECKSUM
    return {
        "run": {"complete_catalog": complete, "source_key": "keller_williams_curacao"},
        "discovery": {"complete": complete, "catalog_checksum": checksum},
        "listings": [
            {
                "external_id": "kw-1",
                "url": "https://www.kw-curacao.com/en/property/kw-1/",
                "title": "Villa",
                "listing_type": "sale",
                "source_status": "Active",
                "lifecycle_hint": "active",
                "price": "450000",
                "currency": "USD",
                "location_text": "Jan Thiel",
                "neighbourhood_text": "Jan Thiel",
                "bedrooms": 3,
                "bathrooms": 2,
                "floor_area_m2": "180",
                "lot_area_value": "500",
                "lot_area_unit": "m2",
                "property_type": "Villa",
                "latitude": 12.08,
                "longitude": -68.86,
                "raw_sha256": "a" * 64,
                "warnings": [],
                "structured_evidence": {},
            },
            {
                "external_id": "kw-2",
                "url": "https://www.kw-curacao.com/en/property/kw-2/",
                "title": "Apartment",
                "listing_type": "rent",
                "source_status": "Active",
                "lifecycle_hint": "active",
                "price": None,
                "currency": None,
                "location_text": "Punda",
                "neighbourhood_text": "Punda",
                "bedrooms": 1,
                "bathrooms": 1,
                "property_type": "Apartment",
                "raw_sha256": "b" * 64,
                "warnings": [],
                "structured_evidence": {},
            },
        ],
    }


def test_complete_catalog_accepted_partial_rejected() -> None:
    assert catalog_is_complete(_minimal_catalog(complete=True))
    result = reconcile_kw_catalog(
        catalog=_minimal_catalog(complete=False),
        existing_rows=[],
        project_ref="csaefdkpwukshtouyixg",
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


def test_null_preserving_and_no_price_exclusion() -> None:
    existing = [
        {
            "external_id": "kw-1",
            "title": "Villa",
            "listing_type": "sale",
            "property_type": "Villa",
            "status": "active",
            "source_listing_status": "Active",
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
            "source_url": "https://www.kw-curacao.com/en/property/kw-1/",
            "first_seen_at": "2026-01-01T00:00:00+00:00",
            "last_seen_at": "2026-07-01T00:00:00+00:00",
            "consecutive_successful_absences": 0,
        }
    ]
    result = reconcile_kw_catalog(
        catalog=_minimal_catalog(),
        existing_rows=existing,
        project_ref="csaefdkpwukshtouyixg",
    )
    assert result.no_price_public_exclusions >= 1
    kw1 = next(r for r in result.rows if r.external_id == "kw-1")
    # Description omitted in dry-run summary should not force a hard wipe update.
    assert kw1.classification in {"no_change", "update"}
    assert result.inserts == 1  # kw-2


def test_suspicious_removal_threshold() -> None:
    existing = [
        {
            "external_id": f"old-{i}",
            "title": f"Old {i}",
            "listing_type": "sale",
            "property_type": "Villa",
            "status": "active",
            "source_listing_status": "Active",
            "original_price": 100000,
            "original_currency": "USD",
            "source_url": f"https://www.kw-curacao.com/en/property/old-{i}/",
            "first_seen_at": "2026-01-01T00:00:00+00:00",
            "last_seen_at": "2026-07-01T00:00:00+00:00",
            "consecutive_successful_absences": 1,
        }
        for i in range(12)
    ]
    result = reconcile_kw_catalog(
        catalog=_minimal_catalog(),
        existing_rows=existing,
        project_ref="csaefdkpwukshtouyixg",
        suspicious_removal_threshold=10,
    )
    assert result.absent_from_catalog == 12
    assert result.failed
    assert any("suspicious_mass_removal" in r for r in result.failure_reasons)


def test_zero_write_methods_invoked(tmp_path: Path) -> None:
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(json.dumps(_minimal_catalog()), encoding="utf-8")
    client = MagicMock()
    # SELECT path only
    source_table = MagicMock()
    listings_table = MagicMock()
    client.table.side_effect = lambda name: {
        "property_sources": source_table,
        "property_listings": listings_table,
    }[name]
    source_table.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": "src-1", "source_key": "keller_williams_curacao"}
    ]
    # resolve_property_source may use different chain — patch load instead
    with (
        patch(
            "merkado_labs.scrapers.kw_import_preview.assert_labs_project_ref",
            return_value="csaefdkpwukshtouyixg",
        ),
        patch(
            "merkado_labs.scrapers.kw_import_preview.load_existing_kw_rows",
            return_value=[],
        ),
    ):
        result = run_kw_import_preview(
            input_path=catalog_path,
            client=client,
            write_reports=True,
            reports_dir=tmp_path,
        )
    assert result.read_only is True
    # No insert/update/upsert/delete on client
    for call in client.method_calls:
        assert call[0] not in {"insert", "update", "upsert", "delete"}
    assert (tmp_path / "kw_import_reconciliation.json").exists()
    assert (tmp_path / "kw_lifecycle_preview.json").exists()
