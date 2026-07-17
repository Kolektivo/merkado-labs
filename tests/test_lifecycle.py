"""Tests for public eligibility and lifecycle safety."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.contracts import (
    ActivityEventType,
    AdapterListingSnapshot,
    ListingLifecycleStatus,
    MoneyAmount,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.lifecycle import (
    ListingLifecycleState,
    compare_complete_success_snapshots,
)


def test_public_eligibility_requires_active_positive_price() -> None:
    ok, reason = evaluate_public_eligibility(
        status="active",
        original_price=Decimal("100"),
        source_enabled=True,
        source_url="https://example.com/listing",
    )
    assert ok and reason == "eligible"

    bad, reason = evaluate_public_eligibility(
        status="active",
        original_price=None,
        source_enabled=True,
        source_url="https://example.com/listing",
    )
    assert not bad and reason == "missing_price"

    sold, reason = evaluate_public_eligibility(
        status="sold",
        original_price=Decimal("100"),
        source_enabled=True,
        source_url="https://example.com/listing",
    )
    assert not sold and reason == "not_active"


def _run(outcome: SourceRunOutcome) -> SourceRunRecord:
    now = datetime(2026, 7, 16, tzinfo=UTC)
    return SourceRunRecord(
        source_key="remax_curacao",
        adapter_name="remax_curacao",
        adapter_version="0.2.0",
        started_at=now,
        completed_at=now,
        outcome=outcome,
        discovered_count=1,
        parsed_count=1,
    )


def _snapshot(
    external_id: str,
    *,
    price: Decimal | None = Decimal("100"),
    lifecycle: ListingLifecycleStatus = ListingLifecycleStatus.ACTIVE,
    source_status: str | None = None,
) -> AdapterListingSnapshot:
    now = datetime(2026, 7, 16, tzinfo=UTC)
    money = MoneyAmount(amount=price, currency="USD") if price is not None else None
    if source_status is None:
        if lifecycle == ListingLifecycleStatus.SOLD:
            source_status = "sold"
        elif lifecycle == ListingLifecycleStatus.INACTIVE:
            source_status = "rented"
        else:
            source_status = "available"
    return AdapterListingSnapshot(
        source_key="remax_curacao",
        external_id=external_id,
        source_url=f"https://www.realestate-curacao.com/{external_id}",
        observed_at=now,
        adapter_name="remax_curacao",
        adapter_version="0.2.0",
        raw_payload={},
        raw_sha256="a" * 64,
        original_price=money,
        lifecycle_hint=lifecycle,
        source_status=source_status,
    )


def test_failed_run_cannot_create_removals() -> None:
    previous = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.ACTIVE,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=None,
            sold_at=None,
            removed_at=None,
        )
    }
    try:
        compare_complete_success_snapshots(
            previous=previous,
            current_snapshots={},
            run=_run(SourceRunOutcome.FAILURE),
        )
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_missing_then_removed_and_explicit_sold() -> None:
    previous = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.ACTIVE,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=None,
            sold_at=None,
            removed_at=None,
            consecutive_absences=0,
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    missing = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={},
        run=_run(SourceRunOutcome.SUCCESS),
        removal_threshold=2,
    )
    types = {t.event_type for t in missing}
    assert ActivityEventType.MISSING_FROM_SOURCE in types
    assert ActivityEventType.REMOVED_FROM_SOURCE not in types

    previous_missing = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.MISSING,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=datetime(2026, 7, 10, tzinfo=UTC),
            sold_at=None,
            removed_at=None,
            consecutive_absences=1,
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    removed = compare_complete_success_snapshots(
        previous=previous_missing,
        current_snapshots={},
        run=_run(SourceRunOutcome.SUCCESS),
        removal_threshold=2,
    )
    assert any(t.event_type == ActivityEventType.REMOVED_FROM_SOURCE for t in removed)

    sold_events = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={"hs1": _snapshot("hs1", lifecycle=ListingLifecycleStatus.SOLD)},
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert any(t.event_type == ActivityEventType.SOURCE_MARKED_SOLD for t in sold_events)


def test_relisted_after_missing() -> None:
    previous = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.MISSING,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=datetime(2026, 7, 10, tzinfo=UTC),
            sold_at=None,
            removed_at=None,
            consecutive_absences=1,
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    events = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={"hs1": _snapshot("hs1")},
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert any(t.event_type == ActivityEventType.RELISTED for t in events)


def test_first_seen_on_new_listing() -> None:
    events = compare_complete_success_snapshots(
        previous={},
        current_snapshots={"hs9": _snapshot("hs9")},
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert any(t.event_type == ActivityEventType.FIRST_SEEN for t in events)
    # freeze sanity: replace works on snapshots
    assert replace(_snapshot("hs9"), title="x").title == "x"


def test_first_seen_preserves_sold_and_inactive_hints() -> None:
    sold = compare_complete_success_snapshots(
        previous={},
        current_snapshots={"hs9": _snapshot("hs9", lifecycle=ListingLifecycleStatus.SOLD)},
        run=_run(SourceRunOutcome.SUCCESS),
    )
    first_sold = next(t for t in sold if t.event_type == ActivityEventType.FIRST_SEEN)
    assert first_sold.new_status == ListingLifecycleStatus.SOLD
    assert any(t.event_type == ActivityEventType.SOURCE_MARKED_SOLD for t in sold)

    rented = compare_complete_success_snapshots(
        previous={},
        current_snapshots={
            "hr9": _snapshot("hr9", lifecycle=ListingLifecycleStatus.INACTIVE)
        },
        run=_run(SourceRunOutcome.SUCCESS),
    )
    first_rented = next(t for t in rented if t.event_type == ActivityEventType.FIRST_SEEN)
    assert first_rented.new_status == ListingLifecycleStatus.INACTIVE
    assert any(t.event_type == ActivityEventType.SOURCE_MARKED_RENTED for t in rented)


def test_rented_and_under_contract_transitions_are_idempotent() -> None:
    previous = {
        "hr1": ListingLifecycleState(
            external_id="hr1",
            status=ListingLifecycleStatus.ACTIVE,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=None,
            sold_at=None,
            removed_at=None,
            source_listing_status="Immediately",
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    rented = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={
            "hr1": _snapshot(
                "hr1",
                lifecycle=ListingLifecycleStatus.INACTIVE,
                source_status="rented",
            )
        },
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert sum(
        1 for t in rented if t.event_type == ActivityEventType.SOURCE_MARKED_RENTED
    ) == 1

    already_rented = {
        "hr1": ListingLifecycleState(
            external_id="hr1",
            status=ListingLifecycleStatus.INACTIVE,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=None,
            sold_at=None,
            removed_at=None,
            source_listing_status="rented",
            first_observed_rented_at=datetime(2026, 7, 1, tzinfo=UTC),
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    again = compare_complete_success_snapshots(
        previous=already_rented,
        current_snapshots={
            "hr1": _snapshot(
                "hr1",
                lifecycle=ListingLifecycleStatus.INACTIVE,
                source_status="rented",
            )
        },
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert not any(
        t.event_type == ActivityEventType.SOURCE_MARKED_RENTED for t in again
    )

    under = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={
            "hr1": _snapshot(
                "hr1",
                lifecycle=ListingLifecycleStatus.ACTIVE,
                source_status="under_contract",
            )
        },
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert any(
        t.event_type == ActivityEventType.SOURCE_MARKED_UNDER_CONTRACT for t in under
    )


def test_description_change_emits_event() -> None:
    previous = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.ACTIVE,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=None,
            sold_at=None,
            removed_at=None,
            source_listing_status="available",
            source_description_checksum="a" * 64,
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    snap = replace(_snapshot("hs1"), source_description_checksum="b" * 64)
    events = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={"hs1": snap},
        run=_run(SourceRunOutcome.SUCCESS),
    )
    assert any(
        t.event_type == ActivityEventType.SOURCE_DESCRIPTION_CHANGED for t in events
    )


def test_relisted_uses_current_lifecycle_hint() -> None:
    previous = {
        "hs1": ListingLifecycleState(
            external_id="hs1",
            status=ListingLifecycleStatus.MISSING,
            first_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            last_successfully_seen_at=datetime(2026, 7, 1, tzinfo=UTC),
            missing_since=datetime(2026, 7, 10, tzinfo=UTC),
            sold_at=None,
            removed_at=None,
            consecutive_absences=1,
            original_price=Decimal("100"),
            original_currency="USD",
        )
    }
    events = compare_complete_success_snapshots(
        previous=previous,
        current_snapshots={"hs1": _snapshot("hs1", lifecycle=ListingLifecycleStatus.SOLD)},
        run=_run(SourceRunOutcome.SUCCESS),
    )
    relisted = next(t for t in events if t.event_type == ActivityEventType.RELISTED)
    assert relisted.new_status == ListingLifecycleStatus.SOLD
