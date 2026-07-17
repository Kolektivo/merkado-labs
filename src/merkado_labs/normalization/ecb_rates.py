"""ECB EUR reference rate → XCG benchmark provider."""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USD_TO_XCG = Decimal("1.79")

ECB_DAILY_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
ECB_PROVIDER_ID = "ecb_eur_usd_xcg_peg"
DEFAULT_MAX_AGE_DAYS = 5
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_RETRIES = 2
DEFAULT_RETRY_BACKOFF_SECONDS = 1.5
USER_AGENT = "MerkadoLabs/1.0 (+https://merkado.cw; property-research; contact=labs)"


class EurRateError(RuntimeError):
    """Raised when an EUR rate cannot be obtained safely."""


@dataclass(frozen=True)
class EurRateQuote:
    """One EUR→XCG quote with full provenance."""

    eur_to_xcg: Decimal
    provider_id: str
    observation_date: date
    fetched_at: datetime
    usd_per_eur: Decimal | None = None
    usd_to_xcg_peg: Decimal = USD_TO_XCG
    calculation_method: str = "ecb_usd_per_eur_times_usd_xcg_peg"
    is_manual_test: bool = False
    notes: str | None = None
    source_url: str | None = None

    def as_provenance(self) -> dict[str, Any]:
        return {
            "provider_id": self.provider_id,
            "calculation_method": self.calculation_method,
            "usd_per_eur": str(self.usd_per_eur) if self.usd_per_eur is not None else None,
            "usd_to_xcg_peg": str(self.usd_to_xcg_peg),
            "eur_to_xcg": str(self.eur_to_xcg),
            "ecb_observation_date": self.observation_date.isoformat(),
            "fetched_at": self.fetched_at.isoformat(),
            "is_manual_test": self.is_manual_test,
            "notes": self.notes,
            "source_url": self.source_url,
            "disclaimer": (
                "Indicative equivalent based on known information. "
                "Not a bank conversion quote, transaction rate, appraisal, or contractual amount."
            ),
        }


def parse_ecb_daily_xml(xml_text: str) -> tuple[date, Decimal]:
    """Parse ECB daily eurofxref XML and return (observation_date, USD per EUR)."""

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as error:
        raise EurRateError(f"ECB XML parse error: {error}") from error

    time_cube = None
    for elem in root.iter():
        if elem.tag.endswith("Cube") and "time" in elem.attrib:
            time_cube = elem
            break
    if time_cube is None:
        raise EurRateError("ECB XML missing dated Cube")

    raw_time = time_cube.attrib.get("time")
    if not raw_time:
        raise EurRateError("ECB XML missing observation time")
    try:
        observation_date = date.fromisoformat(raw_time)
    except ValueError as error:
        raise EurRateError(f"Invalid ECB observation date {raw_time!r}") from error

    usd_rate: Decimal | None = None
    for child in time_cube:
        if not child.tag.endswith("Cube"):
            continue
        if child.attrib.get("currency") != "USD":
            continue
        raw_rate = child.attrib.get("rate")
        if raw_rate is None:
            raise EurRateError("ECB USD Cube missing rate")
        try:
            usd_rate = Decimal(raw_rate)
        except (InvalidOperation, ValueError) as error:
            raise EurRateError(f"Invalid ECB USD rate {raw_rate!r}") from error
        break

    if usd_rate is None:
        raise EurRateError("ECB XML missing USD rate")
    if usd_rate <= 0:
        raise EurRateError(f"Non-positive ECB USD rate: {usd_rate}")
    # Sanity bounds for USD per EUR (reject obviously broken payloads).
    if usd_rate < Decimal("0.5") or usd_rate > Decimal("3.0"):
        raise EurRateError(f"ECB USD rate outside expected bounds: {usd_rate}")

    return observation_date, usd_rate


def derive_eur_to_xcg(usd_per_eur: Decimal, *, peg: Decimal = USD_TO_XCG) -> Decimal:
    """Approved formula: EUR_TO_XCG = ECB_USD_PER_EUR × 1.79."""

    return usd_per_eur * peg


@dataclass
class EcbEurRateProvider:
    """Production ECB daily USD-per-EUR reference → XCG peg provider.

    Caches one quote for the lifetime of the instance (one source run).
    Never falls back to a fabricated or test rate.
    """

    url: str = ECB_DAILY_XML_URL
    provider_id: str = ECB_PROVIDER_ID
    max_age_days: int = DEFAULT_MAX_AGE_DAYS
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    retries: int = DEFAULT_RETRIES
    retry_backoff_seconds: float = DEFAULT_RETRY_BACKOFF_SECONDS
    usd_to_xcg_peg: Decimal = USD_TO_XCG
    _cached: EurRateQuote | None = None

    def get_eur_to_xcg_quote(self) -> EurRateQuote:
        if self._cached is not None:
            return self._cached
        fetched_at = datetime.now(UTC)
        xml_text = self._fetch_xml()
        observation_date, usd_per_eur = parse_ecb_daily_xml(xml_text)
        age_days = (fetched_at.date() - observation_date).days
        if age_days < 0:
            raise EurRateError(
                f"ECB observation date {observation_date} is in the future "
                f"vs fetch {fetched_at.date()}"
            )
        if age_days > self.max_age_days:
            raise EurRateError(
                f"ECB observation {observation_date} is stale "
                f"({age_days} days old; max {self.max_age_days})"
            )
        eur_to_xcg = derive_eur_to_xcg(usd_per_eur, peg=self.usd_to_xcg_peg)
        quote = EurRateQuote(
            eur_to_xcg=eur_to_xcg,
            provider_id=self.provider_id,
            observation_date=observation_date,
            fetched_at=fetched_at,
            usd_per_eur=usd_per_eur,
            usd_to_xcg_peg=self.usd_to_xcg_peg,
            calculation_method="ecb_usd_per_eur_times_usd_xcg_peg",
            is_manual_test=False,
            notes=(
                "ECB daily USD-per-EUR reference × fixed USD→XCG peg 1.79. "
                "Latest published working-day observation (weekends/holidays reuse prior)."
            ),
            source_url=self.url,
        )
        self._cached = quote
        return quote

    def get_eur_to_xcg_rate(self) -> tuple[Decimal, str, datetime]:
        quote = self.get_eur_to_xcg_quote()
        observed_at = datetime(
            quote.observation_date.year,
            quote.observation_date.month,
            quote.observation_date.day,
            tzinfo=UTC,
        )
        return quote.eur_to_xcg, quote.provider_id, observed_at

    def _fetch_xml(self) -> str:
        last_error: Exception | None = None
        attempts = max(1, self.retries + 1)
        for attempt in range(attempts):
            try:
                request = Request(
                    self.url,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/xml,text/xml,*/*"},
                    method="GET",
                )
                with urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310
                    status = getattr(response, "status", None) or response.getcode()
                    if status != 200:
                        raise EurRateError(f"ECB HTTP status {status}")
                    body = response.read(2_000_000)
                if not body:
                    raise EurRateError("ECB response body empty")
                return body.decode("utf-8")
            except (HTTPError, URLError, TimeoutError, EurRateError, OSError) as error:
                last_error = error
                if attempt + 1 < attempts:
                    time.sleep(self.retry_backoff_seconds * (attempt + 1))
        raise EurRateError(f"ECB fetch failed after {attempts} attempts: {last_error}")


@dataclass(frozen=True)
class ManualEurRateProvider:
    """Explicit manual/test EUR→XCG provider. Never used as silent fallback."""

    rate: Decimal
    provider_id: str = "manual_test"
    observation_date: date | None = None
    fetched_at: datetime | None = None
    observed_at: datetime | None = None  # backward-compatible alias
    notes: str = "Manual/test EUR→XCG rate (not an ECB reference)"

    def get_eur_to_xcg_quote(self) -> EurRateQuote:
        fetched = self.fetched_at or self.observed_at or datetime.now(UTC)
        observed = self.observation_date or fetched.date()
        if self.rate <= 0:
            raise EurRateError("Manual EUR rate must be positive")
        return EurRateQuote(
            eur_to_xcg=self.rate,
            provider_id=self.provider_id,
            observation_date=observed,
            fetched_at=fetched if fetched.tzinfo else fetched.replace(tzinfo=UTC),
            usd_per_eur=None,
            usd_to_xcg_peg=USD_TO_XCG,
            calculation_method="manual_fixed_eur_to_xcg",
            is_manual_test=True,
            notes=self.notes,
            source_url=None,
        )

    def get_eur_to_xcg_rate(self) -> tuple[Decimal, str, datetime]:
        quote = self.get_eur_to_xcg_quote()
        observed_at = datetime(
            quote.observation_date.year,
            quote.observation_date.month,
            quote.observation_date.day,
            tzinfo=UTC,
        )
        return quote.eur_to_xcg, quote.provider_id, observed_at


# Backward-compatible alias used by existing tests/CLI.
FixedEurRateProvider = ManualEurRateProvider


def stale_after(*, observation_date: date, fetched_at: datetime, max_age_days: int) -> bool:
    return (fetched_at.date() - observation_date) > timedelta(days=max_age_days)
