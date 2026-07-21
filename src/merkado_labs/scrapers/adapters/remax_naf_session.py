"""Bounded RE/MAX NAF/XCG cookie-session capture for official alternates.

Live EUR pages omit the NAF/XCG selector amount. Proven mechanism
(``scripts/recon/probe_multi_currency_live.py``):

1. Fetch listing page
2. GET ``/currency/NAF/`` (sets ``currency=NAF`` session cookie)
3. Preserve cookies
4. Re-fetch the same listing
5. Verify same external listing
6. Extract official NAF/XCG amount from ``itemprop=price``

Never invents amounts from Merkado/ECB rates. Does not refetch images.
"""

from __future__ import annotations

import hashlib
import http.cookiejar
import re
import ssl
import time
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPCookieProcessor, HTTPSHandler, Request, build_opener

import certifi

from merkado_labs.normalization.currency import (
    normalize_currency_code,
    parse_decimal_amount,
)
from merkado_labs.scrapers.contracts import (
    SOURCE_OFFICIAL_PROVENANCE,
    OfficialAlternatePrice,
)
from merkado_labs.scrapers.robots import USER_AGENT

BASE_URL = "https://www.realestate-curacao.com"
DOMAINS = frozenset({"www.realestate-curacao.com", "realestate-curacao.com"})
NAF_CURRENCY_PATH = "/currency/NAF/"
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_RETRIES = 2
RETRY_BACKOFF_SECONDS = 2.0
SOURCE_FRIENDLY_DELAY_SECONDS = 1.5
MAX_RESPONSE_BYTES = 2_000_000
REF_FROM_URL = re.compile(r"/(?P<ref>(?:hs|hr|lo|co)\d+)/", re.IGNORECASE)

ACTIVE_CURRENCY_RE = re.compile(
    r"<li[^>]*class=['\"][^'\"]*active[^'\"]*['\"][^>]*>\s*"
    r"<a[^>]+href=['\"]/currency/(?P<code>EUR|USD|NAF)/",
    re.I,
)
CURRENCY_LINK_RE = re.compile(
    r'<a[^>]+href=["\'](?P<href>/currency/(?P<code>EUR|USD|NAF)/)["\']',
    re.I,
)
HTML_REF_RE = re.compile(r"\b((?:hs|hr|lo|co)\d+)\b", re.I)


def _external_id_from_url(url: str) -> str | None:
    match = REF_FROM_URL.search(url)
    return match.group("ref").lower() if match else None

# Optional injectable GET: (url) -> {ok, status, final_url, html, error?}
HttpGetFn = Callable[[str], dict[str, Any]]


@dataclass(frozen=True)
class NafSessionCaptureResult:
    """Outcome of one bounded NAF session attempt."""

    alternate: OfficialAlternatePrice | None
    warnings: tuple[str, ...] = ()
    skipped: bool = False
    active_currency: str | None = None
    naf_display_amount: str | None = None
    naf_display_currency: str | None = None
    html_sha256: str | None = None


def has_official_xcg_alternate(
    alts: list[OfficialAlternatePrice] | tuple[OfficialAlternatePrice, ...] | None,
) -> bool:
    """True when a source-official XCG/ANG/NAF alternate is already present."""

    if not alts:
        return False
    for alt in alts:
        if alt.provenance != SOURCE_OFFICIAL_PROVENANCE:
            continue
        code = normalize_currency_code(alt.currency)
        if code in {"XCG", "ANG", "NAF"} and alt.amount > 0:
            return True
    return False


def active_currency_selector(html: str) -> str | None:
    match = ACTIVE_CURRENCY_RE.search(html)
    return match.group("code").upper() if match else None


def naf_switch_url(html: str | None = None) -> str:
    if html:
        for match in CURRENCY_LINK_RE.finditer(html):
            if match.group("code").upper() == "NAF":
                return urljoin(BASE_URL, match.group("href"))
    return urljoin(BASE_URL, NAF_CURRENCY_PATH)


def _hostname_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in DOMAINS


def _ssl_opener_with_cookies(
    jar: http.cookiejar.CookieJar,
) -> Any:
    ctx = ssl.create_default_context(cafile=certifi.where())
    return build_opener(HTTPCookieProcessor(jar), HTTPSHandler(context=ctx))


def _default_http_get_factory(
    jar: http.cookiejar.CookieJar,
    *,
    user_agent: str,
    timeout_seconds: float,
) -> HttpGetFn:
    opener = _ssl_opener_with_cookies(jar)

    def _get(url: str) -> dict[str, Any]:
        if urlparse(url).scheme != "https" or not _hostname_allowed(url):
            return {
                "ok": False,
                "status": None,
                "final_url": url,
                "html": "",
                "error": "host_not_allowed",
            }
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            request = Request(
                url,
                headers={
                    "User-Agent": user_agent,
                    "Accept": "text/html,application/xhtml+xml",
                },
                method="GET",
            )
            try:
                with opener.open(request, timeout=timeout_seconds) as response:  # noqa: S310
                    status = getattr(response, "status", None) or response.getcode()
                    final_url = response.geturl()
                    body = response.read(MAX_RESPONSE_BYTES + 1)
                    if len(body) > MAX_RESPONSE_BYTES:
                        return {
                            "ok": False,
                            "status": status,
                            "final_url": final_url,
                            "html": "",
                            "error": "response_too_large",
                        }
                    html = body.decode("utf-8", errors="replace")
                    return {
                        "ok": True,
                        "status": int(status) if status else None,
                        "final_url": final_url,
                        "html": html,
                        "error": None,
                    }
            except HTTPError as error:
                last_error = error
                if error.code in {401, 403, 429, 503}:
                    return {
                        "ok": False,
                        "status": error.code,
                        "final_url": getattr(error, "url", url),
                        "html": "",
                        "error": f"http_{error.code}",
                    }
                if attempt >= MAX_RETRIES:
                    return {
                        "ok": False,
                        "status": error.code,
                        "final_url": getattr(error, "url", url),
                        "html": "",
                        "error": f"http_{error.code}",
                    }
            except (TimeoutError, URLError, OSError) as error:
                last_error = error
                if attempt >= MAX_RETRIES:
                    return {
                        "ok": False,
                        "status": None,
                        "final_url": url,
                        "html": "",
                        "error": f"{type(error).__name__}: {error}",
                    }
            time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
        return {
            "ok": False,
            "status": None,
            "final_url": url,
            "html": "",
            "error": str(last_error) if last_error else "fetch_failed",
        }

    return _get


def verify_same_listing(
    *,
    listing_url: str,
    naf_html: str,
    naf_final_url: str,
    expected_external_id: str,
) -> str | None:
    """Return a warning code if the NAF view is not the same listing, else None."""

    expected = expected_external_id.lower()
    url_id = _external_id_from_url(listing_url)
    if url_id and url_id != expected:
        return "naf_listing_url_external_id_mismatch"
    final_id = _external_id_from_url(naf_final_url)
    if final_id and final_id != expected:
        return "naf_redirect_external_id_mismatch"
    # Path must still contain the listing ref (redirect to homepage fails).
    path = urlparse(naf_final_url).path.lower()
    if f"/{expected}/" not in path:
        return "naf_final_url_missing_listing_ref"
    html_refs = {m.group(1).lower() for m in HTML_REF_RE.finditer(naf_html)}
    if html_refs and expected not in html_refs:
        return "naf_html_external_id_mismatch"
    return None


def _extract_naf_display_money(
    html: str,
) -> tuple[Decimal | None, str | None, str | None]:
    """Return (amount, currency, evidence) from NAF-view itemprop=price."""

    # Lazy import avoids circular dependency with remax_curacao.
    from merkado_labs.scrapers.adapters.remax_curacao import extract_price

    price_field = extract_price(html)
    if price_field is None or not isinstance(price_field.normalized_value, dict):
        return None, None, None
    amount = parse_decimal_amount(price_field.normalized_value.get("amount"))
    currency = normalize_currency_code(price_field.normalized_value.get("currency"))
    # NAF selector is labelled XCG; treat NAF display as XCG-equivalent.
    if currency == "NAF":
        currency = "XCG"
    evidence = price_field.evidence_snippet
    return amount, currency, evidence


def validate_naf_currency_state(
    html: str,
    *,
    amount: Decimal | None,
    currency: str | None,
) -> str | None:
    """Ensure the re-fetched page is in NAF/XCG state with a usable amount."""

    active = active_currency_selector(html)
    if active and active != "NAF":
        return f"naf_active_currency_not_naf:{active}"
    code = normalize_currency_code(currency)
    if code not in {"XCG", "ANG", "NAF"}:
        return f"naf_display_currency_not_xcg:{currency or 'none'}"
    if amount is None or amount <= 0:
        return "naf_display_amount_missing"
    return None


def capture_naf_official_alternate(
    listing_url: str,
    *,
    expected_external_id: str | None = None,
    default_html: str | None = None,
    honor_delay: bool = True,
    user_agent: str = USER_AGENT,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    http_get: HttpGetFn | None = None,
) -> NafSessionCaptureResult:
    """Capture official NAF/XCG alternate via cookie session when missing inline.

    On any failure returns ``alternate=None`` with warnings; caller retains the
    existing asking anchor.
    """

    from merkado_labs.scrapers.adapters.remax_curacao import (
        extract_listed_in_currency,
        extract_official_alternate_prices,
    )

    expected = (expected_external_id or _external_id_from_url(listing_url) or "").lower()
    if not expected:
        return NafSessionCaptureResult(
            alternate=None,
            warnings=("naf_session_missing_external_id",),
        )

    if default_html is not None:
        existing = extract_official_alternate_prices(default_html)
        if has_official_xcg_alternate(existing):
            return NafSessionCaptureResult(
                alternate=None,
                warnings=(),
                skipped=True,
            )

    jar = http.cookiejar.CookieJar()
    get = http_get or _default_http_get_factory(
        jar, user_agent=user_agent, timeout_seconds=timeout_seconds
    )

    warnings: list[str] = []

    # Ensure we have a session from the listing page before switching currency.
    if default_html is None:
        if honor_delay:
            time.sleep(SOURCE_FRIENDLY_DELAY_SECONDS)
        listing_fetch = get(listing_url)
        if not listing_fetch.get("ok"):
            return NafSessionCaptureResult(
                alternate=None,
                warnings=(
                    f"naf_session_listing_fetch_failed:{listing_fetch.get('error')}",
                ),
            )
        default_html = listing_fetch.get("html") or ""
        existing = extract_official_alternate_prices(default_html)
        if has_official_xcg_alternate(existing):
            return NafSessionCaptureResult(
                alternate=None,
                warnings=(),
                skipped=True,
            )

    switch_url = naf_switch_url(default_html)
    if not _hostname_allowed(switch_url):
        return NafSessionCaptureResult(
            alternate=None,
            warnings=("naf_switch_host_not_allowed",),
        )

    if honor_delay:
        time.sleep(SOURCE_FRIENDLY_DELAY_SECONDS)
    switch_fetch = get(switch_url)
    if not switch_fetch.get("ok"):
        return NafSessionCaptureResult(
            alternate=None,
            warnings=(f"naf_switch_fetch_failed:{switch_fetch.get('error')}",),
        )
    switch_final = switch_fetch.get("final_url") or switch_url
    if not _hostname_allowed(str(switch_final)):
        return NafSessionCaptureResult(
            alternate=None,
            warnings=("naf_switch_redirect_host_not_allowed",),
        )

    if honor_delay:
        time.sleep(SOURCE_FRIENDLY_DELAY_SECONDS)
    after_fetch = get(listing_url)
    if not after_fetch.get("ok"):
        return NafSessionCaptureResult(
            alternate=None,
            warnings=(f"naf_listing_refetch_failed:{after_fetch.get('error')}",),
        )

    naf_html = after_fetch.get("html") or ""
    naf_final = str(after_fetch.get("final_url") or listing_url)
    if not _hostname_allowed(naf_final):
        return NafSessionCaptureResult(
            alternate=None,
            warnings=("naf_refetch_host_not_allowed",),
        )

    same_err = verify_same_listing(
        listing_url=listing_url,
        naf_html=naf_html,
        naf_final_url=naf_final,
        expected_external_id=expected,
    )
    if same_err:
        return NafSessionCaptureResult(
            alternate=None,
            warnings=(same_err,),
        )

    amount, currency, evidence = _extract_naf_display_money(naf_html)
    state_err = validate_naf_currency_state(
        naf_html, amount=amount, currency=currency
    )
    if state_err:
        return NafSessionCaptureResult(
            alternate=None,
            warnings=(state_err,),
            active_currency=active_currency_selector(naf_html),
            naf_display_amount=str(amount) if amount is not None else None,
            naf_display_currency=currency,
        )

    assert amount is not None and currency is not None
    listed_in = extract_listed_in_currency(naf_html)
    alt = OfficialAlternatePrice(
        amount=amount,
        currency=currency,
        provenance=SOURCE_OFFICIAL_PROVENANCE,
        evidence=evidence,
        source_label="remax_naf_session",
    )
    sha = hashlib.sha256(naf_html.encode("utf-8")).hexdigest()
    if listed_in and listed_in not in {"XCG", "ANG", "NAF", "EUR", "USD"}:
        warnings.append(f"naf_listed_in_unexpected:{listed_in}")

    return NafSessionCaptureResult(
        alternate=alt,
        warnings=tuple(warnings),
        skipped=False,
        active_currency=active_currency_selector(naf_html) or "NAF",
        naf_display_amount=str(amount),
        naf_display_currency=currency,
        html_sha256=sha,
    )
