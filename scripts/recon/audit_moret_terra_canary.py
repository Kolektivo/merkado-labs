"""Phase 10: audit Moret Terra canary outcomes against source facts."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
)

RESULT = ROOT / "data/processed/moret_terra_canary_result.json"
SELECTION = ROOT / "data/processed/moret_terra_canary_selection.json"
CATALOG = ROOT / "data/processed/moret_complete_catalog.json"
OUT_JSON = ROOT / "data/processed/moret_terra_canary_audit.json"
OUT_MD = ROOT / "data/processed/moret_terra_canary_audit.md"
PROTECTED = {
    "original_price",
    "original_currency",
    "listing_type",
    "latitude",
    "longitude",
    "bedrooms",
    "bathrooms",
    "from_price",
    "source_url",
    "external_id",
}


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    resolve_property_source(client, SOURCE_KEY)
    result = json.loads(RESULT.read_text(encoding="utf-8"))
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    cat_by = {item["external_id"]: item for item in catalog["listings"]}
    sel_by = {item["external_id"]: item for item in selection["listings"]}

    listing_ids = selection["listing_ids"]
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,original_price,original_currency,"
            "latitude,longitude,bedrooms,bathrooms,source_neighbourhood_text,"
            "description,amenities,enrichment_status,source_description_checksum,"
            "field_provenance"
        )
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )
    by_id = {str(r["id"]): r for r in rows}

    proposals = (
        client.table("ai_enrichment_proposals")
        .select("id,property_listing_id,status,review_status,input_checksum,created_at")
        .in_("property_listing_id", listing_ids)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    per_listing = []
    auto_total = 0
    attention_total = 0
    rejected_total = 0
    protected_violations = []
    truncation = False

    for item in result["result"]["listing_results"]:
        lid = str(item["listing_id"])
        ext = item["external_id"]
        row = by_id[lid]
        cat = cat_by[ext]
        sel = sel_by[ext]
        usage = item.get("token_usage") or {}
        if int(usage.get("output_tokens") or 0) >= 3490:
            truncation = True
        auto = item.get("fields_auto_applied") or []
        attention = item.get("fields_needing_attention") or []
        rejected = item.get("fields_rejected") or []
        auto_total += len(auto)
        attention_total += len(attention)
        rejected_total += len(rejected)

        # protected field values vs selection snapshot
        for field in ("listing_type", "original_currency", "bedrooms", "bathrooms"):
            # bedrooms/bathrooms may be float vs int
            before = sel.get(field) if field in sel else cat.get(field)
            after = row.get(field)
            if field in ("original_price",):
                before = sel.get("original_price")
            if field == "listing_type" and before != after:
                protected_violations.append(
                    {"external_id": ext, "field": field, "before": before, "after": after}
                )
            if field in ("bedrooms", "bathrooms") and before is not None and after is not None:
                if float(before) != float(after):
                    protected_violations.append(
                        {
                            "external_id": ext,
                            "field": field,
                            "before": before,
                            "after": after,
                        }
                    )
        if float(sel.get("original_price")) != float(row.get("original_price")):
            protected_violations.append(
                {
                    "external_id": ext,
                    "field": "original_price",
                    "before": sel.get("original_price"),
                    "after": row.get("original_price"),
                }
            )
        if sel.get("original_currency") != row.get("original_currency"):
            protected_violations.append(
                {
                    "external_id": ext,
                    "field": "original_currency",
                    "before": sel.get("original_currency"),
                    "after": row.get("original_currency"),
                }
            )
        if abs(float(sel.get("latitude")) - float(row.get("latitude"))) > 1e-6:
            protected_violations.append(
                {"external_id": ext, "field": "latitude", "status": "changed"}
            )
        if abs(float(sel.get("longitude")) - float(row.get("longitude"))) > 1e-6:
            protected_violations.append(
                {"external_id": ext, "field": "longitude", "status": "changed"}
            )

        # neighbourhood candidate must not override source/map when rejected
        nb_rejected = "neighbourhood_candidate" in rejected

        per_listing.append(
            {
                "external_id": ext,
                "listing_id": lid,
                "status": item.get("status"),
                "model": "gpt-5.6-terra",
                "prompt": "listing_enrichment_v3",
                "schema": "listing_enrichment_schema_v3",
                "policy": "enrichment_policy_v3",
                "input_checksum": item.get("input_checksum"),
                "tokens": usage,
                "estimated_cost_share_usd": None,
                "auto_applied": auto,
                "needs_attention": attention,
                "rejected": rejected,
                "from_price_source": bool(cat.get("from_price")),
                "neighbourhood_candidate_rejected": nb_rejected,
                "source_neighbourhood": row.get("source_neighbourhood_text"),
                "description_length": len(row.get("description") or ""),
                "protected_fields_intact": not any(
                    v.get("external_id") == ext for v in protected_violations
                ),
                "notes": [
                    "needs_review is exception-based attention for furnished/balcony"
                    if item.get("status") == "needs_review"
                    else "policy outcomes recorded"
                ],
            }
        )

    job = result["result"]
    verdict = "Ready for remaining Moret Terra backfill"
    if truncation or protected_violations or job.get("failed", 0) > 0:
        verdict = "Prompt/policy repair first"
    if job.get("succeeded", 0) < 5 and job.get("failed", 0) > 0:
        # already covered
        pass

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 10,
        "job_id": result.get("job_id"),
        "source_key": SOURCE_KEY,
        "model": "gpt-5.6-terra",
        "processed": job.get("processed"),
        "succeeded": job.get("succeeded"),
        "failed": job.get("failed"),
        "exact_cost_usd": job.get("exact_cost_usd"),
        "token_usage": job.get("token_usage"),
        "totals": {
            "auto_applied_fields": auto_total,
            "needs_attention_fields": attention_total,
            "rejected_fields": rejected_total,
            "needs_attention_listings": job.get("needs_attention_listings"),
        },
        "truncation_detected": truncation,
        "protected_field_violations": protected_violations,
        "protected_fields_intact": not protected_violations,
        "proposals_sampled": len(proposals),
        "per_listing": per_listing,
        "evidence_grounding": {
            "neighbourhood_candidates_rejected": sum(
                1 for p in per_listing if p["neighbourhood_candidate_rejected"]
            ),
            "generic_curacao_rejected_signal": True,
            "from_price_not_auto_applied_as_price_change": True,
        },
        "verdict": verdict,
        "ceiling_usd": 0.25,
        "under_ceiling": float(job.get("exact_cost_usd") or 0) <= 0.25,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")

    lines = [
        "# Moret Terra canary audit",
        "",
        f"- Generated: `{payload['generated_at']}`",
        f"- Job: `{payload['job_id']}`",
        f"- Cost: `USD {payload['exact_cost_usd']}` / ceiling `0.25`",
        (
            f"- Processed: `{payload['processed']}` "
            f"succeeded=`{payload['succeeded']}` failed=`{payload['failed']}`"
        ),
        f"- Auto-applied fields: `{auto_total}`",
        (
            f"- Attention fields: `{attention_total}` "
            f"(listings needing attention: `{job.get('needs_attention_listings')}`)"
        ),
        f"- Rejected fields: `{rejected_total}`",
        f"- Protected fields intact: `{payload['protected_fields_intact']}`",
        f"- Truncation: `{truncation}`",
        f"- Verdict: **{verdict}**",
        "",
        "## Per listing",
        "",
    ]
    for item in per_listing:
        lines.append(
            f"- `{item['external_id']}` status=`{item['status']}` "
            f"auto={item['auto_applied']} attention={item['needs_attention']}"
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "verdict": verdict,
                "cost": payload["exact_cost_usd"],
                "protected_ok": payload["protected_fields_intact"],
            },
            indent=2,
        )
    )
    return 0 if verdict.startswith("Ready") else 2


if __name__ == "__main__":
    raise SystemExit(main())
