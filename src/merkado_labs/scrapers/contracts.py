"""Source-neutral scraper and adapter contracts for Merkado Labs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal, Protocol


class SourceRunOutcome(StrEnum):
    """Outcome of one adapter run. Only success may drive removals."""

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILURE = "failure"


class ListingLifecycleStatus(StrEnum):
    """Canonical listing lifecycle states for Labs and public eligibility."""

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
        return self.outcome == SourceRunOutcome.SUCCESS and self.completed_at is not None


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
