"""Source / AI / effective value layers for property enrichment.

Source facts are immutable evidence. AI values never silently replace them.
Effective values follow priority: source → deterministic → high-confidence AI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ValueProvenance(StrEnum):
    SOURCE = "source"
    DETERMINISTIC = "deterministic"
    AI_EXTRACTED = "ai_extracted"
    GEOSPATIAL = "geospatial"
    MANUAL_OVERRIDE = "manual_override"
    EMPTY = "empty"


class ConflictStatus(StrEnum):
    NONE = "none"
    SOURCE_CONFLICT = "source_conflict"
    TITLE_DESCRIPTION_CONFLICT = "title_description_conflict"
    WEAK_EVIDENCE = "weak_evidence"
    AMBIGUOUS = "ambiguous"
    OUT_OF_BOUNDS = "out_of_bounds"
    FORBIDDEN = "forbidden"
    UNSUPPORTED = "unsupported"


class AutoApplyStatus(StrEnum):
    AUTO_APPLIED = "auto_applied"
    NEEDS_ATTENTION = "needs_attention"
    REJECTED = "rejected"
    REDUNDANT = "redundant"
    SKIPPED = "skipped"
    NOT_EVALUATED = "not_evaluated"


class ValueType(StrEnum):
    BOOLEAN = "boolean"
    NUMBER = "number"
    TEXT = "text"
    ENUM = "enum"
    LIST = "list"


@dataclass(frozen=True)
class ProvenanceRecord:
    kind: ValueProvenance
    evidence_snippet: str | None = None
    evidence_source: str | None = None
    confidence: float | None = None
    reason: str | None = None
    classification: str | None = None  # explicit | inferred | ai_extracted_from_source
    model: str | None = None
    run_id: str | None = None


@dataclass(frozen=True)
class SourceValue:
    """Directly extracted from the original listing website."""

    key: str
    value: Any
    value_type: ValueType = ValueType.TEXT
    evidence_snippet: str | None = None
    evidence_source: str = "source"


@dataclass(frozen=True)
class AiValue:
    """Extracted or normalized by AI from source evidence."""

    key: str
    value: Any
    value_type: ValueType
    confidence: float | None
    evidence_snippet: str | None
    evidence_source: str | None
    extraction_reason: str | None = None
    classification: str = "ai_extracted_from_source"
    conflict: bool = False
    recommended_action: str = "needs_attention"


@dataclass(frozen=True)
class EffectiveValue:
    """Value currently used by Labs / public preview."""

    key: str
    value: Any
    value_type: ValueType
    provenance: ProvenanceRecord
    source_value: Any = None
    ai_value: Any = None
    conflict_status: ConflictStatus = ConflictStatus.NONE
    auto_apply_status: AutoApplyStatus = AutoApplyStatus.NOT_EVALUATED


@dataclass
class LayeredAttribute:
    """Reusable property attribute spanning source, AI, and effective layers."""

    key: str
    display_label: str
    value_type: ValueType
    source_value: Any = None
    ai_value: Any = None
    effective_value: Any = None
    evidence: str | None = None
    confidence: float | None = None
    provenance: ValueProvenance = ValueProvenance.EMPTY
    conflict_status: ConflictStatus = ConflictStatus.NONE
    review_status: AutoApplyStatus = AutoApplyStatus.NOT_EVALUATED
    first_seen_at: str | None = None
    last_seen_at: str | None = None
    extras: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "display_label": self.display_label,
            "value_type": self.value_type.value,
            "source_value": self.source_value,
            "ai_value": self.ai_value,
            "effective_value": self.effective_value,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "provenance": self.provenance.value,
            "conflict_status": self.conflict_status.value,
            "review_status": self.review_status.value,
            "first_seen_at": self.first_seen_at,
            "last_seen_at": self.last_seen_at,
            **self.extras,
        }


def resolve_effective_value(
    *,
    key: str,
    value_type: ValueType,
    source: SourceValue | None,
    deterministic: Any = None,
    ai: AiValue | None,
    allow_ai: bool = True,
) -> EffectiveValue:
    """Pick the effective value without letting AI override source facts."""

    if source is not None and source.value is not None and source.value != "":
        conflict = ConflictStatus.NONE
        auto = AutoApplyStatus.NOT_EVALUATED
        if ai is not None and ai.value is not None and ai.value != source.value:
            conflict = ConflictStatus.SOURCE_CONFLICT
            auto = AutoApplyStatus.NEEDS_ATTENTION
        return EffectiveValue(
            key=key,
            value=source.value,
            value_type=value_type,
            provenance=ProvenanceRecord(
                kind=ValueProvenance.SOURCE,
                evidence_snippet=source.evidence_snippet,
                evidence_source=source.evidence_source,
                classification="explicit",
            ),
            source_value=source.value,
            ai_value=ai.value if ai else None,
            conflict_status=conflict,
            auto_apply_status=auto,
        )

    if deterministic is not None and deterministic != "":
        return EffectiveValue(
            key=key,
            value=deterministic,
            value_type=value_type,
            provenance=ProvenanceRecord(
                kind=ValueProvenance.DETERMINISTIC,
                classification="explicit",
            ),
            source_value=None,
            ai_value=ai.value if ai else None,
        )

    if (
        allow_ai
        and ai is not None
        and ai.value is not None
        and ai.value != ""
        and not ai.conflict
        and ai.evidence_snippet
        and ai.confidence is not None
    ):
        return EffectiveValue(
            key=key,
            value=ai.value,
            value_type=value_type,
            provenance=ProvenanceRecord(
                kind=ValueProvenance.AI_EXTRACTED,
                evidence_snippet=ai.evidence_snippet,
                evidence_source=ai.evidence_source,
                confidence=ai.confidence,
                reason=ai.extraction_reason,
                classification=ai.classification,
            ),
            source_value=None,
            ai_value=ai.value,
            auto_apply_status=AutoApplyStatus.AUTO_APPLIED,
        )

    return EffectiveValue(
        key=key,
        value=None,
        value_type=value_type,
        provenance=ProvenanceRecord(kind=ValueProvenance.EMPTY),
        source_value=None,
        ai_value=ai.value if ai else None,
    )
