#!/usr/bin/env python3
"""Read-only audit of existing AI enrichment proposals (no OpenAI calls)."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from merkado_labs.config import get_settings
from supabase import create_client

PROHIBITED = (
    "guaranteed appreciation",
    "risk-free",
    "legal title confirmed",
    "kadaster verified",
)


def main() -> int:
    settings = get_settings()
    client = create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )
    rows = (
        client.table("ai_enrichment_proposals")
        .select(
            "id,status,review_status,model,token_usage,proposal,warnings,"
            "confidence,supporting_evidence,error_message"
        )
        .execute()
        .data
        or []
    )
    by_status = Counter(r["status"] for r in rows)
    by_review = Counter(r.get("review_status") or "null" for r in rows)
    by_model = Counter(r["model"] for r in rows)
    tokens = sum(int((r.get("token_usage") or {}).get("total_tokens") or 0) for r in rows)
    missing_ev = 0
    prohibited = 0
    schema_ok = 0
    for r in rows:
        p = r.get("proposal") or {}
        if isinstance(p, dict) and p.get("concise_summary") and p.get("features"):
            schema_ok += 1
        feats = (p.get("features") or {}) if isinstance(p, dict) else {}
        for f in feats.values() if isinstance(feats, dict) else []:
            if (
                isinstance(f, dict)
                and f.get("value") == "present"
                and not f.get("supporting_evidence")
            ):
                missing_ev += 1
                break
        text = " ".join(
            str(x) for x in [p.get("concise_summary"), p.get("ai_description")] if x
        ).lower()
        if any(w in text for w in PROHIBITED):
            prohibited += 1
    report = {
        "total": len(rows),
        "by_status": dict(by_status),
        "by_review_status": dict(by_review),
        "by_model": dict(by_model),
        "total_tokens": tokens,
        "schema_ok_count": schema_ok,
        "missing_supporting_evidence_count": missing_ev,
        "prohibited_claim_hits": prohibited,
        "note": "No auto approve/reject. Manual review required for paid proposals.",
        "why_gpt_4_1_mini": (
            "Previous batch hardcoded MODEL=gpt-4.1-mini in "
            "scripts/run_ai_enrichment_batch25.py and DEFAULT_MODEL/config defaults "
            "before env-only hardening."
        ),
    }
    out = Path("data/processed/ai_proposal_audit_report.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
