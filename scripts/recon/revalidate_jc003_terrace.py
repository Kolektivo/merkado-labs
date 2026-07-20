"""Revalidate JC-003 terrace via local policy only (no OpenAI)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.policy import (  # noqa: E402
    evaluate_proposal_attributes,
)
from merkado_labs.enrichment.values import AutoApplyStatus  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    rows = (
        client.table("property_listings")
        .select("id,external_id,title,description")
        .eq("external_id", "JC-003")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise SystemExit("JC-003 not found")
    row = rows[0]
    props = (
        client.table("ai_enrichment_proposals")
        .select("id,proposal,supporting_evidence,status")
        .eq("property_listing_id", row["id"])
        .eq("model", "gpt-5.6-terra")
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not props:
        raise SystemExit("No Terra proposal for JC-003")
    prop_row = props[0]
    proposal = dict(prop_row.get("proposal") or {})
    evidence = dict(prop_row.get("supporting_evidence") or {})
    decisions = list(proposal.get("field_decisions") or [])
    if not decisions:
        audit = (evidence.get("run_audit") or {}).get("policy") or {}
        decisions = list(audit.get("decisions") or [])

    # Rebuild attribute list from prior decisions for local revalidation.
    attrs = [
        {
            "key": d.get("key"),
            "value": d.get("proposed_value"),
            "confidence": d.get("confidence"),
            "evidence_snippet": d.get("evidence_snippet"),
            "evidence_source": d.get("evidence_source"),
            "extraction_reason": d.get("extraction_reason"),
            "classification": d.get("classification") or "ai_extracted_from_source",
            "conflict": bool(d.get("conflict")),
            "recommended_action": d.get("model_recommended_action")
            or "needs_attention",
        }
        for d in decisions
        if d.get("key")
    ]
    source_text = "\n".join(
        part for part in (row.get("title"), row.get("description")) if part
    )
    evaluation = evaluate_proposal_attributes(attrs, source_text=source_text)
    new_decisions = [d.as_dict() for d in evaluation.decisions]
    terrace = next((d for d in new_decisions if d.get("key") == "terrace"), None)
    if terrace is None:
        raise SystemExit("terrace decision missing after revalidation")
    if terrace.get("final_status") not in {
        AutoApplyStatus.NEEDS_ATTENTION.value,
        AutoApplyStatus.REJECTED.value,
    }:
        raise SystemExit(
            f"Expected terrace needs_attention/rejected, got {terrace.get('final_status')}"
        )

    # Preserve other canary auto-applies unless grounding now rejects them.
    applied = [
        {
            "key": d.key,
            "effective_value": d.resulting_effective,
            "provenance": "ai_extracted",
            "confidence": d.confidence,
        }
        for d in evaluation.auto_applied
    ]
    audit = dict(evidence.get("run_audit") or {})
    policy = dict(audit.get("policy") or {})
    policy.update(
        {
            "decisions": new_decisions,
            "auto_applied_count": len(evaluation.auto_applied),
            "needs_attention_count": len(evaluation.needs_attention),
            "rejected_count": len(evaluation.rejected),
            "local_revalidation": "terrace_evidence_grounding_2026-07-17",
        }
    )
    audit["policy"] = policy
    audit["fields_auto_applied"] = [d.key for d in evaluation.auto_applied]
    audit["fields_needing_attention"] = [d.key for d in evaluation.needs_attention]
    audit["fields_rejected"] = [d.key for d in evaluation.rejected]
    evidence["run_audit"] = audit
    proposal["field_decisions"] = new_decisions
    proposal["applied_attributes"] = applied
    proposal["local_revalidation"] = {
        "reason": "terrace_variant_needs_attention",
        "terrace_final_status": terrace.get("final_status"),
        "terrace_reasons": terrace.get("reasons"),
    }

    client.table("ai_enrichment_proposals").update(
        {
            "proposal": proposal,
            "supporting_evidence": evidence,
            "status": "needs_review"
            if evaluation.needs_attention
            else prop_row.get("status"),
        }
    ).eq("id", prop_row["id"]).execute()

    # Keep listing enrichment status needs_review when attention remains.
    if evaluation.needs_attention:
        client.table("property_listings").update(
            {"enrichment_status": "needs_review"}
        ).eq("id", row["id"]).execute()

    print(
        json.dumps(
            {
                "listing_id": row["id"],
                "external_id": "JC-003",
                "terrace_final_status": terrace.get("final_status"),
                "terrace_reasons": terrace.get("reasons"),
                "auto_applied_count": len(evaluation.auto_applied),
                "needs_attention_count": len(evaluation.needs_attention),
                "rejected_count": len(evaluation.rejected),
                "applied_keys": [a["key"] for a in applied],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
