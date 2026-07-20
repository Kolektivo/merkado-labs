"""Monumentenzorg Curaçao (monumentenzorg.cw) WPEstate estate_property adapter.

Manual/unscheduled. Catalog = ``/properties/`` estate_property CPT only.
Heritage portfolio ``/our_property/`` is out of scope.

TLS uses certifi-backed verification via shared ``http_cache`` / ``robots``.
Historical note (2026-07-17): Windows default trust store reported SSL expiry /
alt-domain DNS failure; leaf cert is valid — use certifi, never verify=False.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse, urlunparse

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

SOURCE_KEY = "monumentenzorg_curacao"
ADAPTER_NAME = SOURCE_KEY
ADAPTER_VERSION = "0.2.0"
RAW_EVIDENCE_BUCKET = "listing-raw-evidence"
DOMAINS = frozenset(
    {
        "monumentenzorg.cw",
        "www.monumentenzorg.cw",
    }
)
BASE_URL = "https://monumentenzorg.cw"
PROPERTIES_INDEX_URL = f"{BASE_URL}/properties/"
ESTATE_PROPERTY_SITEMAP_URL = f"{BASE_URL}/estate_property-sitemap.xml"
REALTOR_NAME = "Monumentenzorg Curaçao"
REALTOR_DOMAIN = "monumentenzorg.cw"
DEFAULT_REQUEST_DELAY_SECONDS = 2.0
MAX_SAFE_CATALOG_URLS = 100
DiscoveryMode = Literal["bounded", "index_only", "complete"]

TITLE_H1_RE = re.compile(r"<h1[^>]*>(?P<body>.*?)</h1>", re.I | re.S)
TITLE_TAG_RE = re.compile(r"<title[^>]*>(?P<body>.*?)</title>", re.I | re.S)
NEXT_LINK_RE = re.compile(
    r'<link[^>]+rel=["\']next["\'][^>]+href=["\'](?P<href>[^"\']+)["\']',
    re.I,
)
NEXT_LINK_RE_ALT = re.compile(
    r'<link[^>]+href=["\'](?P<href>[^"\']+)["\'][^>]+rel=["\']next["\']',
    re.I,
)
PAGE_HREF_RE = re.compile(
    r'href=["\'](?P<href>(?:https://(?:www\.)?monumentenzorg\.cw)?'
    r"/properties/page/(?P<n>\d+)/?)[\"']",
    re.I,
)
PROPERTY_HREF_RE = re.compile(
    r'href=["\'](?P<href>(?:https://(?:www\.)?monumentenzorg\.cw)?'
    r"/properties/[^\"'#?]+)[\"']",
    re.I,
)
SITEMAP_LOC_RE = re.compile(r"<loc>\s*(?P<loc>[^<]+)\s*</loc>", re.I)
LISTING_DETAIL_RE = re.compile(
    r'class=["\']listing_detail[^"\']*["\'][^>]*>(?P<body>.*?)</div>',
    re.I | re.S,
)
PRICE_AREA_RE = re.compile(
    r'class=["\'][^"\']*\bprice_area\b[^"\']*["\'][^>]*>(?P<body>.*?)</div>',
    re.I | re.S,
)
POST_ID_RE = re.compile(
    r'id=["\']propertyid_display["\'][^>]*>.*?<strong>\s*Property\s*Id\s*:</strong>\s*'
    r"(?P<id>\d+)"
    r'|postid-(?P<id2>\d+)'
    r'|data-postid=["\'](?P<id3>\d+)["\']',
    re.I | re.S,
)
PRICE_AMOUNT_RE = re.compile(
    r"\b(?P<code>ANG|XCG|NAF|USD|EUR)\s*(?P<amount>[\d.,]+)",
    re.I,
)
NON_NUMERIC_PRICE_RE = re.compile(
    r"(?:rental fee to be determined|open to reasonable offers|price on request|"
    r"fee to be determined|on request)",
    re.I,
)
SIMILAR_SECTION_RE = re.compile(
    r"(?:Similar Listings|Compare properties).*?\Z",
    re.I | re.S,
)
OG_IMAGE_RE = re.compile(
    r'property=["\']og:image["\'][^>]+content=["\'](?P<url>[^"\']+)["\']'
    r'|content=["\'](?P<url2>[^"\']+)["\'][^>]+property=["\']og:image["\']',
    re.I,
)
GALLERY_IMG_RE = re.compile(
    r'(?:href|src)=["\'](?P<url>https?://[^"\']+\.(?:jpg|jpeg|png|webp)(?:\?[^"\']*)?)["\']',
    re.I,
)
DESCRIPTION_RE = re.compile(
    r'(?:wpestate_property_description|property_description|listing-content)'
    r'[^>]*>(?P<body>[\s\S]{0,12000}?)</div>',
    re.I,
)
FEATURES_RE = re.compile(
    r'(?:id|class)=["\'][^"\']*(?:accordion_property_details|property_features|'
    r"wpestate_property_features|listing_detail_features)[^\"']*[\"']"
    r"[\s\S]{0,2000}?<ul[^>]*>(?P<body>.*?)</ul>",
    re.I | re.S,
)
NAV_AMENITY_DENYLIST = frozenset(
    {
        "home",
        "for rent/sale",
        "our properties",
        "about us who we are",
        "about us",
        "news",
        "vacatures",
        "links",
        "contact",
        "search",
    }
)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
EXCLUDED_SLUGS = frozenset({"feed", "page"})
HERITAGE_PATH_PREFIXES = ("/our_property/", "/our-properties/")


def _text(value: str) -> str:
    return WS_RE.sub(" ", html_to_preserved_text(value)).strip()


def canonicalize_detail_url(raw: str) -> str | None:
    """Return canonical ``/properties/{slug}/`` URL or None if excluded/invalid."""

    raw = (raw or "").strip()
    if not raw:
        return None
    if raw.startswith("/"):
        raw = BASE_URL + raw
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host != "monumentenzorg.cw":
        return None
    path = parsed.path or "/"
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) != 2 or parts[0] != "properties":
        return None
    slug = parts[1].casefold()
    if slug in EXCLUDED_SLUGS or "&" in parts[1] or "." in parts[1]:
        return None
    return urlunparse(("https", "monumentenzorg.cw", f"/properties/{slug}/", "", "", ""))


def is_heritage_or_excluded_path(url: str) -> bool:
    path = urlparse(url).path.lower()
    if any(path.startswith(prefix) for prefix in HERITAGE_PATH_PREFIXES):
        return True
    if path.rstrip("/").endswith("/properties/feed") or "/properties/feed/" in path:
        return True
    return False


@dataclass
class DiscoveredListing:
    canonical_url: str
    discovered_on_index: str | None = None
    in_sitemap: bool = False
    raw_urls: tuple[str, ...] = ()


@dataclass
class RequestMetrics:
    robots_cache_hits: int = 0
    index_network_fetches: int = 0
    index_cache_hits: int = 0
    detail_network_fetches: int = 0
    detail_cache_hits: int = 0
    sitemap_network_fetches: int = 0
    sitemap_cache_hits: int = 0
    failed_http: list[dict[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "robots_cache_hits": self.robots_cache_hits,
            "index_network_fetches": self.index_network_fetches,
            "index_cache_hits": self.index_cache_hits,
            "detail_network_fetches": self.detail_network_fetches,
            "detail_cache_hits": self.detail_cache_hits,
            "sitemap_network_fetches": self.sitemap_network_fetches,
            "sitemap_cache_hits": self.sitemap_cache_hits,
            "failed_http": list(self.failed_http),
        }


@dataclass
class CatalogDiscoveryResult:
    listings: list[DiscoveredListing]
    index_pages: list[dict[str, Any]]
    sitemap_urls: list[str]
    termination_reason: str
    pagination_proven: bool
    errors: list[str]
    warnings: list[str]
    raw_link_count: int
    duplicate_count: int
    excluded_count: int
    index_unique_count: int
    sitemap_unique_count: int
    union_count: int
    complete_candidate: bool
    mode: DiscoveryMode
    excluded_samples: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "listings": [
                {
                    "canonical_url": item.canonical_url,
                    "discovered_on_index": item.discovered_on_index,
                    "in_sitemap": item.in_sitemap,
                }
                for item in self.listings
            ],
            "index_pages": self.index_pages,
            "sitemap_urls": self.sitemap_urls,
            "termination_reason": self.termination_reason,
            "pagination_proven": self.pagination_proven,
            "errors": self.errors,
            "warnings": self.warnings,
            "raw_link_count": self.raw_link_count,
            "duplicate_count": self.duplicate_count,
            "excluded_count": self.excluded_count,
            "index_unique_count": self.index_unique_count,
            "sitemap_unique_count": self.sitemap_unique_count,
            "union_count": self.union_count,
            "complete_candidate": self.complete_candidate,
            "mode": self.mode,
            "excluded_samples": self.excluded_samples[:20],
        }


def extract_index_listing_urls(html: str) -> tuple[list[str], int, list[str]]:
    """Return (canonical urls in order, raw_link_count, excluded samples)."""

    found: list[str] = []
    seen: set[str] = set()
    raw_count = 0
    excluded: list[str] = []
    for match in PROPERTY_HREF_RE.finditer(html):
        raw = match.group("href")
        raw_count += 1
        if is_heritage_or_excluded_path(raw if raw.startswith("http") else BASE_URL + raw):
            excluded.append(raw)
            continue
        canon = canonicalize_detail_url(raw)
        if canon is None:
            excluded.append(raw)
            continue
        if canon in seen:
            continue
        seen.add(canon)
        found.append(canon)
    return found, raw_count, excluded


def extract_sitemap_listing_urls(xml_text: str) -> tuple[list[str], list[str]]:
    urls: list[str] = []
    seen: set[str] = set()
    excluded: list[str] = []
    for match in SITEMAP_LOC_RE.finditer(xml_text):
        loc = match.group("loc").strip()
        if is_heritage_or_excluded_path(loc):
            excluded.append(loc)
            continue
        if loc.rstrip("/") == f"{BASE_URL}/properties":
            continue
        canon = canonicalize_detail_url(loc)
        if canon is None:
            excluded.append(loc)
            continue
        if canon in seen:
            continue
        seen.add(canon)
        urls.append(canon)
    return urls, excluded


def _primary_html(html: str) -> str:
    """Strip Similar Listings / compare blocks to avoid contamination."""

    cut = re.search(r"<h\d[^>]*>\s*Similar Listings\s*</h\d>", html, re.I)
    if cut:
        return html[: cut.start()]
    cut2 = re.search(r'class=["\'][^"\']*similar[^"\']*["\']', html, re.I)
    if cut2 and cut2.start() > len(html) // 3:
        return html[: cut2.start()]
    return html


def _listing_details(html: str) -> dict[str, str]:
    details: dict[str, str] = {}
    for match in LISTING_DETAIL_RE.finditer(html):
        t = _text(match.group("body"))
        if ":" not in t:
            continue
        key, value = t.split(":", 1)
        details[key.strip()] = value.strip()
    return details


def _parse_size(value: str | None) -> Decimal | None:
    if not value:
        return None
    m = re.search(r"([\d.,]+)", value)
    if not m:
        return None
    try:
        return parse_decimal_amount(m.group(1))
    except (InvalidOperation, ValueError):
        return None


def _extract_images(html: str) -> tuple[str, ...]:
    images: list[str] = []
    seen: set[str] = set()
    og = OG_IMAGE_RE.search(html)
    if og:
        url = og.group("url") or og.group("url2")
        if url and url not in seen:
            seen.add(url)
            images.append(url)
    for match in GALLERY_IMG_RE.finditer(html):
        url = match.group("url")
        low = url.lower()
        if any(x in low for x in ("logo", "icon", "avatar", "emoji", "sprite")):
            continue
        if "/wp-content/uploads/" not in low:
            continue
        # Prefer full-size over resized when both present; keep first stable order
        if url in seen:
            continue
        seen.add(url)
        images.append(url)
        if len(images) >= 30:
            break
    return tuple(images)


def snapshots_to_catalog_artifact(
    snapshots: Sequence[AdapterListingSnapshot],
    *,
    run: SourceRunRecord,
    discovery: CatalogDiscoveryResult | None = None,
) -> dict[str, Any]:
    items = []
    for snap in snapshots:
        items.append(
            {
                "external_id": snap.external_id,
                "source_url": snap.source_url,
                "title": snap.title,
                "listing_type": snap.listing_type,
                "property_type": snap.property_type,
                "source_status": snap.source_status,
                "lifecycle_hint": snap.lifecycle_hint.value if snap.lifecycle_hint else None,
                "original_price": (
                    {
                        "amount": str(snap.original_price.amount),
                        "currency": snap.original_price.currency,
                        "evidence": snap.original_price.evidence,
                    }
                    if snap.original_price
                    else None
                ),
                "has_positive_price": snap.has_positive_price,
                "bedrooms": snap.bedrooms,
                "bathrooms": float(snap.bathrooms) if snap.bathrooms is not None else None,
                "floor_area_m2": (
                    str(snap.floor_area_m2) if snap.floor_area_m2 is not None else None
                ),
                "lot_area_value": (
                    str(snap.lot_area_value) if snap.lot_area_value is not None else None
                ),
                "neighbourhood_text": snap.neighbourhood_text,
                "location_text": snap.location_text,
                "public_address_text": snap.public_address_text,
                "latitude": snap.latitude,
                "longitude": snap.longitude,
                "image_urls": list(snap.image_urls),
                "raw_sha256": snap.raw_sha256,
                "warnings": list(snap.warnings),
                "parser_errors": list(snap.parser_errors),
                "raw_payload": snap.raw_payload,
            }
        )
    payload = {
        "source_key": SOURCE_KEY,
        "adapter_version": ADAPTER_VERSION,
        "complete_catalog": bool((run.metadata or {}).get("complete_catalog")),
        "generated_at": datetime.now(UTC).isoformat(),
        "run": {
            "outcome": run.outcome.value,
            "discovered_count": run.discovered_count,
            "parsed_count": run.parsed_count,
            "excluded_no_price_count": run.excluded_no_price_count,
            "error_count": run.error_count,
            "snapshot_checksum": run.snapshot_checksum,
            "metadata": run.metadata,
        },
        "discovery": discovery.as_dict() if discovery else None,
        "listings": items,
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    payload["catalog_checksum"] = hashlib.sha256(blob.encode("utf-8")).hexdigest()
    return payload


class MonumentenzorgCuracaoAdapter(DirectSourceAdapter):
    """Direct estate_property adapter for Monumentenzorg Curaçao."""

    source_key = SOURCE_KEY
    name = ADAPTER_NAME
    version = ADAPTER_VERSION
    domains = DOMAINS

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or Path("data/raw/monumentenzorg_curacao/cache")
        self.request_metrics = RequestMetrics()
        self._robots_cache: dict[str, RobotsDecision] = {}
        self._last_request_at: float | None = None
        self._cached_crawl_delay: float | None = None

    def evaluate_robots(self, listing_url: str, *, honor_delay: bool = True) -> RobotsDecision:
        host = (urlparse(listing_url).hostname or "").lower()
        if host in self._robots_cache:
            self.request_metrics.robots_cache_hits += 1
            return self._robots_cache[host]
        decision = check_robots(listing_url, user_agent=USER_AGENT)
        self._robots_cache[host] = decision
        if honor_delay and decision.crawl_delay_seconds:
            self._cached_crawl_delay = max(
                DEFAULT_REQUEST_DELAY_SECONDS, float(decision.crawl_delay_seconds)
            )
        else:
            self._cached_crawl_delay = DEFAULT_REQUEST_DELAY_SECONDS
        return decision

    def _pace(self, *, honor_delay: bool) -> None:
        if not honor_delay:
            return
        delay = max(DEFAULT_REQUEST_DELAY_SECONDS, self._cached_crawl_delay or 0)
        if self._last_request_at is None:
            self._last_request_at = time.monotonic()
            return
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self._last_request_at = time.monotonic()

    def _fetch(
        self,
        url: str,
        *,
        cache_dir: Path,
        honor_delay: bool,
        use_cache: bool,
        kind: str,
    ) -> CachedFetch:
        robots = self.evaluate_robots(url, honor_delay=honor_delay)
        if robots.can_fetch is not True:
            raise FetchError(f"robots_disallow:{url}")
        cache_path = cache_dir / f"{hashlib.sha256(url.encode()).hexdigest()}.html"
        will_use_cache = use_cache and cache_path.exists()
        if not will_use_cache:
            self._pace(honor_delay=honor_delay)
        fetched = fetch_url(
            url,
            cache_dir=cache_dir,
            user_agent=USER_AGENT,
            use_cache=use_cache,
            use_certifi=True,
        )
        if fetched.from_cache:
            if kind == "index":
                self.request_metrics.index_cache_hits += 1
            elif kind == "sitemap":
                self.request_metrics.sitemap_cache_hits += 1
            else:
                self.request_metrics.detail_cache_hits += 1
        else:
            if kind == "index":
                self.request_metrics.index_network_fetches += 1
            elif kind == "sitemap":
                self.request_metrics.sitemap_network_fetches += 1
            else:
                self.request_metrics.detail_network_fetches += 1
            self._last_request_at = time.monotonic()
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
    ) -> AdapterListingSnapshot:
        warnings: list[str] = []
        parser_errors: list[str] = []
        fields: list[FieldProvenance] = []
        observed = observed_at or datetime.now(UTC)
        primary = _primary_html(html)
        details = _listing_details(primary)

        title_m = TITLE_H1_RE.search(primary) or TITLE_TAG_RE.search(primary)
        title = _text(title_m.group("body")) if title_m else None
        if title:
            title = re.sub(r"\s*[|\-].*Stichting Monumentenzorg.*$", "", title, flags=re.I).strip()

        prop_id = details.get("Property Id")
        if not prop_id:
            m_id = POST_ID_RE.search(primary) or POST_ID_RE.search(html)
            if m_id:
                prop_id = m_id.group("id") or m_id.group("id2") or m_id.group("id3")
        if not prop_id:
            parser_errors.append("missing_wordpress_property_id")
            slug = urlparse(listing_url).path.rstrip("/").rsplit("/", 1)[-1]
            external_id = f"unresolved-{slug.casefold()}"
            warnings.append("unstable_external_id_fallback_slug")
        else:
            external_id = f"property-{prop_id}"
            fields.append(
                FieldProvenance(
                    "external_id",
                    prop_id,
                    external_id,
                    "propertyid_display_or_postid",
                    evidence_selector="#propertyid_display",
                )
            )

        price_area = None
        pm = PRICE_AREA_RE.search(primary)
        if pm:
            price_area = _text(pm.group("body"))
        price_detail = details.get("Price")
        price_text = price_area or price_detail
        listing_type = None
        if price_text:
            low_price = price_text.lower()
            if " in sales" in low_price or re.search(r"\bsales\b", low_price):
                listing_type = "sale"
            elif " in rentals" in low_price or "per month" in low_price or "rental" in low_price:
                listing_type = "rent"
        if listing_type is None:
            warnings.append("listing_type_unresolved")

        source_status = "unknown"
        lifecycle = ListingLifecycleStatus.UNKNOWN
        primary_status_text = f"{title or ''} {price_text or ''}".lower()
        if "sold under reservation" in primary_status_text:
            source_status = "sold_under_reservation"
            lifecycle = ListingLifecycleStatus.SOLD
        elif NON_NUMERIC_PRICE_RE.search(price_text or "") and listing_type == "sale":
            source_status = "for_sale_offers"
            lifecycle = ListingLifecycleStatus.ACTIVE
        elif "rental fee to be determined" in (price_text or "").lower():
            source_status = "for_rent_price_tbd"
            lifecycle = ListingLifecycleStatus.ACTIVE
        elif listing_type == "rent":
            source_status = "for_rent"
            lifecycle = ListingLifecycleStatus.ACTIVE
        elif listing_type == "sale":
            source_status = "for_sale"
            lifecycle = ListingLifecycleStatus.ACTIVE

        amount = None
        currency = None
        from_price = False
        rent_period = None
        tax_exclusion_text = None
        if price_text:
            if re.search(r"starting at|vanaf", price_text, re.I):
                from_price = True
            if re.search(r"per month| / month|/month", price_text, re.I):
                rent_period = "month"
            if re.search(r"excl\.?\s*ob", price_text, re.I):
                tax_exclusion_text = "excl. OB"
            if NON_NUMERIC_PRICE_RE.search(price_text):
                warnings.append("non_numeric_price_text")
            else:
                am = PRICE_AMOUNT_RE.search(price_text)
                if am:
                    currency = am.group("code").upper()
                    if currency == "NAF":
                        currency = "ANG"
                        warnings.append("naf_normalized_to_ang")
                    amount = parse_decimal_amount(f"{currency} {am.group('amount')}")

        money = resolve_original_money(amount=amount, currency=currency, evidence=price_text)
        if money is None:
            warnings.append("no_valid_positive_price")

        bedrooms = None
        if "Bedrooms" in details:
            try:
                bedrooms = int(re.search(r"-?\d+", details["Bedrooms"]).group(0))  # type: ignore[union-attr]
            except (AttributeError, ValueError):
                warnings.append("bedrooms_parse_failed")
        bathrooms = None
        if "Bathrooms" in details:
            try:
                bathrooms = float(
                    re.search(r"-?\d+(?:[.,]\d+)?", details["Bathrooms"])
                    .group(0)
                    .replace(",", ".")  # type: ignore[union-attr]
                )
            except (AttributeError, ValueError):
                warnings.append("bathrooms_parse_failed")

        floor_area = _parse_size(details.get("Property Size"))
        lot_area = _parse_size(details.get("Property Lot Size"))
        year_built = None
        if details.get("Year Built"):
            ym = re.search(r"(\d{4})", details["Year Built"])
            if ym:
                year_built = int(ym.group(1))

        address = details.get("Address") or None
        area = details.get("Area") or None
        city = details.get("City") or None
        property_type = details.get("Propery Type") or details.get("Property Type") or None
        if not property_type and price_text and "commercial" in price_text.lower():
            property_type = "Commercial"

        desc_m = DESCRIPTION_RE.search(primary)
        description = _text(desc_m.group("body")) if desc_m else None
        if not description:
            # Fall back to first substantial paragraph block in primary content
            paras = re.findall(r"<p[^>]*>(.*?)</p>", primary, re.I | re.S)
            joined = _text(" ".join(paras[:6]))
            if len(joined) > 80:
                description = joined[:5000]

        features: list[dict[str, Any]] = []
        feat_m = FEATURES_RE.search(primary)
        if feat_m:
            for li in re.findall(r"<li[^>]*>(.*?)</li>", feat_m.group("body"), re.I | re.S):
                label = _text(li)
                if not label:
                    continue
                if label.casefold() in NAV_AMENITY_DENYLIST:
                    continue
                if len(label) > 80:
                    continue
                features.append({"name": label, "source": "features_list"})

        images = _extract_images(primary)
        # Coordinates: only explicit LatLng / lat-lon pairs in primary body
        latitude = None
        longitude = None
        maps = re.search(
            r"LatLng\(\s*(?P<lat>-?\d+\.\d+)\s*,\s*(?P<lng>-?\d+\.\d+)\s*\)", primary
        )
        if maps:
            latitude = float(maps.group("lat"))
            longitude = float(maps.group("lng"))
        else:
            warnings.append("coordinates_absent")

        location_parts = [p for p in (address, area, city, "Curaçao") if p]
        location_text = ", ".join(dict.fromkeys(location_parts)) if location_parts else None

        fields.append(
            FieldProvenance(
                "realtor",
                REALTOR_NAME,
                {"name": REALTOR_NAME, "domain": REALTOR_DOMAIN},
                "source_site_attribution",
            )
        )
        if price_text:
            fields.append(
                FieldProvenance(
                    "price_text",
                    price_text,
                    {
                        "amount": str(money.amount) if money else None,
                        "currency": money.currency if money else None,
                        "from_price": from_price,
                        "rent_period": rent_period,
                        "tax_exclusion_text": tax_exclusion_text,
                    },
                    "price_area_primary",
                    evidence_selector=".price_area",
                    evidence_snippet=price_text[:240],
                )
            )

        return AdapterListingSnapshot(
            source_key=SOURCE_KEY,
            external_id=external_id,
            source_url=canonicalize_detail_url(listing_url) or listing_url,
            observed_at=observed,
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            raw_payload={
                "realtor_name": REALTOR_NAME,
                "realtor_domain": REALTOR_DOMAIN,
                "wordpress_property_id": prop_id,
                "price_text": price_text,
                "price_trusted": money is not None,
                "from_price": from_price,
                "rent_period": rent_period,
                "tax_exclusion_text": tax_exclusion_text,
                "year_built": year_built,
                "listing_details": details,
                "slug": urlparse(listing_url).path.rstrip("/").rsplit("/", 1)[-1],
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type=listing_type,
            property_type=property_type,
            source_status=source_status,
            lifecycle_hint=lifecycle,
            original_price=money,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            floor_area_m2=floor_area,
            lot_area_value=lot_area,
            lot_area_unit="m2" if lot_area is not None else None,
            latitude=latitude,
            longitude=longitude,
            neighbourhood_text=area,
            location_text=location_text,
            public_address_text=address,
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
            amenities=tuple(features),
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
        fixture_index_html: str | None = None,
        fixture_sitemap_xml: str | None = None,
    ) -> CatalogDiscoveryResult:
        if mode == "complete" and max_items is not None:
            raise ValueError("complete catalog discovery rejects max_items")
        if mode == "bounded" and max_items is None:
            max_items = 5

        errors: list[str] = []
        warnings: list[str] = []
        index_pages: list[dict[str, Any]] = []
        raw_link_count = 0
        duplicate_count = 0
        excluded_count = 0
        excluded_samples: list[str] = []
        termination_reason = "unknown"
        pagination_proven = False

        # Index page
        if fixture_index_html is not None:
            index_html = fixture_index_html
            index_sha = sha256_text(index_html)
            index_pages.append(
                {
                    "url": PROPERTIES_INDEX_URL,
                    "page": 1,
                    "sha256": index_sha,
                    "from_fixture": True,
                    "next_url": None,
                }
            )
        else:
            robots = self.evaluate_robots(PROPERTIES_INDEX_URL, honor_delay=honor_delay)
            if robots.can_fetch is not True:
                errors.append(f"robots_disallow:{PROPERTIES_INDEX_URL}")
                return CatalogDiscoveryResult(
                    listings=[],
                    index_pages=[],
                    sitemap_urls=[],
                    termination_reason="robots_disallow",
                    pagination_proven=False,
                    errors=errors,
                    warnings=warnings,
                    raw_link_count=0,
                    duplicate_count=0,
                    excluded_count=0,
                    index_unique_count=0,
                    sitemap_unique_count=0,
                    union_count=0,
                    complete_candidate=False,
                    mode=mode,
                )
            try:
                fetched = self._fetch(
                    PROPERTIES_INDEX_URL,
                    cache_dir=cache_dir,
                    honor_delay=honor_delay,
                    use_cache=use_cache,
                    kind="index",
                )
            except FetchError as error:
                errors.append(f"index_fetch_failed:{error}")
                self.request_metrics.failed_http.append(
                    {"url": PROPERTIES_INDEX_URL, "error": str(error)}
                )
                return CatalogDiscoveryResult(
                    listings=[],
                    index_pages=[],
                    sitemap_urls=[],
                    termination_reason="index_fetch_failed",
                    pagination_proven=False,
                    errors=errors,
                    warnings=warnings,
                    raw_link_count=0,
                    duplicate_count=0,
                    excluded_count=0,
                    index_unique_count=0,
                    sitemap_unique_count=0,
                    union_count=0,
                    complete_candidate=False,
                    mode=mode,
                )
            index_html = fetched.body.decode("utf-8", errors="replace")
            next_url = None
            for pattern in (NEXT_LINK_RE, NEXT_LINK_RE_ALT):
                nm = pattern.search(index_html)
                if nm:
                    next_url = nm.group("href")
                    break
            if next_url is None and PAGE_HREF_RE.search(index_html):
                # page/2+ present without rel=next still means incomplete single-page assumption
                next_url = "page_href_present"
            index_pages.append(
                {
                    "url": PROPERTIES_INDEX_URL,
                    "page": 1,
                    "sha256": fetched.sha256,
                    "status": fetched.status,
                    "from_cache": fetched.from_cache,
                    "next_url": next_url,
                }
            )

        index_urls, raw_link_count, excl = extract_index_listing_urls(index_html)
        excluded_count += len(excl)
        excluded_samples.extend(excl[:10])
        # Count duplicates in raw href stream
        raw_canons = []
        for match in PROPERTY_HREF_RE.finditer(index_html):
            c = canonicalize_detail_url(match.group("href"))
            if c:
                raw_canons.append(c)
        duplicate_count = max(0, len(raw_canons) - len(set(raw_canons)))

        next_present = bool(index_pages and index_pages[0].get("next_url"))
        if next_present:
            termination_reason = "unexpected_next_page"
            pagination_proven = False
            warnings.append("index_has_next_or_page_links")
        else:
            termination_reason = "no_next_page"
            pagination_proven = True

        if max_items is not None and len(index_urls) > max_items:
            index_urls = index_urls[:max_items]
            termination_reason = "max_items_reached"
            pagination_proven = False

        # Sitemap cross-check
        sitemap_urls: list[str] = []
        if fixture_sitemap_xml is not None:
            sitemap_urls, sexcl = extract_sitemap_listing_urls(fixture_sitemap_xml)
            excluded_count += len(sexcl)
            excluded_samples.extend(sexcl[:5])
        elif mode != "bounded" or fixture_index_html is None:
            try:
                sm = self._fetch(
                    ESTATE_PROPERTY_SITEMAP_URL,
                    cache_dir=cache_dir,
                    honor_delay=honor_delay,
                    use_cache=use_cache,
                    kind="sitemap",
                )
                sitemap_urls, sexcl = extract_sitemap_listing_urls(
                    sm.body.decode("utf-8", errors="replace")
                )
                excluded_count += len(sexcl)
            except FetchError as error:
                errors.append(f"sitemap_fetch_failed:{error}")
                warnings.append("sitemap_unavailable")

        index_set = set(index_urls)
        sitemap_set = set(sitemap_urls)
        only_index = sorted(index_set - sitemap_set)
        only_sitemap = sorted(sitemap_set - index_set)
        if only_index:
            warnings.append(f"index_not_in_sitemap:{len(only_index)}")
        if only_sitemap:
            warnings.append(f"sitemap_not_in_index:{len(only_sitemap)}")
            errors.append("sitemap_index_mismatch")

        # Union: prefer index order, then sitemap-only
        by_url: dict[str, DiscoveredListing] = {}
        ordered: list[DiscoveredListing] = []
        for url in index_urls:
            item = DiscoveredListing(
                canonical_url=url,
                discovered_on_index=PROPERTIES_INDEX_URL,
                in_sitemap=url in sitemap_set,
            )
            by_url[url] = item
            ordered.append(item)
        for url in sitemap_urls:
            if url in by_url:
                by_url[url].in_sitemap = True
                continue
            item = DiscoveredListing(
                canonical_url=url,
                discovered_on_index=None,
                in_sitemap=True,
            )
            by_url[url] = item
            ordered.append(item)
            warnings.append(f"sitemap_only_url:{url}")

        if max_items is not None:
            ordered = ordered[:max_items]

        complete_candidate = (
            mode == "complete"
            and pagination_proven
            and termination_reason == "no_next_page"
            and not errors
            and len(ordered) > 0
            and not only_sitemap
            and max_items is None
        )

        return CatalogDiscoveryResult(
            listings=ordered,
            index_pages=index_pages,
            sitemap_urls=sitemap_urls,
            termination_reason=termination_reason,
            pagination_proven=pagination_proven,
            errors=errors,
            warnings=warnings,
            raw_link_count=raw_link_count,
            duplicate_count=duplicate_count,
            excluded_count=excluded_count,
            index_unique_count=len(index_set),
            sitemap_unique_count=len(sitemap_set),
            union_count=len(by_url),
            complete_candidate=complete_candidate,
            mode=mode,
            excluded_samples=excluded_samples,
        )

    def _parse_urls(
        self,
        urls: Sequence[str],
        *,
        cache_dir: Path,
        honor_delay: bool,
        use_cache: bool,
        fixture_html_by_url: dict[str, str] | None = None,
        inject_failures: dict[str, str] | None = None,
    ) -> tuple[list[AdapterListingSnapshot], int, int]:
        snapshots: list[AdapterListingSnapshot] = []
        fetch_errors = 0
        parser_failures = 0
        fixtures = fixture_html_by_url or {}
        failures = inject_failures or {}
        for url in urls:
            if url in failures:
                fetch_errors += 1
                self.request_metrics.failed_http.append({"url": url, "error": failures[url]})
                continue
            try:
                if url in fixtures:
                    html = fixtures[url]
                    raw_sha = sha256_text(html)
                    status = 200
                    ctype = "text/html"
                else:
                    fetched = self._fetch(
                        url,
                        cache_dir=cache_dir,
                        honor_delay=honor_delay,
                        use_cache=use_cache,
                        kind="detail",
                    )
                    html = fetched.body.decode("utf-8", errors="replace")
                    raw_sha = fetched.sha256
                    status = fetched.status
                    ctype = fetched.content_type
                snap = self.parse_listing_html(
                    html,
                    listing_url=url,
                    raw_sha256=raw_sha,
                    http_status=status,
                    content_type=ctype,
                )
                if snap.parser_errors:
                    parser_failures += 1
                snapshots.append(snap)
            except FetchError as error:
                fetch_errors += 1
                self.request_metrics.failed_http.append({"url": url, "error": str(error)})
            except Exception as error:  # noqa: BLE001
                parser_failures += 1
                self.request_metrics.failed_http.append(
                    {"url": url, "error": f"parser:{error}"}
                )
        return snapshots, fetch_errors, parser_failures

    def run_bounded(
        self,
        *,
        listing_urls: Sequence[str],
        cache_dir: Path,
        dry_run: bool = True,
        max_items: int = 5,
        honor_delay: bool = True,
        use_cache: bool = True,
        fixture_html_by_url: dict[str, str] | None = None,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot]]:
        started = datetime.now(UTC)
        urls = [u for u in listing_urls if canonicalize_detail_url(u)]
        if not urls:
            discovery = self.discover_catalog(
                cache_dir=cache_dir,
                mode="bounded",
                max_items=max_items,
                honor_delay=honor_delay,
                use_cache=use_cache,
            )
            urls = [item.canonical_url for item in discovery.listings]
        else:
            urls = urls[:max_items]
            discovery = None
        snapshots, fetch_errors, parser_failures = self._parse_urls(
            urls,
            cache_dir=cache_dir,
            honor_delay=honor_delay,
            use_cache=use_cache,
            fixture_html_by_url=fixture_html_by_url,
        )
        outcome = classify_run_outcome(
            parsed_count=len(snapshots),
            target_count=len(urls),
            error_count=fetch_errors + parser_failures,
            complete_catalog=False,
            bounded=True,
            max_items=max_items,
            failed_fetches=fetch_errors,
            parser_failures=parser_failures,
        )
        completed = datetime.now(UTC)
        checksum = hashlib.sha256(
            "|".join(sorted(f"{s.external_id}:{s.raw_sha256}" for s in snapshots)).encode()
        ).hexdigest()
        record = SourceRunRecord(
            source_key=SOURCE_KEY,
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            started_at=started,
            completed_at=completed,
            outcome=outcome,
            discovered_count=len(urls),
            parsed_count=len(snapshots),
            excluded_no_price_count=sum(1 for s in snapshots if not s.has_positive_price),
            warning_count=sum(len(s.warnings) for s in snapshots),
            error_count=fetch_errors + parser_failures,
            snapshot_checksum=checksum,
            notes="Bounded Monumentenzorg run; complete_catalog=false",
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "bounded": True,
                "complete_catalog": False,
                "request_metrics": self.request_metrics.as_dict(),
                "discovery": discovery.as_dict() if discovery else None,
                "tls": "certifi",
            },
        )
        return record, snapshots

    def run_catalog(
        self,
        *,
        cache_dir: Path,
        dry_run: bool = True,
        honor_delay: bool = True,
        use_cache: bool = True,
        fixture_index_html: str | None = None,
        fixture_sitemap_xml: str | None = None,
        fixture_html_by_url: dict[str, str] | None = None,
        inject_failures: dict[str, str] | None = None,
        mode: DiscoveryMode = "complete",
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot], CatalogDiscoveryResult]:
        started = datetime.now(UTC)
        discovery = self.discover_catalog(
            cache_dir=cache_dir,
            mode=mode,
            max_items=None if mode == "complete" else 5,
            honor_delay=honor_delay,
            use_cache=use_cache,
            fixture_index_html=fixture_index_html,
            fixture_sitemap_xml=fixture_sitemap_xml,
        )
        urls = [item.canonical_url for item in discovery.listings]
        if mode == "index_only":
            completed = datetime.now(UTC)
            record = SourceRunRecord(
                source_key=SOURCE_KEY,
                adapter_name=ADAPTER_NAME,
                adapter_version=ADAPTER_VERSION,
                started_at=started,
                completed_at=completed,
                outcome=SourceRunOutcome.PARTIAL,
                discovered_count=len(urls),
                parsed_count=0,
                notes="Index-only discovery",
                metadata={
                    "dry_run": dry_run,
                    "bounded": True,
                    "complete_catalog": False,
                    "index_only": True,
                    "discovery": discovery.as_dict(),
                    "request_metrics": self.request_metrics.as_dict(),
                },
            )
            return record, [], discovery

        snapshots, fetch_errors, parser_failures = self._parse_urls(
            urls,
            cache_dir=cache_dir,
            honor_delay=honor_delay,
            use_cache=use_cache,
            fixture_html_by_url=fixture_html_by_url,
            inject_failures=inject_failures,
        )
        identity_ok = all(
            s.external_id.startswith("property-") and s.external_id.split("-", 1)[-1].isdigit()
            for s in snapshots
        )
        material_parser_failures = sum(1 for s in snapshots if s.parser_errors) + parser_failures
        complete = (
            discovery.complete_candidate
            and discovery.pagination_proven
            and not discovery.errors
            and fetch_errors == 0
            and material_parser_failures == 0
            and identity_ok
            and len(snapshots) == len(urls)
            and len(urls) > 0
            and mode == "complete"
        )
        outcome = classify_run_outcome(
            parsed_count=len(snapshots),
            target_count=len(urls),
            error_count=fetch_errors + material_parser_failures + len(discovery.errors),
            complete_catalog=complete,
            bounded=mode != "complete",
            failed_fetches=fetch_errors,
            parser_failures=material_parser_failures,
        )
        if complete and outcome == SourceRunOutcome.SUCCESS:
            complete_flag = True
        else:
            complete_flag = False
            if outcome == SourceRunOutcome.SUCCESS:
                outcome = SourceRunOutcome.PARTIAL

        completed = datetime.now(UTC)
        checksum = hashlib.sha256(
            "|".join(sorted(f"{s.external_id}:{s.raw_sha256}" for s in snapshots)).encode()
        ).hexdigest()
        record = SourceRunRecord(
            source_key=SOURCE_KEY,
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            started_at=started,
            completed_at=completed,
            outcome=outcome,
            discovered_count=len(urls),
            parsed_count=len(snapshots),
            excluded_no_price_count=sum(1 for s in snapshots if not s.has_positive_price),
            warning_count=sum(len(s.warnings) for s in snapshots) + len(discovery.warnings),
            error_count=fetch_errors + material_parser_failures + len(discovery.errors),
            snapshot_checksum=checksum,
            notes=(
                "Complete estate_property catalog"
                if complete_flag
                else "Partial/incomplete Monumentenzorg catalog run"
            ),
            metadata={
                "dry_run": dry_run,
                "bounded": mode != "complete",
                "complete_catalog": complete_flag,
                "discovery": discovery.as_dict(),
                "request_metrics": self.request_metrics.as_dict(),
                "tls": "certifi",
                "scope": "estate_property_only",
                "heritage_cpt_excluded": True,
            },
        )
        return record, snapshots, discovery
