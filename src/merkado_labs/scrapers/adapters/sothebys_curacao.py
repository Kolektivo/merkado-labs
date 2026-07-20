"""Sotheby's International Realty Curaçao — recon-only skeleton.

Live recon 2026-07-17 and 2026-07-20:

- Affiliate host ``curacaosothebysrealty.com`` has an expired/mismatched TLS
  certificate (``*.hostingplatform.com``, expired 2022-09-12). HTTP 301
  redirects to ``www.sothebysrealty.com/curacaosir/eng``.
- Network inventory/office/robots/sitemap/terms/feed paths on
  ``www.sothebysrealty.com`` return HTTP 202 empty CloudFront/WAF responses.
- ``app.sir.com/curacaosir`` is an office/app shell with no listing catalog HTML.

Browser automation and WAF bypass are prohibited. Keep this adapter fail-closed
until an approved public route or partner feed/API is confirmed.
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
    "verdict": "BLOCKED",
    "recon_dates": ["2026-07-17", "2026-07-20"],
    "affiliate_domain": "curacaosothebysrealty.com",
    "affiliate_tls": (
        "CERTIFICATE_VERIFY_FAILED; presented CN=*.hostingplatform.com; "
        "expired 2022-09-12"
    ),
    "affiliate_http_redirect": "http://www.sothebysrealty.com/curacaosir/eng",
    "robots": "https://www.sothebysrealty.com/robots.txt -> HTTP 202",
    "office": "https://www.sothebysrealty.com/curacaosir/eng -> HTTP 202",
    "search": "https://www.sothebysrealty.com/eng/sales/curacao-cu -> HTTP 202",
    "country": "https://www.sothebysrealty.com/eng/sales/cr-cuw -> HTTP 202",
    "sitemap": "https://www.sothebysrealty.com/sitemap.xml -> HTTP 202",
    "app_sir_office": (
        "https://app.sir.com/curacaosir -> HTTP 200 office/app shell; "
        "no listing catalog HTML"
    ),
    "interpretation": (
        "No legitimate complete public catalog route; network WAF/challenge "
        "plus broken affiliate TLS"
    ),
    "browser_automation": False,
    "next": "official affiliate feed/export or Anywhere partner API with written approval",
}


class SothebysCuracaoAdapter(DirectSourceAdapter):
    """Blocked pending approved public route or partner feed."""

    source_key = SOURCE_KEY
    name = SOURCE_KEY
    version = "0.1.2"
    domains = frozenset(
        {
            "sothebysrealty.com",
            "www.sothebysrealty.com",
            "curacaosothebysrealty.com",
            "www.curacaosothebysrealty.com",
            "app.sir.com",
        }
    )

    def parse_listing_html(
        self, html: str, *, listing_url: str, raw_sha256: str
    ) -> AdapterListingSnapshot:
        raise NotImplementedError(
            "Sotheby's Curaçao is recon-only (BLOCKED: WAF/TLS). No browser automation."
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
                "Recon-only BLOCKED: affiliate TLS broken; network HTTP 202/WAF; "
                "app.sir.com shell has no catalog. No browser automation."
            ),
            metadata={
                "dry_run": dry_run,
                "max_items": max_items,
                "recon": RECON_NOTES,
                "browser_automation": False,
                "complete_catalog": False,
            },
        ), []
