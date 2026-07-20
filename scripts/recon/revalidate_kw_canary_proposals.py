"""Locally revalidate all KW Terra canary proposals (no OpenAI)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.policy import evaluate_proposal_attributes  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

CANARY = ("001JVD", "ADL-0006", "ZK2423", "JC-003", "ID-002")


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    summary = []
    for eid in CANARY:
        rows = (
            client.table("property_listings")
            .select("id,external_id,title,description,enrichment_status")
            .eq("external_id", eid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            continue
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
            continue
        prop_row = props[0]
        proposal = dict(prop_row.get("proposal") or {})
        evidence = dict(prop_row.get("supporting_evidence") or {})
        decisions = list(proposal.get("field_decisions") or [])
        if not decisions:
            decisions = list(
                ((evidence.get("run_audit") or {}).get("policy") or {}).get("decisions")
                or []
            )
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
                "local_revalidation": "evidence_grounding_2026-07-17",
            }
        )
        audit["policy"] = policy
        audit["fields_auto_applied"] = [d.key for d in evaluation.auto_applied]
        audit["fields_needing_attention"] = [d.key for d in evaluation.needs_attention]
        audit["fields_rejected"] = [d.key for d in evaluation.rejected]
        evidence["run_audit"] = audit
        proposal["field_decisions"] = new_decisions
        proposal["applied_attributes"] = applied
        status = "needs_review" if evaluation.needs_attention else "succeeded"
        client.table("ai_enrichment_proposals").update(
            {
                "proposal": proposal,
                "supporting_evidence": evidence,
                "status": status,
            }
        ).eq("id", prop_row["id"]).execute()
        client.table("property_listings").update(
            {"enrichment_status": status}
        ).eq("id", row["id"]).execute()
        summary.append(
            {
                "external_id": eid,
                "auto_applied": [d.key for d in evaluation.auto_applied],
                "needs_attention": [d.key for d in evaluation.needs_attention],
                "rejected": [d.key for d in evaluation.rejected],
                "terrace": next(
                    (
                        d.final_status.value
                        for d in evaluation.decisions
                        if d.key == "terrace"
                    ),
                    None,
                ),
            }
        )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
