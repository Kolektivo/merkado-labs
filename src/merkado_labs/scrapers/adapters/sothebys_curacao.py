"""Sotheby's International Realty Curaçao — recon-only skeleton.

Live recon 2026-07-17: robots.txt, Curacao sales path, and sitemap all returned
HTTP 202 (typical Cloudflare/WAF interstitial). No usable server-rendered
listing HTML or public feed was obtained.

Browser automation and WAF bypass are prohibited. Keep this adapter fail-closed
until a non-browser feed/API/sitemap path is confirmed.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from merkado_labs.scrapers.adapters.base import DirectSourceAdapter
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    SourceRunOutcome,
    SourceRunRecord,
)

SOURCE_KEY = "sothebys_curacao"
RECON_NOTES = {
    "robots": "https://www.sothebysrealty.com/robots.txt -> HTTP 202",
    "search": "https://www.sothebysrealty.com/eng/sales/curacao-cu -> HTTP 202",
    "sitemap": "https://www.sothebysrealty.com/sitemap.xml -> HTTP 202",
    "interpretation": "Cloudflare/WAF challenge; no parser fixtures captured",
    "browser_automation": False,
}


class SothebysCuracaoAdapter(DirectSourceAdapter):
    """Blocked pending non-browser access path."""

    source_key = SOURCE_KEY
    name = SOURCE_KEY
    version = "0.1.1"
    domains = frozenset({"sothebysrealty.com", "www.sothebysrealty.com"})

    def parse_listing_html(
        self, html: str, *, listing_url: str, raw_sha256: str
    ) -> AdapterListingSnapshot:
        raise NotImplementedError(
            "Sotheby's Curaçao is recon-only (HTTP 202/WAF). No browser automation."
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
            notes="Recon-only: HTTP 202/WAF on robots/search/sitemap; no browser automation.",
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "recon": RECON_NOTES,
                "browser_automation": False,
            },
        ), []
