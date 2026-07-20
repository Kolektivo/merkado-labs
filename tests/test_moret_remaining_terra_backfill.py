"""Tests for Moret remaining Terra-v3 initial backfill safeguards."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

from merkado_labs.enrichment.jobs import has_identical_enrichment_attempt
from merkado_labs.enrichment.neighbourhood import resolve_effective_neighbourhood

# Historical Terra-v3 backfill artifact — versions stay pinned after code moves to v4.
HISTORICAL_PROMPT = "listing_enrichment_v3"
HISTORICAL_SCHEMA = "listing_enrichment_schema_v3"
HISTORICAL_POLICY = "enrichment_policy_v3"

ROOT = Path(__file__).resolve().parents[1]
SELECTION = ROOT / "data/processed/moret_remaining_terra_selection.json"
RESULT = ROOT / "data/processed/moret_remaining_terra_result.json"
COST = ROOT / "data/processed/moret_backfill_cost_preflight.json"
PROTECTED_BEFORE = ROOT / "data/processed/moret_backfill_protected_fields_before.json"
PROTECTED_AFTER = ROOT / "data/processed/moret_backfill_protected_fields_after.json"
IDEM = ROOT / "data/processed/moret_backfill_idempotency_check.json"
FINAL = ROOT / "data/processed/moret_activation_final_report.json"
PUBLIC = ROOT / "data/processed/moret_public_effective_backfill_smoke.json"
INPUT_Q = ROOT / "data/processed/moret_backfill_input_quality.json"

CANARY = {
    "post-75682",
    "post-75725",
    "post-74976",
    "post-75799",
    "post-74710",
}


def test_selection_excludes_five_successful_canaries() -> None:
    payload = json.loads(SELECTION.read_text(encoding="utf-8"))
    assert payload["source_key"] == "moret_real_estate"
    assert payload["model_required"] == "gpt-5.6-terra"
    assert payload["prompt_version"] == HISTORICAL_PROMPT
    assert payload["schema_version"] == HISTORICAL_SCHEMA
    assert payload["policy_version"] == HISTORICAL_POLICY
    assert payload["count"] == 66
    assert len(payload["listing_ids"]) == 66
    assert len(set(payload["listing_ids"])) == 66
    assert set(payload.get("excluded_canary_external_ids") or []) == CANARY
    assert not (set(payload["external_ids"]) & CANARY)
    reasons = payload.get("exclusion_reason_counts") or {}
    assert reasons.get("successful_terra_canary") == 5
    for item in payload["listings"]:
        assert str(item["external_id"]).startswith("post-")
        assert item["external_id"] not in CANARY


def test_runner_enforces_source_key_batch_size_ceiling_and_canary_block() -> None:
    text = (ROOT / "scripts/run_ai_enrichment_sample.py").read_text(encoding="utf-8")
    assert "moret_real_estate" in text
    assert "MORET_TERRA_CANARY_EXTERNAL_IDS" in text
    assert "Refusing Moret canary listing" in text
    assert "--batch-size must be 1" in text
    assert "max_estimated_cost_usd" in text
    assert "gpt-5.6-terra" in text
    assert "0.0233" in text
    jobs = (ROOT / "src/merkado_labs/enrichment/jobs.py").read_text(encoding="utf-8")
    assert "max_estimated_cost_usd" in jobs
    assert 'source_key == "moret_real_estate"' in jobs
    assert "observed_avg = 0.0233" in jobs
    assert "should_skip_unchanged_enrichment" in jobs


def test_cost_preflight_under_usd_2_40_ceiling() -> None:
    payload = json.loads(COST.read_text(encoding="utf-8"))
    cost = payload.get("cost") or payload
    conservative = float(cost.get("conservative_total_usd") or 0)
    assert conservative <= float(payload.get("hard_ceiling_usd") or 2.4)
    assert payload["selected_listings"] == 66
    assert payload.get("passed") is True
    assert payload.get("max_output_tokens") == 3500


def test_protected_moret_fields_baseline_covers_from_price_and_rent_period() -> None:
    payload = json.loads(PROTECTED_BEFORE.read_text(encoding="utf-8"))
    assert payload["listing_count"] == 71
    fields = payload.get("fields") or []
    assert "from_price" in fields
    assert "price_period" in fields
    assert "source_description_checksum" in fields
    assert "original_price" in fields
    assert "bedrooms" in fields


def test_protected_fields_unchanged_after_backfill() -> None:
    after = json.loads(PROTECTED_AFTER.read_text(encoding="utf-8"))
    assert after["unchanged"] is True
    assert after["before_checksum"] == after["after_checksum"]
    assert after["listing_count"] == 71


def test_from_price_and_rent_period_preserved_in_selection_metadata() -> None:
    sel = json.loads(SELECTION.read_text(encoding="utf-8"))
    from_price = [i for i in sel["listings"] if i.get("from_price")]
    assert len(from_price) >= 1
    # price_period may be sparse; field must exist on each selected listing
    for item in sel["listings"]:
        assert "from_price" in item
        assert "price_period" in item


def test_sparse_inputs_policy_documented() -> None:
    payload = json.loads(INPUT_Q.read_text(encoding="utf-8"))
    assert "sparse" in (payload.get("sparse_ok_policy") or "").lower()
    assert "invent" in (payload.get("sparse_ok_policy") or "").lower()


def test_attention_is_exception_based_in_policy_notes() -> None:
    quality = json.loads(
        (ROOT / "data/processed/moret_backfill_quality_audit.json").read_text(
            encoding="utf-8"
        )
    )
    notes = " ".join(quality.get("policy_notes") or []).lower()
    assert "confidence alone" in notes
    assert "attention" in notes


def test_public_allowlist_and_needs_attention_exclusion() -> None:
    payload = json.loads(PUBLIC.read_text(encoding="utf-8"))
    assert payload["moret_public_count"] == 71
    assert payload.get("needs_attention_excluded_from_public") is True
    assert not payload.get("forbidden_public_leaks")


def test_batch_result_within_budget_and_source() -> None:
    assert RESULT.exists()
    payload = json.loads(RESULT.read_text(encoding="utf-8"))
    result = payload["result"]
    assert result["processed"] == 66
    assert float(result["exact_cost_usd"]) <= 2.4
    assert payload["preflight"]["source_key"] == "moret_real_estate"
    assert payload["preflight"]["model"] == "gpt-5.6-terra"
    assert payload["preflight"]["project_ref"] == "csaefdkpwukshtouyixg"


def test_zero_cost_idempotency_all_71() -> None:
    payload = json.loads(IDEM.read_text(encoding="utf-8"))
    assert payload["mode"] == "dry_run_skip_check"
    assert payload["note"] == "No OpenAI calls made"
    assert payload["listing_count"] == 71
    assert payload["billable_listing_count"] == 0
    assert payload["api_calls"] == 0
    assert float(payload["preflight"]["conservative_expected_usd"]) == 0.0
    assert payload.get("passed") is True


def test_failed_results_do_not_count_as_identical_successful() -> None:
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


def test_normal_refresh_excludes_initial_backfill_behavior() -> None:
    worker = (ROOT / "src/merkado_labs/pipeline/worker.py").read_text(encoding="utf-8")
    assert 'scope_type="new_or_changed"' in worker
    store = (ROOT / "src/merkado_labs/pipeline/store.py").read_text(encoding="utf-8")
    assert "manual_refresh_and_enrich" in store
    assert "moret_remaining_terra_backfill" not in worker


def test_map_over_ai_neighbourhood_priority() -> None:
    eff = resolve_effective_neighbourhood(
        source_name="Curacao",
        map_name="Jan Thiel",
        ai_candidate_name="Spanish Water",
        ai_candidate_confidence=0.99,
        ai_evidence_grounded=True,
    )
    assert eff.provenance == "map"
    assert eff.name == "Jan Thiel"


def test_final_report_marks_manual_and_coverage() -> None:
    payload = json.loads(FINAL.read_text(encoding="utf-8"))
    assert payload["manual_unscheduled"] is True
    assert payload["catalog"]["listings"] == 71
    assert payload["ai_coverage"]["terra_v3_successful_listings"] == 71
    assert payload["normal_refresh_remains_new_or_changed_only"] is True
    assert payload["initial_backfill_separate_from_refresh"] is True
    assert payload["next_source_track"] == "monumentenzorg_reconnaissance"
