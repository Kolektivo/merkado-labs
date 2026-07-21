"""Additive presentation classification for listing activity timelines.

Does not delete immutable events. Classification may be stored on
``presentation_*`` columns (forward writes / optional backfill) or computed
at read-time when those columns are null.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

# Event types that represent genuine seller / source activity by default.
PRIMARY_EVENT_TYPES = frozenset(
    {
        "first_seen",
        "source_listed",
        "price_changed",
        "currency_changed",
        "source_marked_sold",
        "source_marked_rented",
        "source_marked_under_contract",
        "source_returned_active",
        "source_description_changed",
        "missing_from_source",
        "removed_from_source",
        "relisted",
        "source_attribution_changed",
        "material_field_changed",
    }
)

# Always secondary/suppressed in the default seller-activity timeline.
RATE_ONLY_TYPES = frozenset({"benchmark_recalculated"})

ENRICHMENT_TYPES = frozenset(
    {
        "ai_enrichment_started",
        "ai_enrichment_completed",
        "ai_enrichment_failed",
        "ai_enrichment_skipped",
        "ai_enrichment_auto_applied",
        "ai_enrichment_needs_attention",
        "enrichment_completed",
    }
)

OPS_NOISE_TYPES = frozenset(
    {
        "manual_override",
        "source_refresh_completed",
    }
)

POLICY_REVALIDATION_MARKERS = (
    "policy_revalidation",
    "zero_cost_reeval",
    "reeval_stored_proposals",
    "policy_rematerialization",
)


@dataclass(frozen=True)
class PresentationDecision:
    presentation_class: str  # primary | secondary | suppressed | grouped
    suppressed_reason: str | None = None
    presentation_metadata: dict[str, Any] | None = None
    visible_in_default: bool = True


def _notes_text(event: Mapping[str, Any]) -> str:
    notes = event.get("notes") or event.get("notesText") or ""
    return str(notes).casefold()


def _event_type(event: Mapping[str, Any]) -> str:
    return str(event.get("event_type") or event.get("eventType") or "").strip()


def _amount_currency_key(value: Any) -> str | None:
    if not isinstance(value, Mapping):
        return None
    amount = value.get("amount")
    currency = value.get("currency")
    if amount is None and currency is None:
        return None
    return f"{amount}|{currency}"


def classify_activity_event(
    event: Mapping[str, Any],
    *,
    previous_same_type: Mapping[str, Any] | None = None,
) -> PresentationDecision:
    """Classify one activity event for the default presentation timeline."""

    # Prefer stored classification when present.
    stored = event.get("presentation_class") or event.get("presentationClass")
    if stored:
        reason = event.get("suppressed_reason") or event.get("suppressedReason")
        meta = event.get("presentation_metadata") or event.get("presentationMetadata")
        visible = str(stored) in {"primary", "secondary"}
        return PresentationDecision(
            presentation_class=str(stored),
            suppressed_reason=str(reason) if reason else None,
            presentation_metadata=dict(meta) if isinstance(meta, Mapping) else None,
            visible_in_default=visible,
        )

    event_type = _event_type(event)
    notes = _notes_text(event)
    meta: dict[str, Any] = {}

    if event_type in RATE_ONLY_TYPES:
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason="benchmark_rate_only",
            presentation_metadata={"event_type": event_type},
            visible_in_default=False,
        )

    if event_type in ENRICHMENT_TYPES:
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason="enrichment_only",
            presentation_metadata={"event_type": event_type},
            visible_in_default=False,
        )

    if event_type in OPS_NOISE_TYPES:
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason="ops_noise",
            presentation_metadata={"event_type": event_type},
            visible_in_default=False,
        )

    if any(marker in notes for marker in POLICY_REVALIDATION_MARKERS):
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason="policy_revalidation",
            presentation_metadata={"event_type": event_type},
            visible_in_default=False,
        )

    # Dual-writer duplicate: identical price/currency change shortly after another.
    if (
        previous_same_type is not None
        and event_type in {"price_changed", "currency_changed"}
        and _amount_currency_key(event.get("previous_value") or event.get("previousValue"))
        == _amount_currency_key(
            previous_same_type.get("previous_value")
            or previous_same_type.get("previousValue")
        )
        and _amount_currency_key(event.get("new_value") or event.get("newValue"))
        == _amount_currency_key(
            previous_same_type.get("new_value") or previous_same_type.get("newValue")
        )
    ):
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason="dual_writer_duplicate",
            presentation_metadata={
                "event_type": event_type,
                "duplicate_of": previous_same_type.get("id"),
            },
            visible_in_default=False,
        )

    # Tiny RE/MAX display FX jitter (±1 on asking amount) — keep event, flag it.
    if event_type == "price_changed":
        prev = event.get("previous_value") or event.get("previousValue") or {}
        new = event.get("new_value") or event.get("newValue") or {}
        try:
            if (
                isinstance(prev, Mapping)
                and isinstance(new, Mapping)
                and prev.get("currency") == new.get("currency")
                and abs(float(prev.get("amount")) - float(new.get("amount"))) <= 1.0
            ):
                meta["suspected_display_fx_jitter"] = True
                return PresentationDecision(
                    presentation_class="secondary",
                    suppressed_reason="suspected_display_fx_jitter",
                    presentation_metadata=meta,
                    visible_in_default=True,
                )
        except (TypeError, ValueError):
            pass

    if event_type in PRIMARY_EVENT_TYPES:
        return PresentationDecision(
            presentation_class="primary",
            presentation_metadata=meta or None,
            visible_in_default=True,
        )

    return PresentationDecision(
        presentation_class="secondary",
        suppressed_reason="unclassified_secondary",
        presentation_metadata={"event_type": event_type},
        visible_in_default=True,
    )


def filter_default_timeline(
    events: Sequence[Mapping[str, Any]],
    *,
    include_secondary: bool = True,
) -> list[Mapping[str, Any]]:
    """Return events visible in the default seller/source activity timeline.

    Events are expected newest-first (dashboard order). Duplicate detection
    looks at the chronologically previous same-type event (older).
    """

    # Work oldest→newest for duplicate detection, then restore input order.
    chronological = list(reversed(events))
    last_by_type: dict[str, Mapping[str, Any]] = {}
    kept_ids: set[str] = set()
    for event in chronological:
        decision = classify_activity_event(
            event,
            previous_same_type=last_by_type.get(_event_type(event)),
        )
        last_by_type[_event_type(event)] = event
        if not decision.visible_in_default:
            continue
        if decision.presentation_class == "secondary" and not include_secondary:
            continue
        event_id = str(event.get("id") or "")
        if event_id:
            kept_ids.add(event_id)
        else:
            kept_ids.add(str(id(event)))

    result: list[Mapping[str, Any]] = []
    for event in events:
        event_id = str(event.get("id") or "") or str(id(event))
        if event_id in kept_ids:
            result.append(event)
    return result


def dry_run_presentation_counts(
    events: Iterable[Mapping[str, Any]],
) -> dict[str, int]:
    """Count presentation outcomes without mutating storage."""

    events_list = list(events)
    chronological = list(reversed(events_list))
    last_by_type: dict[str, Mapping[str, Any]] = {}
    counts: dict[str, int] = {
        "total": 0,
        "primary": 0,
        "secondary": 0,
        "suppressed": 0,
        "grouped": 0,
        "visible_default": 0,
        "benchmark_rate_only": 0,
        "enrichment_only": 0,
        "dual_writer_duplicate": 0,
        "policy_revalidation": 0,
        "ops_noise": 0,
        "suspected_display_fx_jitter": 0,
    }
    for event in chronological:
        decision = classify_activity_event(
            event,
            previous_same_type=last_by_type.get(_event_type(event)),
        )
        last_by_type[_event_type(event)] = event
        counts["total"] += 1
        counts[decision.presentation_class] = counts.get(decision.presentation_class, 0) + 1
        if decision.visible_in_default:
            counts["visible_default"] += 1
        if decision.suppressed_reason:
            key = decision.suppressed_reason
            counts[key] = counts.get(key, 0) + 1
    return counts
