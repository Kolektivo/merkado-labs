"""Base interfaces for direct property source adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from pathlib import Path
from urllib.parse import urlparse

from merkado_labs.scrapers.contracts import AdapterListingSnapshot, SourceRunRecord
from merkado_labs.scrapers.robots import RobotsDecision, check_robots


class DirectSourceAdapter(ABC):
    """One website → bounded listing snapshots."""

    source_key: str
    name: str
    version: str
    domains: frozenset[str] = frozenset()

    def supports(self, listing_url: str) -> bool:
        hostname = (urlparse(listing_url).hostname or "").lower()
        bare = hostname.removeprefix("www.")
        return bare in {d.removeprefix("www.") for d in self.domains} or hostname in self.domains

    def evaluate_robots(self, listing_url: str) -> RobotsDecision:
        return check_robots(listing_url)

    @abstractmethod
    def parse_listing_html(
        self,
        html: str,
        *,
        listing_url: str,
        raw_sha256: str,
    ) -> AdapterListingSnapshot:
        """Deterministic detail-page parse. No network I/O."""

    @abstractmethod
    def run_bounded(
        self,
        *,
        listing_urls: Sequence[str],
        cache_dir: Path,
        dry_run: bool = True,
        max_items: int = 5,
    ) -> tuple[SourceRunRecord, list[AdapterListingSnapshot]]:
        """Manual/bounded adapter execution. Scheduling stays disabled."""
