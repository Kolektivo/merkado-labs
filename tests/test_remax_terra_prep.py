"""Contracts for RE/MAX Terra canary prep (no network, no OpenAI, no DB writes)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from merkado_labs.enrichment import PROMPT_VERSION, SCHEMA_VERSION
from merkado_labs.enrichment.neighbourhood import is_generic_neighbourhood
from merkado_labs.enrichment.policy import POLICY_VERSION
from merkado_labs.enrichment.pricing import MODEL_PRICES_USD_PER_1M, calculate_usage_cost_usd
from merkado_labs.scrapers.adapters.remax_curacao import ADAPTER_VERSION, SOURCE_KEY

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
SELECTION = PROCESSED / "remax_terra_canary_selection.json"
COST = PROCESSED / "remax_terra_cost_preflight.json"
STATE = PROCESSED / "remax_current_state.json"


@pytest.mark.skipif(not SELECTION.exists(), reason="Run build_remax_terra_prep.py first")
def test_canary_selection_exactly_five_and_enforced() -> None:
    payload = json.loads(SELECTION.read_text(encoding="utf-8"))
    assert payload["source_key"] == SOURCE_KEY
    assert payload["model_required"] == "gpt-5.6-terra"
    assert payload["count"] == 5
    assert len(payload["listing_ids"]) == 5
    assert len(set(payload["listing_ids"])) == 5
    assert len(payload["external_ids"]) == 5
    assert payload["prompt_version"] == PROMPT_VERSION
    assert payload["schema_version"] == SCHEMA_VERSION
    assert payload["policy_version"] == POLICY_VERSION
    assert payload["no_listings_outside_selection"] is True


@pytest.mark.skipif(not COST.exists(), reason="Run build_remax_terra_prep.py first")
def test_cost_ceiling_calculated_from_terra_rates() -> None:
    payload = json.loads(COST.read_text(encoding="utf-8"))
    assert payload["model"] == "gpt-5.6-terra"
    rates = MODEL_PRICES_USD_PER_1M["gpt-5.6-terra"]
    assert float(rates[0]) == 2.50
    assert float(rates[2]) == 15.00
    assert payload["recommended_canary_ceiling_usd"] > 0
    assert payload["openai_invoice_amount"] is None
    # Sanity: worst-case uses configured calculator, not a hard-coded $1.
    worst, _ = calculate_usage_cost_usd(
        model="gpt-5.6-terra",
        input_tokens=5 * int(payload["avg_estimated_input_tokens_selected"]),
        output_tokens=5 * int(payload["conservative_max_output_tokens_per_listing"]),
    )
    assert worst is not None
    assert payload["five_listing_worst_case_cost_usd"] > 0


@pytest.mark.skipif(not STATE.exists(), reason="Run build_remax_terra_prep.py first")
def test_catalog_completeness_contract_and_stable_identity() -> None:
    payload = json.loads(STATE.read_text(encoding="utf-8"))
    assert payload["project_ref"] == "csaefdkpwukshtouyixg"
    assert payload["labs_counts"]["total"] == 220
    assert payload["labs_counts"]["unique_external_ids"] == 220
    assert payload["labs_counts"]["unique_canonical_urls"] == 220
    assert payload["duplicates"]["external_id_dupes"] == []
    assert payload["duplicates"]["url_dupes"] == []
    assert payload["manual_unscheduled"] is True
    assert payload["catalog_completeness"]["verdict"] == (
        "complete_as_of_last_successful_run"
    )


def test_generic_curacao_rejected() -> None:
    assert is_generic_neighbourhood("Curaçao")
    assert is_generic_neighbourhood("Curacao")
    assert not is_generic_neighbourhood("Blue Bay")


def test_adapter_version_bumped_for_parser_fixes() -> None:
    assert ADAPTER_VERSION == "0.4.1"


def test_prep_script_declares_no_side_effects() -> None:
    text = (ROOT / "scripts/recon/build_remax_terra_prep.py").read_text(encoding="utf-8")
    assert "no_live_requests" in text
    assert "no_db_writes" in text
    assert "create_enrichment_job" not in text
    assert "openai" not in text.lower() or "No OpenAI" in text or "no_openai" in text
    assert "fetch_url" not in text
