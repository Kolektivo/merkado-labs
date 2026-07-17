"""RE/MAX Curaçao (realestate-curacao.com) direct listing adapter."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urljoin, urlparse, urlunparse

from merkado_labs.normalization.currency import parse_decimal_amount, resolve_original_money
from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    FieldProvenance,
    ListingLifecycleStatus,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.evidence import (
    decode_html_entities,
    evidence_storage_path,
    extract_json_ld_blocks,
    html_to_preserved_text,
    sha256_text,
    strip_chrome_hints,
)
from merkado_labs.scrapers.http_cache import FetchError, fetch_url
from merkado_labs.scrapers.robots import USER_AGENT, sleep_for_delay

SOURCE_KEY = "remax_curacao"
ADAPTER_NAME = "remax_curacao"
ADAPTER_VERSION = "0.4.0"
RAW_EVIDENCE_BUCKET = "listing-raw-evidence"
DOMAINS = frozenset({"www.realestate-curacao.com", "realestate-curacao.com"})
BASE_URL = "https://www.realestate-curacao.com"
REALTOR_NAME = "RE/MAX BonBini Curaçao"
REALTOR_DOMAIN = "www.realestate-curacao.com"

INDEX_SALE = f"{BASE_URL}/en/homes/homes-for-sale/"
INDEX_RENT = f"{BASE_URL}/en/homes/homes-for-rent/"
SALE_PAGINATE = f"{BASE_URL}/en/homes/homes-for-sale/paginate-{{page}}/"
RENT_PAGINATE = f"{BASE_URL}/en/homes/homes-for-rent/paginate-{{page}}/"

# Recommended delay when robots does not publish Crawl-delay.
DEFAULT_REQUEST_DELAY_SECONDS = 1.5

LABEL_ROW = re.compile(
    r"<td[^>]*>\s*(?P<label>[^<:]{2,60}):\s*</td>\s*<td[^>]*>(?P<value>.*?)</td>",
    re.IGNORECASE | re.DOTALL,
)
REF_FROM_URL = re.compile(r"/(?P<ref>(?:hs|hr|lo|co)\d+)/", re.IGNORECASE)
DETAIL_HREF = re.compile(
    r'href=["\'](?P<href>[^"\']*/(?:hs|hr|lo|co)\d+/[^"\']*)["\']',
    re.IGNORECASE,
)
ITEMPROP_PRICE = re.compile(
    r'itemprop=["\']price["\'][^>]*>(?P<body>.*?)</',
    re.IGNORECASE | re.DOTALL,
)
ITEMPROP_NAME = re.compile(
    r'itemprop=["\']name["\'][^>]*>(?P<body>.*?)</',
    re.IGNORECASE | re.DOTALL,
)
AREA_RE = re.compile(
    r'<p[^>]*class=["\'][^"\']*area[^"\']*["\'][^>]*>(?P<body>.*?)</p>',
    re.IGNORECASE | re.DOTALL,
)
TITLE_RE = re.compile(r"<title>(?P<title>.*?)</title>", re.IGNORECASE | re.DOTALL)
META_DESC_RE = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](?P<body>[^"\']+)["\']',
    re.IGNORECASE,
)
DESCRIPTION_TEASER_RE = re.compile(
    r'<p[^>]*class=["\'][^"\']*\bdescription-text\b[^"\']*["\'][^>]*>(?P<body>.*?)</p>',
    re.IGNORECASE | re.DOTALL,
)
DESCRIPTION_BLOCK_RE = re.compile(
    r'<div[^>]+id=["\']description["\'][^>]*>(?P<body>.*?)</div>',
    re.IGNORECASE | re.DOTALL,
)
RELATED_BLOCK_RE = re.compile(
    r'<(?:div|section)[^>]*(?:related|similar|also.?like|other.?propert)[^>]*>.*?</(?:div|section)>',
    re.IGNORECASE | re.DOTALL,
)
AGENT_BLOCK_RE = re.compile(
    r'<div[^>]+id=["\']detail_agentlist["\'][^>]*>.*?</div>\s*</div>',
    re.IGNORECASE | re.DOTALL,
)
LATLNG_RE = re.compile(
    r'(?:lat(?:itude)?|lng|lon(?:gitude)?)\s*[:=]\s*["\']?(?P<value>-?\d+(?:\.\d+)?)',
    re.IGNORECASE,
)
IMAGE_RE = re.compile(
    r'(?:src|href|data-original|data-thumb)=["\'](?P<src>//cdn\.remax-abc\.com/img/[^"\']+)["\']',
    re.IGNORECASE,
)
UNDER_CONTRACT_RE = re.compile(
    r'class=["\'][^"\']*detail_image_message[^"\']*["\'][^>]*>\s*Under contract',
    re.IGNORECASE,
)
SOLD_CLASS_RE = re.compile(r'class=["\'][^"\']*sold(?:price)?[^"\']*["\']', re.I)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")

LABEL_TO_FIELD: dict[str, str] = {
    "bathrooms": "bathrooms",
    "bedrooms": "bedrooms",
    "living space": "floor_area",
    "lot size": "lot_area",
    "furnished": "furnished",
    "pool": "has_pool",
    "gated resort": "gated_resort",
    "pets allowed": "pets_allowed",
    "sea view": "sea_view",
    "available": "availability_status",
    "project": "project_name",
    "year built": "year_built",
    "price": "price_label",
}

ListingSection = Literal["sale", "rent"]


@dataclass(frozen=True)
class DiscoveredListing:
    """One listing URL discovered from an index page."""

    url: str
    external_id: str
    listing_type: ListingSection
    source_status_hint: str | None
    index_url: str


def _clean_html_text(value: str) -> str:
    text = TAG_RE.sub(" ", value)
    text = decode_html_entities(text)
    text = text.replace("€", "EUR ")
    return WS_RE.sub(" ", text).strip()


def _split_description_and_neighbourhood(html_fragment: str) -> tuple[str, str | None]:
    """Separate property copy from the trailing neighbourhood marketing blurb."""

    heading = re.search(r"<h[34][^>]*>.*?</h[34]>", html_fragment, re.I | re.DOTALL)
    if not heading:
        return html_fragment, None
    property_html = html_fragment[: heading.start()]
    neighbourhood_html = html_fragment[heading.start() :]
    return property_html, neighbourhood_html


def extract_source_description(html: str) -> tuple[str | None, str | None, dict[str, Any]]:
    """Extract the full RE/MAX property description (not the SEO meta blurb).

    Root cause of short descriptions in v0.3.x: only ``meta[name=description]``
    was read. Live pages store the full copy in ``p.description-text`` plus
    ``#description``.
    """

    sections: dict[str, Any] = {
        "teaser_present": False,
        "body_present": False,
        "meta_fallback": False,
        "neighbourhood_blurb_present": False,
    }
    parts_html: list[str] = []
    neighbourhood_text: str | None = None

    teaser = DESCRIPTION_TEASER_RE.search(html)
    if teaser:
        sections["teaser_present"] = True
        parts_html.append(teaser.group("body"))

    body = DESCRIPTION_BLOCK_RE.search(html)
    if body:
        sections["body_present"] = True
        property_html, neighbourhood_html = _split_description_and_neighbourhood(body.group("body"))
        if property_html.strip():
            parts_html.append(property_html)
        if neighbourhood_html:
            neighbourhood_text = html_to_preserved_text(neighbourhood_html)
            if neighbourhood_text:
                sections["neighbourhood_blurb_present"] = True
                sections["neighbourhood_blurb"] = neighbourhood_text

    source_html = "\n".join(parts_html).strip() or None
    if source_html is None:
        meta = META_DESC_RE.search(html)
        if meta:
            sections["meta_fallback"] = True
            source_html = meta.group("body")

    if not source_html:
        return None, None, sections

    text = strip_chrome_hints(html_to_preserved_text(source_html))
    if not text:
        return None, source_html, sections
    return text, source_html, sections


def extract_cleaned_listing_text(html: str, *, description: str | None) -> str | None:
    """Build queryable cleaned listing text excluding chrome and related cards."""

    working = RELATED_BLOCK_RE.sub("", html)
    working = AGENT_BLOCK_RE.sub("", working)
    # Keep property facts table + description region when possible.
    chunks: list[str] = []
    if description:
        chunks.append(description)
    property_table = re.search(
        r'<table[^>]+id=["\']propertytable["\'][^>]*>(?P<body>.*?)</table>',
        working,
        re.I | re.DOTALL,
    )
    if property_table:
        table_text = html_to_preserved_text(property_table.group("body"))
        if table_text:
            chunks.append(table_text)
    area = extract_area_text(working)
    if area:
        chunks.append(f"Area: {area}")
    combined = strip_chrome_hints("\n\n".join(chunks))
    return combined or None


def extract_coordinates(html: str) -> tuple[float | None, float | None, list[str]]:
    """Return explicit coordinates only when both lat and lng appear."""

    warnings: list[str] = []
    values: dict[str, float] = {}
    for match in LATLNG_RE.finditer(html):
        token = match.group(0).casefold()
        try:
            value = float(match.group("value"))
        except ValueError:
            continue
        if "lat" in token and "lng" not in token and "lon" not in token:
            values.setdefault("lat", value)
        elif "lng" in token or "lon" in token:
            values.setdefault("lng", value)
    if "lat" in values and "lng" in values:
        return values["lat"], values["lng"], warnings
    if "latitude" not in html.casefold() and "latlng" not in html.casefold():
        warnings.append("coordinates_not_present_in_html")
    else:
        warnings.append("coordinates_incomplete_in_html")
    return None, None, warnings


def parse_number(raw: str) -> int | float | None:
    cleaned = raw.replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    token = match.group(0)
    if "." in token:
        return float(token)
    return int(token)


def parse_area(raw: str) -> tuple[float | int | None, str | None]:
    text = _clean_html_text(raw)
    lowered = text.lower()
    unit = None
    if "sq ft" in lowered or "sqft" in lowered or "ft²" in lowered:
        unit = "sq_ft"
    elif "m²" in lowered or "m2" in lowered or "sq m" in lowered:
        unit = "m2"
    value = parse_number(text.replace(",", ""))
    return value, unit


def parse_yes_no(raw: str) -> bool | str:
    text = _clean_html_text(raw).casefold()
    if text in {"yes", "y", "true"}:
        return True
    if text in {"no", "n", "false"}:
        return False
    return _clean_html_text(raw)


def area_to_m2(value: float | int, unit: str | None) -> float | None:
    if unit == "m2":
        return float(value)
    if unit == "sq_ft":
        return round(float(value) * 0.09290304, 3)
    return None


def canonicalize_detail_url(href: str, *, base: str = BASE_URL) -> str | None:
    """Normalize double-slash paths and force https absolute URLs."""

    absolute = urljoin(base if base.endswith("/") else base + "/", href)
    parsed = urlparse(absolute)
    if parsed.scheme != "https" or parsed.hostname not in DOMAINS:
        # sitemap may use http
        if parsed.hostname not in DOMAINS:
            return None
        parsed = parsed._replace(scheme="https")
    path = re.sub(r"/{2,}", "/", parsed.path)
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def external_id_from_url(url: str) -> str | None:
    match = REF_FROM_URL.search(url)
    return match.group("ref").lower() if match else None


def listing_type_from_url(url: str) -> ListingSection | None:
    path = urlparse(url).path.lower()
    if "/homes-for-rent/" in path or re.search(r"/hr\d+/", path):
        return "rent"
    if "/homes-for-sale/" in path or re.search(r"/hs\d+/", path):
        return "sale"
    return None


def status_hint_from_url(url: str) -> str | None:
    path = urlparse(url).path.lower()
    if "/sold/" in path:
        return "sold"
    if "/rented/" in path:
        return "rented"
    return None


def extract_detail_links(html: str, *, index_url: str) -> list[DiscoveredListing]:
    """Parse listing detail links from one index HTML page."""

    found: list[DiscoveredListing] = []
    seen: set[str] = set()
    for match in DETAIL_HREF.finditer(html):
        url = canonicalize_detail_url(match.group("href"))
        if not url:
            continue
        external_id = external_id_from_url(url)
        listing_type = listing_type_from_url(url)
        if not external_id or listing_type is None:
            continue
        if external_id in seen:
            continue
        seen.add(external_id)
        found.append(
            DiscoveredListing(
                url=url,
                external_id=external_id,
                listing_type=listing_type,
                source_status_hint=status_hint_from_url(url),
                index_url=index_url,
            )
        )
    return found


def extract_labelled_rows(html: str) -> list[FieldProvenance]:
    fields: list[FieldProvenance] = []
    seen: set[str] = set()
    for match in LABEL_ROW.finditer(html):
        label = _clean_html_text(match.group("label"))
        raw_value = _clean_html_text(match.group("value"))
        if not label or not raw_value:
            continue
        field_name = LABEL_TO_FIELD.get(label.casefold())
        if not field_name or field_name in seen:
            continue
        seen.add(field_name)
        selector = f"td:contains('{label}:') + td"
        snippet = f"{label}: {raw_value}"[:240]

        if field_name in {"bathrooms", "bedrooms", "year_built"}:
            normalized: Any = parse_number(raw_value)
            if normalized is None:
                continue
        elif field_name in {"floor_area", "lot_area"}:
            value, unit = parse_area(raw_value)
            if value is None:
                continue
            normalized = {"value": value, "unit": unit, "raw": raw_value}
        elif field_name in {"furnished", "has_pool", "gated_resort", "sea_view", "pets_allowed"}:
            normalized = parse_yes_no(raw_value)
        else:
            normalized = raw_value

        fields.append(
            FieldProvenance(
                field_name=field_name,
                raw_value=raw_value,
                normalized_value=normalized,
                extraction_method="labelled_html",
                evidence_selector=selector,
                evidence_snippet=snippet,
            )
        )
    return fields


def extract_listing_reference(url: str, html: str) -> FieldProvenance | None:
    match = REF_FROM_URL.search(url)
    if not match:
        html_match = re.search(r"\b((?:hs|hr|lo|co)\d+)\b", html, re.I)
        if not html_match:
            return None
        ref = html_match.group(1).lower()
        return FieldProvenance(
            field_name="listing_reference",
            raw_value=ref,
            normalized_value=ref,
            extraction_method="labelled_html",
            evidence_selector="body text reference token",
            evidence_snippet=ref,
        )
    ref = match.group("ref").lower()
    return FieldProvenance(
        field_name="listing_reference",
        raw_value=ref,
        normalized_value=ref,
        extraction_method="url_path",
        evidence_selector=r"url path /(hs|hr|lo|co)\d+/",
        evidence_snippet=ref,
    )


def extract_price(html: str) -> FieldProvenance | None:
    match = ITEMPROP_PRICE.search(html)
    if not match:
        return None
    raw = _clean_html_text(match.group("body"))
    currency = None
    lowered = raw.casefold()
    body = match.group("body")
    if "eur" in lowered or "€" in body or "&euro;" in body.lower():
        currency = "EUR"
    elif "usd" in lowered or "$" in raw:
        currency = "USD"
    elif "xcg" in lowered or "ang" in lowered or "naf" in lowered:
        currency = "XCG" if "xcg" in lowered else "ANG"
    # Strip period suffixes and leading "From" so amounts like
    # "€ 2.709 / mo." and "From € 1.379 / mo." parse cleanly.
    amount_text = re.sub(
        r"(?i)^\s*from\s+",
        "",
        raw,
    )
    amount_text = re.sub(
        r"(?i)\s*/?\s*(mo\.?|month|week|wk\.?|year|yr\.?|day|night|p\.?\s*m\.?)\s*$",
        "",
        amount_text,
    ).strip()
    amount = parse_decimal_amount(amount_text)
    if amount is None or amount <= 0:
        return None
    return FieldProvenance(
        field_name="price",
        raw_value=raw,
        normalized_value={"amount": str(amount), "currency": currency},
        extraction_method="microdata",
        evidence_selector="[itemprop=price]",
        evidence_snippet=raw[:240],
    )


def extract_images(html: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for match in IMAGE_RE.finditer(html):
        src = match.group("src")
        if src.startswith("//"):
            src = "https:" + src
        if src in seen:
            continue
        seen.add(src)
        urls.append(src)
    return urls


def extract_area_text(html: str) -> str | None:
    match = AREA_RE.search(html)
    if not match:
        return None
    text = _clean_html_text(match.group("body"))
    return text or None


def detect_sold(html: str, url: str) -> bool:
    path = urlparse(url).path.lower()
    # Rent pages reuse the soldprice CSS class for rented listings.
    if "/homes-for-rent/" in path or re.search(r"/hr\d+/", path):
        return "/sold/" in path
    if "/sold/" in path:
        return True
    if SOLD_CLASS_RE.search(html):
        body_sold = re.search(
            r'itemprop=["\']price["\'][^>]*class=["\'][^"\']*sold',
            html,
            re.I,
        )
        if body_sold:
            return True
    return False


def detect_rented(html: str, url: str) -> bool:
    path = urlparse(url).path.lower()
    if "/rented/" in path:
        return True
    if "/homes-for-rent/" in path or re.search(r"/hr\d+/", path):
        # On this site, rented listings reuse soldprice on the price node itself.
        if re.search(
            r'itemprop=["\']price["\'][^>]*class=["\'][^"\']*sold',
            html,
            re.I,
        ):
            return True
        if re.search(
            r'class=["\'][^"\']*detail_image_message[^"\']*["\'][^>]*>\s*rented\b',
            html,
            re.I,
        ):
            return True
    return False


def detect_price_period(
    html: str,
    *,
    listing_type: str | None,
    price_evidence: str | None = None,
) -> tuple[str | None, list[str]]:
    """Detect rental payment period when explicitly present.

    Returns ``(period, warnings)``. Period values: month, week, year, day.
    """
    warnings: list[str] = []
    if listing_type != "rent":
        return None, warnings

    haystack = f"{price_evidence or ''}\n{html}"
    patterns: list[tuple[str, re.Pattern[str]]] = [
        (
            "month",
            re.compile(
                r"(?:per\s*month|/?\s*mo\.?\b|/?\s*month|monthly|p\.?\s*m\.?)\b",
                re.I,
            ),
        ),
        ("week", re.compile(r"(?:per\s*week|/?\s*wk\.?\b|/?\s*week|weekly)\b", re.I)),
        (
            "year",
            re.compile(r"(?:per\s*year|/?\s*yr\.?\b|/?\s*year|yearly|annually)\b", re.I),
        ),
        ("day", re.compile(r"(?:per\s*day|/?\s*day|daily|per\s*night)\b", re.I)),
    ]
    for period, pattern in patterns:
        if pattern.search(haystack):
            return period, warnings

    warnings.append("rental_period_unclear")
    return None, warnings


def infer_listing_type(url: str) -> str | None:
    return listing_type_from_url(url)


def infer_property_type(title: str | None, listing_type: str | None) -> str | None:
    if not title:
        return None
    lowered = title.casefold()
    for token, value in (
        ("apartment", "apartment"),
        ("villa", "villa"),
        ("bungalow", "bungalow"),
        ("lot", "lot"),
        ("land", "land"),
        ("commercial", "commercial"),
        ("office", "commercial"),
        ("home", "house"),
        ("house", "house"),
    ):
        if token in lowered:
            return value
    return "house" if listing_type == "sale" else None


class RemaxCuracaoAdapter(DirectSourceAdapter):
    """Direct adapter for RE/MAX BonBini index discovery + detail parsing."""

    source_key = SOURCE_KEY
    name = ADAPTER_NAME
    version = ADAPTER_VERSION
    domains = DOMAINS

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or Path("data/raw/remax_curacao/cache")

    def parse_index_html(self, html: str, *, index_url: str) -> list[DiscoveredListing]:
        return extract_detail_links(html, index_url=index_url)

    def discover_listing_urls(
        self,
        *,
        cache_dir: Path,
        sections: Sequence[ListingSection] = ("sale", "rent"),
        max_pages: int | None = None,
        max_listings: int | None = None,
        use_cache: bool = True,
        honor_delay: bool = True,
    ) -> tuple[list[DiscoveredListing], dict[str, Any]]:
        """Discover listing URLs from paginated sale/rent indexes.

        A bounded discovery (max_pages/max_listings) is always incomplete.
        """

        discovered: list[DiscoveredListing] = []
        seen_ids: set[str] = set()
        index_evidence: list[dict[str, Any]] = []
        pages_fetched = 0
        truncated = False

        templates: list[tuple[ListingSection, str, str]] = []
        if "sale" in sections:
            templates.append(("sale", INDEX_SALE, SALE_PAGINATE))
        if "rent" in sections:
            templates.append(("rent", INDEX_RENT, RENT_PAGINATE))

        for section, first_url, page_template in templates:
            page = 1
            while True:
                if max_pages is not None and pages_fetched >= max_pages:
                    truncated = True
                    break
                if max_listings is not None and len(discovered) >= max_listings:
                    truncated = True
                    break

                url = first_url if page == 1 else page_template.format(page=page)
                robots = self.evaluate_robots(url)
                if robots.can_fetch is not True:
                    index_evidence.append(
                        {"url": url, "error": "robots_disallow", "section": section}
                    )
                    break
                if honor_delay:
                    sleep_for_delay(robots)
                try:
                    fetched = fetch_url(
                        url,
                        cache_dir=cache_dir,
                        user_agent=USER_AGENT,
                        use_cache=use_cache,
                    )
                except FetchError as error:
                    index_evidence.append(
                        {"url": url, "error": str(error), "section": section, "page": page}
                    )
                    break

                html = fetched.body.decode("utf-8", errors="replace")
                page_items = self.parse_index_html(html, index_url=url)
                pages_fetched += 1
                new_items = [item for item in page_items if item.external_id not in seen_ids]
                index_evidence.append(
                    {
                        "url": url,
                        "section": section,
                        "page": page,
                        "sha256": fetched.sha256,
                        "discovered_on_page": len(page_items),
                        "new_on_page": len(new_items),
                    }
                )
                if not page_items:
                    break
                for item in new_items:
                    seen_ids.add(item.external_id)
                    discovered.append(item)
                    if max_listings is not None and len(discovered) >= max_listings:
                        truncated = True
                        break
                if truncated:
                    break
                # Page 1 uses the base index; subsequent use paginate-N.
                # Stop when a page returns fewer than a full page and page>1,
                # or when page>1 yields zero new IDs.
                if page > 1 and len(new_items) == 0:
                    break
                page += 1
                if page > 50:
                    truncated = True
                    break

        meta = {
            "pages_fetched": pages_fetched,
            "truncated": truncated,
            "sections": list(sections),
            "max_pages": max_pages,
            "max_listings": max_listings,
            "index_evidence": index_evidence,
            "complete_catalog": not truncated and pages_fetched > 0,
        }
        return discovered, meta

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
        observed = observed_at or datetime.now(UTC)
        warnings: list[str] = []
        parser_errors: list[str] = []
        fields = extract_labelled_rows(html)
        by_name = {field.field_name: field for field in fields}

        ref = extract_listing_reference(listing_url, html)
        if ref is not None:
            fields.append(ref)
            by_name[ref.field_name] = ref

        price_field = extract_price(html)
        if price_field is not None:
            fields.append(price_field)
            by_name["price"] = price_field

        external_id = None
        if ref is not None:
            external_id = str(ref.normalized_value)
        if not external_id:
            warnings.append("missing_listing_reference")
            parser_errors.append("missing_listing_reference")
            external_id = hashlib.sha256(listing_url.encode("utf-8")).hexdigest()[:16]

        name_match = ITEMPROP_NAME.search(html)
        title_match = TITLE_RE.search(html)
        if name_match:
            title = _clean_html_text(name_match.group("body"))
        elif title_match:
            title = _clean_html_text(title_match.group("title"))
        else:
            title = None

        money = None
        if price_field is not None and isinstance(price_field.normalized_value, dict):
            amount = parse_decimal_amount(price_field.normalized_value.get("amount"))
            currency = price_field.normalized_value.get("currency")
            money = resolve_original_money(
                amount=amount,
                currency=currency,
                evidence=price_field.evidence_snippet,
            )
            if money is None:
                warnings.append("price_present_but_unusable")
        else:
            warnings.append("no_price_extracted")

        floor_area_m2 = None
        lot_area_value = None
        lot_area_unit = None
        if "floor_area" in by_name and isinstance(by_name["floor_area"].normalized_value, dict):
            area = by_name["floor_area"].normalized_value
            converted = area_to_m2(area.get("value"), area.get("unit"))
            if converted is not None:
                floor_area_m2 = Decimal(str(converted))
        if "lot_area" in by_name and isinstance(by_name["lot_area"].normalized_value, dict):
            area = by_name["lot_area"].normalized_value
            lot_area_value = Decimal(str(area["value"])) if area.get("value") is not None else None
            lot_area_unit = area.get("unit")

        sold = detect_sold(html, listing_url)
        rented = detect_rented(html, listing_url)
        under_contract = bool(UNDER_CONTRACT_RE.search(html))
        if sold:
            lifecycle_hint = ListingLifecycleStatus.SOLD
            source_status = "sold"
        elif rented:
            lifecycle_hint = ListingLifecycleStatus.INACTIVE
            source_status = "rented"
        elif under_contract:
            lifecycle_hint = ListingLifecycleStatus.ACTIVE
            source_status = "under_contract"
            warnings.append("under_contract_label")
        else:
            lifecycle_hint = ListingLifecycleStatus.ACTIVE
            source_status = (
                str(by_name["availability_status"].normalized_value)
                if "availability_status" in by_name
                else "available"
            )

        bedrooms = None
        bathrooms = None
        if "bedrooms" in by_name:
            bedrooms = int(by_name["bedrooms"].normalized_value)
        if "bathrooms" in by_name:
            bathrooms = float(by_name["bathrooms"].normalized_value)

        images = extract_images(html)
        if images:
            fields.append(
                FieldProvenance(
                    field_name="images",
                    raw_value=str(len(images)),
                    normalized_value=images,
                    extraction_method="cdn_image_urls",
                    evidence_selector="cdn.remax-abc.com/img",
                    evidence_snippet=images[0][:240],
                )
            )
        area_text = extract_area_text(html)
        if area_text:
            fields.append(
                FieldProvenance(
                    field_name="area_text",
                    raw_value=area_text,
                    normalized_value=area_text,
                    extraction_method="css_class",
                    evidence_selector="p.area",
                    evidence_snippet=area_text[:240],
                )
            )

        meta_desc = META_DESC_RE.search(html)
        meta_description = (
            _clean_html_text(meta_desc.group("body")) if meta_desc else None
        )
        source_description, source_description_html, description_sections = (
            extract_source_description(html)
        )
        if source_description is None and meta_description:
            source_description = meta_description
            description_sections["meta_fallback"] = True
        source_description_checksum = (
            sha256_text(source_description) if source_description else None
        )
        cleaned_listing_text = extract_cleaned_listing_text(
            html, description=source_description
        )

        amenities: list[dict[str, Any]] = []
        for key in ("furnished", "has_pool", "gated_resort", "sea_view", "pets_allowed"):
            if key in by_name:
                amenities.append(
                    {
                        "key": key,
                        "value": by_name[key].normalized_value,
                        "source": "labelled_html",
                    }
                )

        listing_type = infer_listing_type(listing_url)
        price_evidence = money.evidence if money is not None else None
        price_period, period_warnings = detect_price_period(
            html,
            listing_type=listing_type,
            price_evidence=price_evidence,
        )
        warnings.extend(period_warnings)
        if price_period:
            amenities.append(
                {
                    "key": "price_period",
                    "value": price_period,
                    "source": "labelled_html_or_price_evidence",
                }
            )
            fields.append(
                FieldProvenance(
                    field_name="price_period",
                    raw_value=price_period,
                    normalized_value=price_period,
                    extraction_method="regex_on_price_or_html",
                    evidence_selector="price text / listing body",
                    evidence_snippet=(price_evidence or "")[:240],
                )
            )
        elif listing_type == "rent":
            amenities.append(
                {
                    "key": "price_period",
                    "value": None,
                    "source": "missing",
                    "note": "rental_period_unclear",
                }
            )

        fields.append(
            FieldProvenance(
                field_name="realtor",
                raw_value=REALTOR_NAME,
                normalized_value={
                    "name": REALTOR_NAME,
                    "domain": REALTOR_DOMAIN,
                    "url": listing_url,
                },
                extraction_method="source_site_attribution",
                evidence_selector="site identity",
                evidence_snippet=REALTOR_NAME,
            )
        )

        if source_description:
            fields.append(
                FieldProvenance(
                    field_name="source_description",
                    raw_value=source_description[:500],
                    normalized_value={
                        "checksum": source_description_checksum,
                        "length": len(source_description),
                        "sections": description_sections,
                    },
                    extraction_method=(
                        "description_body"
                        if description_sections.get("body_present")
                        or description_sections.get("teaser_present")
                        else "meta_description"
                    ),
                    evidence_selector="p.description-text + #description",
                    evidence_snippet=source_description[:240],
                )
            )

        latitude, longitude, coord_warnings = extract_coordinates(html)
        warnings.extend(coord_warnings)

        json_ld = extract_json_ld_blocks(html)
        storage_path = evidence_storage_path(
            source_key=SOURCE_KEY,
            external_id=external_id,
            checksum=raw_sha256,
            extension="html",
        )
        structured_evidence = {
            "json_ld": json_ld,
            "description_sections": description_sections,
            "meta_description": meta_description,
            "neighbourhood_blurb": description_sections.get("neighbourhood_blurb"),
            "labelled_fields": {
                name: {
                    "raw": prov.raw_value,
                    "normalized": prov.normalized_value,
                    "method": prov.extraction_method,
                    "selector": prov.evidence_selector,
                }
                for name, prov in by_name.items()
            },
            "status_signals": {
                "sold": sold,
                "rented": rented,
                "under_contract": under_contract,
                "url_status_hint": status_hint_from_url(listing_url),
            },
        }

        return AdapterListingSnapshot(
            source_key=SOURCE_KEY,
            external_id=external_id,
            source_url=listing_url,
            observed_at=observed,
            adapter_name=ADAPTER_NAME,
            adapter_version=ADAPTER_VERSION,
            raw_payload={
                "html_sha256": raw_sha256,
                "url": listing_url,
                "realtor_name": REALTOR_NAME,
                "realtor_domain": REALTOR_DOMAIN,
                "image_urls": images,
                "source_neighbourhood_text": area_text,
                "price_period": price_period,
                "listing_type": listing_type,
                "http_status": http_status,
                "content_type": content_type,
                "evidence_storage_bucket": RAW_EVIDENCE_BUCKET,
                "evidence_storage_path": storage_path,
                "source_description_checksum": source_description_checksum,
                "source_description_length": (
                    len(source_description) if source_description else 0
                ),
                "structured_evidence": structured_evidence,
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type=listing_type,
            property_type=infer_property_type(title, listing_type),
            source_status=source_status,
            lifecycle_hint=lifecycle_hint,
            original_price=money,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            floor_area_m2=floor_area_m2,
            lot_area_value=lot_area_value,
            lot_area_unit=lot_area_unit,
            latitude=latitude,
            longitude=longitude,
            neighbourhood_text=area_text,
            location_text=area_text,
            primary_image_url=images[0] if images else None,
            image_urls=tuple(images),
            description=source_description,
            source_description=source_description,
            source_description_html=source_description_html,
            source_description_checksum=source_description_checksum,
            cleaned_listing_text=cleaned_listing_text,
            http_status=http_status,
            content_type=content_type,
            evidence_storage_path=storage_path,
            evidence_storage_bucket=RAW_EVIDENCE_BUCKET,
            structured_evidence=structured_evidence,
            amenities=tuple(amenities),
            fields=tuple(fields),
            warnings=tuple(warnings),
            parser_errors=tuple(parser_errors),
        )

    def run_bounded(
        self,
        *,
        listing_urls: Sequence[str] | None = None,
        cache_dir: Path,
        dry_run: bool = True,
        max_items: int | None = 5,
        max_pages: int | None = None,
        sections: Sequence[ListingSection] = ("sale", "rent"),
        use_cache: bool = True,
        honor_delay: bool = True,
        discover: bool = False,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot]]:
        started = datetime.now(UTC)
        snapshots: list[AdapterListingSnapshot] = []
        warnings = 0
        errors = 0
        excluded_no_price = 0
        discovery_meta: dict[str, Any] = {}

        if discover:
            discovered, discovery_meta = self.discover_listing_urls(
                cache_dir=cache_dir,
                sections=sections,
                max_pages=max_pages,
                max_listings=max_items,
                use_cache=use_cache,
                honor_delay=honor_delay,
            )
            urls = [item.url for item in discovered]
        elif listing_urls:
            urls = [canonicalize_detail_url(url) or url for url in listing_urls]
        else:
            urls = []
            discovery_meta = {"truncated": False, "complete_catalog": False, "pages_fetched": 0}

        if max_items is not None and len(urls) > max_items:
            discovery_meta["truncated"] = True
            discovery_meta["complete_catalog"] = False
            urls = urls[:max_items]
        for url in urls:
            robots = self.evaluate_robots(url)
            if robots.can_fetch is not True:
                errors += 1
                continue
            if honor_delay:
                sleep_for_delay(robots)
            try:
                fetched = fetch_url(
                    url,
                    cache_dir=cache_dir,
                    user_agent=USER_AGENT,
                    use_cache=use_cache,
                )
            except FetchError:
                errors += 1
                continue
            html = fetched.body.decode("utf-8", errors="replace")
            snapshot = self.parse_listing_html(
                html,
                listing_url=url,
                raw_sha256=fetched.sha256,
                http_status=fetched.status,
                content_type=fetched.content_type or "text/html",
            )
            warnings += len(snapshot.warnings)
            if not snapshot.has_positive_price:
                excluded_no_price += 1
            snapshots.append(snapshot)

        completed = datetime.now(UTC)

        # Empty no-op run (no URLs, no discovery) is success.
        if not urls and not discover and not errors:
            outcome = SourceRunOutcome.SUCCESS
            bounded = False
        else:
            # Bounded/partial unless discovery completed the full catalog without caps.
            catalog_complete = bool(discovery_meta.get("complete_catalog")) and not bool(
                discovery_meta.get("truncated")
            )
            bounded = bool(
                dry_run
                or max_pages is not None
                or max_items is not None
                or discovery_meta.get("truncated")
                or errors
                or (discover and not catalog_complete)
            )
            if errors and not snapshots:
                outcome = SourceRunOutcome.FAILURE
            elif bounded:
                outcome = SourceRunOutcome.PARTIAL if snapshots else SourceRunOutcome.FAILURE
            else:
                outcome = SourceRunOutcome.SUCCESS

        checksum = hashlib.sha256(
            "|".join(sorted(s.external_id for s in snapshots)).encode("utf-8")
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
            excluded_no_price_count=excluded_no_price,
            warning_count=warnings,
            error_count=errors,
            snapshot_checksum=checksum,
            notes=(
                "Bounded manual run; scheduling disabled"
                if outcome == SourceRunOutcome.PARTIAL
                else "Manual run; scheduling disabled"
            ),
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "max_pages": max_pages,
                "discover": discover,
                "bounded": outcome == SourceRunOutcome.PARTIAL,
                "discovery": discovery_meta,
            },
        )
        return record, snapshots
