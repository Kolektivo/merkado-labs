"""Tests for the shared effective-neighbourhood resolver used by policy replay.

TypeScript coverage for the same priority rules lives in
`apps/labs-dashboard/src/lib/domain/effective-neighbourhood.ts` and is
exercised indirectly through the dashboard contract tests; this module is
the Python mirror used for policy replay.
"""

from __future__ import annotations

from merkado_labs.enrichment.neighbourhood import (
    AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD,
    NeighbourhoodProvenance,
    is_generic_neighbourhood,
    resolve_effective_neighbourhood,
)


def test_specific_source_wins_over_everything() -> None:
    effective = resolve_effective_neighbourhood(
        source_name="Jan Thiel",
        map_name="Mambo Beach",
        ai_candidate_name="Mambo Beach",
        ai_candidate_confidence=0.99,
    )
    assert effective.name == "Jan Thiel"
    assert effective.provenance == NeighbourhoodProvenance.SOURCE
    assert effective.conflict is True


def test_generic_source_falls_through_to_map() -> None:
    effective = resolve_effective_neighbourhood(
        source_name="Curaçao",
        map_name="Jan Thiel",
    )
    assert effective.name == "Jan Thiel"
    assert effective.provenance == NeighbourhoodProvenance.MAP
    assert effective.conflict is False


def test_missing_source_and_map_uses_high_confidence_ai_candidate() -> None:
    effective = resolve_effective_neighbourhood(
        ai_candidate_name="Mambo Beach",
        ai_candidate_confidence=AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD,
    )
    assert effective.name == "Mambo Beach"
    assert effective.provenance == NeighbourhoodProvenance.AI_EXTRACTED


def test_low_confidence_ai_candidate_is_not_used() -> None:
    effective = resolve_effective_neighbourhood(
        ai_candidate_name="Mambo Beach",
        ai_candidate_confidence=0.5,
    )
    assert effective.name is None
    assert effective.provenance == NeighbourhoodProvenance.UNAVAILABLE


def test_ungrounded_ai_candidate_is_not_used_even_with_high_confidence() -> None:
    effective = resolve_effective_neighbourhood(
        ai_candidate_name="Mambo Beach",
        ai_candidate_confidence=0.99,
        ai_evidence_grounded=False,
    )
    assert effective.name is None
    assert effective.provenance == NeighbourhoodProvenance.UNAVAILABLE


def test_ai_never_overrides_map_even_when_conflicting() -> None:
    effective = resolve_effective_neighbourhood(
        map_name="Jan Thiel",
        ai_candidate_name="Mambo Beach",
        ai_candidate_confidence=0.99,
    )
    assert effective.name == "Jan Thiel"
    assert effective.provenance == NeighbourhoodProvenance.MAP


def test_everything_missing_is_unavailable() -> None:
    effective = resolve_effective_neighbourhood()
    assert effective.name is None
    assert effective.provenance == NeighbourhoodProvenance.UNAVAILABLE
    assert effective.as_dict()["provenance"] == "unavailable"


def test_is_generic_neighbourhood() -> None:
    assert is_generic_neighbourhood("Curacao")
    assert is_generic_neighbourhood("  island  ")
    assert is_generic_neighbourhood(None)
    assert is_generic_neighbourhood("")
    assert not is_generic_neighbourhood("Jan Thiel")
