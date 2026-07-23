"""Tests for ECB EUR→XCG rate parsing and providers."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import patch
from urllib.error import URLError

import pytest

from merkado_labs.normalization.currency import (
    USD_TO_XCG,
    FixedEurRateProvider,
    to_benchmark_xcg,
)
from merkado_labs.normalization.ecb_rates import (
    ECB_PROVIDER_ID,
    EcbEurRateProvider,
    EurRateError,
    ManualEurRateProvider,
    derive_eur_to_xcg,
    parse_ecb_daily_xml,
)
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    ConversionMethod,
    ListingLifecycleStatus,
    MoneyAmount,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.import_simulation import (
    project_test_rate_recalculations,
    simulate_import,
)

SAMPLE_ECB_XML = """<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
 xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time='2026-07-16'>
      <Cube currency='USD' rate='1.1467'/>
      <Cube currency='JPY' rate='185.99'/>
    </Cube>
  </Cube>
</gesmes:Envelope>
"""


def test_parse_ecb_daily_xml_usd_per_eur() -> None:
    observation_date, usd_per_eur = parse_ecb_daily_xml(SAMPLE_ECB_XML)
    assert observation_date == date(2026, 7, 16)
    assert usd_per_eur == Decimal("1.1467")


def test_derive_eur_to_xcg_formula() -> None:
    assert derive_eur_to_xcg(Decimal("1.1467")) == Decimal("1.1467") * USD_TO_XCG
    assert derive_eur_to_xcg(Decimal("1.1467")) == Decimal("2.052593")


def test_ecb_provider_caches_one_quote_per_instance() -> None:
    # Freshness is covered separately; keep this cache test date-independent.
    provider = EcbEurRateProvider(max_age_days=10_000)
    with patch.object(
        provider,
        "_fetch_xml",
        side_effect=[SAMPLE_ECB_XML, Exception("should not fetch again")],
    ) as fetch:
        first = provider.get_eur_to_xcg_quote()
        second = provider.get_eur_to_xcg_quote()
    assert fetch.call_count == 1
    assert first.eur_to_xcg == second.eur_to_xcg
    assert first.provider_id == ECB_PROVIDER_ID
    assert first.observation_date == date(2026, 7, 16)
    assert first.fetched_at.tzinfo is not None
    assert first.usd_per_eur == Decimal("1.1467")
    assert first.usd_to_xcg_peg == USD_TO_XCG


def test_ecb_provider_rejects_stale_observation() -> None:
    old_xml = SAMPLE_ECB_XML.replace("2026-07-16", "2026-01-01")
    provider = EcbEurRateProvider(max_age_days=5)
    with patch.object(provider, "_fetch_xml", return_value=old_xml):
        with pytest.raises(EurRateError, match="stale"):
            provider.get_eur_to_xcg_quote()


def test_ecb_provider_rejects_malformed_xml() -> None:
    provider = EcbEurRateProvider()
    with patch.object(provider, "_fetch_xml", return_value="<not-ecb/>"):
        with pytest.raises(EurRateError):
            provider.get_eur_to_xcg_quote()


def test_ecb_provider_retry_failure_no_fabricated_fallback() -> None:
    provider = EcbEurRateProvider(retries=1, retry_backoff_seconds=0)
    with patch(
        "merkado_labs.normalization.ecb_rates.urlopen",
        side_effect=URLError("down"),
    ):
        with pytest.raises(EurRateError, match="failed after"):
            provider.get_eur_to_xcg_quote()


def test_manual_provider_labelled_as_test() -> None:
    provider = ManualEurRateProvider(rate=Decimal("2.00"), provider_id="manual_test")
    quote = provider.get_eur_to_xcg_quote()
    assert quote.is_manual_test is True
    assert "manual" in quote.provider_id


def test_to_benchmark_pending_on_provider_failure() -> None:
    class Boom:
        def get_eur_to_xcg_rate(self):
            raise EurRateError("boom")

        def get_eur_to_xcg_quote(self):
            raise EurRateError("boom")

    money = MoneyAmount(amount=Decimal("1000"), currency="EUR")
    bench = to_benchmark_xcg(money, eur_provider=Boom())  # type: ignore[arg-type]
    assert bench.pending is True
    assert bench.amount_xcg is None


def test_fixed_alias_still_works_for_tests() -> None:
    money = MoneyAmount(amount=Decimal("1000"), currency="EUR")
    provider = FixedEurRateProvider(rate=Decimal("2.00"), provider_id="fixed_test")
    bench = to_benchmark_xcg(money, eur_provider=provider)
    assert bench.amount_xcg == Decimal("2000")
    assert bench.conversion_method == ConversionMethod.EUR_API
    assert bench.conversion_provider == "fixed_test"
    assert bench.provenance is not None
    assert bench.provenance["is_manual_test"] is True


def test_project_test_rate_recalculations() -> None:
    rows = [
        {
            "original_currency": "EUR",
            "original_price": 100,
            "conversion_provider": "fixed_test",
        },
        {
            "original_currency": "EUR",
            "original_price": 200,
            "conversion_provider": "ecb_eur_usd_xcg_peg",
        },
        {"original_currency": "USD", "original_price": 100, "conversion_provider": None},
    ]
    projection = project_test_rate_recalculations(rows)
    assert projection["listings_with_test_eur_benchmark"] == 1
    assert projection["projected_price_changed_events"] == 0


def test_simulate_import_benchmark_recalc_vs_price_change() -> None:
    now = datetime(2026, 7, 16, tzinfo=UTC)
    snap = AdapterListingSnapshot(
        source_key="remax_curacao",
        external_id="hs1",
        source_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs1/x.html",
        observed_at=now,
        adapter_name="remax_curacao",
        adapter_version="0.3.3",
        raw_payload={"realtor_name": "RE/MAX"},
        raw_sha256="a" * 64,
        listing_type="sale",
        lifecycle_hint=ListingLifecycleStatus.ACTIVE,
        original_price=MoneyAmount(amount=Decimal("1000"), currency="EUR"),
    )
    run = SourceRunRecord(
        source_key="remax_curacao",
        adapter_name="remax_curacao",
        adapter_version="0.3.3",
        started_at=now,
        completed_at=now,
        outcome=SourceRunOutcome.PARTIAL,
        discovered_count=1,
        parsed_count=1,
    )
    existing = {
        "hs1": {
            "original_price": 1000,
            "original_currency": "EUR",
            "conversion_provider": "fixed_test",
            "conversion_rate": 2.0,
            "benchmark_price_xcg": 2000,
            "status": "active",
        }
    }
    provider = ManualEurRateProvider(
        rate=Decimal("2.05"),
        provider_id="ecb_eur_usd_xcg_peg",
        notes="offline stand-in for simulation",
    )
    sim = simulate_import(
        snapshots=[snap],
        existing_by_external_id=existing,
        run=run,
        eur_provider=provider,
    )
    assert sim.price_changed_events == 0
    assert sim.benchmark_recalculated_events == 1
    assert sim.existing_test_rate_recalculations == 1
    assert sim.new_listings == 0
    assert sim.updated_listings == 1
