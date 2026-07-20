"""Automatic enrichment application policy (v3, exception-based).

The model may recommend auto_apply; the application makes the final decision.
Human review is exception-based: only genuine human decisions (source
conflicts, title/description disagreement, neighbourhood signal conflicts,
high-value ambiguous fields, new-attribute taxonomy review, moderate
confidence on material search/display fields) reach needs_attention.
Everything else is either auto-applied (allowed, evidenced, grounded, above
the field's confidence bar, no conflict, no negation, doesn't overwrite a
protected source field) or rejected outright with no operational attention
required (unsupported, duplicated, forbidden, malformed, noisy, generic
unhelpful, too-low-confidence, already represented by stronger source data,
or a partial-word/encoding artifact).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from merkado_labs.enrichment.evidence import ground_evidence
from merkado_labs.enrichment.fields import (
    ATTRIBUTE_DISPLAY_LABELS,
    FORBIDDEN_AI_FIELDS,
    PROTECTED_SOURCE_STRUCTURED_FIELDS,
    is_allowed_ai_field,
    is_forbidden_field,
    normalize_attribute_key,
)
from merkado_labs.enrichment.neighbourhood import is_generic_neighbourhood
from merkado_labs.enrichment.values import (
    AiValue,
    AutoApplyStatus,
    ConflictStatus,
    SourceValue,
    ValueType,
    resolve_effective_value,
)

POLICY_VERSION = "enrichment_policy_v3"


class ReasonCode:
    """Machine-readable reason codes attached to every policy decision.

    Plain string constants (not a StrEnum) so previously stored decisions
    keep matching literal reason strings after this module evolves.
    """

    FORBIDDEN_FIELD = "forbidden_field"
    UNKNOWN_ATTRIBUTE_FLEXIBLE_BAG = "unknown_attribute_flexible_bag"
    UNKNOWN_OR_EMPTY_VALUE = "unknown_or_empty_value"
    MISSING_OR_WEAK_EVIDENCE = "missing_or_weak_evidence"
    EVIDENCE_NOT_GROUNDED = "evidence_not_grounded"
    EVIDENCE_GROUNDING = "evidence_grounding"
    TERRACE_VARIANT_NEEDS_ATTENTION = "terrace_variant_needs_attention"
    MODEL_CONFLICT_INDICATOR = "model_conflict_indicator"
    PARKING_SPACES_NOT_INTEGER = "parking_spaces_not_integer"
    PARKING_SPACES_OUT_OF_BOUNDS = "parking_spaces_out_of_bounds"
    CONFIDENCE_TOO_LOW = "confidence_too_low"
    CONFIDENCE_MODERATE_NEEDS_ATTENTION = "confidence_moderate_needs_attention"
    CONFIDENCE_BELOW_FIELD_AUTO_APPLY_THRESHOLD = (
        "confidence_below_field_auto_apply_threshold"
    )
    EFFECTIVE_RESOLVER_CONFLICT = "effective_resolver_conflict"
    HIGH_CONFIDENCE_EVIDENCE_BACKED = "high_confidence_evidence_backed"
    ALREADY_REPRESENTED_BY_SOURCE = "already_represented_by_source"
    ALREADY_REPRESENTED_BY_MAP = "already_represented_by_map"


# Configurable thresholds — not magic numbers sprinkled in call sites.
# Below NEEDS_ATTENTION_CONFIDENCE_THRESHOLD there is nothing a human could
# usefully review — it is simply rejected as too-low-confidence noise.
AUTO_APPLY_CONFIDENCE_THRESHOLD = 0.85
NEEDS_ATTENTION_CONFIDENCE_THRESHOLD = 0.55
MIN_EVIDENCE_SNIPPET_LENGTH = 8
MAX_PARKING_SPACES = 20

# Field-specific auto-apply confidence bars. Amenities auto-apply at the
# default 0.85 with grounding; higher-value/ambiguous fields need a higher
# bar, and neighbourhood is set above 1.0 so it can never auto-apply — it
# always resolves to needs_attention or rejection, never a silent overwrite.
FIELD_AUTO_APPLY_THRESHOLDS: dict[str, float] = {
    "neighbourhood_candidate": 1.01,
    "property_type": 0.95,
}


@dataclass(frozen=True)
class FieldDecision:
    key: str
    proposed_value: Any
    value_type: ValueType
    confidence: float | None
    evidence_snippet: str | None
    evidence_source: str | None
    extraction_reason: str | None
    classification: str
    conflict: bool
    model_recommended_action: str
    final_status: AutoApplyStatus
    conflict_status: ConflictStatus
    reasons: tuple[str, ...]
    previous_effective: Any = None
    resulting_effective: Any = None
    display_label: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "display_label": self.display_label
            or ATTRIBUTE_DISPLAY_LABELS.get(self.key, self.key.replace("_", " ").title()),
            "proposed_value": self.proposed_value,
            "value_type": self.value_type.value,
            "confidence": self.confidence,
            "evidence_snippet": self.evidence_snippet,
            "evidence_source": self.evidence_source,
            "extraction_reason": self.extraction_reason,
            "classification": self.classification,
            "conflict": self.conflict,
            "model_recommended_action": self.model_recommended_action,
            "final_status": self.final_status.value,
            "conflict_status": self.conflict_status.value,
            "reasons": list(self.reasons),
            "previous_effective": self.previous_effective,
            "resulting_effective": self.resulting_effective,
        }


@dataclass
class PolicyEvaluation:
    decisions: list[FieldDecision] = field(default_factory=list)

    @property
    def auto_applied(self) -> list[FieldDecision]:
        return [d for d in self.decisions if d.final_status == AutoApplyStatus.AUTO_APPLIED]

    @property
    def needs_attention(self) -> list[FieldDecision]:
        return [d for d in self.decisions if d.final_status == AutoApplyStatus.NEEDS_ATTENTION]

    @property
    def rejected(self) -> list[FieldDecision]:
        return [d for d in self.decisions if d.final_status == AutoApplyStatus.REJECTED]

    def as_dict(self) -> dict[str, Any]:
        return {
            "auto_applied_count": len(self.auto_applied),
            "needs_attention_count": len(self.needs_attention),
            "rejected_count": len(self.rejected),
            "decisions": [d.as_dict() for d in self.decisions],
        }


def _tri_state_to_bool(value: Any) -> Any:
    if value == "present":
        return True
    if value == "explicitly_absent":
        return False
    if value == "unknown":
        return None
    return value


def _infer_value_type(key: str, value: Any) -> ValueType:
    if key == "parking_spaces" or isinstance(value, (int, float)):
        return ValueType.NUMBER
    if isinstance(value, bool) or value in {"present", "explicitly_absent", "unknown"}:
        return ValueType.BOOLEAN
    if isinstance(value, list):
        return ValueType.LIST
    return ValueType.TEXT


def _evidence_ok(snippet: str | None) -> bool:
    if not snippet or not str(snippet).strip():
        return False
    text = str(snippet).strip()
    if len(text) < MIN_EVIDENCE_SNIPPET_LENGTH:
        return False
    weak = {"yes", "no", "true", "false", "pool", "nice", "beautiful", "luxury"}
    return text.lower() not in weak


def _build_source_corpus(source_values: dict[str, Any]) -> str:
    parts = [
        source_values.get("title"),
        source_values.get("source_description"),
        source_values.get("cleaned_listing_text"),
        source_values.get("description"),
        source_values.get("source_text"),
    ]
    features = source_values.get("existing_structured_features")
    if isinstance(features, (list, tuple)):
        parts.extend(str(item) for item in features)
    elif isinstance(features, dict):
        parts.append(str(features))
    return "\n".join(str(part) for part in parts if part)


def _source_conflict(
    key: str,
    proposed: Any,
    source_values: dict[str, Any],
) -> ConflictStatus | None:
    if key in FORBIDDEN_AI_FIELDS or is_forbidden_field(key):
        return ConflictStatus.FORBIDDEN

    if key in {"bedrooms", "bathrooms"} and source_values.get(key) is not None:
        try:
            if proposed is not None and float(proposed) != float(source_values[key]):
                return ConflictStatus.SOURCE_CONFLICT
        except (TypeError, ValueError):
            return ConflictStatus.SOURCE_CONFLICT

    if key == "neighbourhood_candidate":
        source_nb = (
            source_values.get("source_neighbourhood_text")
            or source_values.get("location_text")
            or ""
        )
        source_nb_l = str(source_nb).strip().lower()
        proposed_l = str(proposed or "").strip().lower()
        if is_generic_neighbourhood(proposed_l):
            return ConflictStatus.AMBIGUOUS
        if (
            source_nb_l
            and proposed_l
            and not _neighbourhood_names_equivalent(source_nb_l, proposed_l)
        ):
            # Explicit dedicated source location wins; true disagreements need
            # human attention. Equivalent / already-represented names are
            # rejected earlier via already_represented_by_source.
            if source_values.get("location_explicit"):
                return ConflictStatus.SOURCE_CONFLICT
        title_nb = str(source_values.get("title_location_mention") or "").strip().lower()
        desc_nb = str(source_values.get("description_location_mention") or "").strip().lower()
        if title_nb and desc_nb and title_nb != desc_nb:
            return ConflictStatus.TITLE_DESCRIPTION_CONFLICT

    structured = source_values.get(key)
    if (
        key in PROTECTED_SOURCE_STRUCTURED_FIELDS
        and structured is not None
        and structured != ""
        and proposed is not None
        and str(structured).strip().lower() != str(proposed).strip().lower()
    ):
        return ConflictStatus.SOURCE_CONFLICT
    return None


def _validate_bounds(key: str, value: Any) -> str | None:
    if key == "parking_spaces":
        try:
            n = int(value)
        except (TypeError, ValueError):
            return "parking_spaces_not_integer"
        if n < 0 or n > MAX_PARKING_SPACES:
            return "parking_spaces_out_of_bounds"
    return None


def _strip_island_suffix(value: str) -> str:
    text = value.strip().casefold()
    for suffix in (
        " curaçao",
        " curacao",
        ", curaçao",
        ", curacao",
        " curaçao island",
        " curacao island",
    ):
        if text.endswith(suffix):
            return text[: -len(suffix)].strip(" ,")
    return text


def _neighbourhood_names_equivalent(left: str | None, right: str | None) -> bool:
    """True when names match after trimming island-level suffixes."""

    a = _strip_island_suffix(str(left or ""))
    b = _strip_island_suffix(str(right or ""))
    if not a or not b:
        return False
    if a == b:
        return True
    return a in b or b in a


def _map_neighbourhood_name(source_values: dict[str, Any]) -> str | None:
    eff = source_values.get("effective_neighbourhood")
    if isinstance(eff, dict):
        name = eff.get("map_name")
        if name:
            return str(name)
    for key in ("inferred_neighbourhood_name", "map_neighbourhood_name"):
        value = source_values.get(key)
        if value:
            return str(value)
    return None


def _specific_source_neighbourhood(source_values: dict[str, Any]) -> str | None:
    for key in ("source_neighbourhood_text", "location_text", "dedicated_source_location"):
        value = source_values.get(key)
        if value and not is_generic_neighbourhood(str(value)):
            return str(value)
    eff = source_values.get("effective_neighbourhood")
    if isinstance(eff, dict):
        name = eff.get("source_name")
        if name and not is_generic_neighbourhood(str(name)):
            return str(name)
    return None


def decide_field(
    *,
    key: str,
    proposed_value: Any,
    confidence: float | None,
    evidence_snippet: str | None,
    evidence_source: str | None = None,
    extraction_reason: str | None = None,
    classification: str = "ai_extracted_from_source",
    conflict_indicator: bool = False,
    model_recommended_action: str = "needs_attention",
    source_values: dict[str, Any] | None = None,
    previous_effective: Any = None,
    source_text: str | None = None,
) -> FieldDecision:
    """Application-side final decision for one proposed field/attribute."""

    source_values = source_values or {}
    normalized_key = normalize_attribute_key(key)
    value_type = _infer_value_type(normalized_key, proposed_value)
    coerced = _tri_state_to_bool(proposed_value)
    reasons: list[str] = []
    corpus = source_text if source_text is not None else _build_source_corpus(source_values)

    if is_forbidden_field(normalized_key) or normalized_key in FORBIDDEN_AI_FIELDS:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.FORBIDDEN,
            reasons=("forbidden_field",),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    if not is_allowed_ai_field(normalized_key):
        # Unsupported keys stay in the flexible audit bag but are rejected from
        # the operational attention queue. Recurring candidates surface via the
        # attribute-frequency report, not as per-listing review noise.
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=conflict_indicator,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.UNSUPPORTED,
            reasons=(ReasonCode.UNKNOWN_ATTRIBUTE_FLEXIBLE_BAG, "unsupported_rejected"),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                normalized_key, normalized_key.replace("_", " ").title()
            ),
        )

    if coerced is None or coerced == "" or coerced == "unknown":
        return FieldDecision(
            key=normalized_key,
            proposed_value=None,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=False,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.SKIPPED,
            conflict_status=ConflictStatus.NONE,
            reasons=("unknown_or_empty_value",),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    if not _evidence_ok(evidence_snippet):
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.WEAK_EVIDENCE,
            reasons=("missing_or_weak_evidence",),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    grounding = ground_evidence(
        key=normalized_key,
        evidence_snippet=evidence_snippet,
        source_text=corpus,
    )
    if grounding.normalization_warning:
        reasons.append(grounding.normalization_warning)
    if not grounding.ok_for_attention and not grounding.ok_for_auto_apply:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.WEAK_EVIDENCE,
            reasons=tuple(["evidence_not_grounded", grounding.reason, *reasons]),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )
    if grounding.ok_for_attention and not grounding.ok_for_auto_apply:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=False,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.NEEDS_ATTENTION,
            conflict_status=ConflictStatus.AMBIGUOUS,
            reasons=tuple(["evidence_grounding", grounding.reason, *reasons]),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )
    reasons.append(grounding.reason)

    if normalized_key == "neighbourhood_candidate":
        specific_source = _specific_source_neighbourhood(source_values)
        if specific_source and _neighbourhood_names_equivalent(
            specific_source, str(coerced)
        ):
            return FieldDecision(
                key=normalized_key,
                proposed_value=coerced,
                value_type=value_type,
                confidence=confidence,
                evidence_snippet=evidence_snippet,
                evidence_source=evidence_source,
                extraction_reason=extraction_reason,
                classification=classification,
                conflict=False,
                model_recommended_action=model_recommended_action,
                final_status=AutoApplyStatus.REJECTED,
                conflict_status=ConflictStatus.NONE,
                reasons=(ReasonCode.ALREADY_REPRESENTED_BY_SOURCE,),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                    normalized_key, normalized_key
                ),
            )
        map_nb = _map_neighbourhood_name(source_values)
        if (
            map_nb
            and not is_generic_neighbourhood(map_nb)
            and (
                not specific_source
                or _neighbourhood_names_equivalent(map_nb, str(coerced))
            )
        ):
            # Map already supplies (or duplicates) the neighbourhood; AI
            # candidates stay in the audit bag but must not flood attention.
            # When AI matches the map name, treat as duplicate even if a
            # specific source neighbourhood also exists.
            return FieldDecision(
                key=normalized_key,
                proposed_value=coerced,
                value_type=value_type,
                confidence=confidence,
                evidence_snippet=evidence_snippet,
                evidence_source=evidence_source,
                extraction_reason=extraction_reason,
                classification=classification,
                conflict=False,
                model_recommended_action=model_recommended_action,
                final_status=AutoApplyStatus.REJECTED,
                conflict_status=ConflictStatus.NONE,
                reasons=(ReasonCode.ALREADY_REPRESENTED_BY_MAP,),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                    normalized_key, normalized_key
                ),
            )

    conflict = _source_conflict(normalized_key, coerced, source_values)
    if conflict is not None:
        status = (
            AutoApplyStatus.REJECTED
            if conflict == ConflictStatus.FORBIDDEN
            else AutoApplyStatus.NEEDS_ATTENTION
        )
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=status,
            conflict_status=conflict,
            reasons=(conflict.value,),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    if conflict_indicator:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.NEEDS_ATTENTION,
            conflict_status=ConflictStatus.AMBIGUOUS,
            reasons=("model_conflict_indicator",),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    bounds_error = _validate_bounds(normalized_key, coerced)
    if bounds_error:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.OUT_OF_BOUNDS,
            reasons=(bounds_error,),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Below the attention bar there is nothing for a human to usefully
    # decide — reject as too-low-confidence noise instead of queuing it.
    if confidence is None or confidence < NEEDS_ATTENTION_CONFIDENCE_THRESHOLD:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=False,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.WEAK_EVIDENCE,
            reasons=(ReasonCode.CONFIDENCE_TOO_LOW,),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Field-specific bar: amenities default to AUTO_APPLY_CONFIDENCE_THRESHOLD
    # (0.85); higher-value/ambiguous fields (neighbourhood, property_type)
    # require more, and neighbourhood's bar is set above 1.0 so it can never
    # auto-apply.
    auto_apply_threshold = FIELD_AUTO_APPLY_THRESHOLDS.get(
        normalized_key, AUTO_APPLY_CONFIDENCE_THRESHOLD
    )
    if confidence < auto_apply_threshold:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=False,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.NEEDS_ATTENTION,
            conflict_status=ConflictStatus.NONE,
            reasons=(
                ReasonCode.CONFIDENCE_BELOW_FIELD_AUTO_APPLY_THRESHOLD
                if normalized_key in FIELD_AUTO_APPLY_THRESHOLDS
                else ReasonCode.CONFIDENCE_MODERATE_NEEDS_ATTENTION,
            ),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Build effective via layered resolver (source still wins).
    source_val = None
    if normalized_key in source_values and source_values[normalized_key] is not None:
        source_val = SourceValue(key=normalized_key, value=source_values[normalized_key])
    ai_val = AiValue(
        key=normalized_key,
        value=coerced,
        value_type=value_type,
        confidence=confidence,
        evidence_snippet=evidence_snippet,
        evidence_source=evidence_source,
        extraction_reason=extraction_reason,
        classification=classification,
        conflict=False,
        recommended_action="auto_apply",
    )
    effective = resolve_effective_value(
        key=normalized_key,
        value_type=value_type,
        source=source_val,
        ai=ai_val,
        allow_ai=True,
    )
    if effective.conflict_status != ConflictStatus.NONE:
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence,
            evidence_snippet=evidence_snippet,
            evidence_source=evidence_source,
            extraction_reason=extraction_reason,
            classification=classification,
            conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.NEEDS_ATTENTION,
            conflict_status=effective.conflict_status,
            reasons=("effective_resolver_conflict",),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    reasons.append("high_confidence_evidence_backed")
    return FieldDecision(
        key=normalized_key,
        proposed_value=coerced,
        value_type=value_type,
        confidence=confidence,
        evidence_snippet=evidence_snippet,
        evidence_source=evidence_source,
        extraction_reason=extraction_reason,
        classification=classification,
        conflict=False,
        model_recommended_action=model_recommended_action,
        final_status=AutoApplyStatus.AUTO_APPLIED,
        conflict_status=ConflictStatus.NONE,
        reasons=tuple(reasons),
        previous_effective=previous_effective,
        resulting_effective=coerced,
        display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
    )


def evaluate_proposal_attributes(
    attributes: list[dict[str, Any]],
    *,
    source_values: dict[str, Any] | None = None,
    previous_effective: dict[str, Any] | None = None,
    source_text: str | None = None,
) -> PolicyEvaluation:
    """Evaluate a list of structured attribute proposals from the model."""

    previous_effective = previous_effective or {}
    source_values = source_values or {}
    corpus = source_text if source_text is not None else _build_source_corpus(source_values)
    evaluation = PolicyEvaluation()
    for item in attributes:
        key = str(item.get("key") or item.get("attribute") or "")
        if not key:
            continue
        decision = decide_field(
            key=key,
            proposed_value=item.get("value"),
            confidence=item.get("confidence"),
            evidence_snippet=item.get("evidence_snippet") or item.get("evidence"),
            evidence_source=item.get("evidence_source"),
            extraction_reason=item.get("extraction_reason") or item.get("reason"),
            classification=str(
                item.get("classification") or "ai_extracted_from_source"
            ),
            conflict_indicator=bool(item.get("conflict")),
            model_recommended_action=str(
                item.get("recommended_action") or "needs_attention"
            ),
            source_values=source_values,
            previous_effective=previous_effective.get(normalize_attribute_key(key)),
            source_text=corpus,
        )
        evaluation.decisions.append(decision)
    return evaluation
