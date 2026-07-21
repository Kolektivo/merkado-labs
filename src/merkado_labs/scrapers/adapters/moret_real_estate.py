"""Moret Real Estate (moretrealestate.com) WPEstate adapter.

Manual/unscheduled. Deterministic catalog discovery via ``/properties/``
pagination. Bilingual NL/EN mirrors merge by WordPress post ID; canonical
public route prefers ``/properties/{slug}/``.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote, urljoin, urlparse, urlunparse

from merkado_labs.normalization.currency import parse_decimal_amount, resolve_original_money
from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    FieldProvenance,
    ListingLifecycleStatus,
    SourceRunOutcome,
    SourceRunRecord,
    classify_run_outcome,
)
from merkado_labs.scrapers.evidence import (
    evidence_storage_path,
    html_to_preserved_text,
    sha256_text,
)
from merkado_labs.scrapers.http_cache import CachedFetch, FetchError, fetch_url
from merkado_labs.scrapers.robots import USER_AGENT, RobotsDecision, check_robots

SOURCE_KEY = "moret_real_estate"
ADAPTER_NAME = SOURCE_KEY
ADAPTER_VERSION = "0.2.0"
RAW_EVIDENCE_BUCKET = "listing-raw-evidence"
DOMAINS = frozenset({"moretrealestate.com", "www.moretrealestate.com"})
BASE_URL = "https://moretrealestate.com"
PROPERTIES_INDEX_URL = f"{BASE_URL}/properties/"
REALTOR_NAME = "Moret Real Estate"
REALTOR_DOMAIN = "www.moretrealestate.com"
DEFAULT_REQUEST_DELAY_SECONDS = 2.0
MAX_SAFE_CATALOG_URLS = 500
DiscoveryMode = Literal["bounded", "index_only", "complete"]

TITLE_RE = re.compile(
    r"<h1[^>]*class=[\"'][^\"']*entry-prop[^\"']*[\"'][^>]*>"
    r"(?P<body>.*?)</h1>",
    re.I | re.S,
)
TITLE_H1_RE = re.compile(r"<h1[^>]*>(?P<body>.*?)</h1>", re.I | re.S)
TITLE_TAG_RE = re.compile(r"<title>(?P<body>.*?)</title>", re.I | re.S)
CANONICAL_LINK_RE = re.compile(
    r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](?P<href>[^"\']+)["\']',
    re.I,
)
NEXT_LINK_RE = re.compile(
    r'<link[^>]+rel=["\']next["\'][^>]+href=["\'](?P<href>[^"\']+)["\']',
    re.I,
)
HTML_LANG_RE = re.compile(r'<html[^>]+lang=["\'](?P<lang>[^"\']+)["\']', re.I)
PRICE_AREA_OPEN_RE = re.compile(
    r'<span(?P<attrs>[^>]*\bprice_area\b[^>]*)>',
    re.I,
)
DETAIL_PRICE_LABEL_RE = re.compile(
    r'<div class=["\']listing_detail[^"\']*["\'][^>]*>\s*<strong>\s*Prijs\s*:</strong>\s*'
    r"(?P<body>[\s\S]{0,400}?)</div>",
    re.I,
)
PRICE_ANY_RE = re.compile(
    r"(?:"
    r"(?P<code>XCG|ANG|USD|EUR|NAF)\s*(?P<amount>[\d.]+(?:\.[\d]{3})*(?:,\d+)?)"
    r"|(?P<amount2>[\d.]+(?:\.[\d]{3})*(?:,\d+)?)\s*(?P<code2>XCG|ANG|USD|EUR|NAF|euros?)"
    r"|(?P<sym>\$|€)\s*(?P<samount>[\d.]+(?:\.[\d]{3})*(?:,\d+)?)"
    r")",
    re.I,
)
POST_ID_RE = re.compile(
    r'(?:data-postid|data-propid)=["\'](?P<id>\d+)["\']'
    r'|id=["\']agent_property_id["\'][^>]*value=["\'](?P<id2>\d+)["\']'
    r"|<strong>\s*Property\s*Id\s*:</strong>\s*(?P<id3>\d+)"
    r'|["\']current_id["\']\s*:\s*["\']?(?P<id4>\d+)',
    re.I,
)
PROPERTY_LISTING_CARD_RE = re.compile(
    r'<div[^>]+class=["\'][^"\']*\bproperty_listing\b[^"\']*["\'][^>]*'
    r'data-link=["\'](?P<link>[^"\']+)["\']',
    re.I,
)
DETAIL_HREF_RE = re.compile(
    r'href=["\'](?P<href>https?://(?:www\.)?moretrealestate\.com'
    r"/(?:en/|nl/)?properties/[^\"'#?]+)[\"']",
    re.I,
)
PAGINATION_HREF_RE = re.compile(
    r'href=["\'](?P<href>https?://(?:www\.)?moretrealestate\.com'
    r"/(?:en/|nl/)?properties/(?:page/\d+/?)?)[\"']",
    re.I,
)
PAGE_NUM_RE = re.compile(r"/properties/page/(?P<n>\d+)/?$", re.I)
BED_RE = re.compile(
    r"<strong>\s*(?:Slaapkamers|Bedrooms)\s*:</strong>\s*(?P<n>\d+)",
    re.I,
)
BATH_RE = re.compile(
    r"<strong>\s*(?:Badkamers|Bathrooms)\s*:</strong>\s*(?P<n>\d+(?:[.,]\d+)?)",
    re.I,
)
AREA_RE = re.compile(
    r"<strong>\s*(?:Woonoppervlakte|Oppervlakte|Living\s*area|Size)\s*:</strong>\s*"
    r"(?P<n>[\d.]+(?:\.[\d]{3})*(?:,\d+)?)\s*m",
    re.I,
)
LOT_RE = re.compile(
    r"<strong>\s*(?:Perceel|Lot|Kavel|Land\s*area|Grond\s*oppervlakte)\s*:</strong>\s*"
    r"(?P<n>[\d.]+(?:\.[\d]{3})*(?:,\d+)?)\s*(?P<unit>m<sup>2</sup>|m2|m²|are|ha)?",
    re.I,
)
DESC_RE = re.compile(
    r'class=["\'][^"\']*(?:wpestate_property_description|property_description|listing-content)[^"\']*["\'][^>]*>'
    r"(?P<body>.*?)</div>",
    re.I | re.S,
)
GALLERY_HREF_RE = re.compile(
    r"<a\s[^>]*?\bhref=[\"'](?P<url>https?://(?:www\.)?moretrealestate\.com"
    r"/wp-content/uploads/[^\"']+)[\"'][^>]*?\brel=[\"']prettyPhoto"
    r"|<a\s[^>]*?\brel=[\"']prettyPhoto[^\"']*[\"'][^>]*?\bhref=[\"']"
    r"(?P<url2>https?://(?:www\.)?moretrealestate\.com/wp-content/uploads/[^\"']+)[\"']",
    re.I,
)
OG_IMAGE_RE = re.compile(
    r'<meta\s[^>]*\bproperty=["\']og:image["\'][^>]*\bcontent=["\']'
    r'(?P<url>https?://(?:www\.)?moretrealestate\.com/wp-content/uploads/[^"\']+)["\']'
    r'|<meta\s[^>]*\bcontent=["\']'
    r'(?P<url2>https?://(?:www\.)?moretrealestate\.com/wp-content/uploads/[^"\']+)["\']'
    r'[^>]*\bproperty=["\']og:image["\']',
    re.I,
)
WP_SIZE_SUFFIX_RE = re.compile(r"-\d{2,4}x\d{2,4}(?=\.[A-Za-z0-9]+$)")
LOGO_NAME_RE = re.compile(r"(?:^|[-_/])logo(?:[-_.]|$)|favicon|drop-pin|maps-website", re.I)
AGENT_HEADSHOT_RE = re.compile(r"(?:makelaar|agent|headshot|portrait|avatar)", re.I)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
VANAF_RE = re.compile(r"\bvanaf\b|\bfrom\b", re.I)
MONTHLY_RE = re.compile(r"\b(?:per\s*maand|per\s*month|/maand|/month|p\.?m\.?)\b", re.I)
# Widget currency coefs are site UI evidence only — not Merkado conversion rates.
SIDEBAR_CURRENCY_COEF_RE = re.compile(
    r"data-coef=[\"'](?P<coef>[^\"']*)[\"'][^>]*data-value=[\"'](?P<code>[^\"']+)[\"']"
    r"|data-value=[\"'](?P<code2>[^\"']+)[\"'][^>]*data-coef=[\"'](?P<coef2>[^\"']*)[\"']",
    re.I,
)
SITEMAP_RE = re.compile(r"(?im)^[ \t]*Sitemap:[ \t]*(?P<url>\S+)")
DISALLOW_RE = re.compile(r"(?im)^[ \t]*Disallow:[ \t]*(?P<path>\S*)[ \t]*$")
CRAWL_DELAY_RE = re.compile(r"(?im)^[ \t]*Crawl-delay:[ \t]*(?P<n>[\d.]+)")
CATEG_BLOCK_RE = re.compile(
    r'id=["\']prop_categs["\'][^>]*>(?P<body>.*?)</div>',
    re.I | re.S,
)
ADRES_AREA_RE = re.compile(
    r'class=["\'][^"\']*\badres_area\b[^"\']*["\'][^>]*>(?P<body>.*?)</span>',
    re.I | re.S,
)
CITY_RE = re.compile(
    r"<strong>\s*(?:Stad|City)\s*:</strong>\s*(?:<a[^>]*>)?(?P<body>[^<]+)",
    re.I,
)
AREA_LABEL_RE = re.compile(
    r"<strong>\s*(?:Area|Wijk|Neighbourhood|Neighborhood)\s*:</strong>\s*"
    r"(?:<a[^>]*>)?(?P<body>[^<]+)",
    re.I,
)
AGENT_RE = re.compile(
    r'class=["\'][^"\']*title_agent_slider[^"\']*["\'][^>]*>\s*<a[^>]*>(?P<body>.*?)</a>',
    re.I | re.S,
)
MARKERS2_RE = re.compile(
    r'googlecode_property_vars2\s*=\s*\{[^}]*"markers2"\s*:\s*"(?P<raw>\[.*?\])"',
    re.I | re.S,
)
FEATURE_RE = re.compile(
    r'id=["\']accordion_prop_features["\'][\s\S]*?'
    r'<div class=["\']panel-body["\']>(?P<body>.*?)</div>',
    re.I,
)
FEATURE_ITEM_RE = re.compile(
    r'<div class=["\']listing_detail[^"\']*["\'][^>]*>\s*(?:<i[^>]*>\s*</i>)?\s*(?P<body>[^<]+)',
    re.I,
)
LISTING_DETAIL_RE = re.compile(
    r'<div class=["\']listing_detail[^"\']*["\'][^>]*>\s*<strong>(?P<label>[^<:]+):</strong>\s*'
    r"(?P<body>[\s\S]*?)</div>",
    re.I,
)
JSON_LD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(?P<body>.*?)</script>',
    re.I | re.S,
)
WPML_EN_ALT_RE = re.compile(
    r'href=["\'](?P<href>https?://(?:www\.)?moretrealestate\.com/en/properties/[^"\']+)["\']'
    r'[^>]*title=["\'][^"\']*(?:English|Overschakelen naar English)',
    re.I,
)
WPML_NL_ALT_RE = re.compile(
    r'href=["\'](?P<href>https?://(?:www\.)?moretrealestate\.com/properties/[^"\']+)["\']'
    r'[^>]*title=["\'][^"\']*(?:Nederlands|Switch to Nederlands)'
    r'|title=["\'][^"\']*(?:Nederlands|Switch to Nederlands)["\'][^>]*'
    r'href=["\'](?P<href2>https?://(?:www\.)?moretrealestate\.com/properties/[^"\']+)["\']',
    re.I,
)
STATUS_SOLD_RE = re.compile(r"\b(?:verkocht|sold)\b", re.I)
STATUS_RENTED_RE = re.compile(r"\b(?:verhuurd|rented)\b", re.I)
STATUS_UNDER_CONTRACT_RE = re.compile(
    r"\b(?:onder\s*bod|under\s*contract|in\s*onderhandeling)\b", re.I
)
STATUS_RESERVED_RE = re.compile(r"\b(?:gereserveerd|reserved)\b", re.I)
STATUS_INACTIVE_RE = re.compile(r"\b(?:ingetrokken|withdrawn|inactive|niet\s*beschikbaar)\b", re.I)
SALE_TOKEN_RE = re.compile(
    r"\b(?:te\s*koop|for\s*sale|kopen|koop-|objecten\s*te\s*koop|nieuw\s*aanbod\s*te\s*koop)\b",
    re.I,
)
RENT_TOKEN_RE = re.compile(
    r"\b(?:te\s*huur|for\s*rent|huren|huur-|rentals?|verhuur)\b",
    re.I,
)
PROPERTY_TYPE_MAP = (
    (re.compile(r"appartement|apartment|condo", re.I), "apartment"),
    (re.compile(r"villa", re.I), "villa"),
    (re.compile(r"penthouse", re.I), "penthouse"),
    (re.compile(r"terrein|land|lot|kavel", re.I), "land"),
    (re.compile(r"studio", re.I), "studio"),
    (re.compile(r"huis|woning|house|home|residence", re.I), "house"),
)
REJECT_DETAIL_PATH_RE = re.compile(
    r"/properties/(?:page|feed|tag|category|author|agent|agents|blog|wp-content)/",
    re.I,
)


@dataclass(frozen=True)
class DiscoveredListing:
    """One catalog discovery hit before detail fetch."""

    canonical_url: str
    external_id_hint: str | None
    discovered_on_index: str
    raw_urls: tuple[str, ...] = ()
    bilingual_aliases: tuple[str, ...] = ()
    index_category_hint: str | None = None


@dataclass
class RequestMetrics:
    robots_fetches: int = 0
    robots_cache_hits: int = 0
    index_network_fetches: int = 0
    index_cache_hits: int = 0
    detail_network_fetches: int = 0
    detail_cache_hits: int = 0
    failed_http: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "robots_fetches": self.robots_fetches,
            "robots_cache_hits": self.robots_cache_hits,
            "index_network_fetches": self.index_network_fetches,
            "index_cache_hits": self.index_cache_hits,
            "detail_network_fetches": self.detail_network_fetches,
            "detail_cache_hits": self.detail_cache_hits,
            "index_requests": self.index_network_fetches + self.index_cache_hits,
            "detail_requests": self.detail_network_fetches + self.detail_cache_hits,
            "network_requests_total": (
                self.robots_fetches + self.index_network_fetches + self.detail_network_fetches
            ),
            "cache_hits_total": (
                self.robots_cache_hits + self.index_cache_hits + self.detail_cache_hits
            ),
            "failed_http": list(self.failed_http),
        }


@dataclass
class CatalogDiscoveryResult:
    listings: list[DiscoveredListing]
    index_pages: list[dict[str, Any]]
    termination_reason: str
    pagination_proven: bool
    errors: list[str]
    raw_link_count: int
    bilingual_duplicate_count: int
    rejected_non_detail_count: int
    category_signals: dict[str, Any]
    complete_candidate: bool
    mode: DiscoveryMode


def _text(value: str) -> str:
    return WS_RE.sub(" ", html_to_preserved_text(value)).strip()


def _parse_eu_number(raw: str) -> Decimal | None:
    cleaned = raw.strip().replace(" ", "")
    if not cleaned:
        return None
    # European thousands: 750.000 or 1.001 ; decimal comma: 1,5
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", cleaned):
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif cleaned.count(".") == 1 and len(cleaned.split(".")[-1]) == 3 and "," not in cleaned:
        # Ambiguous 106.000-style thousands without further groups — treat as thousands
        # only when trailing group is exactly 3 and leading part is small (<=3 digits).
        left, right = cleaned.split(".")
        if len(left) <= 3 and right.isdigit():
            cleaned = left + right
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return parse_decimal_amount(cleaned)


def _canonical_upload_url(url: str) -> str:
    parsed = urlparse(url)
    path = WP_SIZE_SUFFIX_RE.sub("", parsed.path)
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def _is_site_chrome_image(url: str) -> bool:
    filename = urlparse(url).path.rsplit("/", 1)[-1]
    return bool(LOGO_NAME_RE.search(filename) or AGENT_HEADSHOT_RE.search(filename))


def extract_listing_images(html: str) -> tuple[str, ...]:
    """Prefer prettyPhoto gallery hrefs; fall back to og:image. Skip logos/agents."""
    ordered: list[str] = []
    seen: set[str] = set()

    def _add(raw: str | None) -> None:
        if not raw or _is_site_chrome_image(raw):
            return
        # Skip related-listing card wrappers outside carousel.
        canonical = _canonical_upload_url(raw)
        if canonical in seen:
            return
        seen.add(canonical)
        ordered.append(canonical)

    # Restrict gallery search to carousel when present to avoid related listings.
    carousel = re.search(
        r'id=["\']carousel-listing["\'][^>]*>(?P<body>[\s\S]*?)</div>\s*'
        r'(?:<div id=["\']carousel-listing-nav["\']|</div>\s*</div>\s*<div class=["\']col-md-3)',
        html,
        re.I,
    )
    gallery_html = carousel.group("body") if carousel else html
    for match in GALLERY_HREF_RE.finditer(gallery_html):
        _add(match.group("url") or match.group("url2"))

    if not ordered:
        for match in OG_IMAGE_RE.finditer(html):
            _add(match.group("url") or match.group("url2"))
            if ordered:
                break
    return tuple(ordered)


def canonicalize_detail_url(href: str, *, base: str = BASE_URL) -> str | None:
    absolute = urljoin(base + "/", href.strip())
    parsed = urlparse(absolute)
    host = (parsed.hostname or "").lower()
    bare = host.removeprefix("www.")
    if bare not in {d.removeprefix("www.") for d in DOMAINS}:
        return None
    path = re.sub(r"/{2,}", "/", parsed.path)
    alias_lang = None
    lang_m = re.match(r"^/(en|nl)/properties/", path, flags=re.I)
    if lang_m:
        alias_lang = lang_m.group(1).lower()
        path = re.sub(r"^/(?:en|nl)/properties/", "/properties/", path, flags=re.I)
    if REJECT_DETAIL_PATH_RE.search(path):
        return None
    if not re.search(r"/properties/[^/]+/?$", path, re.I):
        return None
    slug = path.rstrip("/").rsplit("/", 1)[-1]
    if slug.casefold() in {"page", "feed", "properties"}:
        return None
    canonical = urlunparse(("https", "moretrealestate.com", path.rstrip("/") + "/", "", "", ""))
    # annotate via unused var for callers that inspect bilingual separately
    _ = alias_lang
    return canonical


def bilingual_alias_urls(href: str, *, base: str = BASE_URL) -> list[str]:
    """Return observed bilingual forms for a property URL."""
    absolute = urljoin(base + "/", href.strip())
    parsed = urlparse(absolute)
    path = re.sub(r"/{2,}", "/", parsed.path)
    path = re.sub(r"^/(?:en|nl)/properties/", "/properties/", path, flags=re.I)
    if not re.search(r"/properties/[^/]+/?$", path, re.I):
        return []
    slug_path = path.rstrip("/") + "/"
    return [
        f"https://moretrealestate.com{slug_path}",
        f"https://moretrealestate.com/en{slug_path}",
        f"https://moretrealestate.com/nl{slug_path}",
    ]


def canonicalize_index_url(href: str, *, base: str = BASE_URL) -> str | None:
    absolute = urljoin(base + "/", href.strip())
    parsed = urlparse(absolute)
    host = (parsed.hostname or "").lower()
    if host.removeprefix("www.") not in {d.removeprefix("www.") for d in DOMAINS}:
        return None
    path = re.sub(r"/{2,}", "/", parsed.path)
    path = re.sub(r"^/(?:en|nl)/properties/", "/properties/", path, flags=re.I)
    if path.rstrip("/") == "/properties":
        return PROPERTIES_INDEX_URL
    page_m = PAGE_NUM_RE.search(path)
    if page_m:
        return f"{BASE_URL}/properties/page/{int(page_m.group('n'))}/"
    return None


def external_id_from_url(url: str, html: str | None = None) -> str:
    if html:
        post = extract_post_id(html)
        if post:
            return f"post-{post}"
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    return slug.casefold()


def extract_post_id(html: str) -> str | None:
    # Prefer favorites/property controls in the title zone over related cards.
    title_zone = re.search(
        r'class=["\'][^"\']*prop_title_zone[^"\']*["\'][\s\S]{0,4000}?'
        r'data-postid=["\'](?P<id>\d+)["\']',
        html,
        re.I,
    )
    if title_zone:
        return title_zone.group("id")
    prop_id = re.search(
        r'id=["\']agent_property_id["\'][^>]*value=["\'](?P<id>\d+)["\']'
        r"|<strong>\s*Property\s*Id\s*:</strong>\s*(?P<id2>\d+)",
        html,
        re.I,
    )
    if prop_id:
        return prop_id.group("id") or prop_id.group("id2")
    match = POST_ID_RE.search(html)
    if not match:
        return None
    return match.group("id") or match.group("id2") or match.group("id3") or match.group("id4")


def extract_detail_links(html: str, *, index_url: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in PROPERTY_LISTING_CARD_RE.finditer(html):
        url = canonicalize_detail_url(match.group("link"))
        if not url or url in seen:
            continue
        seen.add(url)
        found.append(url)
    for match in DETAIL_HREF_RE.finditer(html):
        url = canonicalize_detail_url(match.group("href"))
        if not url or url in seen:
            continue
        seen.add(url)
        found.append(url)
    _ = index_url
    return found


def extract_pagination_targets(html: str, *, current_url: str) -> dict[str, Any]:
    next_m = NEXT_LINK_RE.search(html)
    next_url = canonicalize_index_url(next_m.group("href")) if next_m else None
    numbered: list[str] = []
    seen: set[str] = set()
    for match in PAGINATION_HREF_RE.finditer(html):
        url = canonicalize_index_url(match.group("href"))
        if not url or url in seen:
            continue
        seen.add(url)
        numbered.append(url)
    canonical_m = CANONICAL_LINK_RE.search(html)
    return {
        "next_url": next_url,
        "numbered_page_urls": numbered,
        "canonical_url": (
            canonicalize_index_url(canonical_m.group("href")) if canonical_m else None
        ),
        "current_url": current_url,
    }


def _extract_price(
    html: str,
) -> tuple[Decimal | None, str | None, str | None, list[str], dict[str, Any]]:
    warnings: list[str] = []
    meta: dict[str, Any] = {
        "price_trusted": False,
        "price_source": None,
        "from_price": False,
        "price_period": None,
    }

    def _match_in(text: str) -> re.Match[str] | None:
        return PRICE_ANY_RE.search(text)

    # 1) price_area block with nested-span-aware close
    raw_block = ""
    area_blob = ""
    open_m = PRICE_AREA_OPEN_RE.search(html)
    if open_m and "price_label" not in (open_m.group("attrs") or ""):
        start = open_m.end()
        depth = 1
        i = start
        while i < len(html) and depth > 0:
            next_open = html.lower().find("<span", i)
            next_close = html.lower().find("</span>", i)
            if next_close < 0:
                break
            if next_open >= 0 and next_open < next_close:
                depth += 1
                i = next_open + 5
            else:
                depth -= 1
                if depth == 0:
                    area_blob = html[start:next_close]
                    break
                i = next_close + 7
        raw_block = _text(area_blob)
        if VANAF_RE.search(area_blob):
            warnings.append("price_marked_from_vanaf")
            meta["from_price"] = True
        if MONTHLY_RE.search(area_blob):
            meta["price_period"] = "monthly"
        match = _match_in(raw_block) or _match_in(area_blob)
        if match:
            amount, currency = _amount_currency_from_match(match)
            meta["price_trusted"] = True
            meta["price_source"] = "price_area"
            return amount, currency, match.group(0), warnings, meta

    # 2) listing-local labelled Prijs field
    labelled = DETAIL_PRICE_LABEL_RE.search(html)
    if labelled:
        body = labelled.group("body")
        if VANAF_RE.search(body):
            warnings.append("price_marked_from_vanaf")
            meta["from_price"] = True
        if MONTHLY_RE.search(body):
            meta["price_period"] = "monthly"
        match = _match_in(_text(body)) or _match_in(body)
        if match:
            amount, currency = _amount_currency_from_match(match)
            meta["price_trusted"] = True
            meta["price_source"] = "listing_detail_price_label"
            return amount, currency, match.group(0), warnings, meta

    # 3) JSON-LD / structured offers inside listing graph
    for ld in JSON_LD_RE.finditer(html):
        blob = ld.group("body")
        if "offers" not in blob.casefold() and "price" not in blob.casefold():
            continue
        match = _match_in(blob)
        if match and "moretrealestate.com/properties/" in blob:
            amount, currency = _amount_currency_from_match(match)
            meta["price_trusted"] = True
            meta["price_source"] = "json_ld"
            return amount, currency, match.group(0), warnings, meta

    # 4) Global fallback — diagnostic only, untrusted
    match = PRICE_ANY_RE.search(html)
    if match:
        warnings.append("price_from_global_fallback_untrusted")
        amount, currency = _amount_currency_from_match(match)
        meta["price_trusted"] = False
        meta["price_source"] = "global_fallback"
        meta["untrusted_price"] = {
            "amount": str(amount),
            "currency": currency,
            "raw": match.group(0),
        }
        return None, None, match.group(0), warnings + ["no_trusted_price"], meta

    return None, None, raw_block or None, warnings + ["no_price_extracted"], meta


def _extract_sidebar_currency_coefs(html: str) -> list[dict[str, str]]:
    """Record Moret sidebar widget coefs as evidence notes (not Merkado rates)."""

    notes: list[dict[str, str]] = []
    for match in SIDEBAR_CURRENCY_COEF_RE.finditer(html):
        code = (match.group("code") or match.group("code2") or "").upper()
        coef = (match.group("coef") or match.group("coef2") or "").strip()
        if not code:
            continue
        notes.append(
            {
                "currency": code,
                "coef": coef,
                "note": "moret_sidebar_widget_coef_evidence_not_merkado_rate",
            }
        )
    return notes


def _amount_currency_from_match(match: re.Match[str]) -> tuple[Decimal | None, str | None]:
    groups = match.groupdict()
    code = (groups.get("code") or groups.get("code2") or "").upper()
    amount_raw = groups.get("amount") or groups.get("amount2")
    if not code:
        sym = groups.get("sym")
        amount_raw = groups.get("samount")
        if sym == "$":
            code = "USD"
        elif sym == "€":
            code = "EUR"
    if code.startswith("EURO"):
        code = "EUR"
    if code == "NAF":
        code = "ANG"
    amount = _parse_eu_number(amount_raw or "") if amount_raw else None
    return amount, code or None


def _extract_listing_type(
    html: str,
    *,
    index_category_hint: str | None = None,
    price_period: str | None = None,
    amount: Decimal | None = None,
) -> tuple[str | None, list[str], str | None]:
    warnings: list[str] = []
    categ = CATEG_BLOCK_RE.search(html)
    categ_text = _text(categ.group("body")) if categ else ""
    evidence = None
    if categ_text:
        if RENT_TOKEN_RE.search(categ_text) and not SALE_TOKEN_RE.search(categ_text):
            return "rent", warnings, f"property_categs:{categ_text[:120]}"
        if SALE_TOKEN_RE.search(categ_text) and not RENT_TOKEN_RE.search(categ_text):
            return "sale", warnings, f"property_categs:{categ_text[:120]}"
        if SALE_TOKEN_RE.search(categ_text) and RENT_TOKEN_RE.search(categ_text):
            # Prefer explicit kopen/huren action category order: last / split
            if re.search(r"/kies/kopen/|kopen\b", categ_text, re.I):
                return "sale", warnings, f"property_categs_kopen:{categ_text[:120]}"
            if re.search(r"/kies/rentals|huren\b|te huur", categ_text, re.I):
                return "rent", warnings, f"property_categs_huren:{categ_text[:120]}"

    # Explicit phrases outside chrome menus — search title zone + description only
    focus = ""
    title_zone = re.search(
        r'class=["\'][^"\']*prop_title_zone[^"\']*["\'][\s\S]{0,6000}', html, re.I
    )
    if title_zone:
        focus += title_zone.group(0)
    desc_m = DESC_RE.search(html)
    if desc_m:
        focus += " " + desc_m.group("body")
    focus_text = _text(focus)
    if re.search(r"\b(?:te huur|for rent)\b", focus_text, re.I):
        return "rent", warnings, "explicit_phrase"
    if re.search(r"\b(?:te koop|for sale)\b", focus_text, re.I):
        return "sale", warnings, "explicit_phrase"

    if index_category_hint:
        if RENT_TOKEN_RE.search(index_category_hint):
            return "rent", warnings, f"index_category:{index_category_hint}"
        if SALE_TOKEN_RE.search(index_category_hint):
            return "sale", warnings, f"index_category:{index_category_hint}"

    if price_period == "monthly":
        return "rent", warnings, "price_period_monthly"

    if amount is not None and amount < Decimal("50000"):
        warnings.append("low_price_listing_type_unresolved")
    warnings.append("listing_type_unknown")
    return None, warnings, evidence


def _extract_lifecycle(html: str) -> tuple[str, ListingLifecycleStatus, list[str]]:
    warnings: list[str] = []
    # Prefer status ribbon / title zone; avoid nav chrome by scoping.
    focus_m = re.search(
        r'class=["\'][^"\']*(?:status-wrapper|status_re|prop_title_zone|property_categs)[^"\']*["\']'
        r"[\s\S]{0,2500}",
        html,
        re.I,
    )
    focus = focus_m.group(0) if focus_m else html[:8000]
    if STATUS_SOLD_RE.search(focus):
        return "sold", ListingLifecycleStatus.SOLD, warnings
    if STATUS_RENTED_RE.search(focus):
        return "rented", ListingLifecycleStatus.INACTIVE, warnings
    if STATUS_UNDER_CONTRACT_RE.search(focus):
        return "under_contract", ListingLifecycleStatus.ACTIVE, warnings + ["under_contract_label"]
    if STATUS_RESERVED_RE.search(focus):
        return "reserved", ListingLifecycleStatus.ACTIVE, warnings + ["reserved_label"]
    if STATUS_INACTIVE_RE.search(focus):
        return "inactive", ListingLifecycleStatus.INACTIVE, warnings
    # Page load alone must not force active — only when no terminal status and listing body exists
    if re.search(r'class=["\'][^"\']*entry-prop', html, re.I) or extract_post_id(html):
        return "active", ListingLifecycleStatus.ACTIVE, warnings
    return "unknown", ListingLifecycleStatus.UNKNOWN, warnings + ["lifecycle_unknown"]


def _extract_coordinates(html: str) -> tuple[float | None, float | None, str | None, list[str]]:
    warnings: list[str] = []
    markers = MARKERS2_RE.search(html)
    if markers:
        raw = markers.group("raw").encode("utf-8").decode("unicode_escape")
        raw = unquote(raw)
        # markers2: [["Title", lat, lng, ...], ...]
        m = re.search(
            r'\[\s*"(?:[^"\\]|\\.)*"\s*,\s*(?P<lat>-?\d+(?:\.\d+)?)\s*,\s*(?P<lng>-?\d+(?:\.\d+)?)',
            raw,
        )
        if m:
            lat = float(m.group("lat"))
            lng = float(m.group("lng"))
            if 10.0 <= lat <= 14.0 and -71.0 <= lng <= -67.0:
                return lat, lng, "googlecode_property_vars2.markers2", warnings
            warnings.append("coordinates_out_of_curacao_bbox")
    # Do not use general_latitude/general_longitude (site default).
    if re.search(r'"general_latitude"\s*:\s*"', html):
        warnings.append("site_default_coordinates_ignored")
    return None, None, None, warnings


def _extract_property_type(html: str) -> str | None:
    categ = CATEG_BLOCK_RE.search(html)
    text = _text(categ.group("body")) if categ else ""
    for pattern, label in PROPERTY_TYPE_MAP:
        if pattern.search(text):
            return label
    return None


def _extract_amenities(html: str) -> tuple[dict[str, Any], ...]:
    block = FEATURE_RE.search(html)
    if not block:
        return ()
    items: list[dict[str, Any]] = []
    for match in FEATURE_ITEM_RE.finditer(block.group("body")):
        label = _text(match.group("body"))
        if label:
            items.append({"raw": label, "mapped": None})
    # Also capture labelled amenity-like detail rows
    for match in LISTING_DETAIL_RE.finditer(html):
        label = _text(match.group("label"))
        value = _text(TAG_RE.sub("", match.group("body")))
        if label.casefold() in {
            "gemeubileerd",
            "gated community",
            "huisdieren toegestaan",
            "zwembad",
            "grond",
            "furnished",
            "pool",
        }:
            items.append(
                {
                    "raw": f"{label}: {value}",
                    "mapped": None,
                    "label": label,
                    "value": value,
                }
            )
    return tuple(items)


def catalog_checksum_for(urls: Sequence[str]) -> str:
    payload = "|".join(sorted(urls))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class MoretRealEstateAdapter(DirectSourceAdapter):
    """Deterministic WPEstate parser and catalog discovery for Moret Real Estate."""

    source_key = SOURCE_KEY
    name = ADAPTER_NAME
    version = ADAPTER_VERSION
    domains = DOMAINS

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or Path("data/raw/moret_real_estate/cache")
        self._robots_by_host: dict[str, RobotsDecision] = {}
        self._last_network_at: float | None = None
        self._cached_crawl_delay: float | None = None
        self.request_metrics = RequestMetrics()

    def reset_request_state(self) -> None:
        self._robots_by_host.clear()
        self._last_network_at = None
        self._cached_crawl_delay = None
        self.request_metrics = RequestMetrics()

    def _pace_before_network(self, *, honor_delay: bool) -> None:
        if not honor_delay:
            return
        delay = max(DEFAULT_REQUEST_DELAY_SECONDS, self._cached_crawl_delay or 0)
        if self._last_network_at is None:
            return
        elapsed = time.monotonic() - self._last_network_at
        remaining = delay - elapsed
        if remaining > 0:
            time.sleep(remaining)

    def _mark_network(self) -> None:
        self._last_network_at = time.monotonic()

    def evaluate_robots(  # type: ignore[override]
        self, listing_url: str, *, honor_delay: bool = False
    ) -> RobotsDecision:
        host = (urlparse(listing_url).hostname or "").lower()
        if host in self._robots_by_host:
            self.request_metrics.robots_cache_hits += 1
            return self._robots_by_host[host]
        self._pace_before_network(honor_delay=honor_delay)
        decision = check_robots(listing_url)
        self._mark_network()
        self.request_metrics.robots_fetches += 1
        self._robots_by_host[host] = decision
        if decision.crawl_delay_seconds is not None:
            self._cached_crawl_delay = max(
                DEFAULT_REQUEST_DELAY_SECONDS, decision.crawl_delay_seconds
            )
        return decision

    def _fetch(
        self,
        url: str,
        *,
        cache_dir: Path,
        honor_delay: bool,
        use_cache: bool,
        kind: Literal["index", "detail"],
    ) -> CachedFetch:
        robots = self.evaluate_robots(url, honor_delay=honor_delay)
        if robots.can_fetch is not True:
            raise FetchError(f"robots_disallow:{url}")
        cache_path = cache_dir / f"{hashlib.sha256(url.encode()).hexdigest()}.html"
        will_use_cache = use_cache and cache_path.exists()
        if not will_use_cache:
            self._pace_before_network(honor_delay=honor_delay)
        fetched = fetch_url(url, cache_dir=cache_dir, user_agent=USER_AGENT, use_cache=use_cache)
        if fetched.from_cache:
            if kind == "index":
                self.request_metrics.index_cache_hits += 1
            else:
                self.request_metrics.detail_cache_hits += 1
        else:
            self._mark_network()
            if kind == "index":
                self.request_metrics.index_network_fetches += 1
            else:
                self.request_metrics.detail_network_fetches += 1
        return fetched

    def parse_listing_html(
        self,
        html: str,
        *,
        listing_url: str,
        raw_sha256: str,
        observed_at: datetime | None = None,
        http_status: int | None = None,
        content_type: str | None = "text/html",
        index_category_hint: str | None = None,
        bilingual_aliases: Sequence[str] | None = None,
    ) -> AdapterListingSnapshot:
        if not self.supports(listing_url):
            raise ValueError("Moret adapter rejects off-domain URLs")
        warnings: list[str] = []
        parser_errors: list[str] = []
        canonical_from_page = None
        can_m = CANONICAL_LINK_RE.search(html)
        if can_m:
            canonical_from_page = canonicalize_detail_url(can_m.group("href"))
        # Prefer Dutch /properties/{slug}/ over English WPML mirrors with distinct post IDs.
        nl_alt = None
        nl_m = WPML_NL_ALT_RE.search(html)
        if nl_m:
            nl_alt = canonicalize_detail_url(nl_m.group("href") or nl_m.group("href2") or "")
        en_alt = None
        en_m = WPML_EN_ALT_RE.search(html)
        if en_m:
            # Keep full EN URL as alias (do not strip language for alias storage).
            en_alt = en_m.group("href").rstrip("/") + "/"
            en_alt = en_alt.replace("://www.", "://")
        requested = canonicalize_detail_url(listing_url) or listing_url
        if nl_alt:
            canonical = nl_alt
        elif canonical_from_page and "/en/" not in (can_m.group("href") if can_m else ""):
            canonical = canonical_from_page
        else:
            canonical = requested
        post_id = extract_post_id(html)
        if post_id:
            external_id = f"post-{post_id}"
            # English WPML posts get a distinct post ID; prefer Dutch identity when
            # the language switcher points at an NL property URL. Detail fetches from
            # the Dutch index already use the Dutch post ID.
            if nl_alt and "/en/" in listing_url:
                warnings.append("english_wpml_mirror_use_dutch_canonical_url")
                # Keep EN post id only as alias metadata; identity stays EN post until
                # Dutch page is authoritative in catalog discovery.
        else:
            external_id = external_id_from_url(canonical)
            warnings.append("identity_slug_fallback")
            parser_errors.append("missing_wordpress_post_id")

        title_match = TITLE_RE.search(html) or TITLE_H1_RE.search(html) or TITLE_TAG_RE.search(html)
        title = _text(title_match.group("body")) if title_match else None
        if title:
            title = re.sub(r"\s*\|\s*Moret Real Estate\s*$", "", title, flags=re.I)
            title = title.replace("&#8211;", "–").replace("&ndash;", "–")
        else:
            warnings.append("missing_title")

        amount, currency, price_raw, price_warnings, price_meta = _extract_price(html)
        warnings.extend(price_warnings)
        money = None
        if price_meta.get("price_trusted") and amount is not None and currency:
            money = resolve_original_money(amount=amount, currency=currency, evidence=price_raw)
        elif price_meta.get("untrusted_price"):
            warnings.append("price_untrusted_excluded_from_import_eligibility")

        bed_m = BED_RE.search(html)
        bath_m = BATH_RE.search(html)
        area_m = AREA_RE.search(html)
        lot_m = LOT_RE.search(html)
        bedrooms = int(bed_m.group("n")) if bed_m else None
        bathrooms = float(bath_m.group("n").replace(",", ".")) if bath_m else None
        floor_area = _parse_eu_number(area_m.group("n")) if area_m else None
        lot_area_value = _parse_eu_number(lot_m.group("n")) if lot_m else None
        lot_area_unit = "m2" if lot_m else None

        desc_m = DESC_RE.search(html)
        description = _text(desc_m.group("body")) if desc_m else None
        if not description:
            warnings.append("missing_description")
        images = extract_listing_images(html)
        if not images:
            warnings.append("missing_images")

        city_m = CITY_RE.search(html)
        area_m2 = AREA_LABEL_RE.search(html)
        adres_m = ADRES_AREA_RE.search(html)
        neighbourhood = _text(area_m2.group("body")) if area_m2 else None
        location_bits = []
        if city_m:
            location_bits.append(_text(city_m.group("body")))
        if neighbourhood:
            location_bits.append(neighbourhood)
        if not location_bits and adres_m:
            location_bits.append(_text(adres_m.group("body")))
        location_text = ", ".join(location_bits) if location_bits else None
        slug = urlparse(canonical).path.strip("/").split("/")[-1]
        slug_diag = slug.replace("-", " ") if slug else None

        listing_type, type_warnings, type_evidence = _extract_listing_type(
            html,
            index_category_hint=index_category_hint,
            price_period=price_meta.get("price_period"),
            amount=amount if price_meta.get("price_trusted") else None,
        )
        warnings.extend(type_warnings)
        source_status, lifecycle_hint, status_warnings = _extract_lifecycle(html)
        warnings.extend(status_warnings)

        lat, lng, coord_source, coord_warnings = _extract_coordinates(html)
        warnings.extend(coord_warnings)
        property_type = _extract_property_type(html)
        amenities = _extract_amenities(html)
        agent_m = AGENT_RE.search(html)
        agent_name = _text(agent_m.group("body")) if agent_m else None

        aliases = list(bilingual_aliases or [])
        for alias in bilingual_alias_urls(canonical):
            if alias not in aliases:
                aliases.append(alias)
        if en_alt and en_alt not in aliases:
            aliases.append(en_alt)
        if nl_alt and nl_alt not in aliases:
            aliases.append(nl_alt)
        if requested and requested not in aliases:
            aliases.append(requested)

        fields = [
            FieldProvenance(
                "listing_reference",
                post_id or slug,
                external_id,
                "wordpress_post_id" if post_id else "slug_fallback",
            ),
            FieldProvenance(
                "price",
                price_raw,
                {
                    "amount": str(amount) if amount is not None else None,
                    "currency": currency,
                    "trusted": price_meta.get("price_trusted"),
                    "source": price_meta.get("price_source"),
                    "from_price": price_meta.get("from_price"),
                    "price_period": price_meta.get("price_period"),
                },
                str(price_meta.get("price_source") or "none"),
            ),
            FieldProvenance(
                "realtor",
                REALTOR_NAME,
                {"name": REALTOR_NAME, "domain": REALTOR_DOMAIN},
                "source_site_attribution",
            ),
        ]
        if type_evidence:
            fields.append(
                FieldProvenance("listing_type", type_evidence, listing_type, "category_or_phrase")
            )

        return AdapterListingSnapshot(
            source_key=SOURCE_KEY,
            external_id=external_id,
            source_url=canonical,
            observed_at=observed_at or datetime.now(UTC),
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            raw_payload={
                "html_sha256": raw_sha256,
                "realtor_name": REALTOR_NAME,
                "realtor_domain": REALTOR_DOMAIN,
                "image_urls": list(images),
                "bilingual_canonical": True,
                "bilingual_aliases": aliases,
                "wordpress_post_id": post_id,
                "price_trusted": price_meta.get("price_trusted"),
                "price_source": price_meta.get("price_source"),
                "from_price": price_meta.get("from_price"),
                "price_period": price_meta.get("price_period"),
                "untrusted_price": price_meta.get("untrusted_price"),
                "listing_type_evidence": type_evidence,
                "agent_name": agent_name,
                "slug_diagnostic": slug_diag,
                "coordinates_source": coord_source,
                "index_category_hint": index_category_hint,
                "sidebar_currency_coefs": _extract_sidebar_currency_coefs(html),
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type=listing_type,
            property_type=property_type,
            source_status=source_status,
            lifecycle_hint=lifecycle_hint,
            original_price=money,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            floor_area_m2=floor_area if floor_area and floor_area > 0 else None,
            lot_area_value=lot_area_value if lot_area_value and lot_area_value > 0 else None,
            lot_area_unit=lot_area_unit if lot_area_value else None,
            latitude=lat,
            longitude=lng,
            neighbourhood_text=neighbourhood,
            location_text=location_text,
            primary_image_url=images[0] if images else None,
            image_urls=images,
            description=description,
            source_description=description,
            source_description_checksum=sha256_text(description) if description else None,
            cleaned_listing_text=description,
            http_status=http_status,
            content_type=content_type,
            evidence_storage_path=evidence_storage_path(
                source_key=SOURCE_KEY, external_id=external_id, checksum=raw_sha256
            ),
            evidence_storage_bucket=RAW_EVIDENCE_BUCKET,
            amenities=amenities,
            fields=tuple(fields),
            warnings=tuple(dict.fromkeys(warnings)),
            parser_errors=tuple(dict.fromkeys(parser_errors)),
        )

    def discover_catalog(
        self,
        *,
        cache_dir: Path,
        mode: DiscoveryMode = "complete",
        max_items: int | None = None,
        honor_delay: bool = True,
        use_cache: bool = True,
    ) -> CatalogDiscoveryResult:
        if mode == "complete" and max_items is not None:
            raise ValueError("complete catalog discovery rejects max_items")
        if mode == "bounded" and max_items is None:
            max_items = 5

        listings: list[DiscoveredListing] = []
        by_url: dict[str, DiscoveredListing] = {}
        index_pages: list[dict[str, Any]] = []
        errors: list[str] = []
        seen_page_urls: set[str] = set()
        seen_checksums: set[str] = set()
        raw_link_count = 0
        bilingual_duplicate_count = 0
        rejected_non_detail = 0
        termination_reason = "unknown"
        pagination_proven = False
        category_signals: dict[str, Any] = {}

        queue: list[str] = [PROPERTIES_INDEX_URL]
        queued: set[str] = {PROPERTIES_INDEX_URL}
        page_number = 0

        while queue:
            index_url = queue.pop(0)
            if index_url in seen_page_urls:
                termination_reason = "repeated_page_url"
                pagination_proven = True
                break
            robots = self.evaluate_robots(index_url, honor_delay=honor_delay)
            if robots.can_fetch is not True:
                errors.append(f"robots_disallow:{index_url}")
                termination_reason = "robots_disallow"
                break
            try:
                fetched = self._fetch(
                    index_url,
                    cache_dir=cache_dir,
                    honor_delay=honor_delay,
                    use_cache=use_cache,
                    kind="index",
                )
            except FetchError as error:
                errors.append(f"fetch_failed:{index_url}:{error}")
                self.request_metrics.failed_http.append({"url": index_url, "error": str(error)})
                termination_reason = "index_fetch_failed"
                break

            html = fetched.body.decode("utf-8", errors="replace")
            page_number += 1
            # Detect unexpected redirect-to-page-1: requested page/N but canonical/content is page 1
            pag = extract_pagination_targets(html, current_url=index_url)
            if page_number > 1:
                req_page = PAGE_NUM_RE.search(urlparse(index_url).path)
                can_path = urlparse(pag.get("canonical_url") or "").path
                on_page_one = (
                    can_path.rstrip("/") == "/properties" or can_path == "/properties/"
                )
                if req_page and on_page_one:
                    # If body still has unique listings, continue; if checksum matches page 1, stop.
                    if fetched.sha256 in seen_checksums:
                        termination_reason = "page_redirected_to_page_one"
                        pagination_proven = False
                        index_pages.append(
                            {
                                "url": index_url,
                                "sha256": fetched.sha256,
                                "error": "redirect_or_repeat_page_one",
                                "page": page_number,
                            }
                        )
                        break

            if fetched.sha256 in seen_checksums:
                termination_reason = "repeated_page_checksum"
                pagination_proven = True
                index_pages.append(
                    {
                        "url": index_url,
                        "sha256": fetched.sha256,
                        "page": page_number,
                        "termination": "repeated_checksum",
                    }
                )
                break
            seen_page_urls.add(index_url)
            seen_checksums.add(fetched.sha256)

            # Category counts from filter dropdown if present
            for m in re.finditer(
                r'data-value="(?P<key>[^"]+)"[^>]*>\s*(?P<label>[^<]*\((?P<n>\d+)\))',
                html,
                re.I,
            ):
                category_signals[m.group("key")] = {
                    "label": _text(m.group("label")),
                    "count": int(m.group("n")),
                }

            page_links: list[str] = []
            for match in PROPERTY_LISTING_CARD_RE.finditer(html):
                raw = match.group("link")
                raw_link_count += 1
                url = canonicalize_detail_url(raw)
                if not url:
                    rejected_non_detail += 1
                    continue
                page_links.append(url)
                aliases = []
                if "/en/" in raw or "/nl/" in raw:
                    bilingual_duplicate_count += 1
                    aliases = [a for a in bilingual_alias_urls(raw) if a != url]
                if url in by_url:
                    prev = by_url[url]
                    merged_aliases = tuple(
                        dict.fromkeys([*prev.bilingual_aliases, *aliases, raw])
                    )
                    by_url[url] = replace(prev, bilingual_aliases=merged_aliases)
                    continue
                item = DiscoveredListing(
                    canonical_url=url,
                    external_id_hint=None,
                    discovered_on_index=index_url,
                    raw_urls=(raw,),
                    bilingual_aliases=tuple(aliases),
                )
                by_url[url] = item
                listings.append(item)
                if max_items is not None and len(listings) >= max_items:
                    termination_reason = "max_items_reached"
                    index_pages.append(
                        {
                            "url": index_url,
                            "sha256": fetched.sha256,
                            "page": page_number,
                            "status": fetched.status,
                            "links_on_page": len(page_links),
                            "canonical_url": pag.get("canonical_url"),
                            "next_url": pag.get("next_url"),
                            "html_lang": (
                                HTML_LANG_RE.search(html).group("lang")
                                if HTML_LANG_RE.search(html)
                                else None
                            ),
                        }
                    )
                    return CatalogDiscoveryResult(
                        listings=listings[:max_items],
                        index_pages=index_pages,
                        termination_reason=termination_reason,
                        pagination_proven=False,
                        errors=errors,
                        raw_link_count=raw_link_count,
                        bilingual_duplicate_count=bilingual_duplicate_count,
                        rejected_non_detail_count=rejected_non_detail,
                        category_signals=category_signals,
                        complete_candidate=False,
                        mode=mode,
                    )

            # Also count href-only discoveries not in cards
            for match in DETAIL_HREF_RE.finditer(html):
                raw = match.group("href")
                raw_link_count += 1
                url = canonicalize_detail_url(raw)
                if not url:
                    if "/properties/" in raw:
                        rejected_non_detail += 1
                    continue
                if url in by_url:
                    if "/en/" in raw or "/nl/" in raw:
                        bilingual_duplicate_count += 1
                    continue
                # Prefer card-discovered; skip featured/sidebar extras for completeness
                # unless they are true property URLs not yet seen — include them.
                item = DiscoveredListing(
                    canonical_url=url,
                    external_id_hint=None,
                    discovered_on_index=index_url,
                    raw_urls=(raw,),
                    bilingual_aliases=tuple(
                        a for a in bilingual_alias_urls(raw) if a != url
                    ),
                )
                by_url[url] = item
                listings.append(item)

            index_pages.append(
                {
                    "url": index_url,
                    "sha256": fetched.sha256,
                    "page": page_number,
                    "status": fetched.status,
                    "from_cache": fetched.from_cache,
                    "links_on_page": len(page_links),
                    "canonical_url": pag.get("canonical_url"),
                    "next_url": pag.get("next_url"),
                    "numbered_page_urls": pag.get("numbered_page_urls"),
                    "html_lang": (
                        HTML_LANG_RE.search(html).group("lang")
                        if HTML_LANG_RE.search(html)
                        else None
                    ),
                }
            )

            if len(listings) > MAX_SAFE_CATALOG_URLS:
                termination_reason = "catalog_exceeds_safety_cap"
                pagination_proven = False
                break

            next_candidates: list[str] = []
            if pag.get("next_url"):
                next_candidates.append(pag["next_url"])
            for numbered in pag.get("numbered_page_urls") or []:
                if numbered not in seen_page_urls and numbered not in queued:
                    # Only enqueue the immediate next page number to stay sequential
                    cur_n = 1
                    cur_m = PAGE_NUM_RE.search(urlparse(index_url).path)
                    if cur_m:
                        cur_n = int(cur_m.group("n"))
                    elif index_url.rstrip("/") == PROPERTIES_INDEX_URL.rstrip("/"):
                        cur_n = 1
                    num_m = PAGE_NUM_RE.search(urlparse(numbered).path)
                    if num_m and int(num_m.group("n")) == cur_n + 1:
                        next_candidates.append(numbered)

            advanced = False
            for nxt in next_candidates:
                if nxt in seen_page_urls or nxt in queued:
                    continue
                if nxt.rstrip("/") == PROPERTIES_INDEX_URL.rstrip("/") and page_number > 1:
                    continue
                queue.append(nxt)
                queued.add(nxt)
                advanced = True
                break

            if not advanced:
                # Construct next page only when the current page looks full and
                # numbered pagination already advertises n+1 (never invent past last).
                cur_n = 1
                cur_m = PAGE_NUM_RE.search(urlparse(index_url).path)
                if cur_m:
                    cur_n = int(cur_m.group("n"))
                advertised_next = f"{BASE_URL}/properties/page/{cur_n + 1}/"
                numbered = set(pag.get("numbered_page_urls") or [])
                if (
                    pag.get("next_url") is None
                    and advertised_next in numbered
                    and advertised_next not in seen_page_urls
                    and advertised_next not in queued
                ):
                    queue.append(advertised_next)
                    queued.add(advertised_next)
                    continue
                # Explicit no-next on a short final page proves termination.
                if pag.get("next_url") is None:
                    termination_reason = "no_next_page"
                    pagination_proven = True
                    break
                termination_reason = "no_next_page"
                pagination_proven = True
                break

        if mode == "bounded":
            complete_candidate = False
        else:
            complete_candidate = (
                pagination_proven
                and termination_reason
                in {"no_next_page", "repeated_page_checksum", "repeated_page_url"}
                and not errors
                and len(listings) > 0
                and len(listings) <= MAX_SAFE_CATALOG_URLS
            )

        return CatalogDiscoveryResult(
            listings=listings,
            index_pages=index_pages,
            termination_reason=termination_reason,
            pagination_proven=pagination_proven,
            errors=errors,
            raw_link_count=raw_link_count,
            bilingual_duplicate_count=bilingual_duplicate_count,
            rejected_non_detail_count=rejected_non_detail,
            category_signals=category_signals,
            complete_candidate=complete_candidate,
            mode=mode,
        )

    def discover_listing_urls(
        self,
        *,
        cache_dir: Path,
        max_items: int = 5,
        honor_delay: bool = True,
    ) -> tuple[list[str], list[str]]:
        result = self.discover_catalog(
            cache_dir=cache_dir,
            mode="bounded",
            max_items=max_items,
            honor_delay=honor_delay,
        )
        return [item.canonical_url for item in result.listings], list(result.errors)

    def run_bounded(
        self,
        *,
        listing_urls: Sequence[str] | None = None,
        cache_dir: Path,
        dry_run: bool = True,
        max_items: int = 5,
        honor_delay: bool = True,
        discover: bool = False,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot]]:
        started = datetime.now(UTC)
        self.reset_request_state()
        discovery_errors: list[str] = []
        discovered_meta: list[DiscoveredListing] = []
        if discover:
            result = self.discover_catalog(
                cache_dir=cache_dir,
                mode="bounded",
                max_items=max_items,
                honor_delay=honor_delay,
            )
            discovered_meta = result.listings
            urls = [item.canonical_url for item in discovered_meta]
            discovery_errors = list(result.errors)
        else:
            urls = list(listing_urls or [])[:max_items]
        snapshots, errors, identity_conflicts = self._parse_urls(
            urls,
            cache_dir=cache_dir,
            dry_run=dry_run,
            honor_delay=honor_delay,
            use_cache=True,
            discovered_meta=discovered_meta,
        )
        errors += len(discovery_errors)
        outcome = classify_run_outcome(
            parsed_count=len(snapshots),
            target_count=len(urls),
            error_count=errors,
            complete_catalog=False,
            bounded=True,
            max_items=max_items,
            failed_fetches=errors,
        )
        return SourceRunRecord(
            source_key=SOURCE_KEY,
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            started_at=started,
            completed_at=datetime.now(UTC),
            outcome=outcome,
            discovered_count=len(urls),
            parsed_count=len(snapshots),
            excluded_no_price_count=sum(not s.has_positive_price for s in snapshots),
            warning_count=sum(len(s.warnings) for s in snapshots),
            error_count=errors,
            snapshot_checksum=hashlib.sha256(
                "|".join(s.external_id for s in snapshots).encode()
            ).hexdigest(),
            notes="Bounded Moret WPEstate run; scheduling disabled",
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "bounded": True,
                "complete_catalog": False,
                "discover": discover,
                "platform": "wpestate",
                "identity_conflicts": identity_conflicts,
                "request_metrics": self.request_metrics.as_dict(),
            },
        ), snapshots

    def run_catalog(
        self,
        *,
        cache_dir: Path,
        dry_run: bool = True,
        honor_delay: bool = True,
        use_cache: bool = True,
        index_only: bool = False,
        max_items: int | None = None,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot], CatalogDiscoveryResult]:
        started = datetime.now(UTC)
        self.reset_request_state()
        if max_items is not None:
            raise ValueError("complete catalog run rejects max_items")
        mode: DiscoveryMode = "index_only" if index_only else "complete"
        discovery = self.discover_catalog(
            cache_dir=cache_dir,
            mode=mode,
            max_items=None,
            honor_delay=honor_delay,
            use_cache=use_cache,
        )
        if index_only:
            outcome = (
                SourceRunOutcome.PARTIAL
                if discovery.listings
                else SourceRunOutcome.FAILURE
            )
            record = SourceRunRecord(
                source_key=SOURCE_KEY,
                adapter_name=ADAPTER_NAME,
                adapter_version=ADAPTER_VERSION,
                started_at=started,
                completed_at=datetime.now(UTC),
                outcome=outcome,
                discovered_count=len(discovery.listings),
                parsed_count=0,
                notes="Index-only Moret reconnaissance; no detail fetches",
                metadata={
                    "dry_run": dry_run,
                    "bounded": False,
                    "complete_catalog": False,
                    "index_only": True,
                    "pagination_proven": discovery.pagination_proven,
                    "termination_reason": discovery.termination_reason,
                    "complete_candidate": discovery.complete_candidate,
                    "request_metrics": self.request_metrics.as_dict(),
                    "catalog_checksum": catalog_checksum_for(
                        [i.canonical_url for i in discovery.listings]
                    ),
                },
            )
            return record, [], discovery

        urls = [item.canonical_url for item in discovery.listings]
        snapshots, errors, identity_conflicts = self._parse_urls(
            urls,
            cache_dir=cache_dir,
            dry_run=dry_run,
            honor_delay=honor_delay,
            use_cache=use_cache,
            discovered_meta=discovery.listings,
        )
        material_parser_failures = sum(1 for s in snapshots if s.parser_errors)
        complete = (
            discovery.complete_candidate
            and discovery.pagination_proven
            and not discovery.errors
            and errors == 0
            and material_parser_failures == 0
            and not identity_conflicts
            and len(snapshots) == len(urls)
            and len(urls) > 0
        )
        outcome = classify_run_outcome(
            parsed_count=len(snapshots),
            target_count=len(urls),
            error_count=errors + material_parser_failures,
            complete_catalog=complete,
            bounded=False,
            truncated=False,
            max_items=None,
            failed_fetches=errors,
            parser_failures=material_parser_failures,
            early_termination=not discovery.pagination_proven,
        )
        if complete and outcome == SourceRunOutcome.SUCCESS:
            complete_flag = True
        else:
            complete_flag = False
            if outcome == SourceRunOutcome.SUCCESS:
                outcome = SourceRunOutcome.PARTIAL

        record = SourceRunRecord(
            source_key=SOURCE_KEY,
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            started_at=started,
            completed_at=datetime.now(UTC),
            outcome=outcome,
            discovered_count=len(urls),
            parsed_count=len(snapshots),
            excluded_no_price_count=sum(not s.has_positive_price for s in snapshots),
            warning_count=sum(len(s.warnings) for s in snapshots),
            error_count=errors,
            snapshot_checksum=hashlib.sha256(
                "|".join(sorted(s.external_id for s in snapshots)).encode()
            ).hexdigest(),
            notes="Moret WPEstate complete-catalog dry-run; scheduling disabled",
            metadata={
                "dry_run": dry_run,
                "bounded": False,
                "complete_catalog": complete_flag,
                "pagination_proven": discovery.pagination_proven,
                "termination_reason": discovery.termination_reason,
                "identity_conflicts": identity_conflicts,
                "index_page_checksums": [p.get("sha256") for p in discovery.index_pages],
                "catalog_checksum": catalog_checksum_for(urls),
                "request_metrics": self.request_metrics.as_dict(),
                "platform": "wpestate",
                "adapter_version": ADAPTER_VERSION,
            },
        )
        return record, snapshots, discovery

    def _parse_urls(
        self,
        urls: Sequence[str],
        *,
        cache_dir: Path,
        dry_run: bool,
        honor_delay: bool,
        use_cache: bool,
        discovered_meta: Sequence[DiscoveredListing],
    ) -> tuple[list[AdapterListingSnapshot], int, list[dict[str, Any]]]:
        meta_by_url = {item.canonical_url: item for item in discovered_meta}
        snapshots: list[AdapterListingSnapshot] = []
        by_external: dict[str, AdapterListingSnapshot] = {}
        identity_conflicts: list[dict[str, Any]] = []
        errors = 0
        for url in urls:
            if not self.supports(url):
                errors += 1
                continue
            try:
                fetched = self._fetch(
                    url,
                    cache_dir=cache_dir,
                    honor_delay=honor_delay,
                    use_cache=use_cache,
                    kind="detail",
                )
            except FetchError as error:
                errors += 1
                self.request_metrics.failed_http.append({"url": url, "error": str(error)})
                continue
            meta = meta_by_url.get(url)
            snap = self.parse_listing_html(
                fetched.body.decode("utf-8", errors="replace"),
                listing_url=url,
                raw_sha256=fetched.sha256,
                http_status=fetched.status,
                content_type=fetched.content_type or "text/html",
                index_category_hint=meta.index_category_hint if meta else None,
                bilingual_aliases=meta.bilingual_aliases if meta else None,
            )
            if not dry_run:
                try:
                    from merkado_labs.scrapers.raw_storage import upload_raw_html

                    upload_raw_html(
                        source_key=SOURCE_KEY,
                        external_id=snap.external_id,
                        checksum=fetched.sha256,
                        html_bytes=fetched.body,
                    )
                except Exception as upload_error:  # noqa: BLE001
                    snap = replace(
                        snap,
                        warnings=(*snap.warnings, f"evidence_upload_failed:{upload_error}"),
                    )
            prior = by_external.get(snap.external_id)
            if prior is not None:
                conflict = {
                    "external_id": snap.external_id,
                    "urls": [prior.source_url, snap.source_url],
                    "titles": [prior.title, snap.title],
                }
                # Same post ID, different canonical slug/facts → attention
                if prior.source_url != snap.source_url or prior.title != snap.title:
                    if (
                        prior.original_price != snap.original_price
                        or prior.listing_type != snap.listing_type
                    ):
                        identity_conflicts.append(conflict)
                        snap = replace(
                            snap,
                            warnings=(*snap.warnings, "duplicate_post_id_conflict"),
                            parser_errors=(*snap.parser_errors, "identity_conflict"),
                        )
                    else:
                        # Merge aliases into prior; skip duplicate snapshot
                        aliases = list(prior.raw_payload.get("bilingual_aliases") or [])
                        for a in snap.raw_payload.get("bilingual_aliases") or []:
                            if a not in aliases:
                                aliases.append(a)
                        if snap.source_url not in aliases:
                            aliases.append(snap.source_url)
                        prior = replace(
                            prior,
                            raw_payload={**prior.raw_payload, "bilingual_aliases": aliases},
                        )
                        by_external[snap.external_id] = prior
                        # replace in snapshots list
                        for idx, existing in enumerate(snapshots):
                            if existing.external_id == snap.external_id:
                                snapshots[idx] = prior
                                break
                        continue
            by_external[snap.external_id] = snap
            snapshots.append(snap)
        return snapshots, errors, identity_conflicts


def audit_robots_text(robots_body: str) -> dict[str, Any]:
    disallows = [m.group("path") for m in DISALLOW_RE.finditer(robots_body)]
    sitemaps = [m.group("url") for m in SITEMAP_RE.finditer(robots_body)]
    delay_m = CRAWL_DELAY_RE.search(robots_body)
    return {
        "disallowed_paths": disallows,
        "sitemap_urls": sitemaps,
        "crawl_delay": float(delay_m.group("n")) if delay_m else None,
        "properties_disallowed": any(
            path.startswith("/properties") for path in disallows if path and path != "/"
        ),
    }


def snapshots_to_catalog_artifact(
    *,
    record: SourceRunRecord,
    snapshots: list[AdapterListingSnapshot],
    discovery: CatalogDiscoveryResult,
) -> dict[str, Any]:
    detail_checksums = {s.external_id: s.raw_sha256 for s in snapshots}
    return {
        "adapter_version": ADAPTER_VERSION,
        "source_key": SOURCE_KEY,
        "generated_at": datetime.now(UTC).isoformat(),
        "complete_catalog": bool(record.metadata.get("complete_catalog")),
        "outcome": record.outcome.value if hasattr(record.outcome, "value") else record.outcome,
        "catalog_checksum": record.metadata.get("catalog_checksum"),
        "snapshot_checksum": record.snapshot_checksum,
        "index_page_checksums": record.metadata.get("index_page_checksums"),
        "detail_checksums": detail_checksums,
        "pagination_termination_reason": discovery.termination_reason,
        "pagination_proven": discovery.pagination_proven,
        "request_statistics": record.metadata.get("request_metrics"),
        "discovered_count": len(discovery.listings),
        "parsed_count": len(snapshots),
        "listings": [
            {
                "external_id": s.external_id,
                "source_url": s.source_url,
                "title": s.title,
                "listing_type": s.listing_type,
                "source_status": s.source_status,
                "lifecycle_hint": s.lifecycle_hint.value if s.lifecycle_hint else None,
                "original_price": str(s.original_price.amount) if s.original_price else None,
                "original_currency": s.original_price.currency if s.original_price else None,
                "from_price": s.raw_payload.get("from_price"),
                "price_period": s.raw_payload.get("price_period"),
                "price_trusted": s.raw_payload.get("price_trusted"),
                "bedrooms": s.bedrooms,
                "bathrooms": s.bathrooms,
                "floor_area_m2": str(s.floor_area_m2) if s.floor_area_m2 is not None else None,
                "lot_area_value": str(s.lot_area_value) if s.lot_area_value is not None else None,
                "neighbourhood_text": s.neighbourhood_text,
                "location_text": s.location_text,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "property_type": s.property_type,
                "primary_image_url": s.primary_image_url,
                "image_count": len(s.image_urls),
                "description_checksum": s.source_description_checksum,
                "description_length": len(s.description or ""),
                "agent_name": s.raw_payload.get("agent_name"),
                "bilingual_aliases": s.raw_payload.get("bilingual_aliases"),
                "wordpress_post_id": s.raw_payload.get("wordpress_post_id"),
                "warnings": list(s.warnings),
                "parser_errors": list(s.parser_errors),
                "raw_sha256": s.raw_sha256,
            }
            for s in snapshots
        ],
    }


def dump_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
