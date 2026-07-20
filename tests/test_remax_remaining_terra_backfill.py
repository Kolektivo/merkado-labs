"""Tests for RE/MAX remaining Terra-v3 initial backfill safeguards."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

from merkado_labs.enrichment import PROMPT_VERSION, SCHEMA_VERSION
from merkado_labs.enrichment.jobs import has_identical_enrichment_attempt
from merkado_labs.enrichment.neighbourhood import resolve_effective_neighbourhood
from merkado_labs.enrichment.policy import POLICY_VERSION
from merkado_labs.pipeline.readiness import assert_can_enqueue_full_refresh

ROOT = Path(__file__).resolve().parents[1]
SELECTION = ROOT / "data/processed/remax_remaining_terra_selection.json"
RESULT = ROOT / "data/processed/remax_remaining_terra_result.json"
COST = ROOT / "data/processed/remax_backfill_cost_preflight.json"
PROTECTED = ROOT / "data/processed/remax_backfill_protected_fields.json"
IDEM = ROOT / "data/processed/remax_backfill_idempotency_check.json"
FINAL = ROOT / "data/processed/remax_activation_final_report.json"


def test_selection_excludes_successful_terra_v3_checksums() -> None:
    payload = json.loads(SELECTION.read_text(encoding="utf-8"))
    assert payload["source_key"] == "remax_curacao"
    assert payload["model_required"] == "gpt-5.6-terra"
    assert payload["prompt_version"] == PROMPT_VERSION
    assert payload["schema_version"] == SCHEMA_VERSION
    assert payload["policy_version"] == POLICY_VERSION
    assert 190 <= payload["count"] <= 215
    assert len(payload["listing_ids"]) == payload["count"]
    assert len(set(payload["listing_ids"])) == payload["count"]
    reasons = payload.get("exclusion_reason_counts") or {}
    assert reasons.get("identical_successful_terra_v3_checksum", 0) >= 1
    for item in payload["listings"]:
        assert "keller" not in str(item.get("external_id") or "").lower()
        assert not str(item.get("external_id") or "").startswith("00")


def test_historical_v1_does_not_count_as_current_enrichment() -> None:
    client = MagicMock()
    # No Terra-v3 terminal proposal for checksum → not identical.
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value.data = (
        []
    )
    assert (
        has_identical_enrichment_attempt(
            client,
            listing_id="listing-v1-only",
            model="gpt-5.6-terra",
            input_checksum="checksum-current",
        )
        is False
    )


def test_runner_enforces_source_key_batch_size_and_budget() -> None:
    text = (ROOT / "scripts/run_ai_enrichment_sample.py").read_text(encoding="utf-8")
    assert "remax_curacao" in text
    assert "--batch-size must be 1" in text
    assert "max_estimated_cost_usd" in text
    assert "gpt-5.6-terra" in text
    jobs = (ROOT / "src/merkado_labs/enrichment/jobs.py").read_text(encoding="utf-8")
    assert "max_estimated_cost_usd" in jobs
    assert "should_skip_unchanged_enrichment" in jobs


def test_cost_preflight_under_ceiling() -> None:
    payload = json.loads(COST.read_text(encoding="utf-8"))
    cost = payload.get("cost") or payload
    conservative = float(cost.get("conservative_total_usd") or 0)
    assert conservative <= float(payload.get("hard_ceiling_usd") or 10.0)
    assert payload["selected_listings"] == json.loads(
        SELECTION.read_text(encoding="utf-8")
    )["count"]
    assert payload.get("passed") is True


def test_batch_result_within_budget_and_source() -> None:
    assert RESULT.exists()
    payload = json.loads(RESULT.read_text(encoding="utf-8"))
    result = payload["result"]
    assert result["processed"] == 211
    assert result["failed"] == 0
    assert float(result["exact_cost_usd"]) <= 10.0
    assert payload["preflight"]["source_key"] == "remax_curacao"
    assert payload["preflight"]["model"] == "gpt-5.6-terra"
    assert payload["preflight"]["project_ref"] == "csaefdkpwukshtouyixg"


def test_protected_fields_unchanged() -> None:
    payload = json.loads(PROTECTED.read_text(encoding="utf-8"))
    assert payload["unchanged"] is True
    assert payload["before_checksum"] == payload["after_checksum"]
    assert payload["listing_count"] == 220


def test_map_over_ai_neighbourhood_priority() -> None:
    eff = resolve_effective_neighbourhood(
        source_name="Curacao",
        map_name="Blauw",
        ai_candidate_name="Blue Bay",
        ai_candidate_confidence=0.99,
        ai_evidence_grounded=True,
    )
    assert eff.provenance == "map"
    assert eff.name == "Blauw"


def test_zero_cost_idempotency_all_220() -> None:
    payload = json.loads(IDEM.read_text(encoding="utf-8"))
    assert payload["mode"] == "dry_run_skip_check"
    assert payload["note"] == "No OpenAI calls made"
    assert payload["preflight"]["listing_count"] == 220
    assert payload["preflight"]["billable_listing_count"] == 0
    assert payload["preflight"]["api_calls"] == 0
    assert float(payload["preflight"]["conservative_expected_usd"]) == 0.0


def test_failed_results_do_not_count_as_identical_successful() -> None:
    """Failed / invalid_output proposals must not satisfy the skip helper."""

    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value.data = (
        []
    )
    assert (
        has_identical_enrichment_attempt(
            client,
            listing_id="failed-listing",
            model="gpt-5.6-terra",
            input_checksum="abc",
        )
        is False
    )


def test_normal_refresh_does_not_start_initial_backfill() -> None:
    worker = (ROOT / "src/merkado_labs/pipeline/worker.py").read_text(encoding="utf-8")
    assert 'scope_type="new_or_changed"' in worker
    store = (ROOT / "src/merkado_labs/pipeline/store.py").read_text(encoding="utf-8")
    assert "manual_refresh_and_enrich" in store
    # RE/MAX may refresh when ready, but AI scope stays new/changed — not full backfill.
    assert "remax_remaining_terra_backfill" not in worker


def test_final_report_marks_manual_and_coverage() -> None:
    payload = json.loads(FINAL.read_text(encoding="utf-8"))
    assert payload["manual_unscheduled"] is True
    assert payload["catalog"]["listings"] == 220
    assert payload["ai_coverage"]["terra_v3_successful_listings"] == 220
    assert payload["normal_refresh_remains_new_or_changed_only"] is True
    assert payload["initial_backfill_separate_from_refresh"] is True
    assert payload["next_source_track"] == "moret_real_estate"


def test_remax_full_refresh_gate_still_source_scoped() -> None:
    text = Path(assert_can_enqueue_full_refresh.__code__.co_filename).read_text(
        encoding="utf-8"
    )
    assert 'LABS_PROJECT_REF = "csaefdkpwukshtouyixg"' in text
    assert 'FORBIDDEN_PROJECT_REF = "jkrfyvukhhsapoivntms"' in text
    assert "manual_refresh_and_enrich" in (
        ROOT / "src/merkado_labs/pipeline/store.py"
    ).read_text(encoding="utf-8")
