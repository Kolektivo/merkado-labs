"""Unit tests for Monumentenzorg offline import preview / activation gates."""

from __future__ import annotations

import pytest

from merkado_labs.scrapers.monumentenzorg_import_preview import (
    EXPECTED_CATALOG_CHECKSUM,
    EXPECTED_INSERTS,
    EXPECTED_LISTING_COUNT,
    EXPECTED_UPDATES,
    FORBIDDEN_PROJECT_REF,
    LABS_PROJECT_REF,
    assert_labs_project_ref,
    catalog_is_complete,
    listing_dict_to_snapshot,
    reconcile_monumentenzorg_catalog,
)


def _listing(i: int, *, priced: bool = True, sold: bool = False) -> dict:
    original_price = None
    if priced:
        original_price = {
            "amount": str(3500 + i),
            "currency": "ANG",
            "evidence": f"ANG {3500 + i}",
        }
    return {
        "external_id": f"property-{1000 + i}",
        "source_url": f"https://monumentenzorg.cw/properties/demo-{i}/",
        "title": f"Demo {i}",
        "listing_type": "sale" if sold else "rent",
        "source_status": "sold_under_reservation" if sold else "for_rent",
        "lifecycle_hint": "sold" if sold else "active",
        "original_price": original_price,
        "has_positive_price": priced,
        "from_price": i == 1,
        "bedrooms": 0,
        "bathrooms": 1,
        "neighbourhood_text": "Scharloo",
        "raw_sha256": f"{i:064x}"[:64],
        "raw_payload": {"from_price": i == 1, "price_text": "Starting at ANG 8,000"},
        "warnings": [],
        "parser_errors": [],
    }


def _catalog(*, checksum: str | None = None) -> dict:
    listings = [
        _listing(0, priced=True),
        _listing(1, priced=True),
        _listing(2, priced=False),
        _listing(3, priced=False),
        _listing(4, priced=False, sold=True),
    ]
    return {
        "source_key": "monumentenzorg_curacao",
        "adapter_version": "0.2.0",
        "complete_catalog": True,
        "catalog_checksum": checksum or EXPECTED_CATALOG_CHECKSUM,
        "listings": listings,
    }


def test_assert_labs_rejects_production(monkeypatch: pytest.MonkeyPatch) -> None:
    import merkado_labs.scrapers.monumentenzorg_import_preview as mod

    class _S:
        supabase_project_ref = FORBIDDEN_PROJECT_REF
        supabase_url = f"https://{FORBIDDEN_PROJECT_REF}.supabase.co"

    monkeypatch.setattr(mod, "get_settings", lambda: _S())
    with pytest.raises(RuntimeError, match="production"):
        assert_labs_project_ref()


def test_assert_labs_accepts_labs(monkeypatch: pytest.MonkeyPatch) -> None:
    import merkado_labs.scrapers.monumentenzorg_import_preview as mod

    class _S:
        supabase_project_ref = LABS_PROJECT_REF
        supabase_url = f"https://{LABS_PROJECT_REF}.supabase.co"

    monkeypatch.setattr(mod, "get_settings", lambda: _S())
    assert assert_labs_project_ref() == LABS_PROJECT_REF


def test_catalog_complete_and_checksum_gate() -> None:
    catalog = _catalog()
    assert catalog_is_complete(catalog) is True
    bad = reconcile_monumentenzorg_catalog(
        catalog=_catalog(checksum="0" * 64),
        existing_rows=[],
        project_ref=LABS_PROJECT_REF,
    )
    assert bad.failed is True
    assert any("catalog_checksum_mismatch" in r for r in bad.failure_reasons)


def test_first_import_preview_five_inserts() -> None:
    result = reconcile_monumentenzorg_catalog(
        catalog=_catalog(),
        existing_rows=[],
        project_ref=LABS_PROJECT_REF,
    )
    assert result.failed is False
    assert result.listing_count == EXPECTED_LISTING_COUNT
    assert result.inserts == EXPECTED_INSERTS
    assert result.updates == EXPECTED_UPDATES
    assert result.absent_from_catalog == 0
    assert result.proposed_missing_events == 0
    assert result.proposed_removed_events == 0
    assert result.no_price_public_exclusions == 3


def test_listing_dict_nested_price() -> None:
    snap = listing_dict_to_snapshot(_listing(1, priced=True))
    assert snap.external_id == "property-1001"
    assert snap.original_price is not None
    assert snap.original_price.currency == "ANG"
    assert snap.raw_payload.get("from_price") is True
