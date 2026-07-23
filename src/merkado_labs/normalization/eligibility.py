"""Public eligibility rules for property listings."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from merkado_labs.scrapers.contracts import (
    ListingLifecycleStatus,
    PublicEligibilityReason,
)


@dataclass(frozen=True)
class EligibilityInput:
    """Inputs required to decide public browse eligibility."""

    status: str
    original_price: Decimal | None
    source_enabled: bool
    source_adapter_status: str | None
    source_url: str | None
    has_critical_parser_error: bool = False
    has_source_attribution: bool = True
    listing_origin: str = "scraped"
    title: str | None = None
    real_estate_type: str | None = None
    listing_type: str | None = None
    primary_image_url: str | None = None
    contact_method: str | None = None
    contact_value: str | None = None


def evaluate_public_eligibility(
    *,
    status: str,
    original_price: Decimal | None,
    source_enabled: bool,
    source_url: str | None,
    has_critical_parser_error: bool = False,
    source_adapter_status: str | None = None,
    has_source_attribution: bool = True,
    listing_origin: str = "scraped",
    title: str | None = None,
    real_estate_type: str | None = None,
    listing_type: str | None = None,
    primary_image_url: str | None = None,
    contact_method: str | None = None,
    contact_value: str | None = None,
) -> tuple[bool, PublicEligibilityReason]:
    """Return whether a listing may appear in public browse queries.

    Benchmark XCG may be pending (e.g. EUR rate unavailable). A pending
    benchmark does not block eligibility when the original positive price and
    other public rules are satisfied; UI must still show the indicative copy.
    Retired or disabled sources are never eligible for scraped rows.

    Manual/native Labs admin listings never require a scraper source URL and
    must not be evaluated with source-absence attribution rules.
    """

    origin = (listing_origin or "scraped").strip().lower()
    if origin == "manual":
        if status != ListingLifecycleStatus.ACTIVE:
            return False, "not_active"
        if original_price is None:
            return False, "missing_price"
        if original_price <= 0:
            return False, "non_positive_price"
        if not title or not title.strip():
            return False, "missing_required_fields"
        if not real_estate_type or not real_estate_type.strip():
            return False, "missing_required_fields"
        if listing_type not in {"sale", "rent"}:
            return False, "missing_required_fields"
        if not primary_image_url or not primary_image_url.strip():
            return False, "missing_image"
        if not contact_method or not contact_method.strip():
            return False, "missing_contact"
        if not contact_value or not contact_value.strip():
            return False, "missing_contact"
        return True, "eligible"

    if has_critical_parser_error:
        return False, "parser_error"
    if not source_enabled or source_adapter_status == "retired":
        return False, "source_disabled"
    if not source_url or not has_source_attribution:
        return False, "missing_attribution"
    if status != ListingLifecycleStatus.ACTIVE:
        return False, "not_active"
    if original_price is None:
        return False, "missing_price"
    if original_price <= 0:
        return False, "non_positive_price"
    return True, "eligible"


def recompute_public_eligibility(row: EligibilityInput) -> tuple[bool, PublicEligibilityReason]:
    """Deterministic recompute helper for import pipelines and admin tools."""

    return evaluate_public_eligibility(
        status=row.status,
        original_price=row.original_price,
        source_enabled=row.source_enabled,
        source_url=row.source_url,
        has_critical_parser_error=row.has_critical_parser_error,
        source_adapter_status=row.source_adapter_status,
        has_source_attribution=row.has_source_attribution,
        listing_origin=row.listing_origin,
        title=row.title,
        real_estate_type=row.real_estate_type,
        listing_type=row.listing_type,
        primary_image_url=row.primary_image_url,
        contact_method=row.contact_method,
        contact_value=row.contact_value,
    )
