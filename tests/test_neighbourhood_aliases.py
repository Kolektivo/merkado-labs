from __future__ import annotations

from experiments.caribbeanhousehunt_sample.review_neighbourhood_aliases import (
    NeighbourhoodStats,
    formatting_key,
    generate_candidates,
)


def neighbourhood(
    identifier: str,
    name: str,
    *,
    count: int,
    latitude: float,
    longitude: float,
) -> NeighbourhoodStats:
    return NeighbourhoodStats(
        id=identifier,
        name=name,
        listing_count=count,
        coordinate_count=count,
        latitude_min=latitude,
        latitude_max=latitude,
        longitude_min=longitude,
        longitude_max=longitude,
        latitude_mean=latitude,
        longitude_mean=longitude,
    )


def test_formatting_key_only_normalizes_formatting() -> None:
    assert formatting_key("  D-section ") == "d section"
    assert formatting_key("Saliña") == "salina"
    assert formatting_key("Rust & Vrede") != formatting_key("Rust en Vrede")


def test_exact_formatting_variant_is_automatically_approved() -> None:
    candidates, distinct = generate_candidates(
        [
            neighbourhood("source", "D section", count=1, latitude=12.1, longitude=-68.9),
            neighbourhood("canonical", "D-section", count=2, latitude=12.1, longitude=-68.9),
            neighbourhood("distinct", "Punda", count=5, latitude=12.2, longitude=-68.8),
        ]
    )
    assert len(candidates) == 1
    assert candidates[0].source_neighbourhood_id == "source"
    assert candidates[0].status == "approved"
    assert candidates[0].match_method == "exact_formatting"
    assert distinct == ["Punda"]


def test_semantic_or_geographic_candidate_remains_pending() -> None:
    candidates, _ = generate_candidates(
        [
            neighbourhood("parent", "Blue Bay", count=49, latitude=12.135, longitude=-68.981),
            neighbourhood(
                "source",
                "Blue Bay Village",
                count=1,
                latitude=12.136,
                longitude=-68.983,
            ),
        ]
    )
    assert len(candidates) == 1
    assert candidates[0].source_neighbourhood_id == "source"
    assert candidates[0].canonical_neighbourhood_id == "parent"
    assert candidates[0].status == "pending"
    assert candidates[0].classification == "likely_alias"


def test_different_named_sections_are_clearly_distinct() -> None:
    candidates, distinct = generate_candidates(
        [
            neighbourhood("o", "O-section", count=1, latitude=12.14, longitude=-68.98),
            neighbourhood("w", "W-section", count=1, latitude=12.14, longitude=-68.98),
        ]
    )
    assert candidates == []
    assert distinct == ["O-section", "W-section"]
