"""Keller Williams Curaçao direct listing adapter.

Manual and unscheduled only. The site's declared Crawl-delay is 20 seconds;
detail requests are intentionally sequential.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal
from urllib.parse import urljoin, urlparse, urlunparse

from merkado_labs.normalization.currency import parse_decimal_amount, resolve_original_money
from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    FieldProvenance,
    ListingLifecycleStatus,
    SourceRunRecord,
    classify_run_outcome,
)
from merkado_labs.scrapers.evidence import (
    evidence_storage_path,
    html_to_preserved_text,
    sha256_text,
)
from merkado_labs.scrapers.http_cache import FetchError, fetch_url
from merkado_labs.scrapers.robots import USER_AGENT

SOURCE_KEY = "keller_williams_curacao"
ADAPTER_NAME = SOURCE_KEY
ADAPTER_VERSION = "0.1.0"
RAW_EVIDENCE_BUCKET = "listing-raw-evidence"
DOMAINS = frozenset({"kw-curacao.com", "www.kw-curacao.com"})
BASE_URL = "https://kw-curacao.com"
DEFAULT_REQUEST_DELAY_SECONDS = 20.0
INDEX_URLS = (
    f"{BASE_URL}/",
    f"{BASE_URL}/listings",
    f"{BASE_URL}/listings/for-sale/residential",
    f"{BASE_URL}/listings/for-sale/lots-and-land",
    f"{BASE_URL}/listings/for-sale/commercial",
    f"{BASE_URL}/listings/for-rent/residential",
    f"{BASE_URL}/listings/for-rent/commercial",
)

ListingSection = Literal["sale", "rent"]

TITLE_RE = re.compile(r"<h1[^>]*>(?P<body>.*?)</h1>", re.I | re.S)
TITLE_TAG_RE = re.compile(r"<title>(?P<body>.*?)</title>", re.I | re.S)
STATUS_RE = re.compile(
    r'class=["\'][^"\']*page-property-details__status[^"\']*["\'][^>]*>(?P<body>.*?)</',
    re.I | re.S,
)
LOCATION_RE = re.compile(
    r'class=["\'][^"\']*page-property-details__location[^"\']*["\'][^>]*>(?P<body>.*?)</',
    re.I | re.S,
)
TYPE_RE = re.compile(
    r'class=["\'][^"\']*page-property-details__type[^"\']*["\'][^>]*>(?P<body>.*?)</',
    re.I | re.S,
)
PRICE_RE = re.compile(
    r'class=["\'][^"\']*page-property-details__price[^"\']*["\'][^>]*>(?P<body>.*?)</div>',
    re.I | re.S,
)
OPTION_RE = re.compile(
    r'class=["\'][^"\']*option__value[^"\']*["\'][^>]*>(?P<body>.*?)</div>',
    re.I | re.S,
)
DESCRIPTION_RE = re.compile(
    r'<div\s+id=["\']description["\'][^>]*>.*?'
    r'<div[^>]+class=["\'][^"\']*\bwysiwyg\b[^"\']*["\'][^>]*>(?P<body>.*?)</div>'
    r'(?:\s*<div[^>]+class=["\'][^"\']*property-brochure-links)',
    re.I | re.S,
)
FEATURES_RE = re.compile(
    r'<div\s+id=["\']features["\'][^>]*>(?P<body>.*?)</div>\s*</div>\s*<div\s+id=["\']map["\']',
    re.I | re.S,
)
FEATURE_ROW_RE = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>(?P<label>.*?)</td>\s*<td[^>]*>(?P<value>.*?)</td>\s*</tr>",
    re.I | re.S,
)
IMAGE_RE = re.compile(
    r'<a\s+href=["\'](?P<url>https?://(?:www\.)?kw-curacao\.com/storage/[^"\']+)["\']'
    r'[^>]*\bdata-fancybox=["\']gallery["\']',
    re.I,
)
DETAIL_HREF_RE = re.compile(
    r'href=["\'](?P<href>[^"\']*/listings/(?:for-(?:sale|rent)/)?[^"\']+)["\']',
    re.I,
)
ID_FROM_SLUG_RE = re.compile(r"(?P<id>[A-Za-z]{2,}\d+(?:[-_]\d+)?|[A-Za-z]{1,4}-\d+)$")
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class DiscoveredListing:
    """A normalized URL found on a KW index page."""

    url: str
    external_id: str
    listing_type: ListingSection | None
    index_url: str


def _text(value: str) -> str:
    return WS_RE.sub(" ", html_to_preserved_text(value)).strip()


def is_silent_listing_url(url: str) -> bool:
    return "/silent-listings" in urlparse(url).path.casefold()


def canonicalize_detail_url(href: str, *, base: str = BASE_URL) -> str | None:
    """Return an HTTPS, same-domain non-silent listing URL."""

    absolute = urljoin(base + "/", href)
    parsed = urlparse(absolute)
    if parsed.hostname not in DOMAINS or is_silent_listing_url(absolute):
        return None
    return urlunparse(("https", parsed.netloc, re.sub(r"/{2,}", "/", parsed.path), "", "", ""))


def external_id_from_url(url: str) -> str | None:
    """Extract stable listing identifier from the final slug token."""

    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    match = ID_FROM_SLUG_RE.search(slug)
    return match.group("id").upper() if match else None


def listing_type_from_url(url: str, context: str | None = None) -> ListingSection | None:
    haystack = f"{urlparse(url).path} {context or ''}".casefold()
    if "for-rent" in haystack or "for rent" in haystack or "rental" in haystack:
        return "rent"
    if "for-sale" in haystack or "for sale" in haystack or "sale" in haystack:
        return "sale"
    return None


def extract_detail_links(html: str, *, index_url: str) -> list[DiscoveredListing]:
    """Discover non-silent detail URLs without fetching them."""

    discovered: list[DiscoveredListing] = []
    seen: set[str] = set()
    for match in DETAIL_HREF_RE.finditer(html):
        url = canonicalize_detail_url(match.group("href"))
        external_id = external_id_from_url(url) if url else None
        if not url or not external_id or external_id in seen:
            continue
        seen.add(external_id)
        discovered.append(
            DiscoveredListing(url, external_id, listing_type_from_url(url), index_url)
        )
    return discovered


def _match_text(pattern: re.Pattern[str], html: str) -> str | None:
    match = pattern.search(html)
    return _text(match.group("body")) if match else None


def _extract_price(html: str) -> tuple[Decimal | None, str | None, str | None]:
    price_html = PRICE_RE.search(html)
    if not price_html:
        return None, None, None
    raw = _text(price_html.group("body"))
    # First displayed code is the original site price. Do not choose indicative
    # EUR/XCG conversion values that follow it.
    match = re.search(r"\b(USD|EUR|XCG|ANG|NAF)\s*([\d.,\s]+)", raw, re.I)
    if not match:
        return None, None, raw
    currency = match.group(1).upper()
    amount = parse_decimal_amount(f"{currency} {match.group(2).strip()}")
    return amount, currency, raw


def _extract_features(html: str) -> dict[str, str]:
    block = FEATURES_RE.search(html)
    if not block:
        return {}
    return {
        _text(row.group("label")).casefold(): _text(row.group("value"))
        for row in FEATURE_ROW_RE.finditer(block.group("body"))
        if _text(row.group("label")) and _text(row.group("value"))
    }


def _number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:[.,]\d+)?", value)
    return float(match.group(0).replace(",", ".")) if match else None


def _area_m2(value: str | None) -> Decimal | None:
    if not value or "m" not in value.casefold():
        return None
    amount = _number(value)
    return Decimal(str(amount)) if amount is not None else None


class KellerWilliamsCuracaoAdapter(DirectSourceAdapter):
    """Parser and bounded, sequential runner for kw-curacao.com."""

    source_key = SOURCE_KEY
    name = ADAPTER_NAME
    version = ADAPTER_VERSION
    domains = DOMAINS

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or Path("data/raw/keller_williams_curacao/cache")

    def parse_index_html(self, html: str, *, index_url: str) -> list[DiscoveredListing]:
        return extract_detail_links(html, index_url=index_url)

    def discover_listing_urls(
        self,
        *,
        cache_dir: Path,
        max_items: int = 5,
        honor_delay: bool = True,
    ) -> tuple[list[DiscoveredListing], list[str]]:
        """Fetch known first-page index sections sequentially.

        Pagination is deliberately not inferred: its structure needs additional
        fixture evidence. This remains a bounded discovery helper.
        """

        discovered: list[DiscoveredListing] = []
        errors: list[str] = []
        for index, index_url in enumerate(INDEX_URLS):
            if len(discovered) >= max_items:
                break
            robots = self.evaluate_robots(index_url)
            if robots.can_fetch is not True:
                errors.append(f"robots_disallow:{index_url}")
                continue
            if honor_delay and index:
                import time

                time.sleep(max(DEFAULT_REQUEST_DELAY_SECONDS, robots.crawl_delay_seconds or 0))
            try:
                fetched = fetch_url(
                    index_url, cache_dir=cache_dir, user_agent=USER_AGENT, use_cache=True
                )
            except FetchError as error:
                errors.append(f"fetch_failed:{index_url}:{error}")
                continue
            for item in self.parse_index_html(
                fetched.body.decode("utf-8", errors="replace"), index_url=index_url
            ):
                if len(discovered) >= max_items:
                    break
                if item.external_id not in {found.external_id for found in discovered}:
                    discovered.append(item)
        return discovered, errors

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
        if not self.supports(listing_url) or is_silent_listing_url(listing_url):
            raise ValueError("KW adapter rejects off-domain and /silent-listings URLs")

        warnings: list[str] = []
        external_id = external_id_from_url(listing_url)
        if not external_id:
            external_id = hashlib.sha256(listing_url.encode()).hexdigest()[:16]
            warnings.append("missing_listing_reference")
        title = _match_text(TITLE_RE, html) or _match_text(TITLE_TAG_RE, html)
        if title:
            title = re.sub(r"\s*-\s*Keller Williams Curacao\s*$", "", title, flags=re.I)
        else:
            warnings.append("missing_title")
        source_status = _match_text(STATUS_RE, html)
        if not source_status:
            warnings.append("missing_status")
        status_key = (source_status or "").casefold()
        lifecycle = (
            ListingLifecycleStatus.SOLD
            if "sold" in status_key
            else ListingLifecycleStatus.INACTIVE
            if "rented" in status_key or "inactive" in status_key
            else ListingLifecycleStatus.ACTIVE
            if "active" in status_key
            else ListingLifecycleStatus.UNKNOWN
        )
        location = _match_text(LOCATION_RE, html)
        type_context = _match_text(TYPE_RE, html)
        listing_type = listing_type_from_url(listing_url, type_context)
        if not listing_type:
            warnings.append("listing_type_unclear")
        amount, currency, price_raw = _extract_price(html)
        money = resolve_original_money(amount=amount, currency=currency, evidence=price_raw)
        if money is None:
            warnings.append("no_price_extracted")

        features = _extract_features(html)
        options = " ".join(_text(item.group("body")) for item in OPTION_RE.finditer(html))
        bedrooms = _number(features.get("bedrooms")) or _number(
            re.search(r"(\d+(?:[.,]\d+)?)\s*bedroom", options, re.I).group(1)
            if re.search(r"(\d+(?:[.,]\d+)?)\s*bedroom", options, re.I)
            else None
        )
        bathrooms = _number(features.get("full bathrooms"))
        half_baths = _number(features.get("half bathrooms"))
        if bathrooms is None:
            bathrooms = _number(
                re.search(r"(\d+(?:[.,]\d+)?)\s*bathroom", options, re.I).group(1)
                if re.search(r"(\d+(?:[.,]\d+)?)\s*bathroom", options, re.I)
                else None
            )
        if bathrooms is not None and half_baths:
            bathrooms += half_baths / 2
        if bathrooms is not None and bathrooms <= 0:
            bathrooms = None
            warnings.append("non_positive_bathrooms_dropped")
        floor_area = _area_m2(features.get("build up size"))
        if floor_area is not None and floor_area <= 0:
            floor_area = None
        if floor_area is None:
            warnings.append("missing_floor_area")
        description_match = DESCRIPTION_RE.search(html)
        description_html = description_match.group("body") if description_match else None
        description = _text(description_html) if description_html else None
        if not description:
            warnings.append("missing_description")
        images = tuple(dict.fromkeys(match.group("url") for match in IMAGE_RE.finditer(html)))
        if not images:
            warnings.append("missing_images")
        if not location:
            warnings.append("missing_neighbourhood")

        fields = [
            FieldProvenance("listing_reference", external_id, external_id, "url_slug"),
            FieldProvenance(
                "price",
                price_raw,
                {"amount": str(amount), "currency": currency} if amount else None,
                "listing_price",
            ),
            FieldProvenance(
                "realtor",
                "Keller Williams Curaçao",
                {"name": "Keller Williams Curaçao", "domain": "kw-curacao.com"},
                "source_site_attribution",
            ),
        ]
        if description:
            fields.append(
                FieldProvenance(
                    "source_description",
                    description[:500],
                    {"checksum": sha256_text(description), "length": len(description)},
                    "description_body",
                    "#description .wysiwyg",
                    description[:240],
                )
            )
        return AdapterListingSnapshot(
            source_key=SOURCE_KEY,
            external_id=external_id,
            source_url=listing_url,
            observed_at=observed_at or datetime.now(UTC),
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            raw_payload={
                "html_sha256": raw_sha256,
                "listing_type": listing_type,
                "image_urls": list(images),
                "realtor_name": "Keller Williams Curaçao",
                "realtor_domain": "www.kw-curacao.com",
                "crawl_delay_seconds": DEFAULT_REQUEST_DELAY_SECONDS,
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type=listing_type,
            source_status=source_status,
            lifecycle_hint=lifecycle,
            original_price=money,
            bedrooms=int(bedrooms) if bedrooms is not None else None,
            bathrooms=bathrooms,
            floor_area_m2=floor_area,
            neighbourhood_text=location,
            location_text=location,
            primary_image_url=images[0] if images else None,
            image_urls=images,
            description=description,
            source_description=description,
            source_description_html=description_html,
            source_description_checksum=sha256_text(description) if description else None,
            cleaned_listing_text=description,
            http_status=http_status,
            content_type=content_type,
            evidence_storage_path=evidence_storage_path(
                source_key=SOURCE_KEY, external_id=external_id, checksum=raw_sha256
            ),
            evidence_storage_bucket=RAW_EVIDENCE_BUCKET,
            structured_evidence={"features": features, "type_context": type_context},
            fields=tuple(fields),
            warnings=tuple(warnings),
        )

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
        """Fetch at most ``max_items`` sequentially, enforcing a 20-second delay."""

        started = datetime.now(UTC)
        discovery_errors: list[str] = []
        if discover:
            found, discovery_errors = self.discover_listing_urls(
                cache_dir=cache_dir, max_items=max_items, honor_delay=honor_delay
            )
            urls = [item.url for item in found]
        else:
            urls = [url for url in (listing_urls or []) if not is_silent_listing_url(url)][
                :max_items
            ]
        snapshots: list[AdapterListingSnapshot] = []
        errors = len(discovery_errors)
        for index, url in enumerate(urls):
            if not self.supports(url):
                errors += 1
                continue
            robots = self.evaluate_robots(url)
            if robots.can_fetch is not True:
                errors += 1
                continue
            if honor_delay and index:
                import time

                time.sleep(max(DEFAULT_REQUEST_DELAY_SECONDS, robots.crawl_delay_seconds or 0))
            try:
                fetched = fetch_url(url, cache_dir=cache_dir, user_agent=USER_AGENT, use_cache=True)
            except FetchError:
                errors += 1
                continue
            snap = self.parse_listing_html(
                fetched.body.decode("utf-8", errors="replace"),
                listing_url=url,
                raw_sha256=fetched.sha256,
                http_status=fetched.status,
                content_type=fetched.content_type or "text/html",
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
            snapshots.append(snap)
        # run_bounded is always an incomplete catalog scope (max_items / URL subset).
        # Only a future full-catalog mode may emit success + complete_catalog=true.
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
            excluded_no_price_count=sum(not snap.has_positive_price for snap in snapshots),
            warning_count=sum(len(snap.warnings) for snap in snapshots),
            error_count=errors,
            snapshot_checksum=hashlib.sha256(
                "|".join(s.external_id for s in snapshots).encode()
            ).hexdigest(),
            notes="Bounded sequential manual run; scheduling disabled; Crawl-delay 20 seconds",
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "bounded": True,
                "complete_catalog": False,
                "crawl_delay_seconds": DEFAULT_REQUEST_DELAY_SECONDS,
                "discover": discover,
                "discovery_errors": discovery_errors,
                "silent_listings_skipped": len(listing_urls or [])
                - len([u for u in (listing_urls or []) if not is_silent_listing_url(u)]),
            },
        ), snapshots
