"""Currency normalization and XCG benchmark conversion."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from merkado_labs.normalization.ecb_rates import (
    ECB_PROVIDER_ID,
    EurRateError,
    EurRateQuote,
    FixedEurRateProvider,
    ManualEurRateProvider,
    derive_eur_to_xcg,
)
from merkado_labs.scrapers.contracts import (
    BenchmarkPrice,
    ConversionMethod,
    EurRateProvider,
    MoneyAmount,
)

USD_TO_XCG = Decimal("1.79")
ANG_ALIASES = frozenset({"ANG", "NAF", "XCG"})

__all__ = [
    "USD_TO_XCG",
    "ECB_PROVIDER_ID",
    "EurRateError",
    "EurRateQuote",
    "FixedEurRateProvider",
    "ManualEurRateProvider",
    "derive_eur_to_xcg",
    "normalize_currency_code",
    "parse_decimal_amount",
    "looks_like_round_eur_anchor",
    "resolve_original_money",
    "to_benchmark_xcg",
    "cached_eur_provider",
    "is_approved_production_provider",
    "is_manual_or_test_provider",
]


def is_manual_or_test_provider(provider_id: str | None) -> bool:
    if not provider_id:
        return False
    return (
        provider_id.startswith("fixed_")
        or provider_id.startswith("manual")
        or provider_id.endswith("_test")
        or provider_id == "test_eur"
    )


def is_approved_production_provider(provider_id: str | None) -> bool:
    return provider_id == ECB_PROVIDER_ID


def normalize_currency_code(raw: str | None) -> str | None:
    """Normalize common Curaçao currency spellings to ISO-ish codes."""

    if raw is None:
        return None
    token = raw.strip().upper().replace(".", "")
    aliases = {
        "NAƒ": "ANG",
        "NAF": "ANG",
        "NAƒS": "ANG",
        "FL": "ANG",
        "FLG": "ANG",
        "ƒ": "ANG",
        "EURO": "EUR",
        "EUROS": "EUR",
        "€": "EUR",
        "US$": "USD",
        "$": "USD",
        "DOLLAR": "USD",
        "DOLLARS": "USD",
    }
    if token in aliases:
        return aliases[token]
    if token in {"XCG", "ANG", "USD", "EUR"}:
        return token
    if len(token) == 3 and token.isalpha():
        return token
    return None


def parse_decimal_amount(raw: str | int | float | Decimal) -> Decimal | None:
    """Parse listing amounts, including European thousand/decimal separators."""

    if isinstance(raw, Decimal):
        return raw
    if isinstance(raw, (int, float)):
        return Decimal(str(raw))
    text = str(raw).strip()
    if not text:
        return None
    cleaned = (
        text.replace("\u00a0", " ")
        .replace("€", "")
        .replace("$", "")
        .replace("USD", "")
        .replace("EUR", "")
        .replace("XCG", "")
        .replace("ANG", "")
        .replace("NAf", "")
        .replace("Naf", "")
        .replace("ƒ", "")
        .strip()
    )
    # European: 480.232 or 1.250.000,50
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned and "." not in cleaned:
        parts = cleaned.split(",")
        if len(parts[-1]) == 2:
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")
    elif cleaned.count(".") == 1:
        # European thousands separator often uses a single dot with 3 fraction digits
        # (e.g. "480.232" meaning 480232). Keep true decimals like "480.25".
        whole, frac = cleaned.split(".")
        if whole.isdigit() and frac.isdigit() and len(frac) == 3:
            cleaned = whole + frac
    cleaned = cleaned.replace(" ", "")
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def looks_like_round_eur_anchor(amount: Decimal) -> bool:
    """Weak heuristic: amounts ending in 000 or 500 may be EUR-anchored."""

    if amount <= 0:
        return False
    as_int = int(amount)
    if Decimal(as_int) != amount:
        return False
    return as_int % 1000 == 0 or as_int % 500 == 0


def resolve_original_money(
    *,
    amount: Decimal | None,
    currency: str | None,
    evidence: str | None = None,
    allow_eur_anchor_hint: bool = False,
) -> MoneyAmount | None:
    """Build original money. Explicit currency always wins."""

    if amount is None or amount <= 0:
        return None
    code = normalize_currency_code(currency)
    if code:
        return MoneyAmount(amount=amount, currency=code, evidence=evidence, inferred=False)
    if allow_eur_anchor_hint and looks_like_round_eur_anchor(amount):
        return MoneyAmount(
            amount=amount,
            currency="EUR",
            evidence=evidence,
            inferred=True,
            inference_reason="ambiguous_amount_ends_000_or_500",
        )
    return None


def _quote_from_provider(eur_provider: EurRateProvider) -> EurRateQuote:
    getter = getattr(eur_provider, "get_eur_to_xcg_quote", None)
    if callable(getter):
        return getter()
    rate, provider_id, observed_at = eur_provider.get_eur_to_xcg_rate()
    return EurRateQuote(
        eur_to_xcg=rate,
        provider_id=provider_id,
        observation_date=observed_at.date(),
        fetched_at=observed_at if observed_at.tzinfo else observed_at.replace(tzinfo=UTC),
        usd_per_eur=None,
        calculation_method="provider_rate_tuple",
        is_manual_test=is_manual_or_test_provider(provider_id),
    )


def to_benchmark_xcg(
    original: MoneyAmount,
    *,
    eur_provider: EurRateProvider | None = None,
) -> BenchmarkPrice:
    """Convert original money to XCG without overwriting the original."""

    code = original.currency
    if code == "XCG":
        return BenchmarkPrice(
            amount_xcg=original.amount,
            conversion_method=ConversionMethod.IDENTITY,
            conversion_rate=Decimal("1"),
            conversion_provider="policy:xcg_identity",
            conversion_rate_at=datetime.now(UTC),
        )
    if code in {"ANG", "NAF"}:
        return BenchmarkPrice(
            amount_xcg=original.amount,
            conversion_method=ConversionMethod.LEGACY_1_TO_1,
            conversion_rate=Decimal("1"),
            conversion_provider="policy:ang_naf_1_to_1",
            conversion_rate_at=datetime.now(UTC),
        )
    if code == "USD":
        return BenchmarkPrice(
            amount_xcg=original.amount * USD_TO_XCG,
            conversion_method=ConversionMethod.USD_FIXED_PEG,
            conversion_rate=USD_TO_XCG,
            conversion_provider="policy:usd_1_79",
            conversion_rate_at=datetime.now(UTC),
        )
    if code == "EUR":
        if eur_provider is None:
            return BenchmarkPrice(
                amount_xcg=None,
                conversion_method=None,
                conversion_rate=None,
                conversion_provider=None,
                conversion_rate_at=None,
                pending=True,
                notes="EUR rate provider unavailable; benchmark pending",
            )
        try:
            quote = _quote_from_provider(eur_provider)
        except EurRateError as error:
            return BenchmarkPrice(
                amount_xcg=None,
                conversion_method=None,
                conversion_rate=None,
                conversion_provider=None,
                conversion_rate_at=None,
                pending=True,
                notes=f"EUR rate provider failed; benchmark pending: {error}",
                provenance={"error": str(error)},
            )
        observed_at = datetime(
            quote.observation_date.year,
            quote.observation_date.month,
            quote.observation_date.day,
            tzinfo=UTC,
        )
        provenance = quote.as_provenance()
        provenance["original_amount"] = str(original.amount)
        provenance["original_currency"] = original.currency
        return BenchmarkPrice(
            amount_xcg=original.amount * quote.eur_to_xcg,
            conversion_method=ConversionMethod.EUR_API,
            conversion_rate=quote.eur_to_xcg,
            conversion_provider=quote.provider_id,
            conversion_rate_at=observed_at,
            notes=quote.notes,
            provenance=provenance,
        )
    return BenchmarkPrice(
        amount_xcg=None,
        conversion_method=None,
        conversion_rate=None,
        conversion_provider=None,
        conversion_rate_at=None,
        pending=True,
        notes=f"Unsupported currency {code}",
    )


def cached_eur_provider(
    provider: EurRateProvider,
) -> Callable[[], tuple[Decimal, str, datetime]]:
    """Cache one EUR rate for the duration of a source run."""

    cached: tuple[Decimal, str, datetime] | None = None

    def _get() -> tuple[Decimal, str, datetime]:
        nonlocal cached
        if cached is None:
            cached = provider.get_eur_to_xcg_rate()
        return cached

    return _get
