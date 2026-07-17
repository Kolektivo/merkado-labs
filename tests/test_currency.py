"""Tests for currency normalization and XCG benchmarks."""

from __future__ import annotations

from decimal import Decimal

from merkado_labs.normalization.currency import (
    USD_TO_XCG,
    FixedEurRateProvider,
    looks_like_round_eur_anchor,
    parse_decimal_amount,
    resolve_original_money,
    to_benchmark_xcg,
)
from merkado_labs.scrapers.contracts import ConversionMethod


def test_usd_fixed_peg() -> None:
    money = resolve_original_money(amount=Decimal("100"), currency="USD")
    assert money is not None
    bench = to_benchmark_xcg(money)
    assert bench.amount_xcg == Decimal("100") * USD_TO_XCG
    assert bench.conversion_method == ConversionMethod.USD_FIXED_PEG
    assert bench.conversion_rate == USD_TO_XCG


def test_xcg_identity_and_ang_legacy() -> None:
    xcg = resolve_original_money(amount=Decimal("250000"), currency="XCG")
    assert xcg is not None
    assert to_benchmark_xcg(xcg).conversion_method == ConversionMethod.IDENTITY

    ang = resolve_original_money(amount=Decimal("250000"), currency="ANG")
    assert ang is not None
    assert to_benchmark_xcg(ang).conversion_method == ConversionMethod.LEGACY_1_TO_1


def test_eur_uses_injectable_provider_not_live_api() -> None:
    money = resolve_original_money(amount=Decimal("1000"), currency="EUR")
    assert money is not None
    provider = FixedEurRateProvider(rate=Decimal("2.00"), provider_id="test_eur")
    bench = to_benchmark_xcg(money, eur_provider=provider)
    assert bench.amount_xcg == Decimal("2000")
    assert bench.conversion_method == ConversionMethod.EUR_API
    assert bench.conversion_provider == "test_eur"


def test_eur_pending_without_provider() -> None:
    money = resolve_original_money(amount=Decimal("1000"), currency="EUR")
    assert money is not None
    bench = to_benchmark_xcg(money, eur_provider=None)
    assert bench.pending is True
    assert bench.amount_xcg is None


def test_explicit_currency_beats_eur_anchor_hint() -> None:
    money = resolve_original_money(
        amount=Decimal("450000"),
        currency="USD",
        allow_eur_anchor_hint=True,
    )
    assert money is not None
    assert money.currency == "USD"
    assert money.inferred is False


def test_ambiguous_000_or_500_is_low_confidence_eur_hint_only() -> None:
    assert looks_like_round_eur_anchor(Decimal("450000"))
    assert looks_like_round_eur_anchor(Decimal("450500"))
    money = resolve_original_money(
        amount=Decimal("450000"),
        currency=None,
        allow_eur_anchor_hint=True,
    )
    assert money is not None
    assert money.currency == "EUR"
    assert money.inferred is True


def test_parse_european_decimal_amount() -> None:
    assert parse_decimal_amount("EUR 480.232") == Decimal("480232")
    assert parse_decimal_amount("1.250.000") == Decimal("1250000")
