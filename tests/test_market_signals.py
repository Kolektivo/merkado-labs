from __future__ import annotations

from datetime import date
from decimal import Decimal

from experiments.caribbeanhousehunt_sample.calculate_market_signals import (
    Evidence,
    apply_approved_aliases,
    build_signal_rows,
    is_base_qualifying,
    month_bounds,
    quality_status,
    select_evidence,
)


def listing(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": "listing-1",
        "external_id": "external-1",
        "source_url": "https://example.test/listing",
        "listing_type": "rent",
        "status": "active",
        "currency": "XCG",
        "current_price": "2000",
        "floor_area_m2": "100",
        "neighbourhood_id": "neighbourhood-1",
        "neighbourhood": {"name": "Punda"},
    }
    value.update(overrides)
    return value


def price(
    *,
    identifier: str,
    observed_at: str,
    amount: str = "2000",
    currency: str = "XCG",
) -> dict[str, str]:
    return {
        "id": identifier,
        "property_listing_id": "listing-1",
        "observed_at": observed_at,
        "created_at": observed_at,
        "price": amount,
        "currency": currency,
    }


def test_month_bounds_and_quality_thresholds() -> None:
    assert month_bounds("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))
    assert [quality_status(size) for size in (1, 2, 3, 4, 5, 9, 10)] == [
        "insufficient",
        "insufficient",
        "limited",
        "limited",
        "usable",
        "usable",
        "strong",
    ]


def test_base_qualification_requires_every_requested_field() -> None:
    assert is_base_qualifying(listing())
    for field, invalid in (
        ("listing_type", "sale"),
        ("status", "inactive"),
        ("currency", "USD"),
        ("current_price", "0"),
        ("floor_area_m2", None),
        ("neighbourhood_id", None),
    ):
        assert not is_base_qualifying(listing(**{field: invalid}))


def test_latest_in_period_price_is_selected_once() -> None:
    evidence, rejected = select_evidence(
        [listing()],
        [
            price(identifier="old", observed_at="2026-07-01T00:00:00+00:00", amount="1000"),
            price(identifier="new", observed_at="2026-07-15T00:00:00+00:00", amount="3000"),
            price(identifier="later", observed_at="2026-08-01T00:00:00+00:00", amount="9000"),
        ],
        date(2026, 7, 1),
        date(2026, 7, 31),
    )
    assert rejected == []
    assert len(evidence) == 1
    assert evidence[0].price_observation_id == "new"
    assert evidence[0].calculated_value == Decimal("30")


def test_invalid_currency_and_extremes_are_rejected_without_correction() -> None:
    for observation, expected_reason in (
        (
            price(
                identifier="usd",
                observed_at="2026-07-15T00:00:00+00:00",
                currency="USD",
            ),
            "latest price observation currency is not XCG",
        ),
        (
            price(
                identifier="low",
                observed_at="2026-07-15T00:00:00+00:00",
                amount="50",
            ),
            "rent per m² is below 1 XCG guardrail",
        ),
        (
            price(
                identifier="high",
                observed_at="2026-07-15T00:00:00+00:00",
                amount="15100",
            ),
            "rent per m² exceeds 150 XCG guardrail",
        ),
    ):
        evidence, rejected = select_evidence(
            [listing()],
            [observation],
            date(2026, 7, 1),
            date(2026, 7, 31),
        )
        assert evidence == []
        assert [item.reason for item in rejected] == [expected_reason]


def test_signal_aggregate_uses_exact_evidence_count() -> None:
    evidence = [
        Evidence(
            property_listing_id=f"listing-{index}",
            price_observation_id=f"price-{index}",
            neighbourhood_id="neighbourhood-1",
            neighbourhood_name="Punda",
            external_id=f"external-{index}",
            source_url="https://example.test/listing",
            observed_price=value * Decimal("100"),
            floor_area_m2=Decimal("100"),
            calculated_value=value,
        )
        for index, value in enumerate((Decimal("10"), Decimal("20"), Decimal("30")), start=1)
    ]
    rows = build_signal_rows(
        evidence,
        [],
        date(2026, 7, 1),
        date(2026, 7, 31),
        "v1",
    )
    assert len(rows) == 1
    assert rows[0]["sample_size"] == 3
    assert rows[0]["average_value"] == 20
    assert rows[0]["median_value"] == 20
    assert rows[0]["minimum_value"] == 10
    assert rows[0]["maximum_value"] == 30
    assert rows[0]["quality_status"] == "limited"


def test_only_approved_aliases_change_signal_grouping() -> None:
    evidence = [
        Evidence(
            property_listing_id="listing-1",
            price_observation_id="price-1",
            neighbourhood_id="source",
            neighbourhood_name="D section",
            external_id="external-1",
            source_url="https://example.test/listing",
            observed_price=Decimal("2000"),
            floor_area_m2=Decimal("100"),
            calculated_value=Decimal("20"),
        )
    ]
    grouped, count = apply_approved_aliases(
        evidence,
        [
            {
                "source_neighbourhood_id": "source",
                "canonical_neighbourhood_id": "canonical",
                "status": "approved",
            },
            {
                "source_neighbourhood_id": "other",
                "canonical_neighbourhood_id": "canonical",
                "status": "pending",
            },
        ],
        {"canonical": "D-section"},
    )
    assert count == 1
    assert grouped[0].neighbourhood_id == "canonical"
    assert grouped[0].original_neighbourhood_id == "source"
    assert grouped[0].property_listing_id == "listing-1"
