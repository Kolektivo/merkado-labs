#!/usr/bin/env python3
"""Read-only live multi-currency probe for Ready property sources.

Fetches live detail pages (no Supabase writes, no import, no OpenAI).
For RE/MAX, discovers the real currency-switch mechanism via cookie session.

Usage:
  PYTHONPATH=src python scripts/recon/probe_multi_currency_live.py
  PYTHONPATH=src python scripts/recon/probe_multi_currency_live.py --out data/processed/multi_currency_probe.json
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime
from decimal import Decimal
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.normalization.currency import (  # noqa: E402
    normalize_currency_code,
    parse_decimal_amount,
)

UA = "MerkadoLabsResearch/0.1 (+local; read-only currency probe; no scrape import)"
TIMEOUT = 45

# Representative active Labs listings (ids for report cross-ref only).
PROBE: list[dict[str, str]] = [
    # RE/MAX — hr2066 known EUR/XCG gap + 2 rent + 2 sale
    {
        "source_key": "remax_curacao",
        "external_id": "hr2066",
        "listing_id": "17d17d2c-f61f-4a6d-9760-ab38ca97a74a",
        "url": "https://www.realestate-curacao.com/en/homes/homes-for-rent/hr2066/rented/marie-pampoen-cozy-furnished-house-for-rent.html",
        "stored_original": "664 EUR",
        "stored_benchmark_xcg": "1358.048656",
    },
    {
        "source_key": "remax_curacao",
        "external_id": "hr2164",
        "listing_id": "8695e1a9-a6b6-48da-abef-1dfa2c5efbf5",
        "url": "https://www.realestate-curacao.com/en/homes/homes-for-rent/hr2164/punda-luxury-fully-furnished-studio.html",
        "stored_original": "860 EUR",
        "stored_benchmark_xcg": "1758.91844",
    },
    {
        "source_key": "remax_curacao",
        "external_id": "hr2154",
        "listing_id": "6fe21df9-9d30-40bb-89ca-5db76128ad6d",
        "url": "https://www.realestate-curacao.com/en/homes/homes-for-rent/hr2154/lovely-fully-furnished-apartment-with-panoramic-terrace-sun-valley.html",
        "stored_original": "942 EUR",
        "stored_benchmark_xcg": "1926.629268",
    },
    {
        "source_key": "remax_curacao",
        "external_id": "hs2992",
        "listing_id": "9e26a654-ba0a-407a-b6a6-c7e889b0a2c3",
        "url": "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs2992/unique-property-in-punda-with-expansion-opportunities.html",
        "stored_original": "233550 EUR",
        "stored_benchmark_xcg": "477669.0717",
    },
    {
        "source_key": "remax_curacao",
        "external_id": "hs3108",
        "listing_id": "672b9b0a-1aa2-4f53-a631-0a813b196478",
        "url": "https://www.realestate-curacao.com/en/homes/homes-for-sale/hs3108/charming-3-bedroom-villa-with-high-ceilings-tropical-garden.html",
        "stored_original": "233550 EUR",
        "stored_benchmark_xcg": "477669.0717",
    },
    # KW
    {
        "source_key": "keller_williams_curacao",
        "external_id": "JC-0027",
        "listing_id": "42485f4d-affd-4c5e-a5af-9cb5e80137a1",
        "url": "https://kw-curacao.com/listings/2-bedroom-condo-seaview-JC-0027",
        "stored_original": "795000 USD",
        "stored_benchmark_xcg": "1423050.0",
    },
    {
        "source_key": "keller_williams_curacao",
        "external_id": "JC-003",
        "listing_id": "7812536f-e5df-46cd-a2d2-6a32619c27c7",
        "url": "https://kw-curacao.com/listings/irenelaan-29-JC-003",
        "stored_original": "684500 USD",
        "stored_benchmark_xcg": "1225255.0",
    },
    {
        "source_key": "keller_williams_curacao",
        "external_id": "ADL-0006",
        "listing_id": "132809d2-23cf-43be-98dd-f5bc274cdb88",
        "url": "https://kw-curacao.com/listings/tera-kora-plaza-ADL-0006",
        "stored_original": "838 USD",
        "stored_benchmark_xcg": "1500.02",
    },
    # Moret — one per stored currency
    {
        "source_key": "moret_real_estate",
        "external_id": "post-75799",
        "listing_id": "9dc05f3c-dfea-4215-8605-ca265e468d60",
        "url": "https://moretrealestate.com/properties/sint-jorisbaai-exclusief-wonen/",
        "stored_original": "635000 XCG",
        "stored_benchmark_xcg": "635000.0",
    },
    {
        "source_key": "moret_real_estate",
        "external_id": "post-68698",
        "listing_id": "12ba0e2a-9500-44db-93d2-f06cc5aa390a",
        "url": "https://moretrealestate.com/properties/otrobanda-turnkey-appartement/",
        "stored_original": "375000 USD",
        "stored_benchmark_xcg": "671250.0",
    },
    {
        "source_key": "moret_real_estate",
        "external_id": "post-66838",
        "listing_id": "b4661aa5-591a-42ac-9b00-c278a7054155",
        "url": "https://moretrealestate.com/properties/julianadrop-charmante-familiewoning/",
        "stored_original": "1950 EUR",
        "stored_benchmark_xcg": "3988.2453",
    },
    # Monumentenzorg — all active
    {
        "source_key": "monumentenzorg_curacao",
        "external_id": "property-18650",
        "listing_id": "b70dbb86-2a83-4449-9709-7a8c3b4216ba",
        "url": "https://monumentenzorg.cw/properties/villa-maria/",
        "stored_original": "8000 ANG",
        "stored_benchmark_xcg": "8000.0",
    },
    {
        "source_key": "monumentenzorg_curacao",
        "external_id": "property-19349",
        "listing_id": "17e06c59-ee16-4fc5-8051-2ada2b8245af",
        "url": "https://monumentenzorg.cw/properties/bargestraat-28-d/",
        "stored_original": "3500 ANG",
        "stored_benchmark_xcg": "3500.0",
    },
    {
        "source_key": "monumentenzorg_curacao",
        "external_id": "property-20933",
        "listing_id": "466c9a68-cd05-4141-887e-ae1b9aae279a",
        "url": "https://monumentenzorg.cw/properties/fort-waakzaamheid/",
        "stored_original": "null",
        "stored_benchmark_xcg": "",
    },
    {
        "source_key": "monumentenzorg_curacao",
        "external_id": "property-31",
        "listing_id": "31946d36-0698-469e-82c9-3aa538a09855",
        "url": "https://monumentenzorg.cw/properties/villawashington/",
        "stored_original": "null",
        "stored_benchmark_xcg": "",
    },
]

ITEMPROP_PRICE_RE = re.compile(
    r'itemprop=["\']price["\'][^>]*>(?P<body>.*?)</',
    re.I | re.S,
)
KW_PRICE_RE = re.compile(
    r'class=["\'][^"\']*page-property-details__price[^"\']*["\'][^>]*>(?P<body>.*?)</div>',
    re.I | re.S,
)
MORET_PRICE_RE = re.compile(
    r'class=["\'][^"\']*\bprice_area\b[^"\']*["\'][^>]*>(?P<body>.{0,400}?)</span>\s*</',
    re.I | re.S,
)
MORET_PRIJS_RE = re.compile(
    r"<strong>\s*Prijs:\s*</strong>\s*(?P<body>.{0,200})",
    re.I | re.S,
)
LISTED_IN_RE = re.compile(
    r"This specific object is listed in\s+(?P<code>XCG|ANG|NAF|EUR|USD|NAf)\b",
    re.I,
)
CURRENCY_LINK_RE = re.compile(
    r'<a[^>]+href=["\'](?P<href>/currency/(?P<code>EUR|USD|NAF)/)["\'][^>]*>\s*(?P<label>[^<]+)',
    re.I,
)
ACTIVE_CURRENCY_RE = re.compile(
    r"<li[^>]*class=['\"][^'\"]*active[^'\"]*['\"][^>]*>\s*<a[^>]+href=['\"]/currency/(?P<code>EUR|USD|NAF)/",
    re.I,
)
MONEY_RE = re.compile(
    r"(?:(?P<code>USD|EUR|XCG|ANG|NAF|NAf|&euro;|€)\s*(?P<amount>[\d.,]+)"
    r"|(?P<amount2>[\d.,]+)\s*(?P<code2>USD|EUR|XCG|ANG|NAF|NAf))",
    re.I,
)
MORET_COEF_RE = re.compile(
    r"data-coef=[\"'](?P<coef>[^\"']*)[\"'][^>]*data-value=[\"'](?P<code>[^\"']+)[\"']"
    r"|data-value=[\"'](?P<code2>[^\"']+)[\"'][^>]*data-coef=[\"'](?P<coef2>[^\"']*)[\"']",
    re.I,
)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def _text(html: str) -> str:
    return WS_RE.sub(" ", TAG_RE.sub(" ", unescape(html))).strip()


def _money_hits(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in MONEY_RE.finditer(text):
        code = m.group("code") or m.group("code2") or ""
        amount_raw = m.group("amount") or m.group("amount2") or ""
        if code.lower() in {"&euro;", "€"}:
            code = "EUR"
        currency = normalize_currency_code(code)
        amount = parse_decimal_amount(amount_raw)
        if currency and amount is not None:
            out.append(
                {
                    "currency": currency,
                    "amount": str(amount),
                    "raw": m.group(0)[:80],
                }
            )
    return out


def _ssl_opener() -> urllib.request.OpenerDirector:
    """Prefer certifi CA bundle (same as Labs http_cache)."""

    try:
        import ssl

        import certifi

        ctx = ssl.create_default_context(cafile=certifi.where())
        return urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    except Exception:  # noqa: BLE001
        return urllib.request.build_opener()


def _fetch(
    url: str,
    *,
    opener: urllib.request.OpenerDirector | None = None,
    method: str = "GET",
) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"},
        method=method,
    )
    try:
        handler = opener or _ssl_opener()
        with handler.open(req, timeout=TIMEOUT) as resp:
            body = resp.read()
            final = resp.geturl()
            status = getattr(resp, "status", None) or resp.getcode()
            headers = {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        final = exc.geturl() if hasattr(exc, "geturl") else url
        status = exc.code
        headers = {k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])}
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "url": url,
            "error": f"{type(exc).__name__}: {exc}",
            "html": "",
            "status": None,
            "final_url": url,
            "headers": {},
        }
    html = body.decode("utf-8", "replace")
    return {
        "ok": True,
        "url": url,
        "final_url": final,
        "status": status,
        "headers": {
            k: headers.get(k)
            for k in ("set-cookie", "location", "content-type")
            if headers.get(k)
        },
        "html": html,
        "bytes": len(body),
    }


def _parse_remax(html: str) -> dict[str, Any]:
    price_m = ITEMPROP_PRICE_RE.search(html)
    price_text = _text(price_m.group("body")) if price_m else None
    listed = None
    lm = LISTED_IN_RE.search(html)
    if lm:
        listed = normalize_currency_code(lm.group("code"))
    links = [
        {
            "href": m.group("href"),
            "code": m.group("code").upper(),
            "label": _text(m.group("label")),
        }
        for m in CURRENCY_LINK_RE.finditer(html)
    ]
    active = None
    am = ACTIVE_CURRENCY_RE.search(html)
    if am:
        active = am.group("code").upper()
    moneys = _money_hits(price_text or "")
    return {
        "display_price_text": price_text,
        "display_moneys": moneys,
        "listed_in_currency": listed,
        "active_selector_code": active,
        "currency_links": links,
        "has_synthetic_hooks": bool(
            re.search(r"remax-currency-evidence|data-remax-official-", html, re.I)
        ),
    }


def _probe_remax(item: dict[str, str]) -> dict[str, Any]:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        *_ssl_opener().handlers,
    )
    base = "https://www.realestate-curacao.com"

    default_fetch = _fetch(item["url"], opener=opener)
    default_parse = _parse_remax(default_fetch.get("html") or "")
    mechanism: dict[str, Any] = {
        "kind": "unknown",
        "switch_url": None,
        "switch_status": None,
        "switch_final_url": None,
        "cookies_after_switch": [],
        "notes": [],
    }

    # Prefer NAF (labelled XCG on site) absolute URL from the page.
    naf_href = next(
        (c["href"] for c in default_parse.get("currency_links") or [] if c["code"] == "NAF"),
        "/currency/NAF/",
    )
    switch_url = urljoin(base, naf_href)
    mechanism["switch_url"] = switch_url
    mechanism["kind"] = "http_get_currency_path_sets_session_cookie"

    # Capture cookies before switch.
    cookies_before = sorted({c.name for c in jar})
    switch_fetch = _fetch(switch_url, opener=opener)
    cookies_after = [
        {"name": c.name, "domain": c.domain, "path": c.path, "value_len": len(c.value or "")}
        for c in jar
    ]
    mechanism["switch_status"] = switch_fetch.get("status")
    mechanism["switch_final_url"] = switch_fetch.get("final_url")
    mechanism["cookies_before"] = cookies_before
    mechanism["cookies_after_switch"] = cookies_after
    mechanism["switch_set_cookie_header"] = (switch_fetch.get("headers") or {}).get(
        "set-cookie"
    )
    # Cookie names that appeared or changed (do not log values).
    cookie_names = sorted({c["name"] for c in cookies_after})
    mechanism["cookie_names"] = cookie_names
    if any(n.lower() in {"currency", "curr", "cur"} or "curr" in n.lower() for n in cookie_names):
        mechanism["notes"].append("currency-related cookie present after /currency/NAF/")
    if switch_fetch.get("final_url") and switch_fetch["final_url"] != switch_url:
        mechanism["notes"].append(
            f"switch redirected to {urlparse(switch_fetch['final_url']).path}"
        )

    after_fetch = _fetch(item["url"], opener=opener)
    after_parse = _parse_remax(after_fetch.get("html") or "")

    # Also try USD for completeness on first listing only (cheap).
    usd_view = None
    if item["external_id"] == "hr2066":
        usd_url = urljoin(base, "/currency/USD/")
        _fetch(usd_url, opener=opener)
        usd_html = _fetch(item["url"], opener=opener)
        usd_view = _parse_remax(usd_html.get("html") or "")

    default_amt = (default_parse.get("display_moneys") or [{}])[0]
    naf_amt = (after_parse.get("display_moneys") or [{}])[0]
    stored_bench = item.get("stored_benchmark_xcg") or None
    delta = None
    if stored_bench and naf_amt.get("amount") and naf_amt.get("currency") in {"XCG", "ANG", "NAF"}:
        try:
            delta = str(Decimal(naf_amt["amount"]) - Decimal(stored_bench))
        except Exception:  # noqa: BLE001
            delta = None

    return {
        **item,
        "probe": "remax_currency_switch",
        "default_view": {
            "http_status": default_fetch.get("status"),
            "ok": default_fetch.get("ok"),
            **default_parse,
        },
        "currency_switch_mechanism": mechanism,
        "naf_xcg_view": {
            "http_status": after_fetch.get("status"),
            "ok": after_fetch.get("ok"),
            **after_parse,
        },
        "usd_view": usd_view,
        "comparison": {
            "stored_original": item.get("stored_original"),
            "stored_benchmark_xcg": stored_bench,
            "live_default_display": default_amt,
            "live_naf_xcg_display": naf_amt,
            "official_xcg_minus_merkado_benchmark": delta,
            "synthetic_hooks_present": default_parse.get("has_synthetic_hooks"),
        },
    }


def _probe_kw(item: dict[str, str]) -> dict[str, Any]:
    fetch = _fetch(item["url"])
    html = fetch.get("html") or ""
    block = KW_PRICE_RE.search(html)
    price_text = _text(block.group("body")) if block else None
    moneys = _money_hits(price_text or "")
    # Fallback: scan near currency-tooltip
    if not moneys:
        tip = re.search(
            r'class=["\'][^"\']*page-property-details__price[^"\']*["\'][^>]*>(?P<body>.{0,500})',
            html,
            re.I | re.S,
        )
        if tip:
            price_text = _text(tip.group("body"))
            moneys = _money_hits(price_text)
    anchor = moneys[0] if moneys else None
    alts = moneys[1:] if len(moneys) > 1 else []
    xcg = next((m for m in moneys if m["currency"] in {"XCG", "ANG", "NAF"}), None)
    stored_bench = item.get("stored_benchmark_xcg") or None
    delta = None
    if stored_bench and xcg:
        try:
            delta = str(Decimal(xcg["amount"]) - Decimal(stored_bench))
        except Exception:  # noqa: BLE001
            delta = None
    return {
        **item,
        "probe": "kw_inline_price_lines",
        "http_status": fetch.get("status"),
        "ok": fetch.get("ok"),
        "error": fetch.get("error"),
        "price_text": price_text,
        "moneys_in_order": moneys,
        "anchor": anchor,
        "official_alts": alts,
        "official_xcg": xcg,
        "exposure": (
            "Inline multi-line price block: first code is asking anchor; "
            "following EUR (indicative tooltip) and XCG lines are source-published alts."
        ),
        "comparison": {
            "stored_original": item.get("stored_original"),
            "stored_benchmark_xcg": stored_bench,
            "live_official_xcg": xcg,
            "official_xcg_minus_merkado_benchmark": delta,
        },
    }


def _probe_moret(item: dict[str, str]) -> dict[str, Any]:
    fetch = _fetch(item["url"])
    html = fetch.get("html") or ""
    price_text = None
    # Prefer Prijs detail row (avoids CSS false hits on .price_area).
    prijs = MORET_PRIJS_RE.search(html)
    if prijs:
        price_text = _text(prijs.group("body"))
    if not price_text:
        block = MORET_PRICE_RE.search(html)
        if block:
            price_text = _text(block.group("body"))
    # Also catch "375.000 USD" inside nested price_label spans.
    if not price_text or not _money_hits(price_text):
        nested = re.search(
            r'class=["\'][^"\']*\bprice_area\b[^"\']*["\'][^>]*>'
            r'(?P<body>(?:(?!</span>\s*</).){0,400})',
            html,
            re.I | re.S,
        )
        if nested:
            price_text = _text(nested.group("body"))
    moneys = _money_hits(price_text or "")
    coefs = []
    for m in MORET_COEF_RE.finditer(html):
        code = m.group("code") or m.group("code2")
        coef = m.group("coef") if m.group("coef") is not None else m.group("coef2")
        coefs.append({"currency": normalize_currency_code(code) or code, "coef": coef})
    return {
        **item,
        "probe": "moret_price_area_and_widget",
        "http_status": fetch.get("status"),
        "ok": fetch.get("ok"),
        "error": fetch.get("error"),
        "price_text": price_text,
        "trusted_price_moneys": moneys,
        "sidebar_currency_coefs": coefs,
        "exposure": (
            "Trusted listing price is .price_area / Prijs label (often already XCG). "
            "Sidebar WPEstate widget exposes XCG/USD/EUR with data-coef; empty coef "
            "means client-side conversion, not a published alternate amount."
        ),
        "comparison": {
            "stored_original": item.get("stored_original"),
            "stored_benchmark_xcg": item.get("stored_benchmark_xcg") or None,
            "live_trusted_price": moneys[0] if moneys else None,
        },
    }


def _probe_monumentenzorg(item: dict[str, str]) -> dict[str, Any]:
    fetch = _fetch(item["url"])
    html = fetch.get("html") or ""
    # Common price patterns on Monumentenzorg WP pages
    candidates: list[str] = []
    for pat in (
        r'class=["\'][^"\']*price[^"\']*["\'][^>]*>(?P<body>.*?)</',
        r"(?P<body>\b(?:ANG|XCG|NAF|USD|EUR)\s*[\d.,]+)",
        r"(?P<body>[\d.,]+)\s*(?:ANG|XCG|NAf|NAF)",
    ):
        for m in re.finditer(pat, html, re.I | re.S):
            candidates.append(_text(m.group("body"))[:120])
    moneys: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in candidates:
        for hit in _money_hits(c):
            key = f"{hit['currency']}|{hit['amount']}"
            if key not in seen:
                seen.add(key)
                moneys.append(hit)
    has_selector = bool(
        re.search(r"currency|valuta|multiple_currency|/currency/", html, re.I)
    )
    return {
        **item,
        "probe": "monumentenzorg_single_currency",
        "http_status": fetch.get("status"),
        "ok": fetch.get("ok"),
        "error": fetch.get("error"),
        "price_candidates": candidates[:8],
        "moneys": moneys,
        "multi_currency_selector_present": has_selector,
        "exposure": (
            "Single displayed asking currency (typically ANG/XCG). "
            "No multi-currency selector observed in prior fixtures; confirm live."
        ),
        "comparison": {
            "stored_original": item.get("stored_original"),
            "stored_benchmark_xcg": item.get("stored_benchmark_xcg") or None,
            "live_price": moneys[0] if moneys else None,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "data" / "processed" / "multi_currency_probe.json",
    )
    args = parser.parse_args()

    results: list[dict[str, Any]] = []
    for item in PROBE:
        source = item["source_key"]
        print(f"probe {source} {item['external_id']} ...", flush=True)
        if source == "remax_curacao":
            results.append(_probe_remax(item))
        elif source == "keller_williams_curacao":
            results.append(_probe_kw(item))
        elif source == "moret_real_estate":
            results.append(_probe_moret(item))
        else:
            results.append(_probe_monumentenzorg(item))

    # Summaries
    remax_mechan = None
    for r in results:
        if r.get("source_key") == "remax_curacao" and r.get("currency_switch_mechanism"):
            remax_mechan = r["currency_switch_mechanism"]
            break

    summary = {
        "probed_at": datetime.now(UTC).isoformat(),
        "mode": "read_only_live_http",
        "no_supabase_writes": True,
        "no_import": True,
        "no_openai": True,
        "counts": {
            "remax": sum(1 for r in results if r["source_key"] == "remax_curacao"),
            "kw": sum(1 for r in results if r["source_key"] == "keller_williams_curacao"),
            "moret": sum(1 for r in results if r["source_key"] == "moret_real_estate"),
            "monumentenzorg": sum(
                1 for r in results if r["source_key"] == "monumentenzorg_curacao"
            ),
        },
        "remax_currency_switch_mechanism": remax_mechan,
        "exposure_by_source": {
            "remax_curacao": (
                "Display price from itemprop=price in the active currency view. "
                "Selector links /currency/{EUR|USD|NAF}/; NAF labelled XCG. "
                "GET /currency/NAF/ sets a session cookie; re-fetching the listing "
                "returns the official XCG/NAF amount. Disclaimer states listed-in currency. "
                "Default EUR view does NOT embed the NAF amount (no synthetic hooks live)."
            ),
            "keller_williams_curacao": (
                "Single .page-property-details__price block with USD anchor plus "
                "inline (EUR …) indicative and XCG line — official alts in same HTML."
            ),
            "moret_real_estate": (
                "Trusted .price_area / Prijs amount (often XCG already). "
                "Sidebar widget lists XCG/USD/EUR coefs for UI conversion only."
            ),
            "monumentenzorg_curacao": (
                "Single ANG/XCG asking display; no multi-currency selector."
            ),
        },
        "listings": results,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    # Strip large HTML before write
    for row in summary["listings"]:
        for key in ("default_view", "naf_xcg_view", "usd_view"):
            block = row.get(key)
            if isinstance(block, dict):
                block.pop("html", None)
        row.pop("html", None)

    args.out.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(f"wrote {args.out}", flush=True)

    # Console coverage table
    print("\n=== Coverage / price comparison ===")
    for r in results:
        sk = r["source_key"]
        eid = r["external_id"]
        if sk == "remax_curacao":
            d = (r.get("default_view") or {}).get("display_moneys") or [{}]
            n = (r.get("naf_xcg_view") or {}).get("display_moneys") or [{}]
            listed = (r.get("default_view") or {}).get("listed_in_currency")
            print(
                f"RE/MAX {eid}: default={d[0] if d else None} "
                f"listed_in={listed} naf_view={n[0] if n else None} "
                f"stored={r.get('stored_original')} bench={r.get('stored_benchmark_xcg')} "
                f"delta={r.get('comparison', {}).get('official_xcg_minus_merkado_benchmark')}"
            )
        elif sk == "keller_williams_curacao":
            print(
                f"KW {eid}: moneys={r.get('moneys_in_order')} "
                f"stored={r.get('stored_original')} bench={r.get('stored_benchmark_xcg')} "
                f"delta={r.get('comparison', {}).get('official_xcg_minus_merkado_benchmark')}"
            )
        elif sk == "moret_real_estate":
            print(
                f"Moret {eid}: price={r.get('trusted_price_moneys')} "
                f"coefs={r.get('sidebar_currency_coefs')} stored={r.get('stored_original')}"
            )
        else:
            print(
                f"Monumentenzorg {eid}: moneys={r.get('moneys')} "
                f"selector={r.get('multi_currency_selector_present')} "
                f"stored={r.get('stored_original')}"
            )

    if remax_mechan:
        print("\n=== RE/MAX currency-switch mechanism ===")
        print(json.dumps(remax_mechan, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
