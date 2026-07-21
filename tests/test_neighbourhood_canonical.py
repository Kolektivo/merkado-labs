"""Tests for safe neighbourhood display canonicalization."""

from __future__ import annotations

from merkado_labs.enrichment.neighbourhood import resolve_effective_neighbourhood
from merkado_labs.enrichment.neighbourhood_canonical import (
    canonicalize_neighbourhood,
    normalize_neighbourhood_key,
)


def test_suffix_removal_jan_thiel() -> None:
    result = canonicalize_neighbourhood("Jan Thiel Curacao")
    assert result.canonical_display == "Jan Thiel"
    assert result.reason in {"exact_alias", "suffix_strip"}
    assert result.safe is True
    assert result.original == "Jan Thiel Curacao"


def test_blue_bay_variants() -> None:
    for raw in (
        "Blue Bay Resort",
        "Blue Bay Golf & Beach Resort",
        "Blue Bay Golf & Beach Resort Curacao",
        "Blue Bay Curacao",
    ):
        result = canonicalize_neighbourhood(raw)
        assert result.canonical_display == "Blue Bay", raw
        assert result.reason == "exact_alias"
        assert result.safe is True


def test_st_joris_to_sint_joris() -> None:
    for raw in ("St. Joris", "St Joris", "St. Joris Curacao"):
        result = canonicalize_neighbourhood(raw)
        assert result.canonical_display == "Sint Joris", raw
        assert result.reason == "exact_alias"


def test_salina_variants_to_salina_with_n() -> None:
    from merkado_labs.enrichment.neighbourhood_canonical import (
        neighbourhood_keys_match,
    )

    for raw in ("Salina", "Salinja", "Saliña", "Salinja Curacao", "Salina Curacao"):
        result = canonicalize_neighbourhood(raw)
        assert result.canonical_display == "Saliña", raw
        assert result.safe is True
    assert neighbourhood_keys_match("Salinja", "Saliña")
    assert neighbourhood_keys_match("Salina Curacao", "Saliña")
    # Distinct sub-areas must stay separate from the parent.
    abou = canonicalize_neighbourhood("Salinja Abou")
    assert abou.canonical_display == "Salinja Abou"
    assert not neighbourhood_keys_match("Salinja Abou", "Saliña")
    ariba = canonicalize_neighbourhood("Saliña Ariba")
    assert ariba.canonical_display == "Saliña Ariba"
    assert not neighbourhood_keys_match("Saliña Ariba", "Saliña")


def test_marie_pompoen_to_marie_pampoen() -> None:
    from merkado_labs.enrichment.neighbourhood_canonical import (
        neighbourhood_keys_match,
    )

    for raw in (
        "Marie Pompoen",
        "Marie Pampoen",
        "Marie Pampoen / Marie Pompoen Curacao",
        "Marie Pompoen Curacao",
    ):
        result = canonicalize_neighbourhood(raw)
        assert result.canonical_display == "Marie Pampoen", raw
        assert result.safe is True
    assert neighbourhood_keys_match("Marie Pompoen", "Marie Pampoen")


def test_alias_filter_keys_converge() -> None:
    from merkado_labs.enrichment.neighbourhood_canonical import (
        neighbourhood_keys_match,
    )

    assert neighbourhood_keys_match(
        "Blue Bay Golf & Beach Resort Curacao",
        "Blue Bay",
    )
    assert neighbourhood_keys_match("St. Joris", "Sint Joris")


def test_brakkeput_abou_remains_distinct() -> None:
    result = canonicalize_neighbourhood("Brakkeput Abou")
    assert result.canonical_display == "Brakkeput Abou"
    assert result.reason == "passthrough"
    assert normalize_neighbourhood_key("Brakkeput Abou") != normalize_neighbourhood_key(
        "Brakkeput"
    )

    parent = canonicalize_neighbourhood("Brakkeput Curacao")
    assert parent.canonical_display == "Brakkeput"
    assert parent.canonical_display != result.canonical_display


def test_generic_curacao() -> None:
    for raw in ("Curacao", "Curaçao", "Curaçao Island", "island"):
        result = canonicalize_neighbourhood(raw)
        assert result.reason == "generic", raw
        assert result.canonical_display is None
        assert result.safe is True


def test_explicit_alias_table_examples() -> None:
    cases = {
        "Bottelier Curacao": "Bottelier",
        "Brakkeput Curacao": "Brakkeput",
        "Cas Grandi Curacao": "Cas Grandi",
        "Sun Valley Curacao": "Sun Valley",
        "Toni Kunchi Curacao": "Toni Kunchi",
        "Piscadera Curacao": "Piscadera",
        "Otrobanda Curacao": "Otrobanda",
        "Jan Sofat Curacao": "Jan Sofat",
        "Mahaai Curacao": "Mahaai",
    }
    for raw, expected in cases.items():
        result = canonicalize_neighbourhood(raw)
        assert result.canonical_display == expected, raw
        assert result.safe is True


def test_cas_abou_resort_uncertain() -> None:
    result = canonicalize_neighbourhood("Cas Abou Resort")
    assert result.reason == "uncertain"
    assert result.safe is False
    assert result.canonical_display == "Cas Abou Resort"


def test_vista_royal_jan_thiel_uncertain() -> None:
    result = canonicalize_neighbourhood("Vista Royal / Jan Thiel")
    assert result.reason == "uncertain"
    assert result.safe is False


def test_normalize_key_strips_accents_and_suffix() -> None:
    assert normalize_neighbourhood_key("Jan Thiel Curaçao") == "jan thiel"
    assert normalize_neighbourhood_key("St. Joris") == "st joris"


def test_effective_neighbourhood_uses_canonical_display() -> None:
    effective = resolve_effective_neighbourhood(
        source_name="Toni Kunchi Curacao",
        map_name="Toni Kunchi",
    )
    assert effective.name == "Toni Kunchi"
    assert effective.source_name == "Toni Kunchi Curacao"
    assert effective.map_name == "Toni Kunchi"
    assert effective.conflict is False


def test_coordinate_conflict_still_flagged() -> None:
    effective = resolve_effective_neighbourhood(
        source_name="Jan Thiel Curacao",
        map_name="Mambo Beach",
    )
    assert effective.name == "Jan Thiel"
    assert effective.conflict is True
    assert effective.source_name == "Jan Thiel Curacao"
    assert effective.map_name == "Mambo Beach"
