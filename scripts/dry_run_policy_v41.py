"""Dry-run policy v4.1 rematerialization over all retained v4 proposals (no writes, no OpenAI)."""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.policy import (  # noqa: E402
    POLICY_VERSION,
    evaluate_proposal_attributes,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"


def _load_env() -> None:
    env = ROOT / "apps" / "labs-dashboard" / ".env.local"
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
    os.environ["SUPABASE_PROJECT_REF"] = LABS


def _attrs_from_proposal(body: dict) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    for attr in body.get("attributes") or []:
        if not isinstance(attr, dict) or not attr.get("key"):
            continue
        key = str(attr.get("key"))
        if key in seen or attr.get("value") in (None, "", "unknown"):
            continue
        seen.add(key)
        items.append(
            {
                "key": key,
                "value": attr.get("value"),
                "confidence": attr.get("confidence"),
                "evidence_snippet": attr.get("evidence_snippet")
                or attr.get("supporting_evidence"),
                "evidence_source": attr.get("evidence_source"),
                "extraction_reason": attr.get("extraction_reason"),
                "classification": attr.get("classification")
                or "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": attr.get("recommended_action") or "auto_apply",
            }
        )
    for decision in body.get("field_decisions") or []:
        if not isinstance(decision, dict):
            continue
        key = str(decision.get("key") or "")
        if not key or key in seen:
            continue
        if decision.get("proposed_value") in (None, "", "unknown"):
            continue
        seen.add(key)
        items.append(
            {
                "key": key,
                "value": decision.get("proposed_value"),
                "confidence": decision.get("confidence"),
                "evidence_snippet": decision.get("evidence_snippet"),
                "evidence_source": decision.get("evidence_source"),
                "extraction_reason": decision.get("extraction_reason"),
                "classification": decision.get("classification")
                or "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": decision.get("model_recommended_action")
                or "auto_apply",
            }
        )
    return items


def main() -> int:
    _load_env()
    if os.environ.get("SUPABASE_PROJECT_REF") != LABS:
        raise SystemExit("Labs only")
    if "jkrfyvukhhsapoivntms" in json.dumps(dict(os.environ)):
        raise SystemExit("Production reference loaded")

    client = create_labs_client()
    props: list[dict] = []
    page_size = 1000
    start = 0
    while True:
        chunk = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,proposal,status,generated_at,prompt_version"
            )
            .eq("prompt_version", "listing_enrichment_v4")
            .in_("status", ["succeeded", "needs_review"])
            .range(start, start + page_size - 1)
            .execute()
            .data
            or []
        )
        props.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    latest: dict[str, dict] = {}
    for row in sorted(props, key=lambda r: str(r.get("generated_at") or ""), reverse=True):
        lid = str(row["property_listing_id"])
        latest.setdefault(lid, row)

    listing_ids = list(latest)
    listings = {
        str(r["id"]): r
        for r in (
            client.table("property_listings")
            .select(
                "id,title,description,source_neighbourhood_text,property_type,"
                "bedrooms,bathrooms,amenities,inferred_neighbourhood_id"
            )
            .in_("id", listing_ids)
            .execute()
            .data
            or []
        )
    }
    nb = {
        r["id"]: r["name"]
        for r in (client.table("neighbourhoods").select("id,name").execute().data or [])
    }

    before = Counter()
    after = Counter()
    listings_before_attention = 0
    listings_after_attention = 0
    for lid, prop in latest.items():
        body = dict(prop.get("proposal") or {})
        decisions = body.get("field_decisions") or []
        before_attn = sum(1 for d in decisions if d.get("final_status") == "needs_attention")
        if before_attn:
            listings_before_attention += 1
        for d in decisions:
            before[str(d.get("final_status"))] += 1

        row = listings.get(lid) or {}
        source_values = {
            "title": row.get("title"),
            "source_description": row.get("description"),
            "description": row.get("description"),
            "cleaned_listing_text": row.get("description"),
            "source_neighbourhood_text": row.get("source_neighbourhood_text"),
            "property_type": row.get("property_type"),
            "bedrooms": row.get("bedrooms"),
            "bathrooms": row.get("bathrooms"),
            "existing_structured_features": row.get("amenities"),
            "inferred_neighbourhood_name": nb.get(row.get("inferred_neighbourhood_id")),
        }
        evaluation = evaluate_proposal_attributes(
            _attrs_from_proposal(body),
            source_values=source_values,
            source_text=row.get("description") or row.get("title") or "",
        )
        after_attn = len(evaluation.needs_attention)
        if after_attn:
            listings_after_attention += 1
        for d in evaluation.decisions:
            after[d.final_status.value] += 1

    non_redundant_after = (
        after["auto_applied"] + after["needs_attention"] + after["rejected"] + after["skipped"]
    )
    attention_rate = (
        (after["needs_attention"] / non_redundant_after) if non_redundant_after else 0.0
    )
    report = {
        "policy_version": POLICY_VERSION,
        "openai_calls": 0,
        "terra_calls": 0,
        "ai_cost_usd": 0.0,
        "retained_v4_listings": len(latest),
        "before_field_status": dict(before),
        "after_field_status": dict(after),
        "listings_with_attention_before": listings_before_attention,
        "listings_with_attention_after": listings_after_attention,
        "attention_share_of_non_redundant_after": round(attention_rate, 4),
        "meets_2pct_target": attention_rate <= 0.02,
        "writes": False,
    }
    out = ROOT / "data" / "processed" / "policy_v41_dry_run.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
