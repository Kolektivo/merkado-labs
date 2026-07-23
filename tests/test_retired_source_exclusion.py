"""Source-neutral retirement and dashboard exclusion tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_aggregator_experiment_trees_removed() -> None:
    assert not (ROOT / "experiments/caribbeanhousehunt_sample").exists()
    assert not (ROOT / "experiments/caribbeanhousehunt_recon").exists()
    assert not (ROOT / ".github/workflows/chh-daily-harvest.yml").exists()


def test_no_active_aggregator_import_commands() -> None:
    forbidden = [
        "experiments/caribbeanhousehunt_sample/create_snapshot.py",
        "experiments/caribbeanhousehunt_sample/import_supabase.py",
        "experiments/caribbeanhousehunt_sample/extract_sample.py",
    ]
    for relative in forbidden:
        assert not (ROOT / relative).exists(), relative


def test_cleanup_dry_run_is_non_destructive_after_delete(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/cleanup/chh_labs_data_cleanup.py"),
            "--export-dir",
            str(tmp_path),
        ],
        check=False,
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )
    assert result.returncode == 0, result.stderr
    assert "counts" in result.stdout.lower()
    plans = list(tmp_path.glob("chh_cleanup_plan_*.json"))
    assert plans
    payload = json.loads(plans[0].read_text(encoding="utf-8"))
    assert payload["project_ref"] == "csaefdkpwukshtouyixg"
    assert payload["mode"] == "dry_run"
    # Offline credential-less runs echo historical CHH counts (non-destructive).
    # Live Labs dry-runs after cleanup must show a zero CHH scope.
    if payload.get("offline"):
        assert payload["counts"].get("property_listings") == 1549
    else:
        assert payload["counts"].get("property_listings", 0) == 0
        assert payload["counts"].get("property_sources", 0) == 0


def test_verified_export_still_present_and_checksums() -> None:
    export_dir = ROOT / "data/processed/chh_cleanup_export/payloads_20260716T165840Z"
    assert export_dir.is_dir()
    manifest = json.loads((export_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["project_ref"] == "csaefdkpwukshtouyixg"
    assert manifest["counts"]["property_listings"] == 1549


def test_seed_migration_is_idempotent_on_conflict() -> None:
    sql = (
        ROOT / "supabase/migrations/20260716180100_seed_approved_property_sources.sql"
    ).read_text(encoding="utf-8")
    assert "on conflict (base_url) do update" in sql.lower()
    assert "adapter_status = 'retired'" in sql


def test_dashboard_queries_exclude_retired_sources() -> None:
    queries = (ROOT / "apps/labs-dashboard/src/lib/data/queries.ts").read_text(encoding="utf-8")
    assert "source:property_sources(" in queries
    assert 'eq("enabled", true)' in queries or '.eq("enabled", true)' in queries
    assert "adapter_status" in queries
    assert "retired" in queries
    assert "isInventoryVisible" in queries


def test_neighbourhood_slug_helpers_remain_source_neutral() -> None:
    from merkado_labs.geo import neighbourhood_slug, normalize_neighbourhood_name

    assert neighbourhood_slug("Willemstad") == "willemstad"
    assert normalize_neighbourhood_name("  Santa Rosa ") == "santa rosa"
