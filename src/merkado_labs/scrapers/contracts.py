"""Source-neutral scraper and adapter contracts for Merkado Labs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal, Protocol


class SourceRunOutcome(StrEnum):
    """Outcome of one adapter run.

    Only ``success`` with ``complete_catalog=true`` may drive missing/removal.
    Bounded or incomplete scope must be ``partial`` (or ``failure``).
    """

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILURE = "failure"


class ListingLifecycleStatus(StrEnum):
    """Canonical listing lifecycle states for Labs and public eligibility.

    Source-specific labels (rented, under contract, for sale, …) stay on
    ``source_listing_status`` and must not be silently remapped across
    canonical states (e.g. rented↛sold, under_contract↛sold, inactive↛removed).
    """

    ACTIVE = "active"
    SOLD = "sold"
    MISSING = "missing"
    REMOVED = "removed"
    INACTIVE = "inactive"
    UNKNOWN = "unknown"


class ConversionMethod(StrEnum):
    """How an XCG benchmark amount was derived."""

    IDENTITY = "identity"
    LEGACY_1_TO_1 = "legacy_1_to_1"
    USD_FIXED_PEG = "usd_fixed_peg"
    EUR_API = "eur_api"
    # Source-published official ANG/XCG (or other) amount — never Merkado-inferred.
    SOURCE_OFFICIAL_CONVERSION = "source_official_conversion"


SOURCE_OFFICIAL_PROVENANCE = "source_official_conversion"


class ActivityEventType(StrEnum):
    """Immutable Passport / listing activity event types."""

    FIRST_SEEN = "first_seen"
    SOURCE_LISTED = "source_listed"
    PRICE_CHANGED = "price_changed"
    CURRENCY_CHANGED = "currency_changed"
    BENCHMARK_RECALCULATED = "benchmark_recalculated"
    SOURCE_MARKED_SOLD = "source_marked_sold"
    SOURCE_MARKED_RENTED = "source_marked_rented"
    SOURCE_MARKED_UNDER_CONTRACT = "source_marked_under_contract"
    SOURCE_RETURNED_ACTIVE = "source_returned_active"
    MISSING_FROM_SOURCE = "missing_from_source"
    REMOVED_FROM_SOURCE = "removed_from_source"
    RELISTED = "relisted"
    SOURCE_ATTRIBUTION_CHANGED = "source_attribution_changed"
    MATERIAL_FIELD_CHANGED = "material_field_changed"
    SOURCE_DESCRIPTION_CHANGED = "source_description_changed"
    # AI enrichment audit events (require migration 20260717180000 before insert)
    AI_ENRICHMENT_STARTED = "ai_enrichment_started"
    AI_ENRICHMENT_COMPLETED = "ai_enrichment_completed"
    AI_ENRICHMENT_FAILED = "ai_enrichment_failed"
    AI_ENRICHMENT_SKIPPED = "ai_enrichment_skipped"
    AI_ENRICHMENT_AUTO_APPLIED = "ai_enrichment_auto_applied"
    AI_ENRICHMENT_NEEDS_ATTENTION = "ai_enrichment_needs_attention"
    MANUAL_OVERRIDE = "manual_override"


class DerivationType(StrEnum):
    SOURCE_FACT = "source_fact"
    SYSTEM_CALCULATED = "system_calculated"
    INFERRED = "inferred"


@dataclass(frozen=True)
class FieldProvenance:
    """Evidence for one extracted field."""

    field_name: str
    raw_value: str | None
    normalized_value: Any
    extraction_method: str
    evidence_selector: str | None = None
    evidence_snippet: str | None = None
    confidence: float | None = None
    inferred: bool = False
    inference_reason: str | None = None


@dataclass(frozen=True)
class MoneyAmount:
    """Original source money before benchmark conversion."""

    amount: Decimal
    currency: str
    evidence: str | None = None
    inferred: bool = False
    inference_reason: str | None = None


@dataclass(frozen=True)
class OfficialAlternatePrice:
    """Source-published alternate currency amount (not Merkado FX).

    ``provenance`` must remain ``source_official_conversion``. Never invent
    these from Merkado/ECB rates.
    """

    amount: Decimal
    currency: str
    provenance: str = SOURCE_OFFICIAL_PROVENANCE
    evidence: str | None = None
    source_label: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "amount": str(self.amount),
            "currency": self.currency,
            "provenance": self.provenance,
            "evidence": self.evidence,
            "source_label": self.source_label,
        }


@dataclass(frozen=True)
class BenchmarkPrice:
    """XCG benchmark with conversion provenance."""

    amount_xcg: Decimal | None
    conversion_method: ConversionMethod | None
    conversion_rate: Decimal | None
    conversion_provider: str | None
    conversion_rate_at: datetime | None
    pending: bool = False
    notes: str | None = None
    provenance: dict[str, Any] | None = None


@dataclass(frozen=True)
class AdapterListingSnapshot:
    """Normalized output of one direct-source listing observation.

    ``description`` remains the source description for backward compatibility.
    AI summaries/descriptions must never be stored on this contract.
    """

    source_key: str
    external_id: str
    source_url: str
    observed_at: datetime
    adapter_name: str
    adapter_version: str
    raw_payload: dict[str, Any]
    raw_sha256: str
    title: str | None = None
    listing_type: str | None = None
    property_type: str | None = None
    source_status: str | None = None
    lifecycle_hint: ListingLifecycleStatus | None = None
    original_price: MoneyAmount | None = None
    official_alternate_prices: tuple[OfficialAlternatePrice, ...] = ()
    source_listed_at: datetime | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    floor_area_m2: Decimal | None = None
    lot_area_value: Decimal | None = None
    lot_area_unit: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    neighbourhood_text: str | None = None
    location_text: str | None = None
    public_address_text: str | None = None
    primary_image_url: str | None = None
    image_urls: tuple[str, ...] = ()
    description: str | None = None
    source_description: str | None = None
    source_description_html: str | None = None
    source_description_checksum: str | None = None
    cleaned_listing_text: str | None = None
    http_status: int | None = None
    content_type: str | None = None
    evidence_storage_path: str | None = None
    evidence_storage_bucket: str | None = None
    structured_evidence: dict[str, Any] = field(default_factory=dict)
    amenities: tuple[dict[str, Any], ...] = ()
    fields: tuple[FieldProvenance, ...] = ()
    warnings: tuple[str, ...] = ()
    parser_errors: tuple[str, ...] = ()

    @property
    def has_positive_price(self) -> bool:
        return self.original_price is not None and self.original_price.amount > 0

    def effective_source_description(self) -> str | None:
        return self.source_description or self.description


@dataclass(frozen=True)
class SourceRunRecord:
    """Health record for one adapter execution."""

    source_key: str
    adapter_name: str
    adapter_version: str
    started_at: datetime
    completed_at: datetime | None
    outcome: SourceRunOutcome
    discovered_count: int = 0
    parsed_count: int = 0
    imported_count: int = 0
    updated_count: int = 0
    excluded_no_price_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    snapshot_checksum: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_complete_success(self) -> bool:
        """True only for a finished full-catalog success with no scope caps.

        Defense in depth: even if an adapter mislabels a bounded run as
        ``success``, ``complete_catalog`` must be explicitly true and no
        ``max_items`` / ``max_pages`` / ``bounded`` flag may be set.
        """

        if self.outcome != SourceRunOutcome.SUCCESS or self.completed_at is None:
            return False
        meta = self.metadata or {}
        if meta.get("complete_catalog") is not True:
            return False
        if meta.get("bounded") is True:
            return False
        if meta.get("max_items") is not None or meta.get("max_pages") is not None:
            return False
        if meta.get("truncated") is True:
            return False
        return True


def classify_run_outcome(
    *,
    parsed_count: int,
    target_count: int,
    error_count: int,
    complete_catalog: bool,
    bounded: bool = False,
    truncated: bool = False,
    max_items: int | None = None,
    max_pages: int | None = None,
    failed_fetches: int = 0,
    parser_failures: int = 0,
    early_termination: bool = False,
) -> SourceRunOutcome:
    """Source-neutral run outcome classifier.

    ``success`` is reserved for full configured scope with no caps and no
    relevant failures. Any limit, subset, failed fetch, parser failure, early
    stop, or incomplete catalog proof yields ``partial`` (or ``failure`` when
    nothing usable was produced).
    """

    capped = (
        bounded
        or truncated
        or max_items is not None
        or max_pages is not None
        or not complete_catalog
        or early_termination
    )
    problems = error_count + failed_fetches + parser_failures
    incomplete_targets = target_count > 0 and parsed_count < target_count

    if parsed_count == 0 and (target_count > 0 or problems > 0 or capped):
        return SourceRunOutcome.FAILURE
    if problems > 0 or incomplete_targets or capped:
        return SourceRunOutcome.PARTIAL if parsed_count > 0 else SourceRunOutcome.FAILURE
    return SourceRunOutcome.SUCCESS


class EurRateProvider(Protocol):
    """Injectable EUR→XCG rate provider. Tests must not call live APIs."""

    def get_eur_to_xcg_rate(self) -> tuple[Decimal, str, datetime]:
        """Return (eur_to_xcg_rate, provider_id, observation_datetime)."""


APPROVED_SOURCE_KEYS: tuple[str, ...] = (
    "keller_williams_curacao",
    "sothebys_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)

SOURCE_DISPLAY_NAMES: dict[str, str] = {
    "keller_williams_curacao": "Keller Williams Curaçao",
    "sothebys_curacao": "Sotheby's International Realty",
    "remax_curacao": "RE/MAX",
    "moret_real_estate": "Moret Real Estate",
    "monumentenzorg_curacao": "Monumentenzorg Curaçao",
}

PublicEligibilityReason = Literal[
    "eligible",
    "missing_price",
    "non_positive_price",
    "not_active",
    "source_disabled",
    "missing_attribution",
    "parser_error",
]
