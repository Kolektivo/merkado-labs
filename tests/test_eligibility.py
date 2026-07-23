"""Public eligibility recompute tests."""

from __future__ import annotations

from decimal import Decimal

from merkado_labs.normalization.eligibility import (
    EligibilityInput,
    evaluate_public_eligibility,
    recompute_public_eligibility,
)


def test_retired_or_disabled_source_never_eligible() -> None:
    ok, reason = evaluate_public_eligibility(
        status="active",
        original_price=Decimal("100"),
        source_enabled=False,
        source_url="https://example.com/x",
        source_adapter_status="retired",
    )
    assert not ok and reason == "source_disabled"


def test_chh_style_listing_not_backfilled_eligible() -> None:
    result = recompute_public_eligibility(
        EligibilityInput(
            status="active",
            original_price=Decimal("250000"),
            source_enabled=False,
            source_adapter_status="retired",
            source_url="https://caribbeanhousehunt.com/x",
        )
    )
    assert result == (False, "source_disabled")


def test_eligible_active_priced_enabled_source() -> None:
    ok, reason = recompute_public_eligibility(
        EligibilityInput(
            status="active",
            original_price=Decimal("100"),
            source_enabled=True,
            source_adapter_status="manual",
            source_url="https://www.realestate-curacao.com/hs1",
            has_source_attribution=True,
        )
    )
    assert ok and reason == "eligible"


def test_pending_benchmark_does_not_block_eligibility() -> None:
    # Docs: keep original; benchmark may be pending for EUR.
    ok, reason = evaluate_public_eligibility(
        status="active",
        original_price=Decimal("480232"),
        source_enabled=True,
        source_url="https://www.realestate-curacao.com/hs1",
        source_adapter_status="manual",
    )
    assert ok and reason == "eligible"


def test_manual_listing_requires_contact_and_image() -> None:
    ok, reason = evaluate_public_eligibility(
        status="active",
        original_price=Decimal("250000"),
        source_enabled=True,
        source_url=None,
        listing_origin="manual",
        title="House in Mahaai",
        real_estate_type="house",
        listing_type="sale",
        primary_image_url=None,
        contact_method="whatsapp",
        contact_value="+5999",
    )
    assert not ok and reason == "missing_image"


def test_manual_listing_eligible_without_source_url() -> None:
    ok, reason = evaluate_public_eligibility(
        status="active",
        original_price=Decimal("250000"),
        source_enabled=False,
        source_url=None,
        listing_origin="manual",
        title="House in Mahaai",
        real_estate_type="house",
        listing_type="sale",
        primary_image_url="https://example.com/a.jpg",
        contact_method="whatsapp",
        contact_value="+5999",
    )
    assert ok and reason == "eligible"
