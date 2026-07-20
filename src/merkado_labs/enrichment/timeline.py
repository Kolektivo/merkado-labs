"""Plain-language AI enrichment timeline event builders.

Event types require a forward-only migration to extend listing_activity_events.
Builders are pure; callers insert only after the migration is applied.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from merkado_labs.scrapers.contracts import ActivityEventType

# Proposed event type strings (must match migration check constraint once applied).
AI_ENRICHMENT_STARTED = "ai_enrichment_started"
AI_ENRICHMENT_COMPLETED = "ai_enrichment_completed"
AI_ENRICHMENT_FAILED = "ai_enrichment_failed"
AI_ENRICHMENT_SKIPPED = "ai_enrichment_skipped"
AI_ENRICHMENT_AUTO_APPLIED = "ai_enrichment_auto_applied"
AI_ENRICHMENT_NEEDS_ATTENTION = "ai_enrichment_needs_attention"
MANUAL_OVERRIDE = "manual_override"

PROPOSED_AI_EVENT_TYPES: frozenset[str] = frozenset(
    {
        AI_ENRICHMENT_STARTED,
        AI_ENRICHMENT_COMPLETED,
        AI_ENRICHMENT_FAILED,
        AI_ENRICHMENT_SKIPPED,
        AI_ENRICHMENT_AUTO_APPLIED,
        AI_ENRICHMENT_NEEDS_ATTENTION,
        MANUAL_OVERRIDE,
    }
)


def display_model_name(model: str) -> str:
    """Human-readable model label for timeline copy."""

    cleaned = (model or "").strip()
    if cleaned.lower() in {"gpt-5.6-terra", "gpt-5.6-terra-high"}:
        return "GPT-5.6 Terra"
    return cleaned or "unknown model"


@dataclass(frozen=True)
class TimelineEventDraft:
    event_type: str
    summary: str
    details: dict[str, Any]
    event_at: datetime

    def as_insert_row(
        self,
        *,
        property_listing_id: str,
        property_source_run_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            "property_listing_id": property_listing_id,
            "property_source_run_id": property_source_run_id,
            "event_type": self.event_type,
            "event_at": self.event_at.isoformat(),
            "summary": self.summary,
            "details": self.details,
        }


def build_enrichment_started_event(
    *,
    model: str,
    input_checksum: str,
    job_id: str | None = None,
    event_at: datetime | None = None,
) -> TimelineEventDraft:
    when = event_at or datetime.now(UTC)
    return TimelineEventDraft(
        event_type=AI_ENRICHMENT_STARTED,
        summary=f"AI enrichment started using {display_model_name(model)}.",
        details={
            "model": model,
            "input_checksum": input_checksum,
            "enrichment_job_id": job_id,
        },
        event_at=when,
    )


def build_enrichment_completed_event(
    *,
    model: str,
    fields_proposed: int,
    fields_auto_applied: int,
    fields_needs_attention: int,
    fields_rejected: int = 0,
    input_checksum: str | None = None,
    job_id: str | None = None,
    event_at: datetime | None = None,
) -> TimelineEventDraft:
    when = event_at or datetime.now(UTC)
    summary = (
        f"AI enrichment completed using {display_model_name(model)}. "
        f"{fields_proposed} fields were extracted, "
        f"{fields_auto_applied} applied automatically, "
        f"and {fields_needs_attention} need attention."
    )
    return TimelineEventDraft(
        event_type=AI_ENRICHMENT_COMPLETED,
        summary=summary,
        details={
            "model": model,
            "fields_proposed": fields_proposed,
            "fields_auto_applied": fields_auto_applied,
            "fields_needs_attention": fields_needs_attention,
            "fields_rejected": fields_rejected,
            "input_checksum": input_checksum,
            "enrichment_job_id": job_id,
        },
        event_at=when,
    )


def build_enrichment_failed_event(
    *,
    model: str,
    error_message: str | None,
    input_checksum: str | None = None,
    job_id: str | None = None,
    event_at: datetime | None = None,
) -> TimelineEventDraft:
    when = event_at or datetime.now(UTC)
    err = error_message or "unknown error"
    return TimelineEventDraft(
        event_type=AI_ENRICHMENT_FAILED,
        summary=f"AI enrichment failed using {display_model_name(model)}: {err}.",
        details={
            "model": model,
            "error_message": err,
            "input_checksum": input_checksum,
            "enrichment_job_id": job_id,
        },
        event_at=when,
    )


def build_enrichment_skipped_event(
    *,
    model: str,
    input_checksum: str,
    job_id: str | None = None,
    event_at: datetime | None = None,
) -> TimelineEventDraft:
    when = event_at or datetime.now(UTC)
    return TimelineEventDraft(
        event_type=AI_ENRICHMENT_SKIPPED,
        summary=(
            f"AI enrichment skipped because listing evidence was unchanged "
            f"({display_model_name(model)})."
        ),
        details={
            "model": model,
            "input_checksum": input_checksum,
            "reason": "unchanged_input_checksum",
            "enrichment_job_id": job_id,
        },
        event_at=when,
    )


def build_auto_applied_event(
    *,
    model: str,
    applied_keys: list[str],
    job_id: str | None = None,
    event_at: datetime | None = None,
) -> TimelineEventDraft | None:
    if not applied_keys:
        return None
    when = event_at or datetime.now(UTC)
    labels = ", ".join(applied_keys[:8])
    more = f" (+{len(applied_keys) - 8} more)" if len(applied_keys) > 8 else ""
    return TimelineEventDraft(
        event_type=AI_ENRICHMENT_AUTO_APPLIED,
        summary=(
            f"AI auto-applied {len(applied_keys)} field(s) using "
            f"{display_model_name(model)}: {labels}{more}."
        ),
        details={
            "model": model,
            "applied_keys": applied_keys,
            "enrichment_job_id": job_id,
        },
        event_at=when,
    )


def build_needs_attention_event(
    *,
    model: str,
    attention_keys: list[str],
    job_id: str | None = None,
    event_at: datetime | None = None,
) -> TimelineEventDraft | None:
    if not attention_keys:
        return None
    when = event_at or datetime.now(UTC)
    labels = ", ".join(attention_keys[:8])
    more = f" (+{len(attention_keys) - 8} more)" if len(attention_keys) > 8 else ""
    return TimelineEventDraft(
        event_type=AI_ENRICHMENT_NEEDS_ATTENTION,
        summary=(
            f"AI flagged {len(attention_keys)} field(s) for attention "
            f"({display_model_name(model)}): {labels}{more}."
        ),
        details={
            "model": model,
            "attention_keys": attention_keys,
            "enrichment_job_id": job_id,
        },
        event_at=when,
    )


def dedupe_event_drafts(
    drafts: list[TimelineEventDraft],
    *,
    existing_summaries: set[str] | None = None,
) -> list[TimelineEventDraft]:
    """Avoid duplicate timeline noise on retry for the same checksum/summary."""

    seen = set(existing_summaries or ())
    unique: list[TimelineEventDraft] = []
    for draft in drafts:
        fingerprint = f"{draft.event_type}:{draft.summary}"
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        unique.append(draft)
    return unique


def legacy_activity_event_types() -> set[str]:
    """Currently persisted ActivityEventType values (pre-migration)."""

    return {item.value for item in ActivityEventType}
