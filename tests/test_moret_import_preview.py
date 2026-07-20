"""Unit tests for Moret offline import preview / activation gates."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from merkado_labs.scrapers.moret_import_preview import (
    EXPECTED_CATALOG_CHECKSUM,
    EXPECTED_INSERTS,
    EXPECTED_LISTING_COUNT,
    EXPECTED_UPDATES,
    FORBIDDEN_PROJECT_REF,
    LABS_PROJECT_REF,
    SOURCE_KEY,
    assert_labs_project_ref,
    catalog_is_complete,
    listing_dict_to_snapshot,
    reconcile_moret_catalog,
)
from merkado_labs.scrapers.raw_storage import RAW_EVIDENCE_BUCKET


def _catalog(*, checksum: str | None = None, n: int = 71) -> dict:
    listings = []
    for i in range(n):
        listings.append(
            {
                "external_id": f"post-{70000 + i}",
                "source_url": f"https://moretrealestate.com/properties/demo-{i}/",
                "title": f"Demo {i}",
                "listing_type": "sale" if i % 2 == 0 else "rent",
                "source_status": "active",
                "lifecycle_hint": "active",
                "original_price": "100000" if i % 2 == 0 else "2500",
                "original_currency": "XCG",
                "from_price": i % 15 == 0,
                "price_period": "month" if i % 2 else None,
                "bedrooms": 3,
                "bathrooms": 2,
                "latitude": 12.1 + i * 0.001,
                "longitude": -68.9 - i * 0.001,
                "neighbourhood_text": "Salinja",
                "primary_image_url": f"https://moretrealestate.com/img/{i}.jpg",
                "description_checksum": f"{i:064x}"[:64],
                "raw_sha256": f"{i:064x}"[:64],
            }
        )
    return {
        "adapter_version": "0.2.0",
        "complete_catalog": True,
        "catalog_checksum": checksum or EXPECTED_CATALOG_CHECKSUM,
        "listings": listings,
    }


def test_assert_labs_rejects_production(monkeypatch: pytest.MonkeyPatch) -> None:
    import merkado_labs.scrapers.moret_import_preview as mod

    class _S:
        supabase_project_ref = FORBIDDEN_PROJECT_REF
        supabase_url = f"https://{FORBIDDEN_PROJECT_REF}.supabase.co"

    monkeypatch.setattr(mod, "get_settings", lambda: _S())
    with pytest.raises(RuntimeError, match="production"):
        assert_labs_project_ref()


def test_assert_labs_accepts_labs(monkeypatch: pytest.MonkeyPatch) -> None:
    import merkado_labs.scrapers.moret_import_preview as mod

    class _S:
        supabase_project_ref = LABS_PROJECT_REF
        supabase_url = f"https://{LABS_PROJECT_REF}.supabase.co"

    monkeypatch.setattr(mod, "get_settings", lambda: _S())
    assert assert_labs_project_ref() == LABS_PROJECT_REF


def test_catalog_complete_and_checksum_gate() -> None:
    catalog = _catalog()
    assert catalog_is_complete(catalog) is True
    bad = reconcile_moret_catalog(
        catalog=_catalog(checksum="0" * 64),
        existing_rows=[],
        project_ref=LABS_PROJECT_REF,
    )
    assert bad.failed is True
    assert any("catalog_checksum_mismatch" in r for r in bad.failure_reasons)


def test_first_complete_baseline_no_absence_for_new_majority() -> None:
    catalog = _catalog()
    # Prior bounded sample: five rows that exist in catalog
    existing = [
        {
            "external_id": catalog["listings"][i]["external_id"],
            "source_url": catalog["listings"][i]["source_url"],
            "title": catalog["listings"][i]["title"],
            "listing_type": "rent",  # will update
            "property_type": None,
            "status": "active",
            "source_listing_status": "active",
            "original_price": float(catalog["listings"][i]["original_price"]),
            "original_currency": "XCG",
            "bedrooms": 3,
            "bathrooms": 2,
            "floor_area_m2": None,
            "lot_area_value": None,
            "lot_area_unit": None,
            "latitude": None,
            "longitude": None,
            "source_neighbourhood_text": "Old",
            "description": "kept",
            "primary_image_url": catalog["listings"][i]["primary_image_url"],
            "first_seen_at": datetime.now(UTC).isoformat(),
            "last_seen_at": datetime.now(UTC).isoformat(),
            "source_description_checksum": catalog["listings"][i]["description_checksum"],
        }
        for i in range(5)
    ]
    result = reconcile_moret_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref=LABS_PROJECT_REF,
    )
    assert result.listing_count == EXPECTED_LISTING_COUNT
    assert result.inserts == EXPECTED_INSERTS
    assert result.updates == EXPECTED_UPDATES
    assert result.absent_from_catalog == 0
    assert result.proposed_missing_events == 0
    assert result.proposed_removed_events == 0
    assert result.failed is False


def test_idempotent_reconciliation_after_full_import() -> None:
    catalog = _catalog()
    existing = []
    for item in catalog["listings"]:
        snap = listing_dict_to_snapshot(item)
        existing.append(
            {
                "external_id": snap.external_id,
                "source_url": snap.source_url,
                "title": snap.title,
                "listing_type": snap.listing_type,
                "property_type": snap.property_type,
                "status": "active",
                "source_listing_status": snap.source_status,
                "original_price": float(snap.original_price.amount)
                if snap.original_price
                else None,
                "original_currency": snap.original_price.currency
                if snap.original_price
                else None,
                "bedrooms": snap.bedrooms,
                "bathrooms": snap.bathrooms,
                "floor_area_m2": float(snap.floor_area_m2)
                if snap.floor_area_m2 is not None
                else None,
                "lot_area_value": None,
                "lot_area_unit": None,
                "latitude": snap.latitude,
                "longitude": snap.longitude,
                "source_neighbourhood_text": snap.neighbourhood_text,
                "description": None,  # catalog summary omits description
                "primary_image_url": snap.primary_image_url,
                "first_seen_at": datetime.now(UTC).isoformat(),
                "last_seen_at": datetime.now(UTC).isoformat(),
                "source_description_checksum": snap.source_description_checksum,
            }
        )
    result = reconcile_moret_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref=LABS_PROJECT_REF,
    )
    assert result.inserts == 0
    assert result.absent_from_catalog == 0
    assert result.proposed_missing_events == 0
    assert result.proposed_removed_events == 0


def test_from_price_preserved_on_snapshot() -> None:
    item = _catalog()["listings"][0]
    item["from_price"] = True
    item["price_period"] = "month"
    snap = listing_dict_to_snapshot(item)
    assert snap.raw_payload.get("from_price") is True
    assert snap.raw_payload.get("price_period") == "month"
    assert snap.original_price is not None
    assert snap.original_price.amount == Decimal("100000")


def test_evidence_bucket_is_private_constant() -> None:
    assert RAW_EVIDENCE_BUCKET == "listing-raw-evidence"
    assert SOURCE_KEY == "moret_real_estate"


def test_canary_external_ids_and_ceiling_constants() -> None:
    from pathlib import Path

    approved = {
        "post-75682",
        "post-75725",
        "post-74976",
        "post-75799",
        "post-74710",
    }
    assert len(approved) == 5
    ceiling_usd = 0.25
    runner = (
        Path(__file__).resolve().parents[1]
        / "scripts"
        / "run_ai_enrichment_sample.py"
    ).read_text(encoding="utf-8")
    assert "MORET_TERRA_CANARY_EXTERNAL_IDS" in runner
    for ext in approved:
        assert ext in runner
    assert "max-estimated-cost-usd" in runner
    assert ceiling_usd == 0.25
