"""Keller Williams Curaçao direct listing adapter.

Manual and unscheduled only. The site's declared Crawl-delay is 20 seconds;
detail requests are intentionally sequential.

``run_bounded`` is permanently partial. Full-catalog discovery is a separate
path and still fails closed to partial unless every completeness gate passes.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal
from urllib.parse import parse_qs, unquote, urljoin, urlparse, urlunparse

from merkado_labs.normalization.currency import (
    normalize_currency_code,
    parse_decimal_amount,
    resolve_original_money,
)
from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.contracts import (
    SOURCE_OFFICIAL_PROVENANCE,
    AdapterListingSnapshot,
    FieldProvenance,
    ListingLifecycleStatus,
    OfficialAlternatePrice,
    SourceRunOutcome,
    SourceRunRecord,
    classify_run_outcome,
)
from merkado_labs.scrapers.evidence import (
    evidence_storage_path,
    html_to_preserved_text,
    sha256_text,
)
from merkado_labs.scrapers.http_cache import FetchError, fetch_url
from merkado_labs.scrapers.robots import USER_AGENT, RobotsDecision

SOURCE_KEY = "keller_williams_curacao"
ADAPTER_NAME = SOURCE_KEY
ADAPTER_VERSION = "0.3.1"
RAW_EVIDENCE_BUCKET = "listing-raw-evidence"
DOMAINS = frozenset({"kw-curacao.com", "www.kw-curacao.com"})
BASE_URL = "https://kw-curacao.com"
DEFAULT_REQUEST_DELAY_SECONDS = 20.0
MAX_PAGES_PER_SECTION_HARD_CAP = 50
MAX_DETAIL_FETCHES_HARD_CAP = 500
DEFAULT_NEIGHBOURHOOD_LEXICON_PATH = Path("data/reference/neighbourhood_lexicon.json")
# Generic tokens never promoted to neighbourhood unless an exact canonical match wins.
GENERIC_LOCATION_TOKENS = frozenset(
    {
        "curaçao",
        "curacao",
        "resort",
        "island",
        "beach",
        "caribbean",
    }
)
AGENT_NAME_RE = re.compile(
    r'class=["\']card-agent__name["\'][^>]*>'
    r"(?P<body>.*?)"
    r'</div>\s*<div class=["\']card-agent__position',
    re.I | re.S,
)
COORDS_RE = re.compile(
    r"latLng:\s*\{\s*lat:\s*(?P<lat>-?\d+(?:\.\d+)?)\s*,\s*lng:\s*(?P<lng>-?\d+(?:\.\d+)?)",
    re.I,
)
# Historical bounded helper indexes (first-page only). Not a completeness claim.
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
CategoryKey = Literal[
    "for-sale/residential",
    "for-sale/lots-and-land",
    "for-sale/commercial",
    "for-rent/residential",
    "for-rent/commercial",
]

APPROVED_CATEGORIES: tuple[tuple[CategoryKey, ListingSection, str], ...] = (
    ("for-sale/residential", "sale", f"{BASE_URL}/listings/for-sale/residential"),
    ("for-sale/lots-and-land", "sale", f"{BASE_URL}/listings/for-sale/lots-and-land"),
    ("for-sale/commercial", "sale", f"{BASE_URL}/listings/for-sale/commercial"),
    ("for-rent/residential", "rent", f"{BASE_URL}/listings/for-rent/residential"),
    ("for-rent/commercial", "rent", f"{BASE_URL}/listings/for-rent/commercial"),
)
APPROVED_CATEGORY_KEYS: frozenset[str] = frozenset(key for key, _, _ in APPROVED_CATEGORIES)

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
SILENT_HREF_RE = re.compile(
    r'href=["\'](?P<href>[^"\']*silent-listings[^"\']*)["\']',
    re.I,
)
OFF_DOMAIN_LISTING_HREF_RE = re.compile(
    r'href=["\'](?P<href>https?://(?!(?:www\.)?kw-curacao\.com)[^"\']+/listings/[^"\']+)["\']',
    re.I,
)
# Evidence-backed trailing reference tokens from cached KW HTML.
# Order preserves existing extractions (e.g. KW2024-01, RLOO-016, JVD-050).
ID_FROM_SLUG_RE = re.compile(
    r"(?P<id>"
    r"[A-Za-z]{2,}\d+(?:[-_]\d+)?"
    r"|[A-Za-z]{1,4}-\d+"
    r"|[A-Za-z]{2,}-[A-Za-z]\d+"
    r"|[A-Za-z]{2,}-\d+[A-Za-z]"  # JvD-046S (live rent residential 2026-07-17)
    r"|[A-Za-z]+\d+[A-Za-z]{2,}"
    r"|\d+[A-Za-z]{2,}"
    r"|\d+[A-Za-z]+-[A-Za-z]+"
    r")$",
    re.I,
)
# Deterministic office/marketing pages that appear under /listings/ without a
# stable property reference ID (live 2026-07-20 supervised run).
EXCLUDED_NON_LISTING_SLUG_RE = re.compile(
    r"(?:^|[-_])list-with[-_]"
    r"|trusted[-_]real[-_]estate[-_]team"
    r"|rc[\s_-]*marketing"
    r"|(?:^|[-_])marketing[\s_-]*\d+",
    re.I,
)
# Exact URL observed blocking complete_catalog proof.
_KW_MARKETING_SLUG = "list-with-curacaos-trusted-real-estate-team-RC Marketing 001"
KNOWN_EXCLUDED_NON_LISTING_URLS = frozenset(
    {
        f"https://kw-curacao.com/listings/{_KW_MARKETING_SLUG}",
        (
            "https://kw-curacao.com/listings/"
            "list-with-curacaos-trusted-real-estate-team-RC%20Marketing%20001"
        ),
        (
            "https://kw-curacao.com/listings/"
            "list-with-curacaos-trusted-real-estate-team-rc-marketing-001"
        ),
    }
)
REL_NEXT_RE = re.compile(
    r'<a[^>]+rel=["\']next["\'][^>]*href=["\'](?P<href>[^"\']+)["\']'
    r'|<a[^>]+href=["\'](?P<href2>[^"\']+)["\'][^>]*rel=["\']next["\']',
    re.I,
)
PAGE_QUERY_HREF_RE = re.compile(
    r'href=["\'](?P<href>[^"\']*\bpage=\d+[^"\']*)["\']',
    re.I,
)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class DiscoveredListing:
    """A normalized URL found on a KW index page."""

    url: str
    external_id: str
    listing_type: ListingSection | None
    index_url: str
    category_key: str | None = None


@dataclass
class CatalogDiscoveryResult:
    """Result of approved-section catalog traversal (no detail fetches)."""

    listings: list[DiscoveredListing] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    index_pages: list[dict[str, Any]] = field(default_factory=list)
    categories_seen: set[str] = field(default_factory=set)
    duplicate_external_ids: int = 0
    duplicate_canonical_urls: int = 0
    skipped_silent: int = 0
    skipped_off_domain: int = 0
    skipped_no_external_id: int = 0
    skipped_excluded_non_listing: int = 0
    unresolved_no_external_id_urls: list[str] = field(default_factory=list)
    excluded_non_listing_urls: list[str] = field(default_factory=list)
    page_loops: int = 0
    unexpected_empty_pages: int = 0
    truncated: bool = False
    catalog_checksum: str | None = None

    @property
    def sections_complete(self) -> bool:
        return APPROVED_CATEGORY_KEYS <= self.categories_seen and not self.errors

    @property
    def discovery_complete(self) -> bool:
        return (
            self.sections_complete
            and not self.truncated
            and self.page_loops == 0
            and self.unexpected_empty_pages == 0
            and not self.unresolved_no_external_id_urls
            and bool(self.listings)
            and self.catalog_checksum is not None
        )


def _text(value: str) -> str:
    return WS_RE.sub(" ", html_to_preserved_text(value)).strip()


def is_silent_listing_url(url: str) -> bool:
    return "/silent-listings" in urlparse(url).path.casefold()


def is_excluded_non_listing_url(url: str) -> bool:
    """True for marketing/office pages incorrectly linked under /listings/.

    These must not block ``discovery_complete`` / ``complete_catalog`` proof.
    Classification is recorded as ``excluded_non_listing``.
    """

    absolute = url.strip()
    if absolute in KNOWN_EXCLUDED_NON_LISTING_URLS:
        return True
    parsed = urlparse(absolute)
    slug = unquote(parsed.path.rstrip("/").rsplit("/", 1)[-1])
    if absolute.replace("%20", " ") in KNOWN_EXCLUDED_NON_LISTING_URLS:
        return True
    return bool(EXCLUDED_NON_LISTING_SLUG_RE.search(slug))


def category_key_from_url(url: str) -> str | None:
    """Return an approved category key for exact category index paths only."""

    path = urlparse(url).path.rstrip("/").casefold()
    for key, _, _ in APPROVED_CATEGORIES:
        if path == f"/listings/{key}":
            return key
    return None


def canonicalize_index_url(href: str, *, base: str = BASE_URL) -> str | None:
    """Normalize an index/category URL; reject off-domain and silent listings."""

    absolute = urljoin(base + "/", href)
    parsed = urlparse(absolute)
    if parsed.hostname not in DOMAINS or is_silent_listing_url(absolute):
        return None
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    return urlunparse(("https", parsed.netloc, path.rstrip("/") or "/", "", parsed.query, ""))


def canonicalize_detail_url(href: str, *, base: str = BASE_URL) -> str | None:
    """Return an HTTPS, same-domain non-silent listing URL."""

    absolute = urljoin(base + "/", href)
    parsed = urlparse(absolute)
    if parsed.hostname not in DOMAINS or is_silent_listing_url(absolute):
        return None
    path = re.sub(r"/{2,}", "/", parsed.path)
    # Reject category index paths; keep /listings/for-sale/{slug} detail URLs.
    if category_key_from_url(absolute) is not None:
        return None
    segs = [part for part in path.split("/") if part]
    if len(segs) >= 2 and segs[0] == "listings" and segs[1] in {"for-sale", "for-rent"}:
        if len(segs) == 2 or (len(segs) == 3 and segs[2] in {
            "residential",
            "lots-and-land",
            "commercial",
        }):
            return None
    return urlunparse(("https", parsed.netloc, path, "", "", ""))


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


def extract_next_page_url(html: str, *, current_url: str) -> str | None:
    """Return an explicit same-category next index URL when present in HTML.

    Cached KW category HTML (for-sale/residential) contains no page-number or
    rel=next pager. This only follows explicit next/page links; it does not
    invent OctoberCMS AJAX pagination.
    """

    current = canonicalize_index_url(current_url)
    if not current:
        return None
    category = category_key_from_url(current)
    if not category:
        return None

    candidates: list[str] = []
    rel_match = REL_NEXT_RE.search(html)
    if rel_match:
        candidates.append(rel_match.group("href") or rel_match.group("href2") or "")

    current_page = 1
    query_page = parse_qs(urlparse(current).query).get("page", ["1"])
    try:
        current_page = int(query_page[0])
    except ValueError:
        current_page = 1

    for match in PAGE_QUERY_HREF_RE.finditer(html):
        candidates.append(match.group("href"))

    for href in candidates:
        if not href or href.startswith("#"):
            continue
        absolute = canonicalize_index_url(href, base=current)
        if not absolute or category_key_from_url(absolute) != category:
            continue
        if absolute.rstrip("/") == current.rstrip("/"):
            continue
        page_vals = parse_qs(urlparse(absolute).query).get("page")
        if page_vals:
            try:
                if int(page_vals[0]) <= current_page:
                    continue
            except ValueError:
                continue
        return absolute
    return None


def extract_detail_links(
    html: str,
    *,
    index_url: str,
    category_key: str | None = None,
) -> tuple[list[DiscoveredListing], dict[str, int]]:
    """Discover non-silent detail URLs without fetching them."""

    discovered: list[DiscoveredListing] = []
    seen_ids: set[str] = set()
    seen_urls: set[str] = set()
    stats: dict[str, Any] = {
        "skipped_silent": 0,
        "skipped_off_domain": 0,
        "skipped_no_external_id": 0,
        "skipped_excluded_non_listing": 0,
        "duplicate_external_ids": 0,
        "duplicate_canonical_urls": 0,
        "no_external_id_urls": [],
        "excluded_non_listing_urls": [],
    }
    resolved_category = category_key or category_key_from_url(index_url)
    section = None
    if resolved_category and resolved_category.startswith("for-rent"):
        section = "rent"
    elif resolved_category and resolved_category.startswith("for-sale"):
        section = "sale"

    stats["skipped_silent"] = len(SILENT_HREF_RE.findall(html))
    stats["skipped_off_domain"] = len(OFF_DOMAIN_LISTING_HREF_RE.findall(html))

    for match in DETAIL_HREF_RE.finditer(html):
        href = match.group("href")
        absolute = urljoin(index_url if "://" in index_url else BASE_URL + "/", href)
        if is_silent_listing_url(absolute):
            continue
        parsed = urlparse(absolute)
        if parsed.hostname and parsed.hostname not in DOMAINS:
            continue
        url = canonicalize_detail_url(href, base=index_url)
        if not url:
            # Category/nav links and malformed detail paths are ignored quietly.
            continue
        if is_excluded_non_listing_url(url):
            stats["skipped_excluded_non_listing"] += 1
            stats["excluded_non_listing_urls"].append(url)
            continue
        if url in seen_urls:
            stats["duplicate_canonical_urls"] += 1
            continue
        external_id = external_id_from_url(url)
        if not external_id:
            if is_excluded_non_listing_url(url):
                stats["skipped_excluded_non_listing"] += 1
                stats["excluded_non_listing_urls"].append(url)
                continue
            stats["skipped_no_external_id"] += 1
            stats["no_external_id_urls"].append(url)
            continue
        if external_id in seen_ids:
            stats["duplicate_external_ids"] += 1
            continue
        seen_urls.add(url)
        seen_ids.add(external_id)
        listing_type = listing_type_from_url(url) or section
        discovered.append(
            DiscoveredListing(
                url,
                external_id,
                listing_type,
                index_url,
                resolved_category,
            )
        )
    return discovered, stats


def _match_text(pattern: re.Pattern[str], html: str) -> str | None:
    match = pattern.search(html)
    return _text(match.group("body")) if match else None


def _is_generic_location(value: str | None) -> bool:
    if not value:
        return True
    token = value.casefold().strip()
    return token in GENERIC_LOCATION_TOKENS


def load_neighbourhood_lexicon(
    path: Path | None = None,
) -> tuple[tuple[str, str], ...]:
    """Load canonical Labs neighbourhood names for offline alias matching.

    Returns (display_name, normalized_name) tuples sorted longest-first.
    """

    lexicon_path = path or DEFAULT_NEIGHBOURHOOD_LEXICON_PATH
    if not lexicon_path.exists():
        return ()
    try:
        payload = json.loads(lexicon_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ()
    entries = payload.get("entries") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        return ()
    pairs: list[tuple[str, str]] = []
    for entry in entries:
        if isinstance(entry, str):
            name = entry.strip()
            normalized = name.casefold()
        elif isinstance(entry, dict):
            name = str(entry.get("name") or "").strip()
            normalized = str(entry.get("normalized_name") or name).casefold().strip()
        else:
            continue
        if not name or len(name) < 4:
            continue
        if name.casefold() in GENERIC_LOCATION_TOKENS:
            continue
        pairs.append((name, normalized))
    pairs.sort(key=lambda item: len(item[0]), reverse=True)
    return tuple(pairs)


def match_neighbourhood_alias(
    text: str | None,
    lexicon: Sequence[tuple[str, str]],
    *,
    source: str,
) -> dict[str, Any] | None:
    """Return the longest canonical neighbourhood alias found in ``text``."""

    if not text or not lexicon:
        return None
    haystack = text.casefold()
    for display, normalized in lexicon:
        # Word-boundary-ish match; allow hyphens/spaces interchangeably.
        pattern = re.compile(
            r"(?<![a-z0-9])" + re.escape(normalized).replace(r"\ ", r"[\s\-]+") + r"(?![a-z0-9])",
            re.I,
        )
        match = pattern.search(haystack)
        if match:
            return {
                "matched_text": text[match.start() : match.end()],
                "canonical_name": display,
                "normalized_name": normalized,
                "source": source,
                "span": [match.start(), match.end()],
            }
    return None


def extract_coordinates(html: str) -> tuple[float | None, float | None, str | None]:
    match = COORDS_RE.search(html)
    if not match:
        return None, None, None
    try:
        lat = float(match.group("lat"))
        lng = float(match.group("lng"))
    except ValueError:
        return None, None, match.group(0)
    return lat, lng, match.group(0)


def extract_agent_name(html: str) -> str | None:
    match = AGENT_NAME_RE.search(html)
    if not match:
        return None
    name = _text(match.group("body"))
    return name or None


def property_type_from_context(type_context: str | None) -> str | None:
    if not type_context:
        return None
    lowered = type_context.casefold()
    if "lots" in lowered or "land" in lowered:
        return "lots_and_land"
    if "commercial" in lowered or "office" in lowered:
        return "commercial"
    if "apartment" in lowered or "condo" in lowered or "penthouse" in lowered:
        return "apartment"
    if "villa" in lowered:
        return "villa"
    if (
        "detached single" in lowered
        or "single family" in lowered
        or "family home" in lowered
        or "townhouse" in lowered
        or "bungalow" in lowered
        or "house" in lowered
        or "home" in lowered
    ):
        return "house"
    if "residential" in lowered:
        return "residential"
    return None


def catalog_checksum_for(listings: Sequence[DiscoveredListing]) -> str:
    payload = "|".join(sorted(f"{item.external_id}:{item.url}" for item in listings))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class RequestMetrics:
    """Network/cache accounting for one adapter run (local dry-run reporting)."""

    robots_fetches: int = 0
    robots_cache_hits: int = 0
    index_network_fetches: int = 0
    index_cache_hits: int = 0
    detail_network_fetches: int = 0
    detail_cache_hits: int = 0
    failed_http: list[dict[str, Any]] = field(default_factory=list)
    network_request_timestamps: list[str] = field(default_factory=list)

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
                self.robots_fetches
                + self.index_network_fetches
                + self.detail_network_fetches
            ),
            "cache_hits_total": (
                self.robots_cache_hits + self.index_cache_hits + self.detail_cache_hits
            ),
            "failed_http": list(self.failed_http),
            "network_request_count_recorded": len(self.network_request_timestamps),
            "network_request_timestamps": list(self.network_request_timestamps),
        }


class KellerWilliamsCuracaoAdapter(DirectSourceAdapter):
    """Parser, bounded runner, and evidence-backed catalog discovery for kw-curacao.com."""

    source_key = SOURCE_KEY
    name = ADAPTER_NAME
    version = ADAPTER_VERSION
    domains = DOMAINS

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir or Path("data/raw/keller_williams_curacao/cache")
        self._robots_by_host: dict[str, RobotsDecision] = {}
        self._last_network_at: float | None = None
        self._cached_crawl_delay: float | None = None
        self.request_metrics = RequestMetrics()

    def reset_request_state(self) -> None:
        """Clear per-run robots cache and metrics (keeps cache_dir)."""

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
        self.request_metrics.network_request_timestamps.append(
            datetime.now(UTC).isoformat()
        )

    def evaluate_robots(  # type: ignore[override]
        self, listing_url: str, *, honor_delay: bool = False
    ) -> RobotsDecision:
        """Fetch robots.txt at most once per host for this adapter instance."""

        host = (urlparse(listing_url).hostname or "").lower()
        if host in self._robots_by_host:
            self.request_metrics.robots_cache_hits += 1
            return self._robots_by_host[host]
        self._pace_before_network(honor_delay=honor_delay)
        decision = super().evaluate_robots(listing_url)
        self._mark_network()
        self.request_metrics.robots_fetches += 1
        self._robots_by_host[host] = decision
        if decision.crawl_delay_seconds is not None:
            self._cached_crawl_delay = decision.crawl_delay_seconds
        return decision

    def parse_index_html(
        self,
        html: str,
        *,
        index_url: str,
        category_key: str | None = None,
    ) -> list[DiscoveredListing]:
        listings, _stats = extract_detail_links(
            html, index_url=index_url, category_key=category_key
        )
        return listings

    def discover_listing_urls(
        self,
        *,
        cache_dir: Path,
        max_items: int = 5,
        honor_delay: bool = True,
    ) -> tuple[list[DiscoveredListing], list[str]]:
        """Fetch known first-page index sections sequentially.

        Bounded helper only. Pagination and completeness belong to
        ``discover_catalog``.
        """

        discovered: list[DiscoveredListing] = []
        errors: list[str] = []
        for index_url in INDEX_URLS:
            if len(discovered) >= max_items:
                break
            robots = self.evaluate_robots(index_url, honor_delay=honor_delay)
            if robots.can_fetch is not True:
                errors.append(f"robots_disallow:{index_url}")
                continue
            try:
                if honor_delay:
                    # Only pace when the URL is not already on disk.
                    key = hashlib.sha256(index_url.encode()).hexdigest()
                    cache_path = cache_dir / f"{key}.html"
                    if not cache_path.exists():
                        self._pace_before_network(honor_delay=True)
                fetched = fetch_url(
                    index_url, cache_dir=cache_dir, user_agent=USER_AGENT, use_cache=True
                )
            except FetchError as error:
                errors.append(f"fetch_failed:{index_url}:{error}")
                self.request_metrics.failed_http.append(
                    {"url": index_url, "error": str(error), "kind": "index"}
                )
                continue
            if fetched.from_cache:
                self.request_metrics.index_cache_hits += 1
            else:
                self._mark_network()
                self.request_metrics.index_network_fetches += 1
            for item in self.parse_index_html(
                fetched.body.decode("utf-8", errors="replace"), index_url=index_url
            ):
                if len(discovered) >= max_items:
                    break
                if item.external_id not in {found.external_id for found in discovered}:
                    discovered.append(item)
        return discovered, errors

    def discover_catalog(
        self,
        *,
        cache_dir: Path,
        honor_delay: bool = True,
        use_cache: bool = True,
        max_pages_per_section: int | None = None,
        max_items: int | None = None,
        html_by_url: dict[str, str] | None = None,
    ) -> CatalogDiscoveryResult:
        """Traverse all approved public sections with evidence-backed page following.

        Completeness fails closed when any section is missing, capped, looped,
        unexpectedly empty, or when fetches fail.
        """

        result = CatalogDiscoveryResult()
        by_external_id: dict[str, DiscoveredListing] = {}
        by_url: dict[str, DiscoveredListing] = {}
        category_membership: dict[str, set[str]] = {}
        fixture_mode = html_by_url is not None

        for category_key, section, first_url in APPROVED_CATEGORIES:
            page_url: str | None = first_url
            seen_page_urls: set[str] = set()
            seen_checksums: set[str] = set()
            pages_in_section = 0
            section_had_listings = False

            while page_url:
                if max_pages_per_section is not None and pages_in_section >= max_pages_per_section:
                    result.truncated = True
                    result.warnings.append(f"max_pages_per_section:{category_key}")
                    break
                if pages_in_section >= MAX_PAGES_PER_SECTION_HARD_CAP:
                    result.truncated = True
                    result.warnings.append(f"hard_page_cap:{category_key}")
                    result.errors.append(f"page_cap_exceeded:{category_key}")
                    break
                if max_items is not None and len(by_external_id) >= max_items:
                    result.truncated = True
                    result.warnings.append("max_items_cap")
                    break

                normalized = canonicalize_index_url(page_url)
                if not normalized or is_silent_listing_url(normalized):
                    result.errors.append(f"invalid_index_url:{page_url}")
                    break
                if category_key_from_url(normalized) != category_key:
                    # Path must remain an approved category index (query may add page=N).
                    result.errors.append(f"off_approved_index:{normalized}")
                    break
                if normalized in seen_page_urls:
                    result.page_loops += 1
                    result.errors.append(f"page_loop_url:{normalized}")
                    break

                html: str
                page_sha: str
                if fixture_mode:
                    if normalized not in html_by_url and page_url not in html_by_url:
                        result.errors.append(f"fixture_missing:{normalized}")
                        break
                    html = html_by_url.get(normalized) or html_by_url[page_url]
                    page_sha = sha256_text(html)
                else:
                    robots = self.evaluate_robots(normalized, honor_delay=honor_delay)
                    if robots.can_fetch is not True:
                        result.errors.append(f"robots_disallow:{normalized}")
                        break
                    cache_path = (
                        cache_dir / f"{hashlib.sha256(normalized.encode()).hexdigest()}.html"
                    )
                    will_hit_cache = use_cache and cache_path.exists()
                    if not will_hit_cache:
                        self._pace_before_network(honor_delay=honor_delay)
                    try:
                        fetched = fetch_url(
                            normalized,
                            cache_dir=cache_dir,
                            user_agent=USER_AGENT,
                            use_cache=use_cache,
                        )
                    except FetchError as error:
                        result.errors.append(f"fetch_failed:{normalized}:{error}")
                        self.request_metrics.failed_http.append(
                            {"url": normalized, "error": str(error), "kind": "index"}
                        )
                        break
                    if fetched.from_cache:
                        self.request_metrics.index_cache_hits += 1
                    else:
                        self._mark_network()
                        self.request_metrics.index_network_fetches += 1
                    html = fetched.body.decode("utf-8", errors="replace")
                    page_sha = fetched.sha256

                if page_sha in seen_checksums:
                    result.page_loops += 1
                    result.errors.append(f"page_loop_checksum:{normalized}")
                    result.index_pages.append(
                        {
                            "url": normalized,
                            "category_key": category_key,
                            "sha256": page_sha,
                            "error": "repeated_checksum",
                        }
                    )
                    break

                seen_page_urls.add(normalized)
                seen_checksums.add(page_sha)
                pages_in_section += 1
                page_listings, stats = extract_detail_links(
                    html, index_url=normalized, category_key=category_key
                )
                result.skipped_silent += stats["skipped_silent"]
                result.skipped_off_domain += stats["skipped_off_domain"]
                result.skipped_no_external_id += stats["skipped_no_external_id"]
                result.skipped_excluded_non_listing += stats[
                    "skipped_excluded_non_listing"
                ]
                result.duplicate_canonical_urls += stats["duplicate_canonical_urls"]
                result.unresolved_no_external_id_urls.extend(stats["no_external_id_urls"])
                result.excluded_non_listing_urls.extend(
                    stats["excluded_non_listing_urls"]
                )

                new_on_page = 0
                for item in page_listings:
                    item = replace(item, listing_type=item.listing_type or section)
                    category_membership.setdefault(item.external_id, set()).add(category_key)
                    if item.url in by_url and by_url[item.url].external_id != item.external_id:
                        result.errors.append(f"url_id_conflict:{item.url}")
                        continue
                    if item.external_id in by_external_id:
                        result.duplicate_external_ids += 1
                        existing = by_external_id[item.external_id]
                        if existing.url != item.url:
                            result.warnings.append(
                                f"changed_url:{item.external_id}:{existing.url}->{item.url}"
                            )
                        continue
                    if item.url in by_url:
                        result.duplicate_canonical_urls += 1
                        continue
                    by_external_id[item.external_id] = item
                    by_url[item.url] = item
                    new_on_page += 1
                    if max_items is not None and len(by_external_id) >= max_items:
                        result.truncated = True
                        break

                result.index_pages.append(
                    {
                        "url": normalized,
                        "category_key": category_key,
                        "sha256": page_sha,
                        "discovered_on_page": len(page_listings),
                        "new_on_page": new_on_page,
                        "page": pages_in_section,
                    }
                )
                if page_listings:
                    section_had_listings = True
                elif pages_in_section == 1:
                    # First page empty may be a valid empty category, but is
                    # treated as unexpected until live recon confirms inventory.
                    result.unexpected_empty_pages += 1
                    result.warnings.append(f"unexpected_empty_page:{normalized}")

                if result.truncated:
                    break

                next_url = extract_next_page_url(html, current_url=normalized)
                if next_url is None:
                    break
                if next_url in seen_page_urls:
                    result.page_loops += 1
                    result.errors.append(f"page_loop_next:{next_url}")
                    break
                page_url = next_url

            if pages_in_section > 0:
                result.categories_seen.add(category_key)
            if pages_in_section > 0 and not section_had_listings:
                result.warnings.append(f"category_without_listings:{category_key}")

        result.listings = sorted(by_external_id.values(), key=lambda item: item.external_id)
        if result.listings:
            result.catalog_checksum = catalog_checksum_for(result.listings)
        # Drop broken no-id hrefs that are strict prefixes of a discovered URL
        # (observed live: .../harmonie plus .../harmonie-UJ33).
        discovered_urls = {item.url for item in result.listings}
        unresolved: list[str] = []
        for no_id_url in dict.fromkeys(result.unresolved_no_external_id_urls):
            if is_excluded_non_listing_url(no_id_url):
                result.skipped_excluded_non_listing += 1
                result.excluded_non_listing_urls.append(no_id_url)
                result.warnings.append(f"excluded_non_listing:{no_id_url}")
                continue
            prefix = no_id_url.rstrip("/") + "-"
            if any(found.startswith(prefix) for found in discovered_urls):
                result.warnings.append(f"no_id_prefix_duplicate:{no_id_url}")
                continue
            unresolved.append(no_id_url)
        result.unresolved_no_external_id_urls = unresolved
        result.excluded_non_listing_urls = list(
            dict.fromkeys(result.excluded_non_listing_urls)
        )
        if unresolved:
            result.errors.append(
                "unresolved_no_external_id:" + ",".join(unresolved)
            )
        for external_id, categories in category_membership.items():
            if len(categories) > 1:
                result.warnings.append(
                    f"multi_category:{external_id}:{','.join(sorted(categories))}"
                )
        missing = sorted(APPROVED_CATEGORY_KEYS - result.categories_seen)
        if missing:
            result.errors.append(f"missing_categories:{','.join(missing)}")
        return result

    def parse_listing_html(
        self,
        html: str,
        *,
        listing_url: str,
        raw_sha256: str,
        observed_at: datetime | None = None,
        http_status: int | None = None,
        content_type: str | None = "text/html",
        neighbourhood_lexicon: Sequence[tuple[str, str]] | None = None,
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
        under_contract = "under contract" in status_key
        lifecycle = (
            ListingLifecycleStatus.SOLD
            if "sold" in status_key
            else ListingLifecycleStatus.INACTIVE
            if "rented" in status_key or "inactive" in status_key
            else ListingLifecycleStatus.ACTIVE
            if "active" in status_key
            or under_contract
            or "price upon request" in status_key
            else ListingLifecycleStatus.UNKNOWN
        )
        if under_contract:
            warnings.append("under_contract_label")
        location = _match_text(LOCATION_RE, html)
        feature_neighbourhood = None
        type_context = _match_text(TYPE_RE, html)
        listing_type = listing_type_from_url(listing_url, type_context)
        if not listing_type:
            warnings.append("listing_type_unclear")
        property_type = property_type_from_context(type_context)
        amount, currency, price_raw = _extract_price(html)
        money = resolve_original_money(amount=amount, currency=currency, evidence=price_raw)
        official_alternates = _extract_official_alternate_prices(
            html, anchor_currency=currency
        )
        if money is None:
            warnings.append("no_price_extracted")

        features = _extract_features(html)
        feature_neighbourhood = features.get("neighborhood") or features.get("neighbourhood")
        options = " ".join(_text(item.group("body")) for item in OPTION_RE.finditer(html))
        bedrooms = _number(features.get("bedrooms")) or _number(
            re.search(r"(\d+(?:[.,]\d+)?)\s*bedroom", options, re.I).group(1)
            if re.search(r"(\d+(?:[.,]\d+)?)\s*bedroom", options, re.I)
            else None
        )
        full_baths = _number(features.get("full bathrooms"))
        half_baths = _number(features.get("half bathrooms"))
        bathrooms = full_baths
        if bathrooms is None:
            bathrooms = _number(
                re.search(r"(\d+(?:[.,]\d+)?)\s*bathroom", options, re.I).group(1)
                if re.search(r"(\d+(?:[.,]\d+)?)\s*bathroom", options, re.I)
                else None
            )
        normalized_bathrooms = bathrooms
        if normalized_bathrooms is not None and half_baths:
            normalized_bathrooms += half_baths / 2
        if normalized_bathrooms is not None and normalized_bathrooms <= 0:
            normalized_bathrooms = None
            warnings.append("non_positive_bathrooms_dropped")
        floor_area = _area_m2(features.get("build up size"))
        if floor_area is not None and floor_area <= 0:
            floor_area = None
        if floor_area is None:
            warnings.append("missing_floor_area")
        lot_area = _area_m2(features.get("land size"))
        lot_area_unit = "m2" if lot_area is not None else None
        if lot_area is not None and lot_area <= 0:
            lot_area = None
            lot_area_unit = None
            warnings.append("non_positive_lot_area_dropped")
        description_match = DESCRIPTION_RE.search(html)
        description_html = description_match.group("body") if description_match else None
        description = _text(description_html) if description_html else None
        if not description:
            warnings.append("missing_description")
        images = tuple(dict.fromkeys(match.group("url") for match in IMAGE_RE.finditer(html)))
        if not images:
            warnings.append("missing_images")
        latitude, longitude, coords_raw = extract_coordinates(html)
        if latitude is not None and longitude is not None:
            # Guard obvious lat/lng swaps for Curaçao bbox.
            if abs(latitude) > 20 and abs(longitude) < 20:
                latitude, longitude = longitude, latitude
                warnings.append("coordinate_order_swapped")
        agent_name = extract_agent_name(html)

        lexicon = (
            tuple(neighbourhood_lexicon)
            if neighbourhood_lexicon is not None
            else load_neighbourhood_lexicon()
        )
        title_alias = match_neighbourhood_alias(title, lexicon, source="title")
        description_alias = match_neighbourhood_alias(
            description, lexicon, source="description"
        )
        slug_text = urlparse(listing_url).path.rstrip("/").rsplit("/", 1)[-1].replace("-", " ")
        slug_alias = match_neighbourhood_alias(slug_text, lexicon, source="url_slug")
        location_evidence: dict[str, Any] = {
            "dedicated_location": location,
            "feature_neighborhood": feature_neighbourhood,
            "title_alias": title_alias,
            "description_alias": description_alias,
            "slug_alias": slug_alias,
            "coordinates": {"lat": latitude, "lng": longitude, "raw": coords_raw},
        }
        if (
            title_alias
            and description_alias
            and title_alias["normalized_name"] != description_alias["normalized_name"]
        ):
            # Always retain both matches in location_evidence; warn when they disagree.
            warnings.append(
                "neighbourhood_alias_conflict:"
                f"{title_alias['canonical_name']}|{description_alias['canonical_name']}"
            )

        neighbourhood_text: str | None = None
        neighbourhood_inferred = False
        neighbourhood_inference_reason: str | None = None
        if location and not _is_generic_location(location):
            neighbourhood_text = location
        elif feature_neighbourhood and not _is_generic_location(feature_neighbourhood):
            neighbourhood_text = feature_neighbourhood
            location_evidence["neighbourhood_from"] = "features_table"
        else:
            if location and _is_generic_location(location):
                warnings.append("generic_location_text")
            inferred = title_alias or description_alias or slug_alias
            if inferred:
                neighbourhood_text = inferred["canonical_name"]
                neighbourhood_inferred = True
                neighbourhood_inference_reason = (
                    f"alias_match:{inferred['source']}:{inferred['matched_text']}"
                )
                location_evidence["neighbourhood_from"] = inferred["source"]
            else:
                warnings.append("missing_neighbourhood")

        fields = [
            FieldProvenance("listing_reference", external_id, external_id, "url_slug"),
            FieldProvenance(
                "price",
                price_raw,
                {"amount": str(amount), "currency": currency} if amount else None,
                "listing_price",
                ".page-property-details__price",
            ),
            FieldProvenance(
                "realtor_brokerage",
                "Keller Williams Curaçao",
                {"name": "Keller Williams Curaçao", "domain": "kw-curacao.com"},
                "source_site_attribution",
            ),
        ]
        if location:
            fields.append(
                FieldProvenance(
                    "location_text",
                    location,
                    location,
                    "dedicated_location",
                    ".page-property-details__location",
                    location,
                    confidence=1.0,
                    inferred=False,
                )
            )
        if neighbourhood_text:
            fields.append(
                FieldProvenance(
                    "neighbourhood_text",
                    neighbourhood_text
                    if not neighbourhood_inferred
                    else (title_alias or description_alias or slug_alias or {}).get(
                        "matched_text"
                    ),
                    neighbourhood_text,
                    (
                        "dedicated_location"
                        if not neighbourhood_inferred
                        else "canonical_alias_match"
                    ),
                    (
                        ".page-property-details__location"
                        if not neighbourhood_inferred
                        else neighbourhood_inference_reason
                    ),
                    neighbourhood_text,
                    confidence=0.95 if not neighbourhood_inferred else 0.7,
                    inferred=neighbourhood_inferred,
                    inference_reason=neighbourhood_inference_reason,
                )
            )
        if agent_name:
            fields.append(
                FieldProvenance(
                    "agent_name",
                    agent_name,
                    agent_name,
                    "agent_card",
                    ".card-agent__name",
                    agent_name,
                )
            )
        if latitude is not None and longitude is not None:
            fields.append(
                FieldProvenance(
                    "coordinates",
                    coords_raw,
                    {"latitude": latitude, "longitude": longitude},
                    "embedded_map_latlng",
                    "script.latLng",
                    coords_raw,
                )
            )
        if full_baths is not None or half_baths is not None:
            fields.append(
                FieldProvenance(
                    "bathrooms",
                    f"full={full_baths};half={half_baths}",
                    {
                        "full": full_baths,
                        "half": half_baths,
                        "normalized": normalized_bathrooms,
                    },
                    "features_table",
                    "#features table",
                )
            )
        if lot_area is not None:
            fields.append(
                FieldProvenance(
                    "lot_area",
                    features.get("land size"),
                    {"value": str(lot_area), "unit": lot_area_unit},
                    "features_table",
                    "#features table",
                )
            )
        if property_type:
            fields.append(
                FieldProvenance(
                    "property_type",
                    type_context,
                    property_type,
                    "listing_type_badge",
                    ".page-property-details__type",
                )
            )
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
                "property_type": property_type,
                "image_urls": list(images),
                "realtor_name": "Keller Williams Curaçao",
                "agent_name": agent_name,
                "realtor_domain": "www.kw-curacao.com",
                "full_bathrooms": full_baths,
                "half_bathrooms": half_baths,
                "crawl_delay_seconds": DEFAULT_REQUEST_DELAY_SECONDS,
                "under_contract": under_contract,
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type=listing_type,
            property_type=property_type,
            source_status=source_status,
            lifecycle_hint=lifecycle,
            original_price=money,
            official_alternate_prices=tuple(official_alternates),
            bedrooms=int(bedrooms) if bedrooms is not None else None,
            bathrooms=normalized_bathrooms,
            floor_area_m2=floor_area,
            lot_area_value=lot_area,
            lot_area_unit=lot_area_unit,
            latitude=latitude,
            longitude=longitude,
            neighbourhood_text=neighbourhood_text,
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
            structured_evidence={
                "features": features,
                "type_context": type_context,
                "full_bathrooms": full_baths,
                "half_bathrooms": half_baths,
                "agent_name": agent_name,
                "location_evidence": location_evidence,
                "official_alternate_prices": [alt.as_dict() for alt in official_alternates],
            },
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
        """Fetch at most ``max_items`` sequentially, enforcing a 20-second delay.

        Permanently partial: never emits ``complete_catalog=true``.
        """

        started = datetime.now(UTC)
        self.reset_request_state()
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
        snapshots, errors, _parser_failures = self._fetch_details(
            urls,
            cache_dir=cache_dir,
            dry_run=dry_run,
            honor_delay=honor_delay,
            initial_errors=len(discovery_errors),
        )
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
                "request_metrics": self.request_metrics.as_dict(),
                "no_supabase_writes": dry_run,
                "no_evidence_uploads": dry_run,
                "no_lifecycle_events": True,
                "discover": discover,
                "discovery_errors": discovery_errors,
                "silent_listings_skipped": len(listing_urls or [])
                - len([u for u in (listing_urls or []) if not is_silent_listing_url(u)]),
            },
        ), snapshots

    def run_catalog(
        self,
        *,
        cache_dir: Path,
        dry_run: bool = True,
        honor_delay: bool = True,
        use_cache: bool = True,
        max_pages_per_section: int | None = None,
        max_items: int | None = None,
        html_by_url: dict[str, str] | None = None,
        detail_html_by_url: dict[str, str] | None = None,
        prior_catalog_count: int | None = None,
        # Align with pipeline anomaly (~15% decrease): discovered must stay at
        # or above 85% of the prior Labs inventory or completeness fails closed.
        suspicious_shrink_ratio: float = 0.85,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot], CatalogDiscoveryResult]:
        """Full approved-section catalog path with fail-closed completeness."""

        started = datetime.now(UTC)
        self.reset_request_state()
        discovery = self.discover_catalog(
            cache_dir=cache_dir,
            honor_delay=honor_delay,
            use_cache=use_cache,
            max_pages_per_section=max_pages_per_section,
            max_items=max_items,
            html_by_url=html_by_url,
        )
        urls = [item.url for item in discovery.listings]
        snapshots: list[AdapterListingSnapshot] = []
        errors = len(discovery.errors)
        parser_failures = 0
        failed_fetches = 0

        if detail_html_by_url is not None:
            for item in discovery.listings:
                html = detail_html_by_url.get(item.url)
                if html is None:
                    failed_fetches += 1
                    errors += 1
                    continue
                try:
                    snapshots.append(
                        self.parse_listing_html(
                            html,
                            listing_url=item.url,
                            raw_sha256=sha256_text(html),
                        )
                    )
                except ValueError:
                    parser_failures += 1
                    errors += 1
        else:
            snapshots, fetch_errors, parser_failures = self._fetch_details(
                urls,
                cache_dir=cache_dir,
                dry_run=dry_run,
                honor_delay=honor_delay,
                use_cache=use_cache,
                initial_errors=0,
            )
            failed_fetches = fetch_errors
            errors += fetch_errors

        suspicious_shrinkage = False
        if (
            prior_catalog_count is not None
            and prior_catalog_count > 0
            and len(discovery.listings) < prior_catalog_count * suspicious_shrink_ratio
        ):
            suspicious_shrinkage = True
            discovery.warnings.append(
                f"suspicious_catalog_shrinkage:{len(discovery.listings)}<{prior_catalog_count}"
            )

        bounded = max_items is not None or max_pages_per_section is not None
        catalog_complete = (
            discovery.discovery_complete
            and not bounded
            and failed_fetches == 0
            and parser_failures == 0
            and not suspicious_shrinkage
            and len(snapshots) == len(urls)
            and len(discovery.errors) == 0
        )
        outcome = classify_run_outcome(
            parsed_count=len(snapshots),
            target_count=len(urls),
            error_count=errors,
            complete_catalog=catalog_complete,
            bounded=bounded,
            truncated=discovery.truncated or suspicious_shrinkage,
            max_items=max_items,
            max_pages=max_pages_per_section,
            failed_fetches=failed_fetches,
            parser_failures=parser_failures,
            early_termination=discovery.page_loops > 0,
        )
        if outcome == SourceRunOutcome.SUCCESS and not catalog_complete:
            outcome = SourceRunOutcome.PARTIAL

        return (
            SourceRunRecord(
                source_key=SOURCE_KEY,
                adapter_name=ADAPTER_NAME,
                adapter_version=ADAPTER_VERSION,
                started_at=started,
                completed_at=datetime.now(UTC),
                outcome=outcome,
                discovered_count=len(urls),
                parsed_count=len(snapshots),
                excluded_no_price_count=sum(not snap.has_positive_price for snap in snapshots),
                warning_count=sum(len(snap.warnings) for snap in snapshots)
                + len(discovery.warnings),
                error_count=errors,
                snapshot_checksum=discovery.catalog_checksum
                or hashlib.sha256(
                    "|".join(s.external_id for s in snapshots).encode()
                ).hexdigest(),
                notes=(
                    "Full approved-section catalog path; scheduling disabled; "
                    "Crawl-delay 20 seconds; fail-closed completeness"
                ),
                metadata={
                    "dry_run": dry_run,
                    "bounded": bounded,
                    "complete_catalog": catalog_complete,
                    "crawl_delay_seconds": DEFAULT_REQUEST_DELAY_SECONDS,
                    "max_items": max_items,
                    "max_pages_per_section": max_pages_per_section,
                    "truncated": discovery.truncated,
                    "duplicate_external_ids": discovery.duplicate_external_ids,
                    "duplicate_canonical_urls": discovery.duplicate_canonical_urls,
                    "skipped_silent": discovery.skipped_silent,
                    "skipped_off_domain": discovery.skipped_off_domain,
                    "skipped_no_external_id": discovery.skipped_no_external_id,
                    "skipped_excluded_non_listing": discovery.skipped_excluded_non_listing,
                    "excluded_non_listing_urls": discovery.excluded_non_listing_urls,
                    "page_loops": discovery.page_loops,
                    "unexpected_empty_pages": discovery.unexpected_empty_pages,
                    "categories_seen": sorted(discovery.categories_seen),
                    "index_pages": discovery.index_pages,
                    "discovery_errors": discovery.errors,
                    "discovery_warnings": discovery.warnings,
                    "catalog_checksum": discovery.catalog_checksum,
                    "suspicious_shrinkage": suspicious_shrinkage,
                    "discovery_ready": True,
                    "manual_unscheduled": True,
                    "request_metrics": self.request_metrics.as_dict(),
                    "no_supabase_writes": dry_run,
                    "no_evidence_uploads": dry_run,
                    "no_lifecycle_events": True,
                },
            ),
            snapshots,
            discovery,
        )

    def _fetch_details(
        self,
        urls: Sequence[str],
        *,
        cache_dir: Path,
        dry_run: bool,
        honor_delay: bool,
        use_cache: bool = True,
        initial_errors: int = 0,
    ) -> tuple[list[AdapterListingSnapshot], int, int]:
        snapshots: list[AdapterListingSnapshot] = []
        errors = initial_errors
        parser_failures = 0
        if len(urls) > MAX_DETAIL_FETCHES_HARD_CAP:
            # Fail closed: refuse unbounded detail loops.
            self.request_metrics.failed_http.append(
                {
                    "url": "*",
                    "error": f"detail_hard_cap:{len(urls)}>{MAX_DETAIL_FETCHES_HARD_CAP}",
                    "kind": "detail_cap",
                }
            )
            return snapshots, errors + 1, parser_failures

        for url in urls:
            if not self.supports(url) or is_silent_listing_url(url):
                errors += 1
                continue
            robots = self.evaluate_robots(url, honor_delay=honor_delay)
            if robots.can_fetch is not True:
                errors += 1
                self.request_metrics.failed_http.append(
                    {"url": url, "error": "robots_disallow", "kind": "detail"}
                )
                continue
            cache_path = cache_dir / f"{hashlib.sha256(url.encode()).hexdigest()}.html"
            will_hit_cache = use_cache and cache_path.exists()
            if not will_hit_cache:
                self._pace_before_network(honor_delay=honor_delay)
            try:
                fetched = fetch_url(
                    url,
                    cache_dir=cache_dir,
                    user_agent=USER_AGENT,
                    use_cache=use_cache,
                )
            except FetchError as error:
                errors += 1
                status_match = re.search(r"HTTP\s+(\d+)", str(error))
                self.request_metrics.failed_http.append(
                    {
                        "url": url,
                        "error": str(error),
                        "http_status": int(status_match.group(1)) if status_match else None,
                        "kind": "detail",
                    }
                )
                continue
            if fetched.from_cache:
                self.request_metrics.detail_cache_hits += 1
            else:
                self._mark_network()
                self.request_metrics.detail_network_fetches += 1
            try:
                snap = self.parse_listing_html(
                    fetched.body.decode("utf-8", errors="replace"),
                    listing_url=url,
                    raw_sha256=fetched.sha256,
                    http_status=fetched.status,
                    content_type=fetched.content_type or "text/html",
                )
            except ValueError:
                parser_failures += 1
                errors += 1
                continue
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
        return snapshots, errors, parser_failures


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


def _extract_official_alternate_prices(
    html: str,
    *,
    anchor_currency: str | None,
) -> list[OfficialAlternatePrice]:
    """Capture KW inline EUR/XCG lines as source-official alternates.

    Anchor remains the first currency code; following amounts are official
    source conversions, never Merkado-inferred.
    """

    price_html = PRICE_RE.search(html)
    if not price_html:
        return []
    raw = _text(price_html.group("body"))
    matches = list(re.finditer(r"\b(USD|EUR|XCG|ANG|NAF)\s*([\d.,\s]+)", raw, re.I))
    if len(matches) <= 1:
        return []
    anchor = normalize_currency_code(anchor_currency)
    alts: list[OfficialAlternatePrice] = []
    seen: set[str] = set()
    for match in matches[1:]:
        currency = normalize_currency_code(match.group(1))
        amount = parse_decimal_amount(f"{match.group(1)} {match.group(2).strip()}")
        if currency is None or amount is None or amount <= 0:
            continue
        if currency == anchor:
            continue
        key = f"{currency}|{amount}"
        if key in seen:
            continue
        seen.add(key)
        alts.append(
            OfficialAlternatePrice(
                amount=amount,
                currency=currency,
                provenance=SOURCE_OFFICIAL_PROVENANCE,
                evidence=match.group(0)[:240],
                source_label="kw_inline_price_line",
            )
        )
    return alts


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
    """Parse build-up/land size. Prefer the metric figure before any Sq Ft parenthetical."""

    if not value:
        return None
    # Accept m² even when encoding mangled the superscript (mÂ² / mA�).
    metric = re.search(
        r"([\d.,]+)\s*m(?:²|2|Â²|A.|)\b",
        value,
        re.I,
    )
    if metric:
        amount = _number(metric.group(1))
        return Decimal(str(amount)) if amount is not None else None
    if "m" not in value.casefold():
        return None
    # Fall back only when there is no Sq Ft clause that could steal the first number.
    if "sq" in value.casefold():
        return None
    amount = _number(value)
    return Decimal(str(amount)) if amount is not None else None
