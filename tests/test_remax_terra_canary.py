"""Tests for RE/MAX Terra canary safeguards (no OpenAI / no DB writes)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

from merkado_labs.enrichment import PROMPT_VERSION, SCHEMA_VERSION
from merkado_labs.enrichment.jobs import has_identical_enrichment_attempt
from merkado_labs.enrichment.neighbourhood import is_generic_neighbourhood
from merkado_labs.enrichment.policy import POLICY_VERSION
from merkado_labs.enrichment.pricing import calculate_usage_cost_usd

ROOT = Path(__file__).resolve().parents[1]
SELECTION = ROOT / "data/processed/remax_terra_canary_selection.json"
RESULT = ROOT / "data/processed/remax_terra_canary_result.json"
APPROVED = {"hs2467", "hr1013", "hr2165", "hs2941", "hr1393"}


def test_selection_exactly_five_approved_ids() -> None:
    payload = json.loads(SELECTION.read_text(encoding="utf-8"))
    assert payload["source_key"] == "remax_curacao"
    assert payload["model_required"] == "gpt-5.6-terra"
    assert set(payload["external_ids"]) == APPROVED
    assert len(payload["listing_ids"]) == 5
    assert len(set(payload["listing_ids"])) == 5
    assert payload["prompt_version"] == PROMPT_VERSION
    assert payload["schema_version"] == SCHEMA_VERSION
    assert payload["policy_version"] == POLICY_VERSION


def test_historical_v1_does_not_count_as_identical_terra_v3() -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value.data = (
        []
    )
    assert (
        has_identical_enrichment_attempt(
            client,
            listing_id="listing-1",
            model="gpt-5.6-terra",
            input_checksum="abc",
        )
        is False
    )


def test_identical_terra_v3_is_detected_for_skip() -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value.data = [
        {"id": "p1", "status": "needs_review"}
    ]
    assert (
        has_identical_enrichment_attempt(
            client,
            listing_id="listing-1",
            model="gpt-5.6-terra",
            input_checksum="abc",
        )
        is True
    )


def test_cost_ceiling_and_no_sixth_listing_in_result() -> None:
    assert RESULT.exists(), "Canary result missing — run canary first"
    payload = json.loads(RESULT.read_text(encoding="utf-8"))
    result = payload["result"]
    assert result["processed"] == 5
    assert len(result["listing_results"]) == 5
    assert float(result["exact_cost_usd"]) <= 1.0
    ext = {item["external_id"] for item in result["listing_results"]}
    assert ext == APPROVED


def test_runner_enforces_batch_size_one_and_remax_canary_ids() -> None:
    text = (ROOT / "scripts/run_ai_enrichment_sample.py").read_text(encoding="utf-8")
    assert 'REMAX_TERRA_CANARY_EXTERNAL_IDS = frozenset' in text
    assert '"hs2467"' in text
    assert "--batch-size must be 1" in text
    assert "should_skip_unchanged_enrichment" in text


def test_generic_curacao_and_pricing_helpers() -> None:
    assert is_generic_neighbourhood("Curaçao")
    assert is_generic_neighbourhood("Curacao")
    cost, note = calculate_usage_cost_usd(
        model="gpt-5.6-terra", input_tokens=1000, output_tokens=1000
    )
    assert note is None
    assert cost is not None
    assert float(cost) > 0


def test_idempotency_dry_run_four_skips_one_billable() -> None:
    path = ROOT / "data/processed/remax_terra_canary_idempotency_check.json"
    assert path.exists(), "Run --dry-run-skip-check before asserting"
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["mode"] == "dry_run_skip_check"
    assert payload["note"] == "No OpenAI calls made"
    assert payload["preflight"]["listing_count"] == 5
    assert payload["preflight"]["billable_listing_count"] == 1
    assert payload["preflight"]["model"] == "gpt-5.6-terra"
    assert payload["preflight"]["project_ref"] == "csaefdkpwukshtouyixg"


def test_skip_helper_ignores_invalid_output_status() -> None:
    """Failed/invalid_output proposals must not count as identical successful attempts."""
    client = MagicMock()
    # Query filters status to succeeded/needs_review/skipped_unchanged only.
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value.data = (
        []
    )
    assert (
        has_identical_enrichment_attempt(
            client,
            listing_id="listing-fail",
            model="gpt-5.6-terra",
            input_checksum="deadbeef",
        )
        is False
    )


def test_protected_fields_and_evidence_modules_present() -> None:
    from merkado_labs.enrichment import fields, policy as policy_mod

    assert "bedrooms" in fields.PROTECTED_SOURCE_STRUCTURED_FIELDS
    assert "bathrooms" in fields.PROTECTED_SOURCE_STRUCTURED_FIELDS
    assert "listing_type" in fields.PROTECTED_SOURCE_STRUCTURED_FIELDS
    assert "property_type" in fields.PROTECTED_SOURCE_STRUCTURED_FIELDS
    text = Path(policy_mod.__file__).read_text(encoding="utf-8")
    assert "PROTECTED_SOURCE_STRUCTURED_FIELDS" in text
    assert "neighbourhood" in text.lower()
