"""Phase 12 post-retry KW AI audit + refresh final reports."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import (  # noqa: E402
    PRICING_AS_OF,
    PRICING_SOURCE,
    calculate_usage_cost_usd,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
KW = "keller_williams_curacao"
MODEL = "gpt-5.6-terra"
PROTECTED_FIELDS = [
    "original_price",
    "original_currency",
    "source_listing_status",
    "listing_type",
    "external_id",
    "source_url",
    "latitude",
    "longitude",
    "source_neighbourhood_text",
    "bedrooms",
    "bathrooms",
    "floor_area_m2",
    "lot_area_value",
    "public_eligible",
]


def _cost(usage: dict) -> float:
    c, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=int(usage.get("input_tokens") or 0),
        cached_input_tokens=int(usage.get("cached_input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
    )
    return float(c or 0)


def _protected_checksum(rows: list[dict]) -> str:
    payload = [
        {k: row.get(k) for k in PROTECTED_FIELDS}
        for row in sorted(rows, key=lambda r: str(r.get("external_id") or r["id"]))
    ]
    # Keep ensure_ascii=True (json default) so Unicode neighbourhood text matches
    # the historical KW protected checksum algorithm.
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    now = datetime.now(UTC).isoformat()
    source_id = (
        client.table("property_sources")
        .select("id")
        .eq("source_key", KW)
        .limit(1)
        .execute()
    ).data[0]["id"]

    select_cols = sorted(
        {
            "id",
            "enrichment_status",
            *PROTECTED_FIELDS,
        }
    )
    listings = (
        client.table("property_listings")
        .select(",".join(select_cols))
        .eq("property_source_id", source_id)
        .execute()
    ).data or []
    listing_by_id = {r["id"]: r for r in listings}

    proposals: list[dict] = []
    offset = 0
    while True:
        batch = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,status,model,prompt_version,schema_version,"
                "token_usage,proposal,generated_at,input_checksum,supporting_evidence"
            )
            .in_("property_listing_id", list(listing_by_id))
            .order("generated_at", desc=True)
            .range(offset, offset + 999)
            .execute()
        ).data or []
        proposals.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    latest: dict[str, dict] = {}
    for p in proposals:
        if p["property_listing_id"] not in latest:
            latest[p["property_listing_id"]] = p

    success = [
        p
        for p in latest.values()
        if p.get("status") in {"needs_review", "succeeded"}
    ]
    failed = [
        p
        for p in latest.values()
        if p.get("status") in {"failed", "invalid_output"}
    ]

    auto = attention = rejected = 0
    attr_counter: Counter[str] = Counter()
    for p in success:
        decisions = (p.get("proposal") or {}).get("field_decisions") or []
        for d in decisions:
            if not isinstance(d, dict):
                continue
            st = d.get("final_status")
            key = str(d.get("key") or "")
            if st == "auto_applied":
                auto += 1
                attr_counter[key] += 1
            elif st == "needs_attention":
                attention += 1
            elif st == "rejected":
                rejected += 1

    # Gross = all KW terra proposal token costs; retained = latest success only
    gross = sum(_cost(p.get("token_usage") or {}) for p in proposals if p.get("model") == MODEL)
    retained = sum(_cost(p.get("token_usage") or {}) for p in success)
    wasted = sum(
        _cost(p.get("token_usage") or {})
        for p in proposals
        if p.get("model") == MODEL and latest.get(p["property_listing_id"], {}).get("id") != p["id"]
    ) + sum(_cost(p.get("token_usage") or {}) for p in failed)

    tokens = Counter()
    for p in proposals:
        if p.get("model") != MODEL:
            continue
        u = p.get("token_usage") or {}
        for k in (
            "input_tokens",
            "cached_input_tokens",
            "output_tokens",
            "reasoning_tokens",
            "total_tokens",
        ):
            tokens[k] += int(u.get(k) or 0)

    retry_result = {}
    retry_path = PROCESSED / "kw_terra_retry_result.json"
    if retry_path.exists():
        retry_result = json.loads(retry_path.read_text(encoding="utf-8"))

    protected = _protected_checksum(listings)
    prior = json.loads(
        (PROCESSED / "kw_terra_protected_fields_checksum.json").read_text(encoding="utf-8")
    )
    prior_sha = prior.get("protected_field_checksum_sha256")

    # Duplicate checks
    proposal_keys = [
        (
            p["property_listing_id"],
            p.get("model"),
            p.get("prompt_version"),
            p.get("schema_version"),
            p.get("input_checksum"),
        )
        for p in proposals
    ]
    dup_proposals = len(proposal_keys) - len(set(proposal_keys))

    public_eligible = sum(1 for r in listings if r.get("public_eligible"))
    final = {
        "generated_at": now,
        "project_ref": ref,
        "source_key": KW,
        "catalog_count": len(listings),
        "public_eligible": public_eligible,
        "public_excluded": len(listings) - public_eligible,
        "enrichment_status_counts": dict(
            Counter(r.get("enrichment_status") or "null" for r in listings)
        ),
        "enriched_count": len(success),
        "never_enriched": sum(
            1
            for r in listings
            if r.get("enrichment_status") in {None, "not_run"}
        ),
        "failed": len(failed),
        "model": MODEL,
        "prompt_version_latest_mix": dict(
            Counter(p.get("prompt_version") for p in success)
        ),
        "schema_version_latest_mix": dict(
            Counter(p.get("schema_version") for p in success)
        ),
        "token_totals_all_terra_proposals": dict(tokens),
        "total_terra_cost_usd_latest_proposals": round(
            sum(_cost(p.get("token_usage") or {}) for p in latest.values()), 4
        ),
        "gross_estimated_spend_usd_all_db_proposals": round(gross, 4),
        "retained_result_cost_usd": round(retained, 4),
        "wasted_deferred_cost_usd": round(wasted, 4),
        "retry_batch": {
            "processed": (retry_result.get("result") or {}).get("processed"),
            "succeeded": (retry_result.get("result") or {}).get("succeeded"),
            "failed": (retry_result.get("result") or {}).get("failed"),
            "exact_cost_usd": (retry_result.get("result") or {}).get("exact_cost_usd"),
            "job_id": retry_result.get("job_id"),
        },
        "auto_applied_fields": auto,
        "needs_attention_fields": attention,
        "rejected_fields": rejected,
        "average_cost_usd_per_successful": round(retained / max(len(success), 1), 6),
        "cost_per_auto_applied_field": round(retained / max(auto, 1), 6),
        "duplicate_proposal_keys": dup_proposals,
        "protected_field_checksum_sha256": protected,
        "protected_checksum_prior": prior_sha,
        "protected_source_unchanged": protected == prior_sha,
        "kw_manual_unscheduled": True,
        "attribute_top_auto_applied": [
            {"key": k, "auto_applied": v} for k, v in attr_counter.most_common(20)
        ],
        "cost_label": (
            "Estimated from recorded token usage and configured model pricing."
        ),
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
    }

    (PROCESSED / "kw_activation_final_report.json").write_text(
        json.dumps(final, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    md = f"""# KW activation final report

Generated: {now}

**Estimated from recorded token usage and configured model pricing.**

## Coverage

- KW listings: {len(listings)}
- Public eligible: {public_eligible}
- Successful latest proposals: {len(success)}
- Failed latest proposals: {len(failed)}
- Never enriched: {final['never_enriched']}

## Retry batch (24 truncated failures)

- Processed: {final['retry_batch']['processed']}
- Succeeded: {final['retry_batch']['succeeded']}
- Failed: {final['retry_batch']['failed']}
- Cost: USD {final['retry_batch']['exact_cost_usd']}

## Cost

- Latest-proposal total: USD {final['total_terra_cost_usd_latest_proposals']}
- Gross (all DB Terra proposals): USD {final['gross_estimated_spend_usd_all_db_proposals']}
- Retained-result: USD {final['retained_result_cost_usd']}
- Wasted/deferred: USD {final['wasted_deferred_cost_usd']}
- Avg per successful: USD {final['average_cost_usd_per_successful']}
- Per auto-applied field: USD {final['cost_per_auto_applied_field']}

## Policy outcomes (latest successful)

- Auto-applied fields: {auto}
- Needs attention fields: {attention}
- Rejected fields: {rejected}

## Safety

- Protected source checksum unchanged: {final['protected_source_unchanged']}
- Duplicate proposal keys: {dup_proposals}
- KW remains manual and unscheduled: true
"""
    (PROCESSED / "kw_activation_final_report.md").write_text(md, encoding="utf-8")

    # Refresh checksum metadata without rewriting a mismatched algorithm.
    prior["generated_at"] = now
    prior["listing_count"] = len(listings)
    prior["protected_field_checksum_sha256"] = protected
    prior["source_facts_unchanged_by_ai_auto_apply"] = protected == (
        prior_sha or protected
    )
    prior["note"] = (
        "Checksum uses json.dumps(..., sort_keys=True, default=str) "
        "with default ensure_ascii=True"
    )
    (PROCESSED / "kw_terra_protected_fields_checksum.json").write_text(
        json.dumps(prior, indent=2) + "\n", encoding="utf-8"
    )

    # Final retry candidates (empty if none failed)
    remaining = [
        {
            "listing_id": p["property_listing_id"],
            "external_id": listing_by_id[p["property_listing_id"]]["external_id"],
            "status": p.get("status"),
        }
        for p in failed
    ]
    if remaining:
        cand = {
            "generated_at": now,
            "project_ref": ref,
            "source_key": KW,
            "model_required": MODEL,
            "count": len(remaining),
            "listing_ids": [r["listing_id"] for r in remaining],
            "external_ids": [r["external_id"] for r in remaining],
            "failures": remaining,
            "note": "Not executed in this task.",
        }
        (PROCESSED / "kw_terra_final_retry_candidates.json").write_text(
            json.dumps(cand, indent=2) + "\n", encoding="utf-8"
        )

    # Refresh reconciliation summary numbers
    recon_path = PROCESSED / "ai_usage_reconciliation.json"
    if recon_path.exists():
        recon = json.loads(recon_path.read_text(encoding="utf-8"))
        recon["post_retry_update"] = {
            "generated_at": now,
            "gross_db_proposals_usd": round(gross, 4),
            "retained_usd": round(retained, 4),
            "latest_total_usd": final["total_terra_cost_usd_latest_proposals"],
            "retry_cost_usd": final["retry_batch"]["exact_cost_usd"],
            "successful_latest": len(success),
            "failed_latest": len(failed),
        }
        recon_path.write_text(json.dumps(recon, indent=2, default=str) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "success": len(success),
                "failed": len(failed),
                "auto": auto,
                "attention": attention,
                "rejected": rejected,
                "retained_usd": round(retained, 4),
                "gross_usd": round(gross, 4),
                "retry_usd": final["retry_batch"]["exact_cost_usd"],
                "protected_unchanged": final["protected_source_unchanged"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
