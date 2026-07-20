"""Moret Real Estate (moretrealestate.com) WPEstate adapter.

Manual/unscheduled. Bilingual NL/EN duplicates: prefer canonical
``/properties/{slug}/`` over ``/en/...`` / ``/nl/...`` mirrors.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
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

SOURCE_KEY = "moret_real_estate"
ADAPTER_NAME = SOURCE_KEY
ADAPTER_VERSION = "0.1.1"
RAW_EVIDENCE_BUCKET = "listing-raw-evidence"
DOMAINS = frozenset({"moretrealestate.com", "www.moretrealestate.com"})
BASE_URL = "https://moretrealestate.com"
REALTOR_NAME = "Moret Real Estate"
REALTOR_DOMAIN = "www.moretrealestate.com"
DEFAULT_REQUEST_DELAY_SECONDS = 2.0
INDEX_URLS = (
    f"{BASE_URL}/properties/",
    f"{BASE_URL}/properties/page/2/",
    f"{BASE_URL}/en/properties/",
)

TITLE_RE = re.compile(r"<h1[^>]*>(?P<body>.*?)</h1>", re.I | re.S)
TITLE_TAG_RE = re.compile(r"<title>(?P<body>.*?)</title>", re.I | re.S)
PRICE_AREA_RE = re.compile(
    r'class=["\'][^"\']*\bprice_area\b[^"\']*["\'][^>]*>(?P<body>.*?)</span>\s*</span>'
    r'|class=["\'][^"\']*\bprice_area\b[^"\']*["\'][^>]*>(?P<body2>.*?)</',
    re.I | re.S,
)
PRICE_ANY_RE = re.compile(
    r"\b(?P<code>XCG|ANG|USD|EUR|NAF)\s*(?P<amount>[\d.]+(?:\.[\d]{3})*(?:,\d+)?)",
    re.I,
)
POST_ID_RE = re.compile(r'data-postid=["\'](?P<id>\d+)["\']', re.I)
DETAIL_HREF_RE = re.compile(
    r'href=["\'](?P<href>https?://(?:www\.)?moretrealestate\.com/properties/[^"\']+)["\']',
    re.I,
)
BED_RE = re.compile(
    r"(?:Slaapkamers|Bedrooms)\s*:</strong>\s*(?P<n>\d+)",
    re.I,
)
BATH_RE = re.compile(
    r"(?:Badkamers|Bathrooms)\s*:</strong>\s*(?P<n>\d+(?:[.,]\d+)?)",
    re.I,
)
AREA_RE = re.compile(
    r"(?:Woonoppervlakte|Living\s*area|Size)\s*:</strong>\s*(?P<n>[\d.,]+)\s*m",
    re.I,
)
DESC_RE = re.compile(
    r'class=["\'][^"\']*(?:wpestate_property_description|property_description)[^"\']*["\'][^>]*>'
    r"(?P<body>.*?)</div>",
    re.I | re.S,
)
# Gallery full-size links (prettyPhoto); href/rel order varies in WPEstate markup.
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
LOGO_NAME_RE = re.compile(r"(?:^|[-_/])logo(?:[-_.]|$)|favicon", re.I)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
VANAF_RE = re.compile(r"\bvanaf\b|\bfrom\b", re.I)


def _text(value: str) -> str:
    return WS_RE.sub(" ", html_to_preserved_text(value)).strip()


def _canonical_upload_url(url: str) -> str:
    """Strip WordPress resized suffixes (-835x540) toward the full upload URL."""
    parsed = urlparse(url)
    path = WP_SIZE_SUFFIX_RE.sub("", parsed.path)
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def _is_site_chrome_image(url: str) -> bool:
    filename = urlparse(url).path.rsplit("/", 1)[-1]
    return bool(LOGO_NAME_RE.search(filename))


def extract_listing_images(html: str) -> tuple[str, ...]:
    """Prefer prettyPhoto gallery hrefs; fall back to og:image. Skip logos."""
    ordered: list[str] = []
    seen: set[str] = set()

    def _add(raw: str | None) -> None:
        if not raw or _is_site_chrome_image(raw):
            return
        canonical = _canonical_upload_url(raw)
        if canonical in seen:
            return
        seen.add(canonical)
        ordered.append(canonical)

    for match in GALLERY_HREF_RE.finditer(html):
        _add(match.group("url") or match.group("url2"))

    if not ordered:
        for match in OG_IMAGE_RE.finditer(html):
            _add(match.group("url") or match.group("url2"))
            if ordered:
                break

    return tuple(ordered)


def canonicalize_detail_url(href: str, *, base: str = BASE_URL) -> str | None:
    absolute = urljoin(base + "/", href)
    parsed = urlparse(absolute)
    host = (parsed.hostname or "").lower()
    if host not in DOMAINS and host.removeprefix("www.") not in {
        d.removeprefix("www.") for d in DOMAINS
    }:
        return None
    path = re.sub(r"/{2,}", "/", parsed.path)
    # Drop bilingual prefix duplicates toward /properties/{slug}/
    path = re.sub(r"^/(?:en|nl)/properties/", "/properties/", path, flags=re.I)
    if not re.search(r"/properties/[^/]+/?$", path, re.I):
        return None
    if re.search(r"/properties/(?:page|feed)/", path, re.I):
        return None
    return urlunparse(("https", "moretrealestate.com", path.rstrip("/") + "/", "", "", ""))


def external_id_from_url(url: str, html: str | None = None) -> str:
    if html:
        post = POST_ID_RE.search(html)
        if post:
            return f"post-{post.group('id')}"
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    return slug.casefold()


def extract_detail_links(html: str, *, index_url: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in DETAIL_HREF_RE.finditer(html):
        url = canonicalize_detail_url(match.group("href"))
        if not url:
            continue
        ext = external_id_from_url(url)
        if ext in seen:
            continue
        seen.add(ext)
        found.append(url)
    return found


def _extract_price(html: str) -> tuple[Decimal | None, str | None, str | None, list[str]]:
    warnings: list[str] = []
    # Prefer price_area block text when present (includes nested "vanaf" labels).
    area = re.search(
        r'class=["\'][^"\']*\bprice_area\b[^"\']*["\'][^>]*>(?P<body>[\s\S]{0,400}?)</',
        html,
        re.I,
    )
    raw_block = _text(area.group("body")) if area else ""
    if area and VANAF_RE.search(area.group(0)):
        warnings.append("price_marked_from_vanaf")
    match = PRICE_ANY_RE.search(raw_block) if raw_block else None
    if match is None:
        match = PRICE_ANY_RE.search(html)
        if match and not raw_block:
            warnings.append("price_from_global_fallback")
        elif match and raw_block:
            # Nested labels often truncate price_area text before the amount.
            warnings.append("price_from_expanded_price_area_context")
    if not match:
        return None, None, raw_block or None, warnings + ["no_price_extracted"]
    currency = match.group("code").upper()
    if currency == "NAF":
        currency = "ANG"
    amount = parse_decimal_amount(f"{currency} {match.group('amount')}")
    return amount, currency, match.group(0), warnings


class MoretRealEstateAdapter(DirectSourceAdapter):
    """Deterministic WPEstate parser for Moret Real Estate."""

    source_key = SOURCE_KEY
    name = ADAPTER_NAME
    version = ADAPTER_VERSION
    domains = DOMAINS

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
        if not self.supports(listing_url):
            raise ValueError("Moret adapter rejects off-domain URLs")
        warnings: list[str] = []
        canonical = canonicalize_detail_url(listing_url) or listing_url
        external_id = external_id_from_url(canonical, html)
        title_match = TITLE_RE.search(html) or TITLE_TAG_RE.search(html)
        title = _text(title_match.group("body")) if title_match else None
        if title:
            title = re.sub(r"\s*\|\s*Moret Real Estate\s*$", "", title, flags=re.I)
            title = title.replace("&#8211;", "–")
        else:
            warnings.append("missing_title")

        amount, currency, price_raw, price_warnings = _extract_price(html)
        warnings.extend(price_warnings)
        money = resolve_original_money(amount=amount, currency=currency, evidence=price_raw)

        bed_m = BED_RE.search(html)
        bath_m = BATH_RE.search(html)
        area_m = AREA_RE.search(html)
        bedrooms = int(bed_m.group("n")) if bed_m else None
        bathrooms = float(bath_m.group("n").replace(",", ".")) if bath_m else None
        floor_area = None
        if area_m:
            floor_area = parse_decimal_amount(area_m.group("n").replace(".", "").replace(",", "."))
            if floor_area is None:
                try:
                    floor_area = Decimal(area_m.group("n").replace(",", "."))
                except Exception:
                    floor_area = None

        desc_m = DESC_RE.search(html)
        description = _text(desc_m.group("body")) if desc_m else None
        if not description:
            warnings.append("missing_description")
        images = extract_listing_images(html)
        if not images:
            warnings.append("missing_images")
        neighbourhood = None
        slug = urlparse(canonical).path.strip("/").split("/")[-1]
        if slug:
            neighbourhood = slug.split("-")[0].replace("_", " ").title()

        hay = f"{title or ''} {description or ''} {html[:5000]}".casefold()
        listing_type = "sale"
        rent_tokens = ("te huur", "for rent", "huurprijs", "per month", "per maand")
        if any(token in hay for token in rent_tokens):
            listing_type = "rent"
        elif amount is not None and amount < Decimal("50000"):
            listing_type = "rent"
            warnings.append("listing_type_inferred_from_low_price")

        fields = [
            FieldProvenance("listing_reference", external_id, external_id, "post_id_or_slug"),
            FieldProvenance(
                "price",
                price_raw,
                {"amount": str(amount), "currency": currency} if amount else None,
                "price_area",
            ),
            FieldProvenance(
                "realtor",
                REALTOR_NAME,
                {"name": REALTOR_NAME, "domain": REALTOR_DOMAIN},
                "source_site_attribution",
            ),
        ]
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
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type=listing_type,
            source_status="active",
            lifecycle_hint=ListingLifecycleStatus.ACTIVE,
            original_price=money,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            floor_area_m2=floor_area if floor_area and floor_area > 0 else None,
            neighbourhood_text=neighbourhood,
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
            fields=tuple(fields),
            warnings=tuple(warnings),
        )

    def discover_listing_urls(
        self,
        *,
        cache_dir: Path,
        max_items: int = 5,
        honor_delay: bool = True,
    ) -> tuple[list[str], list[str]]:
        discovered: list[str] = []
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
            for url in extract_detail_links(
                fetched.body.decode("utf-8", errors="replace"), index_url=index_url
            ):
                if url not in discovered:
                    discovered.append(url)
                if len(discovered) >= max_items:
                    break
        return discovered, errors

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
        discovery_errors: list[str] = []
        if discover:
            urls, discovery_errors = self.discover_listing_urls(
                cache_dir=cache_dir, max_items=max_items, honor_delay=honor_delay
            )
        else:
            urls = list(listing_urls or [])[:max_items]
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
            },
        ), snapshots
