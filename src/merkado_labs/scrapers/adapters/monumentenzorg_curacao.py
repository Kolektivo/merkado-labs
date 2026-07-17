"""Monumentenzorg Curaçao adapter (fixture-capable; live access blocked).

Live recon (2026-07-17):
- monumentenzorg.cw — SSL certificate expired (CERTIFICATE_VERIFY_FAILED)
- monumentenzorgcuracao.com — DNS resolution failed
Earlier robots.txt fetch returned HTTP 403.

Until partner confirms a reachable domain and listing scope (heritage vs
commercial) and ANG/XCG presentation, live fetches stay disabled. Fixture
parsing is supported for offline development.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

from merkado_labs.normalization.currency import parse_decimal_amount, resolve_original_money
from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    FieldProvenance,
    ListingLifecycleStatus,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.evidence import html_to_preserved_text, sha256_text

SOURCE_KEY = "monumentenzorg_curacao"
ADAPTER_VERSION = "0.1.1"
DOMAINS = frozenset(
    {
        "monumentenzorg.cw",
        "www.monumentenzorg.cw",
        "monumentenzorgcuracao.com",
        "www.monumentenzorgcuracao.com",
    }
)
TITLE_RE = re.compile(r"<h1[^>]*>(?P<body>.*?)</h1>", re.I | re.S)
PRICE_RE = re.compile(
    r"\b(?P<code>XCG|ANG|NAF|USD|EUR)\s*(?P<amount>[\d.,]+)",
    re.I,
)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def _text(value: str) -> str:
    return WS_RE.sub(" ", html_to_preserved_text(value)).strip()


class MonumentenzorgCuracaoAdapter(DirectSourceAdapter):
    """Fixture parser available; live network runs intentionally fail-closed."""

    source_key = SOURCE_KEY
    name = SOURCE_KEY
    version = ADAPTER_VERSION
    domains = DOMAINS

    def parse_listing_html(
        self, html: str, *, listing_url: str, raw_sha256: str
    ) -> AdapterListingSnapshot:
        warnings = [
            "live_access_blocked_ssl_or_dns",
            "partner_scope_confirmation_required",
        ]
        title_m = TITLE_RE.search(html)
        title = _text(title_m.group("body")) if title_m else None
        price_m = PRICE_RE.search(html)
        amount = None
        currency = None
        price_raw = None
        if price_m:
            currency = price_m.group("code").upper()
            if currency == "NAF":
                currency = "ANG"
            amount = parse_decimal_amount(f"{currency} {price_m.group('amount')}")
            price_raw = price_m.group(0)
        money = resolve_original_money(amount=amount, currency=currency, evidence=price_raw)
        if money is None:
            warnings.append("no_price_extracted")
        slug = urlparse(listing_url).path.rstrip("/").rsplit("/", 1)[-1] or "unknown"
        description = _text(html)[:2000] or None
        return AdapterListingSnapshot(
            source_key=SOURCE_KEY,
            external_id=slug.casefold(),
            source_url=listing_url,
            observed_at=datetime.now(UTC),
            adapter_name=SOURCE_KEY,
            adapter_version=ADAPTER_VERSION,
            raw_payload={
                "realtor_name": "Monumentenzorg Curaçao",
                "realtor_domain": "www.monumentenzorg.cw",
                "access_blocker": "ssl_expired_or_dns",
            },
            raw_sha256=raw_sha256,
            title=title,
            listing_type="sale",
            source_status="unknown",
            lifecycle_hint=ListingLifecycleStatus.UNKNOWN,
            original_price=money,
            description=description,
            source_description=description,
            source_description_checksum=sha256_text(description) if description else None,
            fields=(
                FieldProvenance(
                    "realtor",
                    "Monumentenzorg Curaçao",
                    {"name": "Monumentenzorg Curaçao"},
                    "source_site_attribution",
                ),
            ),
            warnings=tuple(warnings),
        )

    def run_bounded(
        self,
        *,
        listing_urls: Sequence[str],
        cache_dir: Path,
        dry_run: bool = True,
        max_items: int = 5,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot]]:
        now = datetime.now(UTC)
        return SourceRunRecord(
            source_key=self.source_key,
            adapter_name=self.name,
            adapter_version=self.version,
            started_at=now,
            completed_at=now,
            outcome=SourceRunOutcome.FAILURE,
            notes=(
                "Live fetch disabled: SSL certificate expired on monumentenzorg.cw; "
                "alternate domain DNS failed; earlier robots 403. Use fixtures only."
            ),
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "currency_notes": "ANG/XCG expected",
                "live_fetch_authorized": False,
            },
        ), []
