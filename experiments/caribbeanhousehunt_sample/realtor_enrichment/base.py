"""Reusable per-domain adapter interfaces for original-realtor enrichment."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

try:
    from .robots import RobotsDecision, check_robots
except ImportError:
    from robots import RobotsDecision, check_robots


@dataclass(frozen=True)
class EnrichmentField:
    """One factual field captured from an original realtor page."""

    name: str
    value: Any
    evidence_snippet: str | None = None


@dataclass(frozen=True)
class EnrichmentResult:
    """Outcome of one adapter attempt against an original listing URL."""

    domain: str
    listing_url: str
    adapter_name: str
    observed_at: str
    status: str
    robots: RobotsDecision
    fields: tuple[EnrichmentField, ...] = ()
    conflicts: tuple[dict[str, Any], ...] = ()
    notes: str = ""
    raw_evidence_sha256: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class DomainAdapter(ABC):
    """Base class for domain-specific original-listing adapters."""

    name: str = "base"
    domains: frozenset[str] = frozenset()

    def supports(self, listing_url: str) -> bool:
        hostname = (urlparse(listing_url).hostname or "").lower()
        if hostname in self.domains:
            return True
        if hostname.startswith("www.") and hostname[4:] in self.domains:
            return True
        bare = hostname.removeprefix("www.")
        return bare in self.domains or f"www.{bare}" in self.domains

    def evaluate_robots(self, listing_url: str) -> RobotsDecision:
        return check_robots(listing_url)

    @abstractmethod
    def enrich(
        self,
        listing_url: str,
        *,
        aggregator_fields: dict[str, Any] | None = None,
    ) -> EnrichmentResult:
        """Fetch and extract facts only when robots and adapter policy allow."""


class PolicyBlockedAdapter(DomainAdapter):
    """Default adapter used when no domain-specific extractor is registered."""

    name = "policy_review_required"
    domains = frozenset()

    def supports(self, listing_url: str) -> bool:  # noqa: ARG002
        return True

    def enrich(
        self,
        listing_url: str,
        *,
        aggregator_fields: dict[str, Any] | None = None,  # noqa: ARG002
    ) -> EnrichmentResult:
        robots = self.evaluate_robots(listing_url)
        domain = robots.domain or (urlparse(listing_url).hostname or "")
        if robots.can_fetch is False:
            status = "blocked_by_robots"
            notes = robots.notes
        elif robots.can_fetch is None:
            status = "robots_inconclusive"
            notes = (
                "robots.txt missing or unreadable. Enrichment skipped pending "
                "manual adapter review."
            )
        else:
            status = "adapter_not_implemented"
            notes = (
                "robots.txt allows this user agent path, but no factual extractor "
                "is registered for this domain yet."
            )
        return EnrichmentResult(
            domain=domain,
            listing_url=listing_url,
            adapter_name=self.name,
            observed_at=datetime.now(UTC).isoformat(),
            status=status,
            robots=robots,
            notes=notes,
        )


def select_adapter(listing_url: str, adapters: list[DomainAdapter]) -> DomainAdapter:
    """Pick the first matching domain adapter, else the policy fallback."""

    for adapter in adapters:
        if adapter.name != "policy_review_required" and adapter.supports(listing_url):
            return adapter
    return PolicyBlockedAdapter()


def detect_conflicts(
    aggregator_fields: dict[str, Any],
    enriched_fields: tuple[EnrichmentField, ...],
) -> tuple[dict[str, Any], ...]:
    """Record conflicts instead of silently overwriting aggregator values."""

    conflicts: list[dict[str, Any]] = []
    for field in enriched_fields:
        if field.name not in aggregator_fields:
            continue
        left = aggregator_fields.get(field.name)
        right = field.value
        if left in (None, "", [], {}) or right in (None, "", [], {}):
            continue
        if left != right:
            conflicts.append(
                {
                    "field_name": field.name,
                    "aggregator_value": left,
                    "original_source_value": right,
                    "resolution_status": "unresolved",
                }
            )
    return tuple(conflicts)
