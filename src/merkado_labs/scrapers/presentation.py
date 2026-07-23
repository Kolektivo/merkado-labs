"""Deterministic Passport activity presentation contract.

Shared semantics with dashboard ``activity-presentation.ts``. Does not delete
immutable events. Classification may be stored on ``presentation_*`` columns
or computed at read-time when those columns are null.

Reusable later for car Passports — keep helpers property-agnostic.
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
        # currency_changed retained in storage but never primary for Passport UI
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
        "submitted",
        "published",
        "unpublished",
        "marked_sold",
        "marked_rented",
        "republished",
    }
)

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
        "currency_changed",
    }
)

POLICY_REVALIDATION_MARKERS = (
    "policy_revalidation",
    "zero_cost_reeval",
    "reeval_stored_proposals",
    "policy_rematerialization",
    "system_repair",
)

XCG_EQUIVALENT = frozenset({"XCG", "ANG", "NAF"})
USD_TO_XCG = 1.79


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


def _money_value(value: Any) -> tuple[float, str] | None:
    if not isinstance(value, Mapping):
        return None
    amount_raw = value.get("amount")
    currency_raw = value.get("currency")
    if amount_raw is None or currency_raw is None:
        return None
    try:
        amount = float(amount_raw)
    except (TypeError, ValueError):
        return None
    currency = str(currency_raw).strip().upper()
    if not currency:
        return None
    return amount, currency


def _amount_currency_key(value: Any) -> str | None:
    money = _money_value(value)
    if money is None:
        if not isinstance(value, Mapping):
            return None
        amount = value.get("amount")
        currency = value.get("currency")
        if amount is None and currency is None:
            return None
        return f"{amount}|{currency}"
    amount, currency = money
    return f"{amount}|{currency}"


def to_normalized_xcg_amount(
    amount: float,
    currency: str,
    *,
    eur_to_xcg_rate: float | None = None,
) -> int | None:
    code = currency.strip().upper()
    if code in XCG_EQUIVALENT:
        return int(round(amount))
    if code == "USD":
        return int(round(amount * USD_TO_XCG))
    if code == "EUR":
        if eur_to_xcg_rate is None or eur_to_xcg_rate <= 0:
            return None
        return int(round(amount * eur_to_xcg_rate))
    return None


def _is_foreign_display_currency(currency: str) -> bool:
    return currency not in XCG_EQUIVALENT and currency != "USD"


def classify_activity_event(
    event: Mapping[str, Any],
    *,
    previous_same_type: Mapping[str, Any] | None = None,
    has_official_xcg_alternate: bool = False,
    stable_asking_currency: str | None = None,
    eur_to_xcg_rate: float | None = None,
    audience: str = "public",
) -> PresentationDecision:
    """Classify one activity event for the default presentation timeline."""

    event_type = _event_type(event)
    notes = _notes_text(event)
    meta: dict[str, Any] = {}

    if event_type == "currency_changed":
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason="currency_session_not_public",
            presentation_metadata={
                "event_type": event_type,
                "admin_review": audience == "admin",
            },
            visible_in_default=False,
        )

    if event_type == "price_changed":
        prev = event.get("previous_value") or event.get("previousValue") or {}
        new = event.get("new_value") or event.get("newValue") or {}
        prev_money = _money_value(prev)
        new_money = _money_value(new)
        try:
            jitter = (
                prev_money is not None
                and new_money is not None
                and prev_money[1] == new_money[1]
                and abs(prev_money[0] - new_money[0]) <= 1.0
            )
        except (TypeError, ValueError):
            jitter = False
        if (
            event.get("suppressed_reason") == "suspected_display_fx_jitter"
            or event.get("suppressedReason") == "suspected_display_fx_jitter"
            or jitter
        ):
            return PresentationDecision(
                presentation_class="suppressed",
                suppressed_reason="suspected_display_fx_jitter",
                presentation_metadata={"suspected_display_fx_jitter": True},
                visible_in_default=False,
            )
        if prev_money and new_money:
            if prev_money == new_money:
                return PresentationDecision(
                    presentation_class="suppressed",
                    suppressed_reason="identical_observation",
                    presentation_metadata={"event_type": event_type},
                    visible_in_default=False,
                )
            if prev_money[1] != new_money[1]:
                return PresentationDecision(
                    presentation_class="suppressed",
                    suppressed_reason="currency_session_switch",
                    presentation_metadata={
                        "event_type": event_type,
                        "previous_currency": prev_money[1],
                        "next_currency": new_money[1],
                        "admin_review": True,
                    },
                    visible_in_default=False,
                )
            stable = (stable_asking_currency or "").strip().upper()
            stable_is_xcg = stable in XCG_EQUIVALENT
            if _is_foreign_display_currency(prev_money[1]) and (
                has_official_xcg_alternate or stable_is_xcg
            ):
                return PresentationDecision(
                    presentation_class="suppressed",
                    suppressed_reason="non_anchor_display_observation",
                    presentation_metadata={
                        "event_type": event_type,
                        "currency": prev_money[1],
                        "stable_asking_currency": stable or None,
                        "admin_review": True,
                    },
                    visible_in_default=False,
                )
            prev_xcg = to_normalized_xcg_amount(
                prev_money[0], prev_money[1], eur_to_xcg_rate=eur_to_xcg_rate
            )
            next_xcg = to_normalized_xcg_amount(
                new_money[0], new_money[1], eur_to_xcg_rate=eur_to_xcg_rate
            )
            if prev_xcg is not None and next_xcg is not None and prev_xcg == next_xcg:
                return PresentationDecision(
                    presentation_class="suppressed",
                    suppressed_reason="same_normalized_xcg",
                    presentation_metadata={
                        "event_type": event_type,
                        "previous_xcg": prev_xcg,
                        "next_xcg": next_xcg,
                    },
                    visible_in_default=False,
                )
            if (
                audience == "public"
                and prev_money[1] == "EUR"
                and (prev_xcg is None or next_xcg is None)
            ):
                return PresentationDecision(
                    presentation_class="suppressed",
                    suppressed_reason="ambiguous_anchor",
                    presentation_metadata={
                        "event_type": event_type,
                        "admin_review": True,
                    },
                    visible_in_default=False,
                )

    if any(marker in notes for marker in POLICY_REVALIDATION_MARKERS):
        reason = "system_repair" if "system_repair" in notes else "policy_revalidation"
        return PresentationDecision(
            presentation_class="suppressed",
            suppressed_reason=reason,
            presentation_metadata={"event_type": event_type},
            visible_in_default=False,
        )

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
    has_official_xcg_alternate: bool = False,
    stable_asking_currency: str | None = None,
    eur_to_xcg_rate: float | None = None,
    audience: str = "public",
) -> list[Mapping[str, Any]]:
    """Return events visible in the default seller/source activity timeline.

    Events are expected newest-first (dashboard order). Duplicate detection
    looks at the chronologically previous same-type event (older). Keeps only
    the earliest ``first_seen``.
    """

    chronological = list(reversed(events))
    last_by_type: dict[str, Mapping[str, Any]] = {}
    kept_ids: set[str] = set()
    kept_first_seen = False
    for event in chronological:
        event_type = _event_type(event)
        if event_type in {"first_seen", "listing_first_seen"}:
            if kept_first_seen:
                continue
            decision = classify_activity_event(
                event,
                has_official_xcg_alternate=has_official_xcg_alternate,
                stable_asking_currency=stable_asking_currency,
                eur_to_xcg_rate=eur_to_xcg_rate,
                audience=audience,
            )
            if not decision.visible_in_default:
                continue
            if decision.presentation_class == "secondary" and not include_secondary:
                continue
            kept_first_seen = True
            event_id = str(event.get("id") or "") or str(id(event))
            kept_ids.add(event_id)
            last_by_type[event_type] = event
            continue

        decision = classify_activity_event(
            event,
            previous_same_type=last_by_type.get(event_type),
            has_official_xcg_alternate=has_official_xcg_alternate,
            stable_asking_currency=stable_asking_currency,
            eur_to_xcg_rate=eur_to_xcg_rate,
            audience=audience,
        )
        last_by_type[event_type] = event
        if not decision.visible_in_default:
            continue
        if decision.presentation_class == "secondary" and not include_secondary:
            continue
        event_id = str(event.get("id") or "") or str(id(event))
        kept_ids.add(event_id)

    result: list[Mapping[str, Any]] = []
    for event in events:
        event_id = str(event.get("id") or "") or str(id(event))
        if event_id in kept_ids:
            result.append(event)
    return result


# Stable alias for the reusable Passport contract.
build_passport_timeline = filter_default_timeline


def dry_run_presentation_counts(
    events: Iterable[Mapping[str, Any]],
    *,
    has_official_xcg_alternate: bool = False,
    stable_asking_currency: str | None = None,
    eur_to_xcg_rate: float | None = None,
    audience: str = "public",
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
        "system_repair": 0,
        "currency_session_not_public": 0,
        "currency_session_switch": 0,
        "non_anchor_display_observation": 0,
        "same_normalized_xcg": 0,
        "identical_observation": 0,
        "ambiguous_anchor": 0,
        "duplicate_first_seen": 0,
    }
    kept_first_seen = False
    for event in chronological:
        event_type = _event_type(event)
        counts["total"] += 1
        if event_type in {"first_seen", "listing_first_seen"}:
            if kept_first_seen:
                counts["suppressed"] += 1
                counts["duplicate_first_seen"] += 1
                continue
            kept_first_seen = True
        decision = classify_activity_event(
            event,
            previous_same_type=last_by_type.get(event_type),
            has_official_xcg_alternate=has_official_xcg_alternate,
            stable_asking_currency=stable_asking_currency,
            eur_to_xcg_rate=eur_to_xcg_rate,
            audience=audience,
        )
        last_by_type[event_type] = event
        counts[decision.presentation_class] = counts.get(decision.presentation_class, 0) + 1
        if decision.visible_in_default:
            counts["visible_default"] += 1
        if decision.suppressed_reason:
            key = decision.suppressed_reason
            counts[key] = counts.get(key, 0) + 1
    return counts
