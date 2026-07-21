"""Idempotency guarantees for zero-cost policy rematerialization."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from replay_enrichment_policy import _attrs_from_proposal  # noqa: E402
from merkado_labs.enrichment.policy import evaluate_proposal_attributes  # noqa: E402
from merkado_labs.enrichment.values import AutoApplyStatus  # noqa: E402


def test_attrs_from_proposal_ignores_field_decisions_and_audit() -> None:
    body = {
        "attributes": [
            {
                "key": "pets_allowed",
                "value": False,
                "confidence": 0.98,
                "evidence_snippet": "no pets allowed",
                "conflict": False,
            }
        ],
        "field_decisions": [
            {
                "key": "pet_suitability",
                "proposed_value": False,
                "confidence": 0.98,
                "evidence_snippet": "no pets allowed",
                "conflict": True,
                "final_status": "needs_attention",
                "model_recommended_action": "needs_attention",
            }
        ],
    }
    evidence = {
        "run_audit": {
            "policy": {
                "decisions": [
                    {
                        "key": "has_pool",
                        "proposed_value": True,
                        "confidence": 0.99,
                        "evidence_snippet": "pool",
                        "conflict": False,
                    }
                ]
            }
        }
    }
    attrs = _attrs_from_proposal(body, evidence)
    keys = [a["key"] for a in attrs]
    assert keys == ["pet_suitability"]
    assert attrs[0]["conflict"] is False


def test_materialize_then_reeval_is_fixed_point() -> None:
    body = {
        "attributes": [
            {
                "key": "pets_allowed",
                "value": False,
                "confidence": 0.98,
                "evidence_snippet": "no pets allowed",
                "conflict": False,
            },
            {
                "key": "has_pool",
                "value": True,
                "confidence": 0.99,
                "evidence_snippet": "swimming pool",
                "conflict": False,
            },
        ],
        "neighbourhood_candidate": "Jan Thiel",
        "neighbourhood_candidate_confidence": 0.9,
        "neighbourhood_evidence": "Located in Jan Thiel",
    }
    corpus = "Apartment in Jan Thiel. No pets allowed. Swimming pool on site."
    source_values = {
        "title": "Apartment Jan Thiel",
        "description": corpus,
        "source_neighbourhood_text": "Jan Thiel",
        "location_explicit": True,
    }

    attrs_1 = _attrs_from_proposal(body, {})
    eval_1 = evaluate_proposal_attributes(
        attrs_1, source_values=source_values, source_text=corpus
    )
    decisions_1 = [d.as_dict() for d in eval_1.decisions]

    # Simulate apply writing field_decisions (including sticky conflict noise).
    body["field_decisions"] = [
        {
            **decisions_1[0],
            "conflict": True,
            "final_status": "needs_attention",
        },
        *decisions_1,
    ]
    attrs_2 = _attrs_from_proposal(body, {"run_audit": {"policy": {"decisions": decisions_1}}})
    eval_2 = evaluate_proposal_attributes(
        attrs_2, source_values=source_values, source_text=corpus
    )
    decisions_2 = [d.as_dict() for d in eval_2.decisions]

    assert [d["key"] for d in decisions_1] == [d["key"] for d in decisions_2]
    assert [d["final_status"] for d in decisions_1] == [
        d["final_status"] for d in decisions_2
    ]
    assert [tuple(d.get("reasons") or []) for d in decisions_1] == [
        tuple(d.get("reasons") or []) for d in decisions_2
    ]
    # No synonym inflation.
    assert len(decisions_2) == len({d["key"] for d in decisions_2})


def test_field_decision_backfill_cannot_force_needs_attention() -> None:
    body = {
        "attributes": [
            {
                "key": "pets_allowed",
                "value": False,
                "confidence": 0.98,
                "evidence_snippet": "pets are not allowed here",
                "conflict": False,
            }
        ],
        "field_decisions": [
            {
                "key": "pet_suitability",
                "proposed_value": False,
                "conflict": True,
                "final_status": "needs_attention",
            }
        ],
    }
    attrs = _attrs_from_proposal(body, None)
    evaluation = evaluate_proposal_attributes(
        attrs,
        source_text="Apartment policy: pets are not allowed here.",
    )
    assert len(evaluation.decisions) == 1
    assert evaluation.decisions[0].final_status == AutoApplyStatus.AUTO_APPLIED
