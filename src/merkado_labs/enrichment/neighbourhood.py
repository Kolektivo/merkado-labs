"""Shared effective-neighbourhood resolution for policy replay.

Priority:
1. Specific explicit source neighbourhood, when valid and non-generic.
2. Authoritative point-in-polygon map assignment from valid coordinates.
3. High-confidence, evidence-grounded AI neighbourhood candidate — only
   when the source is missing/generic and the map assignment is unavailable.
4. Otherwise unspecified.

AI can never overwrite a stronger source or map value, and the map wins
over a conflicting AI candidate because AI is only consulted once both
stronger tiers are exhausted.

Mirrors `apps/labs-dashboard/src/lib/domain/effective-neighbourhood.ts` —
keep both in sync when the priority rules change.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

# Generic island-level mentions that are not a real neighbourhood.
GENERIC_NEIGHBOURHOOD_TERMS = frozenset(
    {
        "curacao",
        "curaçao",
        "curaçao island",
        "island",
        "netherlands antilles",
        "dutch caribbean",
    }
)

# Minimum AI candidate confidence to treat it as "high-confidence" —
# mirrors AUTO_APPLY_CONFIDENCE_THRESHOLD in
# merkado_labs.enrichment.policy.
AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD = 0.85


class NeighbourhoodProvenance(StrEnum):
    SOURCE = "source"
    MAP = "map"
    AI_EXTRACTED = "ai_extracted"
    UNAVAILABLE = "unavailable"


NEIGHBOURHOOD_PROVENANCE_LABELS: dict[NeighbourhoodProvenance, str] = {
    NeighbourhoodProvenance.SOURCE: "Website",
    NeighbourhoodProvenance.MAP: "Map match",
    NeighbourhoodProvenance.AI_EXTRACTED: "AI suggested",
    NeighbourhoodProvenance.UNAVAILABLE: "Not specified",
}


@dataclass(frozen=True)
class EffectiveNeighbourhood:
    name: str | None
    provenance: NeighbourhoodProvenance
    source_name: str | None
    map_name: str | None
    ai_name: str | None
    conflict: bool
    label: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "provenance": self.provenance.value,
            "source_name": self.source_name,
            "map_name": self.map_name,
            "ai_name": self.ai_name,
            "conflict": self.conflict,
            "label": self.label,
        }


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def is_generic_neighbourhood(value: str | None) -> bool:
    cleaned = _clean(value)
    if not cleaned:
        return True
    return cleaned.casefold() in GENERIC_NEIGHBOURHOOD_TERMS


def _specific(value: str | None) -> str | None:
    cleaned = _clean(value)
    if cleaned is None or is_generic_neighbourhood(cleaned):
        return None
    return cleaned


def resolve_effective_neighbourhood(
    *,
    source_name: str | None = None,
    map_name: str | None = None,
    ai_candidate_name: str | None = None,
    ai_candidate_confidence: float | None = None,
    ai_evidence_grounded: bool | None = None,
) -> EffectiveNeighbourhood:
    """Resolve the effective neighbourhood using the shared priority rules.

    ``ai_evidence_grounded`` mirrors whether the policy field decision for
    ``neighbourhood_candidate`` was ``auto_applied`` (see
    ``merkado_labs.enrichment.policy.decide_field``). It defaults to
    ``True`` so callers without a policy decision can rely on confidence
    alone; pass ``False`` explicitly for rejected/needs-attention candidates.
    """

    source_name = _clean(source_name)
    map_name = _clean(map_name)
    ai_candidate_name = _clean(ai_candidate_name)

    specific_source = _specific(source_name)
    specific_map = _specific(map_name)
    specific_ai = _specific(ai_candidate_name)

    conflict = bool(
        specific_source
        and specific_map
        and specific_source.casefold() != specific_map.casefold()
    )

    if specific_source:
        return EffectiveNeighbourhood(
            name=specific_source,
            provenance=NeighbourhoodProvenance.SOURCE,
            source_name=source_name,
            map_name=map_name,
            ai_name=ai_candidate_name,
            conflict=conflict,
            label=NEIGHBOURHOOD_PROVENANCE_LABELS[NeighbourhoodProvenance.SOURCE],
        )

    if specific_map:
        return EffectiveNeighbourhood(
            name=specific_map,
            provenance=NeighbourhoodProvenance.MAP,
            source_name=source_name,
            map_name=map_name,
            ai_name=ai_candidate_name,
            conflict=conflict,
            label=NEIGHBOURHOOD_PROVENANCE_LABELS[NeighbourhoodProvenance.MAP],
        )

    grounded = ai_evidence_grounded if ai_evidence_grounded is not None else True
    high_confidence = (
        ai_candidate_confidence is not None
        and ai_candidate_confidence >= AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD
    )
    if specific_ai and grounded and high_confidence:
        return EffectiveNeighbourhood(
            name=specific_ai,
            provenance=NeighbourhoodProvenance.AI_EXTRACTED,
            source_name=source_name,
            map_name=map_name,
            ai_name=ai_candidate_name,
            conflict=conflict,
            label=NEIGHBOURHOOD_PROVENANCE_LABELS[NeighbourhoodProvenance.AI_EXTRACTED],
        )

    return EffectiveNeighbourhood(
        name=None,
        provenance=NeighbourhoodProvenance.UNAVAILABLE,
        source_name=source_name,
        map_name=map_name,
        ai_name=ai_candidate_name,
        conflict=conflict,
        label=NEIGHBOURHOOD_PROVENANCE_LABELS[NeighbourhoodProvenance.UNAVAILABLE],
    )
