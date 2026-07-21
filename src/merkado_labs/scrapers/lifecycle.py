"""Lifecycle comparison using only complete successful source runs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from merkado_labs.scrapers.contracts import (
    ActivityEventType,
    AdapterListingSnapshot,
    DerivationType,
    ListingLifecycleStatus,
    SourceRunRecord,
)


@dataclass(frozen=True)
class ListingLifecycleState:
    """Current lifecycle fields for one source listing."""

    external_id: str
    status: ListingLifecycleStatus
    first_seen_at: datetime
    last_seen_at: datetime
    last_successfully_seen_at: datetime | None
    missing_since: datetime | None
    sold_at: datetime | None
    removed_at: datetime | None
    consecutive_absences: int = 0
    original_price: Decimal | None = None
    original_currency: str | None = None
    source_listing_status: str | None = None
    first_observed_sold_at: datetime | None = None
    first_observed_rented_at: datetime | None = None
    first_observed_under_contract_at: datetime | None = None
    source_description_checksum: str | None = None


@dataclass(frozen=True)
class LifecycleTransition:
    """One proposed immutable activity event plus optional status change."""

    external_id: str
    event_type: ActivityEventType
    event_at: datetime
    previous_status: ListingLifecycleStatus | None
    new_status: ListingLifecycleStatus | None
    previous_value: dict | None
    new_value: dict | None
    derivation: DerivationType
    notes: str | None = None


def compare_complete_success_snapshots(
    *,
    previous: dict[str, ListingLifecycleState],
    current_snapshots: dict[str, AdapterListingSnapshot],
    run: SourceRunRecord,
    removal_threshold: int = 2,
) -> list[LifecycleTransition]:
    """Diff listings after a complete successful run.

    Failed or partial runs must not call this function for removal logic.
    """

    if not run.is_complete_success:
        raise ValueError(
            "Lifecycle absence transitions require a complete successful source run"
        )
    if removal_threshold < 1:
        raise ValueError("removal_threshold must be >= 1")

    event_at = run.completed_at or run.started_at
    transitions: list[LifecycleTransition] = []
    seen_ids = set(current_snapshots)

    for external_id, snapshot in current_snapshots.items():
        existing = previous.get(external_id)
        if existing is None:
            # Preserve parser lifecycle (sold/inactive/active); never force active.
            inferred_status = snapshot.lifecycle_hint or ListingLifecycleStatus.ACTIVE
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.FIRST_SEEN,
                    event_at=event_at,
                    previous_status=None,
                    new_status=inferred_status,
                    previous_value=None,
                    new_value={
                        "source_url": snapshot.source_url,
                        "status": inferred_status.value,
                        "source_status": snapshot.source_status,
                    },
                    derivation=DerivationType.SYSTEM_CALCULATED,
                )
            )
            if snapshot.source_listed_at is not None:
                transitions.append(
                    LifecycleTransition(
                        external_id=external_id,
                        event_type=ActivityEventType.SOURCE_LISTED,
                        event_at=snapshot.source_listed_at,
                        previous_status=None,
                        new_status=None,
                        previous_value=None,
                        new_value={"source_listed_at": snapshot.source_listed_at.isoformat()},
                        derivation=DerivationType.SOURCE_FACT,
                    )
                )
            # First observation may already be sold/rented/under_contract.
            if snapshot.lifecycle_hint == ListingLifecycleStatus.SOLD:
                transitions.append(
                    LifecycleTransition(
                        external_id=external_id,
                        event_type=ActivityEventType.SOURCE_MARKED_SOLD,
                        event_at=event_at,
                        previous_status=None,
                        new_status=ListingLifecycleStatus.SOLD,
                        previous_value=None,
                        new_value={
                            "status": ListingLifecycleStatus.SOLD.value,
                            "first_observed_label": "First observed as sold by Merkado",
                        },
                        derivation=DerivationType.SOURCE_FACT,
                        notes=(
                            "Sold on first Merkado observation; not a transaction date"
                        ),
                    )
                )
            elif snapshot.source_status == "rented":
                transitions.append(
                    LifecycleTransition(
                        external_id=external_id,
                        event_type=ActivityEventType.SOURCE_MARKED_RENTED,
                        event_at=event_at,
                        previous_status=None,
                        new_status=ListingLifecycleStatus.INACTIVE,
                        previous_value=None,
                        new_value={
                            "status": ListingLifecycleStatus.INACTIVE.value,
                            "source_status": "rented",
                            "first_observed_label": (
                                "First observed as rented by Merkado"
                            ),
                        },
                        derivation=DerivationType.SOURCE_FACT,
                        notes=(
                            "Rented on first Merkado observation; "
                            "not a rental agreement date"
                        ),
                    )
                )
            elif snapshot.source_status == "under_contract":
                transitions.append(
                    LifecycleTransition(
                        external_id=external_id,
                        event_type=ActivityEventType.SOURCE_MARKED_UNDER_CONTRACT,
                        event_at=event_at,
                        previous_status=None,
                        new_status=ListingLifecycleStatus.ACTIVE,
                        previous_value=None,
                        new_value={
                            "status": ListingLifecycleStatus.ACTIVE.value,
                            "source_status": "under_contract",
                            "first_observed_label": (
                                "First observed as under contract by Merkado"
                            ),
                        },
                        derivation=DerivationType.SOURCE_FACT,
                        notes="Under contract on first Merkado observation",
                    )
                )
            continue

        if existing.status in {
            ListingLifecycleStatus.MISSING,
            ListingLifecycleStatus.REMOVED,
        }:
            # Relist restores visibility using the current snapshot hint, not always active.
            relist_status = snapshot.lifecycle_hint or ListingLifecycleStatus.ACTIVE
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.RELISTED,
                    event_at=event_at,
                    previous_status=existing.status,
                    new_status=relist_status,
                    previous_value={"status": existing.status.value},
                    new_value={"status": relist_status.value},
                    derivation=DerivationType.SYSTEM_CALCULATED,
                    notes="Listing reappeared in a complete successful snapshot",
                )
            )

        if (
            snapshot.lifecycle_hint == ListingLifecycleStatus.SOLD
            and existing.status != ListingLifecycleStatus.SOLD
        ):
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.SOURCE_MARKED_SOLD,
                    event_at=event_at,
                    previous_status=existing.status,
                    new_status=ListingLifecycleStatus.SOLD,
                    previous_value={"status": existing.status},
                    new_value={
                        "status": ListingLifecycleStatus.SOLD,
                        "first_observed_label": "First observed as sold by Merkado",
                    },
                    derivation=DerivationType.SOURCE_FACT,
                    notes=(
                        "Explicit source sold signal; event_at is first observed, "
                        "not transaction date"
                    ),
                )
            )

        if (
            snapshot.source_status == "rented"
            and existing.source_listing_status != "rented"
        ):
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.SOURCE_MARKED_RENTED,
                    event_at=event_at,
                    previous_status=existing.status,
                    new_status=ListingLifecycleStatus.INACTIVE,
                    previous_value={
                        "status": existing.status.value,
                        "source_listing_status": existing.source_listing_status,
                    },
                    new_value={
                        "status": ListingLifecycleStatus.INACTIVE.value,
                        "source_status": "rented",
                        "first_observed_label": "First observed as rented by Merkado",
                    },
                    derivation=DerivationType.SOURCE_FACT,
                    notes=(
                        "Explicit source rented signal; event_at is first observed, "
                        "not rental agreement date"
                    ),
                )
            )

        if (
            snapshot.source_status == "under_contract"
            and existing.source_listing_status != "under_contract"
        ):
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.SOURCE_MARKED_UNDER_CONTRACT,
                    event_at=event_at,
                    previous_status=existing.status,
                    new_status=ListingLifecycleStatus.ACTIVE,
                    previous_value={
                        "status": existing.status.value,
                        "source_listing_status": existing.source_listing_status,
                    },
                    new_value={
                        "status": ListingLifecycleStatus.ACTIVE.value,
                        "source_status": "under_contract",
                        "first_observed_label": (
                            "First observed as under contract by Merkado"
                        ),
                    },
                    derivation=DerivationType.SOURCE_FACT,
                    notes="Explicit under-contract banner/label",
                )
            )

        if (
            snapshot.lifecycle_hint == ListingLifecycleStatus.ACTIVE
            and snapshot.source_status
            not in {"under_contract", "rented", "sold"}
            and existing.source_listing_status
            in {"sold", "rented", "under_contract"}
        ):
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.SOURCE_RETURNED_ACTIVE,
                    event_at=event_at,
                    previous_status=existing.status,
                    new_status=ListingLifecycleStatus.ACTIVE,
                    previous_value={
                        "status": existing.status.value,
                        "source_listing_status": existing.source_listing_status,
                    },
                    new_value={
                        "status": ListingLifecycleStatus.ACTIVE.value,
                        "source_status": snapshot.source_status,
                    },
                    derivation=DerivationType.SOURCE_FACT,
                    notes=(
                        "Source listing observed as active again after "
                        "sold/rented/under_contract"
                    ),
                )
            )

        if (
            snapshot.source_description_checksum
            and existing.source_description_checksum
            and snapshot.source_description_checksum
            != existing.source_description_checksum
        ):
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.SOURCE_DESCRIPTION_CHANGED,
                    event_at=event_at,
                    previous_status=None,
                    new_status=None,
                    previous_value={
                        "source_description_checksum": existing.source_description_checksum
                    },
                    new_value={
                        "source_description_checksum": snapshot.source_description_checksum
                    },
                    derivation=DerivationType.SYSTEM_CALCULATED,
                    notes="Source description checksum changed",
                )
            )

        # Asking price / currency events are owned exclusively by import_pipeline
        # (observed_at timestamps + benchmark_recalculated semantics). Emitting
        # PRICE_CHANGED / CURRENCY_CHANGED here duplicated the same transition
        # at run.completed_at.

    for external_id, existing in previous.items():
        if external_id in seen_ids:
            continue
        if existing.status == ListingLifecycleStatus.SOLD:
            continue
        absences = existing.consecutive_absences + 1
        if absences == 1 and existing.status != ListingLifecycleStatus.MISSING:
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.MISSING_FROM_SOURCE,
                    event_at=event_at,
                    previous_status=existing.status,
                    new_status=ListingLifecycleStatus.MISSING,
                    previous_value={"status": existing.status},
                    new_value={
                        "status": ListingLifecycleStatus.MISSING,
                        "consecutive_absences": absences,
                    },
                    derivation=DerivationType.SYSTEM_CALCULATED,
                )
            )
        if absences >= removal_threshold and existing.status != ListingLifecycleStatus.REMOVED:
            transitions.append(
                LifecycleTransition(
                    external_id=external_id,
                    event_type=ActivityEventType.REMOVED_FROM_SOURCE,
                    event_at=event_at,
                    previous_status=ListingLifecycleStatus.MISSING
                    if absences > 1
                    else existing.status,
                    new_status=ListingLifecycleStatus.REMOVED,
                    previous_value={"consecutive_absences": absences - 1},
                    new_value={
                        "status": ListingLifecycleStatus.REMOVED,
                        "consecutive_absences": absences,
                        "removal_threshold": removal_threshold,
                    },
                    derivation=DerivationType.SYSTEM_CALCULATED,
                    notes="Absent from consecutive complete successful snapshots",
                )
            )

    return transitions
