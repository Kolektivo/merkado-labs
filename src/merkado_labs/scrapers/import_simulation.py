"""No-write simulation of Labs import effects for a snapshot set."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from merkado_labs.normalization.currency import (
    is_manual_or_test_provider,
    to_benchmark_xcg,
)
from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    EurRateProvider,
    ListingLifecycleStatus,
    SourceRunRecord,
)
from merkado_labs.scrapers.import_pipeline import should_append_price_observation


@dataclass
class ImportSimulation:
    """Projected write effects without mutating the database."""

    new_listings: int = 0
    updated_listings: int = 0
    unchanged_listings: int = 0
    new_listing_observations: int = 0
    new_price_observations: int = 0
    first_seen_events: int = 0
    price_changed_events: int = 0
    currency_changed_events: int = 0
    benchmark_recalculated_events: int = 0
    source_marked_sold_events: int = 0
    no_price_exclusions: int = 0
    publicly_eligible: int = 0
    publicly_excluded: int = 0
    sold_count: int = 0
    rented_inactive_count: int = 0
    under_contract_count: int = 0
    parser_warning_listings: int = 0
    parser_error_listings: int = 0
    benchmark_pending_count: int = 0
    existing_test_rate_recalculations: int = 0
    notes: list[str] = field(default_factory=list)
    fx_quote: dict[str, Any] | None = None


def simulate_import(
    *,
    snapshots: list[AdapterListingSnapshot],
    existing_by_external_id: dict[str, dict[str, Any]],
    run: SourceRunRecord,
    eur_provider: EurRateProvider | None,
    source_enabled: bool = True,
    source_adapter_status: str = "manual",
) -> ImportSimulation:
    """Project counts for a later full import using the same decision rules."""

    result = ImportSimulation()
    if eur_provider is not None and hasattr(eur_provider, "get_eur_to_xcg_quote"):
        try:
            quote = eur_provider.get_eur_to_xcg_quote()  # type: ignore[attr-defined]
            result.fx_quote = quote.as_provenance()
        except Exception as error:  # noqa: BLE001
            result.notes.append(f"fx_quote_unavailable:{error}")

    seen_existing = set()
    for snapshot in snapshots:
        existing = existing_by_external_id.get(snapshot.external_id)
        is_new = existing is None
        if is_new:
            result.new_listings += 1
            result.first_seen_events += 1
            result.new_listing_observations += 1
        else:
            seen_existing.add(snapshot.external_id)
            result.updated_listings += 1
            # Same content snapshot id would be idempotent; assume new sha → new obs,
            # but identical re-parse of same HTML is still counted as attempt.
            result.new_listing_observations += 1

        if snapshot.warnings:
            result.parser_warning_listings += 1
        if snapshot.parser_errors:
            result.parser_error_listings += 1

        status = (
            snapshot.lifecycle_hint.value
            if snapshot.lifecycle_hint
            else ListingLifecycleStatus.ACTIVE.value
        )
        if status == "sold":
            result.sold_count += 1
        if status == "inactive" or snapshot.source_status == "rented":
            result.rented_inactive_count += 1
        if snapshot.source_status == "under_contract":
            result.under_contract_count += 1

        eligible, _reason = evaluate_public_eligibility(
            status=status,
            original_price=(
                snapshot.original_price.amount if snapshot.original_price else None
            ),
            source_enabled=source_enabled,
            source_url=snapshot.source_url,
            has_critical_parser_error=bool(snapshot.parser_errors),
            source_adapter_status=source_adapter_status,
            has_source_attribution=True,
        )
        if eligible:
            result.publicly_eligible += 1
        else:
            result.publicly_excluded += 1
        if snapshot.original_price is None or not snapshot.has_positive_price:
            result.no_price_exclusions += 1

        benchmark = None
        if snapshot.original_price is not None:
            benchmark = to_benchmark_xcg(snapshot.original_price, eur_provider=eur_provider)
            if benchmark.pending:
                result.benchmark_pending_count += 1

            should_append, price_changed, currency_changed = should_append_price_observation(
                is_new=is_new,
                previous_amount=existing.get("original_price") if existing else None,
                previous_currency=existing.get("original_currency") if existing else None,
                new_amount=float(snapshot.original_price.amount),
                new_currency=snapshot.original_price.currency,
            )
            if should_append:
                result.new_price_observations += 1
            if not is_new and price_changed:
                result.price_changed_events += 1
            if not is_new and currency_changed:
                result.currency_changed_events += 1

            if (
                not is_new
                and existing is not None
                and not price_changed
                and not currency_changed
                and benchmark is not None
                and not benchmark.pending
            ):
                prev_provider = existing.get("conversion_provider")
                prev_rate = existing.get("conversion_rate")
                new_rate = (
                    float(benchmark.conversion_rate)
                    if benchmark.conversion_rate is not None
                    else None
                )
                rate_changed = (
                    prev_rate is None
                    or new_rate is None
                    or abs(float(prev_rate) - float(new_rate)) > 1e-9
                )
                provider_changed = prev_provider != benchmark.conversion_provider
                if rate_changed or provider_changed:
                    result.benchmark_recalculated_events += 1
                    if is_manual_or_test_provider(str(prev_provider) if prev_provider else None):
                        result.existing_test_rate_recalculations += 1

            if (
                not is_new
                and existing is not None
                and snapshot.lifecycle_hint == ListingLifecycleStatus.SOLD
                and existing.get("status") != "sold"
            ):
                result.source_marked_sold_events += 1

    # Existing rows not in this catalog would only go missing on a complete success import.
    missing_candidates = set(existing_by_external_id) - {
        snap.external_id for snap in snapshots
    }
    if run.is_complete_success:
        result.notes.append(
            f"complete_success_would_consider_absence_for:{len(missing_candidates)}"
        )
    else:
        result.notes.append(
            "partial_or_dry_run_never_marks_missing_or_removed;"
            f"unseen_existing={len(missing_candidates)}"
        )
        result.unchanged_listings = len(missing_candidates)

    return result


def project_test_rate_recalculations(
    existing_rows: list[dict[str, Any]],
) -> dict[str, int]:
    """Count current sample rows that would get an ECB benchmark recalculation."""

    listings = 0
    for row in existing_rows:
        if row.get("original_currency") != "EUR":
            continue
        if not is_manual_or_test_provider(str(row.get("conversion_provider") or "")):
            continue
        if row.get("original_price") is None:
            continue
        listings += 1
    return {
        "listings_with_test_eur_benchmark": listings,
        "projected_benchmark_recalculated_events": listings,
        "projected_price_changed_events": 0,
        "immutable_price_observations_retained": True,
    }
