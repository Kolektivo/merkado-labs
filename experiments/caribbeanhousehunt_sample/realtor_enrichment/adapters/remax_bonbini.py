"""Deterministic RE/MAX BonBini (realestate-curacao.com) listing adapter."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    from ..base import DomainAdapter, EnrichmentField, EnrichmentResult, detect_conflicts
    from ..http_cache import FetchError, fetch_url
    from ..robots import USER_AGENT, sleep_for_delay
except ImportError:  # pragma: no cover - script path fallback
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from base import DomainAdapter, EnrichmentField, EnrichmentResult, detect_conflicts
    from http_cache import FetchError, fetch_url
    from robots import USER_AGENT, sleep_for_delay

ADAPTER_NAME = "remax_bonbini"
ADAPTER_VERSION = "0.1.0"
DOMAINS = frozenset({"www.realestate-curacao.com", "realestate-curacao.com"})

LABEL_ROW = re.compile(
    r"<td[^>]*>\s*(?P<label>[^<:]{2,60}):\s*</td>\s*<td[^>]*>(?P<value>.*?)</td>",
    re.IGNORECASE | re.DOTALL,
)
REF_FROM_URL = re.compile(r"/(?P<ref>(?:hs|hr|lo|co)\d+)/", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")

# Labels observed on live RE/MAX BonBini listing pages (controlled sample).
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
}


@dataclass(frozen=True)
class ProvenancedField:
    """Field with extraction provenance for enrichment observations."""

    name: str
    raw_value: str
    normalized_value: Any
    extraction_method: str
    evidence_selector: str
    evidence_snippet: str


def _clean_html_text(value: str) -> str:
    text = TAG_RE.sub(" ", value)
    text = text.replace("&nbsp;", " ").replace("&euro;", "EUR ").replace("&amp;", "&")
    return WS_RE.sub(" ", text).strip()


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
    """Parse '5,167 sq ft' style areas. Returns (value, unit) without conversion."""

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


def extract_labelled_rows(html: str) -> list[ProvenancedField]:
    """Extract factual fields from labelled HTML table rows only."""

    fields: list[ProvenancedField] = []
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
        elif field_name in {"furnished", "has_pool", "gated_resort", "sea_view"}:
            normalized = parse_yes_no(raw_value)
        elif field_name == "pets_allowed":
            normalized = parse_yes_no(raw_value)
        else:
            normalized = raw_value

        fields.append(
            ProvenancedField(
                name=field_name,
                raw_value=raw_value,
                normalized_value=normalized,
                extraction_method="labelled_html",
                evidence_selector=selector,
                evidence_snippet=snippet,
            )
        )
    return fields


def extract_listing_reference(url: str, html: str) -> ProvenancedField | None:
    """Pull hs/hr/lo reference from the listing URL path when present."""

    match = REF_FROM_URL.search(url)
    if not match:
        # Fallback: first occurrence in HTML body near known pattern.
        html_match = re.search(r"\b((?:hs|hr|lo|co)\d+)\b", html, re.I)
        if not html_match:
            return None
        ref = html_match.group(1).lower()
        return ProvenancedField(
            name="listing_reference",
            raw_value=ref,
            normalized_value=ref,
            extraction_method="labelled_html",
            evidence_selector="body text reference token",
            evidence_snippet=ref,
        )
    ref = match.group("ref").lower()
    return ProvenancedField(
        name="listing_reference",
        raw_value=ref,
        normalized_value=ref,
        extraction_method="url_path",
        evidence_selector="url path /(hs|hr|lo|co)\\d+/",
        evidence_snippet=ref,
    )


def extract_microdata_bedrooms(html: str) -> ProvenancedField | None:
    match = re.search(
        r"itemprop=['\"]numberOfRooms['\"][^>]*>(?P<value>[^<]+)",
        html,
        re.I,
    )
    if not match:
        return None
    raw = _clean_html_text(match.group("value"))
    value = parse_number(raw)
    if value is None:
        return None
    return ProvenancedField(
        name="bedrooms",
        raw_value=raw,
        normalized_value=value,
        extraction_method="microdata",
        evidence_selector="[itemprop=numberOfRooms]",
        evidence_snippet=f"numberOfRooms={raw}",
    )


class RemaxBonbiniAdapter(DomainAdapter):
    """Focused adapter for www.realestate-curacao.com listing detail pages."""

    name = ADAPTER_NAME
    domains = DOMAINS
    version = ADAPTER_VERSION

    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = cache_dir

    def enrich(
        self,
        listing_url: str,
        *,
        aggregator_fields: dict[str, Any] | None = None,
        use_cache: bool = True,
        honor_delay: bool = True,
    ) -> EnrichmentResult:
        robots = self.evaluate_robots(listing_url)
        domain = robots.domain or (urlparse(listing_url).hostname or "")
        observed_at = datetime.now(UTC).isoformat()
        if robots.can_fetch is not True:
            return EnrichmentResult(
                domain=domain,
                listing_url=listing_url,
                adapter_name=self.name,
                observed_at=observed_at,
                status="blocked_by_robots"
                if robots.can_fetch is False
                else "robots_inconclusive",
                robots=robots,
                notes=robots.notes,
                metadata={"adapter_version": self.version},
            )

        cache_path = self.cache_dir / f"{hashlib.sha256(listing_url.encode('utf-8')).hexdigest()}.html"
        if honor_delay and not (use_cache and cache_path.exists()):
            sleep_for_delay(robots)

        try:
            fetched = fetch_url(
                listing_url,
                cache_dir=self.cache_dir,
                user_agent=USER_AGENT,
                use_cache=use_cache,
            )
        except FetchError as error:
            return EnrichmentResult(
                domain=domain,
                listing_url=listing_url,
                adapter_name=self.name,
                observed_at=observed_at,
                status="fetch_failed",
                robots=robots,
                notes=str(error),
                metadata={"adapter_version": self.version},
            )

        html = fetched.body.decode("utf-8", errors="replace")
        provenanced = extract_labelled_rows(html)
        by_name = {field.name: field for field in provenanced}

        # Prefer labelled bedrooms; fall back to microdata if label missing.
        if "bedrooms" not in by_name:
            micro = extract_microdata_bedrooms(html)
            if micro is not None:
                provenanced.append(micro)
                by_name["bedrooms"] = micro

        ref = extract_listing_reference(listing_url, html)
        if ref is not None and "listing_reference" not in by_name:
            provenanced.append(ref)

        enrichment_fields = tuple(
            EnrichmentField(
                name=field.name,
                value=field.normalized_value,
                evidence_snippet=field.evidence_snippet,
            )
            for field in provenanced
        )
        conflicts = detect_conflicts(aggregator_fields or {}, enrichment_fields)
        return EnrichmentResult(
            domain=domain,
            listing_url=listing_url,
            adapter_name=self.name,
            observed_at=observed_at,
            status="ok",
            robots=robots,
            fields=enrichment_fields,
            conflicts=conflicts,
            notes=f"Extracted {len(provenanced)} labelled fields",
            raw_evidence_sha256=fetched.sha256,
            metadata={
                "adapter_version": self.version,
                "elapsed_ms": fetched.elapsed_ms,
                "from_cache": fetched.from_cache,
                "provenanced_fields": [
                    {
                        "name": field.name,
                        "raw_value": field.raw_value,
                        "normalized_value": field.normalized_value,
                        "extraction_method": field.extraction_method,
                        "evidence_selector": field.evidence_selector,
                        "evidence_snippet": field.evidence_snippet,
                    }
                    for field in provenanced
                ],
                "fetch": {
                    "status": fetched.status,
                    "content_type": fetched.content_type,
                    "sha256": fetched.sha256,
                    "elapsed_ms": fetched.elapsed_ms,
                    "from_cache": fetched.from_cache,
                },
            },
        )


def area_to_m2(value: float | int, unit: str | None) -> float | None:
    """Convert area to m² only when unit is known."""

    if unit == "m2":
        return float(value)
    if unit == "sq_ft":
        return round(float(value) * 0.09290304, 3)
    return None
