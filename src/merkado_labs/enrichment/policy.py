"""Automatic enrichment application policy (v4.1, exception-based).

The model may recommend auto_apply; the application makes the final decision.
Human review is exception-based: only genuine unresolved factual conflicts
reach needs_attention. Confidence-alone gaps, subjective marketing language,
Dutch/English synonym normalization, and property-type equivalence are handled
deterministically without creating operational review work.

Everything else is either auto-applied (allowed, evidenced, grounded, above
the field's confidence bar, no conflict, no negation, doesn't overwrite a
protected source field) or rejected quietly with no operational attention
required (unsupported, duplicated, forbidden, malformed, noisy, generic
unhelpful, too-low-confidence, subjective accessibility/marketing, already
represented by stronger source data, or a partial-word/encoding artifact).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from merkado_labs.enrichment.evidence import ground_evidence
from merkado_labs.enrichment.fields import (
    ATTRIBUTE_DISPLAY_LABELS,
    FORBIDDEN_AI_FIELDS,
    PROTECTED_AI_PROPOSAL_FIELDS,
    PROTECTED_SOURCE_STRUCTURED_FIELDS,
    is_allowed_ai_field,
    is_forbidden_field,
    normalize_attribute_key,
)
from merkado_labs.enrichment.neighbourhood import is_generic_neighbourhood
from merkado_labs.enrichment.normalization import (
    is_generic_property_type,
    is_subjective_accessibility,
    is_subjective_marketing_claim,
    normalize_property_type,
    normalize_proposed_value,
    property_types_equivalent,
)
from merkado_labs.enrichment.values import (
    AiValue,
    AutoApplyStatus,
    ConflictStatus,
    SourceValue,
    ValueType,
    resolve_effective_value,
)

POLICY_VERSION = "enrichment_policy_v4_1"


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
    REDUNDANT_SOURCE_VALUE = "redundant_source_value"
    REDUNDANT_MAP_VALUE = "redundant_map_value"
    REDUNDANT_DUPLICATE_PROPOSAL = "redundant_duplicate_proposal"
    PROTECTED_SOURCE_FIELD = "protected_source_field"
    GENERIC_NEIGHBOURHOOD = "generic_neighbourhood"
    NARRATIVE_INVENTS_PROTECTED_CLAIM = "narrative_invents_protected_claim"
    PROPERTY_TYPE_EQUIVALENT = "property_type_equivalent"
    PROPERTY_TYPE_REFINES_GENERIC_SOURCE = "property_type_refines_generic_source"
    PROPERTY_TYPE_SOURCE_WINS_QUIET = "property_type_source_wins_quiet"
    SUBJECTIVE_ACCESSIBILITY_REJECTED = "subjective_accessibility_rejected"
    SUBJECTIVE_MARKETING_REJECTED = "subjective_marketing_rejected"
    CONFIDENCE_BELOW_AUTO_APPLY_REJECTED = "confidence_below_auto_apply_rejected"
    SOURCE_NEGATION_CONFIRMS_FALSE = "source_negation_confirms_false"
    SOURCE_NEGATION_REJECTS_TRUE = "source_negation_rejects_true"
    SOURCE_TERRACE_FALSE_WINS = "source_terrace_false_wins"


# Configurable thresholds — not magic numbers sprinkled in call sites.
# Below NEEDS_ATTENTION_CONFIDENCE_THRESHOLD there is nothing a human could
# usefully review — it is simply rejected as too-low-confidence noise.
AUTO_APPLY_CONFIDENCE_THRESHOLD = 0.85
NEEDS_ATTENTION_CONFIDENCE_THRESHOLD = 0.55
MIN_EVIDENCE_SNIPPET_LENGTH = 8
MAX_PARKING_SPACES = 20

# Field-specific auto-apply confidence bars. Amenities auto-apply at the
# default 0.85 with grounding; higher-value/ambiguous fields need a higher
# bar.
FIELD_AUTO_APPLY_THRESHOLDS: dict[str, float] = {
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

    @property
    def redundant(self) -> list[FieldDecision]:
        return [d for d in self.decisions if d.final_status == AutoApplyStatus.REDUNDANT]

    def as_dict(self) -> dict[str, Any]:
        return {
            "auto_applied_count": len(self.auto_applied),
            "needs_attention_count": len(self.needs_attention),
            "rejected_count": len(self.rejected),
            "redundant_count": len(self.redundant),
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
    if isinstance(value, list):
        return ValueType.LIST
    if key == "parking_spaces" or isinstance(value, (int, float)):
        return ValueType.NUMBER
    if isinstance(value, bool) or value in {"present", "explicitly_absent", "unknown"}:
        return ValueType.BOOLEAN
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
        source_values.get("source_neighbourhood_text"),
        source_values.get("location_text"),
        source_values.get("dedicated_source_location"),
        source_values.get("inferred_neighbourhood_name"),
        source_values.get("map_neighbourhood_name"),
    ]
    features = source_values.get("existing_structured_features")
    if isinstance(features, (list, tuple)):
        parts.extend(str(item) for item in features)
    elif isinstance(features, dict):
        parts.append(str(features))
    return "\n".join(str(part) for part in parts if part)


def _narrative_has_protected_claim(
    value: Any, *, source_text: str | None = None
) -> bool:
    """Flag invented price/currency amounts — not ordinary sale/rent wording.

    Source listings routinely say \"for sale\", \"rented units\", etc. Those
    phrases are allowed when they also appear in the source corpus. Bare
    currency amounts or asking-price figures that are absent from source are
    still blocked.
    """

    import re

    text = str(value or "")
    corpus = str(source_text or "")
    text_l = text.lower()
    corpus_l = corpus.lower()

    amount_patterns = (
        r"(?:\$\s?\d[\d,]*(?:\.\d+)?)",
        r"(?:€\s?\d[\d,]*(?:\.\d+)?)",
        r"\b(?:usd|naf|ang|eur)\s*\d[\d,]*(?:\.\d+)?\b",
        r"\b\d[\d,]*(?:\.\d+)?\s*(?:usd|naf|ang|eur|dollars?|guilders?)\b",
    )
    for pattern in amount_patterns:
        for match in re.finditer(pattern, text_l, flags=re.IGNORECASE):
            snippet = match.group(0)
            if snippet and snippet not in corpus_l:
                # Also allow if digits appear near currency words in source.
                digits = re.sub(r"[^\d]", "", snippet)
                if digits and digits in re.sub(r"[^\d]", "", corpus_l):
                    continue
                return True

    # Status words are only blocked when narrative invents them vs source.
    for token in ("sold", "under offer", "available now"):
        if re.search(rf"\b{re.escape(token)}\b", text_l) and not re.search(
            rf"\b{re.escape(token)}\b", corpus_l
        ):
            return True
    return False


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
    ):
        if key == "property_type":
            if property_types_equivalent(structured, proposed):
                return None
            if is_generic_property_type(structured) and not is_generic_property_type(
                proposed
            ):
                # KW-style generic "residential" may be refined by evidenced AI.
                return None
        if str(structured).strip().lower() != str(proposed).strip().lower():
            if key == "property_type":
                source_norm = normalize_property_type(structured)
                proposed_norm = normalize_property_type(proposed)
                if source_norm and proposed_norm and source_norm != proposed_norm:
                    return ConflictStatus.SOURCE_CONFLICT
            else:
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
    proposed_value = normalize_proposed_value(normalized_key, proposed_value)
    value_type = _infer_value_type(normalized_key, proposed_value)
    coerced = _tri_state_to_bool(proposed_value)
    reasons: list[str] = []
    corpus = source_text if source_text is not None else _build_source_corpus(source_values)
    narrative_field = normalized_key in {
        "concise_summary",
        "display_overview",
        "display_layout",
        "display_location",
        "display_highlights",
        "display_practical",
    }

    if normalized_key in PROTECTED_AI_PROPOSAL_FIELDS:
        return FieldDecision(
            key=normalized_key, proposed_value=coerced, value_type=value_type,
            confidence=confidence, evidence_snippet=evidence_snippet,
            evidence_source=evidence_source, extraction_reason=extraction_reason,
            classification=classification, conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.FORBIDDEN,
            reasons=(ReasonCode.PROTECTED_SOURCE_FIELD,),
            previous_effective=previous_effective, resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

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

    # Quiet-reject location/marketing "accessibility" — never disability access.
    if normalized_key == "accessibility" and is_subjective_accessibility(
        coerced, evidence_snippet
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
            conflict_status=ConflictStatus.UNSUPPORTED,
            reasons=(ReasonCode.SUBJECTIVE_ACCESSIBILITY_REJECTED,),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Reject free-text amenity values that are pure marketing language.
    if (
        not narrative_field
        and isinstance(coerced, str)
        and is_subjective_marketing_claim(coerced, None)
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
            conflict_status=ConflictStatus.UNSUPPORTED,
            reasons=(ReasonCode.SUBJECTIVE_MARKETING_REJECTED,),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Property-type equivalence with an existing source type is redundant, not
    # a conflict (e.g. "Detached Single Family Home" ↔ house).
    if normalized_key == "property_type":
        source_type = source_values.get("property_type")
        if source_type and property_types_equivalent(source_type, coerced):
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
                final_status=AutoApplyStatus.REDUNDANT,
                conflict_status=ConflictStatus.NONE,
                reasons=(
                    ReasonCode.PROPERTY_TYPE_EQUIVALENT,
                    ReasonCode.ALREADY_REPRESENTED_BY_SOURCE,
                ),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                    normalized_key, normalized_key
                ),
            )
        if source_type and is_generic_property_type(source_type):
            reasons.append(ReasonCode.PROPERTY_TYPE_REFINES_GENERIC_SOURCE)

    if narrative_field and _narrative_has_protected_claim(
        coerced, source_text=corpus
    ):
        return FieldDecision(
            key=normalized_key, proposed_value=coerced, value_type=value_type,
            confidence=confidence, evidence_snippet=evidence_snippet,
            evidence_source=evidence_source, extraction_reason=extraction_reason,
            classification=classification, conflict=True,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REJECTED,
            conflict_status=ConflictStatus.FORBIDDEN,
            reasons=(ReasonCode.NARRATIVE_INVENTS_PROTECTED_CLAIM,),
            previous_effective=previous_effective, resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    if narrative_field:
        title_bits = " ".join(
            str(source_values.get(k) or "")
            for k in ("title", "source_neighbourhood_text", "property_type")
        ).strip()
        narrative_corpus = (corpus or "").strip() or title_bits
        # Short commercial listings may only have a title + area — still allow
        # a compact display overview derived from that source material.
        if len(narrative_corpus) < 12 and not source_values.get(
            "existing_structured_features"
        ):
            return FieldDecision(
                key=normalized_key, proposed_value=coerced, value_type=value_type,
                confidence=confidence, evidence_snippet=evidence_snippet,
                evidence_source=evidence_source, extraction_reason=extraction_reason,
                classification=classification, conflict=True,
                model_recommended_action=model_recommended_action,
                final_status=AutoApplyStatus.REJECTED,
                conflict_status=ConflictStatus.WEAK_EVIDENCE,
                reasons=(ReasonCode.MISSING_OR_WEAK_EVIDENCE,),
                previous_effective=previous_effective, resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
            )
        if not corpus.strip() and title_bits:
            corpus = title_bits

    # Display/summary text is intentionally paraphrased from the source, so it
    # must not be substring-grounded like feature claims. Require a usable
    # source corpus (above) and no protected-fact invention (above) only.
    if narrative_field:
        reasons.append("narrative_source_available")
        if not evidence_snippet:
            evidence_snippet = corpus[:160]
    else:
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
        # Source negation of an amenity: True proposals lose quietly; False
        # proposals are confirmed absence and may auto-apply.
        negation_confirms_false = (
            grounding.reason == "negation_conflict_with_source" and coerced is False
        )
        if grounding.reason == "negation_conflict_with_source" and coerced is True:
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
                reasons=tuple(
                    [
                        ReasonCode.SOURCE_NEGATION_REJECTS_TRUE,
                        grounding.reason,
                        *reasons,
                    ]
                ),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                    normalized_key, normalized_key
                ),
            )
        if (
            grounding.ok_for_attention
            and not grounding.ok_for_auto_apply
            and not negation_confirms_false
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
                final_status=AutoApplyStatus.NEEDS_ATTENTION,
                conflict_status=ConflictStatus.AMBIGUOUS,
                reasons=tuple(["evidence_grounding", grounding.reason, *reasons]),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
            )
        if negation_confirms_false:
            reasons.append(ReasonCode.SOURCE_NEGATION_CONFIRMS_FALSE)
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
                final_status=AutoApplyStatus.REDUNDANT,
                conflict_status=ConflictStatus.NONE,
                reasons=(
                    ReasonCode.ALREADY_REPRESENTED_BY_SOURCE,
                    ReasonCode.REDUNDANT_SOURCE_VALUE,
                ),
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
                final_status=AutoApplyStatus.REDUNDANT,
                conflict_status=ConflictStatus.NONE,
                reasons=(ReasonCode.ALREADY_REPRESENTED_BY_MAP, ReasonCode.REDUNDANT_MAP_VALUE),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                    normalized_key, normalized_key
                ),
            )
        if (
            map_nb
            and not specific_source
            and not is_generic_neighbourhood(map_nb)
            and not _neighbourhood_names_equivalent(map_nb, str(coerced))
        ):
            return FieldDecision(
                key=normalized_key, proposed_value=coerced, value_type=value_type,
                confidence=confidence, evidence_snippet=evidence_snippet,
                evidence_source=evidence_source, extraction_reason=extraction_reason,
                classification=classification, conflict=True,
                model_recommended_action=model_recommended_action,
                final_status=AutoApplyStatus.NEEDS_ATTENTION,
                conflict_status=ConflictStatus.SOURCE_CONFLICT,
                reasons=(ConflictStatus.SOURCE_CONFLICT.value,),
                previous_effective=previous_effective, resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
            )

    if previous_effective is not None and (
        str(previous_effective).strip().casefold()
        == str(coerced).strip().casefold()
    ):
        return FieldDecision(
            key=normalized_key,
            proposed_value=coerced,
            value_type=value_type,
            confidence=confidence, evidence_snippet=evidence_snippet,
            evidence_source=evidence_source, extraction_reason=extraction_reason,
            classification=classification, conflict=False,
            model_recommended_action=model_recommended_action,
            final_status=AutoApplyStatus.REDUNDANT,
            conflict_status=ConflictStatus.NONE,
            reasons=(ReasonCode.REDUNDANT_DUPLICATE_PROPOSAL,),
            previous_effective=previous_effective, resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Direct structured source terrace=false always beats AI terrace=true.
    if normalized_key == "terrace" and coerced is True:
        structured_terrace = source_values.get("terrace")
        if structured_terrace is False or str(structured_terrace).strip().lower() in {
            "false",
            "0",
            "no",
        }:
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
                reasons=(ReasonCode.SOURCE_TERRACE_FALSE_WINS,),
                previous_effective=previous_effective,
                resulting_effective=previous_effective,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
            )

    conflict = _source_conflict(normalized_key, coerced, source_values)
    if conflict is not None:
        status = (
            AutoApplyStatus.REJECTED
            if conflict == ConflictStatus.FORBIDDEN
            else AutoApplyStatus.NEEDS_ATTENTION
        )
        reason_codes: tuple[str, ...] = (conflict.value,)
        # Specific structured source property_type wins quietly over a
        # conflicting AI proposal. Review is reserved for genuine dual-source
        # factual conflicts, not lower-priority AI disagreement alone.
        if (
            normalized_key == "property_type"
            and conflict == ConflictStatus.SOURCE_CONFLICT
        ):
            status = AutoApplyStatus.REJECTED
            reason_codes = (
                ReasonCode.PROPERTY_TYPE_SOURCE_WINS_QUIET,
                conflict.value,
            )
        if normalized_key == "neighbourhood_candidate" and is_generic_neighbourhood(
            str(coerced)
        ):
            status = AutoApplyStatus.REJECTED
            reason_codes = (ReasonCode.GENERIC_NEIGHBOURHOOD,)
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
            reasons=reason_codes,
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
    # (0.85); property_type requires 0.95. Confidence alone never creates
    # operational review — fall below the bar and reject quietly.
    auto_apply_threshold = FIELD_AUTO_APPLY_THRESHOLDS.get(
        normalized_key, AUTO_APPLY_CONFIDENCE_THRESHOLD
    )
    if confidence < auto_apply_threshold and not narrative_field:
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
            reasons=(
                ReasonCode.CONFIDENCE_BELOW_FIELD_AUTO_APPLY_THRESHOLD
                if normalized_key in FIELD_AUTO_APPLY_THRESHOLDS
                else ReasonCode.CONFIDENCE_BELOW_AUTO_APPLY_REJECTED,
            ),
            previous_effective=previous_effective,
            resulting_effective=previous_effective,
            display_label=ATTRIBUTE_DISPLAY_LABELS.get(normalized_key, normalized_key),
        )

    # Build effective via layered resolver (source still wins).
    # Generic source property types (e.g. KW "residential") may be refined by
    # evidenced AI without treating the refinement as a source conflict.
    source_val = None
    source_raw = source_values.get(normalized_key)
    if source_raw is not None and source_raw != "":
        if normalized_key == "property_type" and is_generic_property_type(source_raw):
            source_val = None
        else:
            source_val = SourceValue(key=normalized_key, value=source_raw)
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
