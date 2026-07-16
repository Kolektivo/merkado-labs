"""Focused tests for the bounded Labs Supabase importer."""

from __future__ import annotations

import pytest

from experiments.caribbeanhousehunt_sample.import_supabase import (
    LABS_PROJECT_REF,
    MIN_SNAPSHOT_SIZE,
    _same_value,
    listing_payload,
    load_sample_artifacts,
    neighbourhood_rows,
    neighbourhood_slug,
    normalize_neighbourhood,
    verify_labs_project,
)
from merkado_labs.config import Settings


def test_latest_snapshot_is_consistent_full_catalog() -> None:
    artifacts = load_sample_artifacts()

    assert len(artifacts.normalized) >= MIN_SNAPSHOT_SIZE
    assert len(artifacts.raw_records) == len(artifacts.normalized)
    assert len(artifacts.raw_by_external_id) == len(artifacts.normalized)
    assert artifacts.snapshot_id == artifacts.snapshot_path.name
    assert artifacts.duplicate_input_ids == ()
    assert len(artifacts.source_sha256) == 64


def test_neighbourhood_normalization_preserves_display_distinction() -> None:
    assert normalize_neighbourhood("  Montaña   Rey ") == "montaña rey"
    assert neighbourhood_slug("Montaña Rey") == "montana-rey"


def test_neighbourhood_slug_collisions_do_not_merge_distinct_names() -> None:
    rows = neighbourhood_rows(
        {"d section": "D section", "d-section": "D-section", "piscadera": "Piscadera"}
    )

    assert len({row["normalized_name"] for row in rows}) == 3
    assert len({row["slug"] for row in rows}) == 3


def test_database_timestamp_formatting_does_not_trigger_updates() -> None:
    assert _same_value(
        "2026-07-15T13:35:30.42925+00:00",
        "2026-07-15T13:35:30.429250+00:00",
    )


def test_project_guard_requires_exact_labs_ref_and_host() -> None:
    settings = Settings(
        supabase_project_ref=LABS_PROJECT_REF,
        supabase_url=f"https://{LABS_PROJECT_REF}.supabase.co",
    )
    assert verify_labs_project(settings).endswith(".supabase.co")

    with pytest.raises(RuntimeError, match="Labs host"):
        verify_labs_project(
            Settings(
                supabase_project_ref=LABS_PROJECT_REF,
                supabase_url="https://example.supabase.co",
            )
        )
    with pytest.raises(RuntimeError, match="expected Labs ref"):
        verify_labs_project(
            Settings(
                supabase_project_ref="not-labs",
                supabase_url=f"https://{LABS_PROJECT_REF}.supabase.co",
            )
        )


def test_listing_payload_keeps_asset_unlinked_and_id_provisional() -> None:
    artifacts = load_sample_artifacts()
    item = artifacts.normalized[0]
    payload = listing_payload(item, "source-id", None, artifacts.observed_at)

    assert payload["property_asset_id"] is None
    assert payload["external_id"] == item["source_listing_id"]
    assert payload["external_id_status"] == "provisional"
    assert payload["first_seen_at"] == artifacts.observed_at
