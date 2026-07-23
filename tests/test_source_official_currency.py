"""Phase 4: source-official currency capture and public XCG preference."""

from __future__ import annotations

from decimal import Decimal

from merkado_labs.normalization.currency import (
    FixedEurRateProvider,
    prefer_official_xcg_benchmark,
    resolve_public_benchmark_xcg,
    to_benchmark_xcg,
)
from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    KellerWilliamsCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.remax_curacao import (
    RemaxCuracaoAdapter,
    extract_listed_in_currency,
    extract_official_alternate_prices,
    resolve_remax_asking_and_alternates,
)
from merkado_labs.scrapers.adapters.remax_naf_session import (
    capture_naf_official_alternate,
    has_official_xcg_alternate,
    verify_same_listing,
)
from merkado_labs.scrapers.contracts import (
    SOURCE_OFFICIAL_PROVENANCE,
    ConversionMethod,
    MoneyAmount,
    OfficialAlternatePrice,
)
from merkado_labs.scrapers.import_pipeline import (
    is_official_alternate_only_update,
    should_append_price_observation,
)
from merkado_labs.scrapers.presentation import (
    classify_activity_event,
    dry_run_presentation_counts,
    filter_default_timeline,
)
from tests.fixtures.kw_html import DETAIL_USD_SALE
from tests.fixtures.remax_html import (
    DETAIL_EUR_ACTIVE,
    DETAIL_EUR_OFFICIAL_XCG,
    DETAIL_HR2066_EUR_DEFAULT,
    DETAIL_HR2066_NAF_VIEW,
    DETAIL_HR2066_NAF_WRONG_LISTING,
)

HR2066_URL = (
    "https://www.realestate-curacao.com/en/homes/homes-for-rent/"
    "hr2066/rented/marie-pampoen-cozy-furnished-house-for-rent.html"
)


def test_remax_listed_in_and_official_xcg_fixture() -> None:
    html = DETAIL_EUR_OFFICIAL_XCG
    assert extract_listed_in_currency(html) == "EUR"
    alts = extract_official_alternate_prices(html)
    assert any(
        alt.currency == "XCG"
        and alt.amount == Decimal("1350")
        and alt.provenance == SOURCE_OFFICIAL_PROVENANCE
        for alt in alts
    )

    amount, currency, official, warnings = resolve_remax_asking_and_alternates(
        html,
        display_money_currency="EUR",
        display_amount=Decimal("664"),
        display_evidence="€ 664",
    )
    assert amount == Decimal("664")
    assert currency == "EUR"
    assert any(alt.currency == "XCG" and alt.amount == Decimal("1350") for alt in official)
    assert not any("listed_in_currency_differs" in w for w in warnings)

    snap = RemaxCuracaoAdapter().parse_listing_html(
        html,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-rent/hr2066/synthetic.html",
        raw_sha256="a" * 64,
    )
    assert snap.original_price is not None
    assert snap.original_price.amount == Decimal("664")
    assert snap.original_price.currency == "EUR"
    assert any(
        alt.currency == "XCG" and alt.amount == Decimal("1350")
        for alt in snap.official_alternate_prices
    )


def test_remax_live_sample_has_listed_in_but_no_selector_amount() -> None:
    """Cas Grandi sample: listed in XCG, EUR display, no XCG amount on page."""
    from pathlib import Path

    sample = Path("tests/fixtures/remax_sample.html").read_text(encoding="utf-8")
    assert extract_listed_in_currency(sample) == "XCG"
    assert extract_official_alternate_prices(sample) == []
    _amount, _currency, alts, warnings = resolve_remax_asking_and_alternates(
        sample,
        display_money_currency="EUR",
        display_amount=Decimal("480232"),
        display_evidence="€ 480.232",
    )
    assert alts == []
    assert "listed_in_currency_differs_amount_unknown" in warnings


def test_prefer_official_xcg_over_merkado_ecb() -> None:
    original = MoneyAmount(amount=Decimal("664"), currency="EUR")
    provider = FixedEurRateProvider(rate=Decimal("2.045"), provider_id="test_eur")
    merkado = to_benchmark_xcg(original, eur_provider=provider)
    assert merkado.amount_xcg == Decimal("664") * Decimal("2.045")

    official = [
        OfficialAlternatePrice(
            amount=Decimal("1350"),
            currency="XCG",
            provenance=SOURCE_OFFICIAL_PROVENANCE,
            source_label="remax_official_meta",
        )
    ]
    public = prefer_official_xcg_benchmark(
        merkado_benchmark=merkado,
        official_alternates=official,
    )
    assert public.amount_xcg == Decimal("1350")
    assert public.conversion_method == ConversionMethod.SOURCE_OFFICIAL_CONVERSION
    assert public.provenance is not None
    assert public.provenance["preferred_over_merkado"] is True

    # Never invent official from Merkado alone.
    alone = resolve_public_benchmark_xcg(original, eur_provider=provider)
    assert alone.conversion_method == ConversionMethod.EUR_API
    assert alone.amount_xcg == merkado.amount_xcg


def test_anchor_unchanged_rate_change_is_not_price_changed() -> None:
    append, price_changed, currency_changed = should_append_price_observation(
        is_new=False,
        previous_amount=664,
        previous_currency="EUR",
        new_amount=664.0,
        new_currency="EUR",
    )
    assert not append
    assert not price_changed
    assert not currency_changed


def test_official_alternate_only_update_is_not_price_changed() -> None:
    """Official alt backfill with same asking must not emit price_changed."""

    assert is_official_alternate_only_update(
        previous_amount=664,
        previous_currency="EUR",
        new_amount=664.0,
        new_currency="EUR",
    )
    append, price_changed, currency_changed = should_append_price_observation(
        is_new=False,
        previous_amount=664,
        previous_currency="EUR",
        new_amount=664.0,
        new_currency="EUR",
    )
    assert not append
    assert not price_changed
    assert not currency_changed


def test_kw_keeps_usd_anchor_and_captures_official_alts() -> None:
    snap = KellerWilliamsCuracaoAdapter().parse_listing_html(
        DETAIL_USD_SALE,
        listing_url="https://www.kw-curacao.com/property/ocean-view-villa",
        raw_sha256="b" * 64,
    )
    assert snap.original_price is not None
    assert snap.original_price.currency == "USD"
    assert snap.original_price.amount == Decimal("795000")
    currencies = {alt.currency for alt in snap.official_alternate_prices}
    assert "EUR" in currencies
    assert "XCG" in currencies
    assert all(
        alt.provenance == SOURCE_OFFICIAL_PROVENANCE
        for alt in snap.official_alternate_prices
    )


def test_kw_inline_alternates_idempotent_second_parse() -> None:
    adapter = KellerWilliamsCuracaoAdapter()
    first = adapter.parse_listing_html(
        DETAIL_USD_SALE,
        listing_url="https://www.kw-curacao.com/property/ocean-view-villa",
        raw_sha256="b" * 64,
    )
    second = adapter.parse_listing_html(
        DETAIL_USD_SALE,
        listing_url="https://www.kw-curacao.com/property/ocean-view-villa",
        raw_sha256="b" * 64,
    )
    assert first.original_price == second.original_price
    assert [a.as_dict() for a in first.official_alternate_prices] == [
        a.as_dict() for a in second.official_alternate_prices
    ]
    append, price_changed, _ = should_append_price_observation(
        is_new=False,
        previous_amount=float(first.original_price.amount),  # type: ignore[union-attr]
        previous_currency=first.original_price.currency,  # type: ignore[union-attr]
        new_amount=float(second.original_price.amount),  # type: ignore[union-attr]
        new_currency=second.original_price.currency,  # type: ignore[union-attr]
    )
    assert not append
    assert not price_changed


def test_presentation_timeline_hides_rate_only_and_dual_writer() -> None:
    events = [
        {
            "id": "1",
            "event_type": "price_changed",
            "previous_value": {"amount": "100", "currency": "EUR"},
            "new_value": {"amount": "110", "currency": "EUR"},
            "notes": None,
        },
        {
            "id": "2",
            "event_type": "price_changed",
            "previous_value": {"amount": "100", "currency": "EUR"},
            "new_value": {"amount": "110", "currency": "EUR"},
            "notes": None,
        },
        {
            "id": "3",
            "event_type": "benchmark_recalculated",
            "previous_value": {"benchmark_price_xcg": "200"},
            "new_value": {"benchmark_price_xcg": "210"},
            "notes": "Asking amount unchanged; conversion context changed",
        },
        {
            "id": "4",
            "event_type": "first_seen",
            "previous_value": None,
            "new_value": {"source_url": "https://example.com"},
            "notes": None,
        },
    ]
    # Newest-first as dashboard loads.
    newest_first = list(reversed(events))
    visible = filter_default_timeline(newest_first)
    visible_ids = {str(e["id"]) for e in visible}
    assert "3" not in visible_ids  # rate-only suppressed
    assert "2" not in visible_ids or "1" not in visible_ids  # one dual-writer dupe
    assert "4" in visible_ids
    assert len([e for e in visible if e["event_type"] == "price_changed"]) == 1

    counts = dry_run_presentation_counts(newest_first)
    assert counts["benchmark_rate_only"] == 1
    assert counts["dual_writer_duplicate"] == 1
    assert counts["visible_default"] == 2

    jitter = classify_activity_event(
        {
            "event_type": "price_changed",
            "previous_value": {"amount": "664", "currency": "EUR"},
            "new_value": {"amount": "665", "currency": "EUR"},
        }
    )
    assert jitter.suppressed_reason == "suspected_display_fx_jitter"
    assert jitter.visible_in_default is False

    repair = classify_activity_event(
        {
            "event_type": "material_field_changed",
            "notes": "SYSTEM_REPAIR normalized stale value",
            "presentation_class": "primary",
        }
    )
    assert repair.suppressed_reason == "system_repair"
    assert repair.visible_in_default is False


def test_detail_eur_active_still_parses() -> None:
    snap = RemaxCuracaoAdapter().parse_listing_html(
        DETAIL_EUR_ACTIVE,
        listing_url="https://www.realestate-curacao.com/en/homes/homes-for-sale/hs2957/blue-bay.html",
        raw_sha256="c" * 64,
    )
    assert snap.original_price is not None
    assert snap.original_price.currency == "EUR"


def test_remax_naf_session_success_hr2066() -> None:
    """Probe-aligned: EUR 664 default → official XCG 1350 after NAF switch."""

    default_html = DETAIL_HR2066_EUR_DEFAULT
    assert extract_official_alternate_prices(default_html) == []
    assert extract_listed_in_currency(default_html) == "XCG"

    calls: list[str] = []

    def fake_get(url: str) -> dict:
        calls.append(url)
        if "/currency/NAF/" in url:
            return {
                "ok": True,
                "status": 200,
                "final_url": "https://www.realestate-curacao.com/en/",
                "html": "<html></html>",
                "error": None,
            }
        return {
            "ok": True,
            "status": 200,
            "final_url": HR2066_URL,
            "html": DETAIL_HR2066_NAF_VIEW,
            "error": None,
        }

    result = capture_naf_official_alternate(
        HR2066_URL,
        expected_external_id="hr2066",
        default_html=default_html,
        honor_delay=False,
        http_get=fake_get,
    )
    assert result.alternate is not None
    assert result.alternate.amount == Decimal("1350")
    assert result.alternate.currency == "XCG"
    assert result.alternate.provenance == SOURCE_OFFICIAL_PROVENANCE
    assert result.alternate.source_label == "remax_naf_session"
    assert any("/currency/NAF/" in u for u in calls)
    assert any("hr2066" in u for u in calls)

    # Refresh semantics: retain EUR asking; store NAF amount as official alt.
    provider = FixedEurRateProvider(rate=Decimal("2.045"), provider_id="test_eur")
    original = MoneyAmount(amount=Decimal("664"), currency="EUR")
    public = resolve_public_benchmark_xcg(
        original,
        eur_provider=provider,
        official_alternates=[result.alternate],
    )
    assert public.amount_xcg == Decimal("1350")
    assert public.conversion_method == ConversionMethod.SOURCE_OFFICIAL_CONVERSION
    append, price_changed, _ = should_append_price_observation(
        is_new=False,
        previous_amount=664,
        previous_currency="EUR",
        new_amount=664.0,
        new_currency="EUR",
    )
    assert not price_changed
    assert not append

    # Import parse with extras: listed-in XCG + known amount may promote asking.
    snap = RemaxCuracaoAdapter().parse_listing_html(
        default_html,
        listing_url=HR2066_URL,
        raw_sha256="d" * 64,
        extra_official_alternates=[result.alternate],
    )
    assert snap.original_price is not None
    assert has_official_xcg_alternate(snap.official_alternate_prices) or (
        snap.original_price.currency == "XCG"
        and snap.original_price.amount == Decimal("1350")
    )


def test_remax_naf_session_failure_keeps_anchor() -> None:
    default_html = DETAIL_HR2066_EUR_DEFAULT

    def fake_get(url: str) -> dict:
        if "/currency/NAF/" in url:
            return {
                "ok": False,
                "status": 503,
                "final_url": url,
                "html": "",
                "error": "http_503",
            }
        return {
            "ok": True,
            "status": 200,
            "final_url": HR2066_URL,
            "html": default_html,
            "error": None,
        }

    result = capture_naf_official_alternate(
        HR2066_URL,
        expected_external_id="hr2066",
        default_html=default_html,
        honor_delay=False,
        http_get=fake_get,
    )
    assert result.alternate is None
    assert any("naf_switch_fetch_failed" in w for w in result.warnings)

    snap = RemaxCuracaoAdapter().parse_listing_html(
        default_html,
        listing_url=HR2066_URL,
        raw_sha256="e" * 64,
        extra_official_alternates=None,
        extra_warnings=result.warnings,
    )
    assert snap.original_price is not None
    assert snap.original_price.amount == Decimal("664")
    assert snap.original_price.currency == "EUR"
    assert not has_official_xcg_alternate(snap.official_alternate_prices)
    assert any("naf_switch_fetch_failed" in w for w in snap.warnings)


def test_remax_naf_same_listing_verification_failure() -> None:
    wrong_url = (
        "https://www.realestate-curacao.com/en/homes/homes-for-rent/"
        "hr9999/other-home.html"
    )
    err = verify_same_listing(
        listing_url=HR2066_URL,
        naf_html=DETAIL_HR2066_NAF_WRONG_LISTING,
        naf_final_url=wrong_url,
        expected_external_id="hr2066",
    )
    assert err == "naf_redirect_external_id_mismatch"

    def fake_get(url: str) -> dict:
        if "/currency/NAF/" in url:
            return {
                "ok": True,
                "status": 200,
                "final_url": "https://www.realestate-curacao.com/en/",
                "html": "<html></html>",
                "error": None,
            }
        return {
            "ok": True,
            "status": 200,
            "final_url": wrong_url,
            "html": DETAIL_HR2066_NAF_WRONG_LISTING,
            "error": None,
        }

    result = capture_naf_official_alternate(
        HR2066_URL,
        expected_external_id="hr2066",
        default_html=DETAIL_HR2066_EUR_DEFAULT,
        honor_delay=False,
        http_get=fake_get,
    )
    assert result.alternate is None
    assert result.warnings
    assert any(
        w
        in {
            "naf_redirect_external_id_mismatch",
            "naf_final_url_missing_listing_ref",
            "naf_html_external_id_mismatch",
        }
        for w in result.warnings
    )


def test_remax_naf_skipped_when_inline_alt_present() -> None:
    result = capture_naf_official_alternate(
        HR2066_URL,
        expected_external_id="hr2066",
        default_html=DETAIL_EUR_OFFICIAL_XCG,
        honor_delay=False,
        http_get=lambda _url: (_ for _ in ()).throw(AssertionError("must not fetch")),
    )
    assert result.skipped is True
    assert result.alternate is None
