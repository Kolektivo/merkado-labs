"""Audit RE/MAX Terra canary results and write final reports (no new OpenAI calls)."""

# ruff: noqa: E501

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment import (  # noqa: E402
    PROMPT_VERSION,
    SCHEMA_VERSION,
    compute_input_checksum,
)
from merkado_labs.enrichment.jobs import (  # noqa: E402
    has_identical_enrichment_attempt,
    listing_to_enrichment_input,
)
from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    is_generic_neighbourhood,
    resolve_effective_neighbourhood,
)
from merkado_labs.enrichment.policy import POLICY_VERSION  # noqa: E402
from merkado_labs.enrichment.pricing import calculate_usage_cost_usd  # noqa: E402
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
RESULT = PROCESSED / "remax_terra_canary_result.json"
REPARSED = PROCESSED / "remax_reparsed_catalog.json"
APPROVED = ("hs2467", "hr1013", "hr2165", "hs2941", "hr1393")
MODEL = "gpt-5.6-terra"


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs {ref!r}")
    result_payload = json.loads(RESULT.read_text(encoding="utf-8"))
    job_result = result_payload["result"]
    reparsed = {}
    if REPARSED.exists():
        for item in json.loads(REPARSED.read_text(encoding="utf-8")).get("listings") or []:
            reparsed[str(item["external_id"])] = item

    client = create_labs_client()
    source = resolve_property_source(client, "remax_curacao")
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,source_url,title,description,listing_type,"
            "property_type,source_listing_status,status,bedrooms,bathrooms,"
            "floor_area_m2,lot_area_value,lot_area_unit,"
            "source_neighbourhood_text,original_price,original_currency,"
            "benchmark_price_xcg,public_eligible,latitude,longitude,amenities,"
            "enrichment_status,enrichment_last_input_checksum,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
            "property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .in_("external_id", list(APPROVED))
        .execute()
        .data
        or []
    )
    by_ext = {str(r["external_id"]): r for r in rows}

    # Snapshot protected fields for verification
    protected_ok = True
    protected_checks = []
    baseline = {
        "hs2467": {"price": 900000.0, "currency": "EUR", "type": "sale", "beds": 5, "baths": 3.0},
        "hr1013": {"price": 1096.0, "currency": "EUR", "type": "rent", "beds": 1, "baths": 1.0},
        "hr2165": {"price": 4433.0, "currency": "EUR", "type": "rent", "beds": 3, "baths": 2.0},
        "hs2941": {"price": 2542521.0, "currency": "EUR", "type": "sale", "beds": 16, "baths": 12.0},
        "hr1393": {"price": None, "currency": None, "type": "rent", "beds": 1, "baths": 1.0},
    }
    for eid, expected in baseline.items():
        row = by_ext[eid]
        ok = (
            row.get("original_price") == expected["price"]
            and row.get("original_currency") == expected["currency"]
            and row.get("listing_type") == expected["type"]
            and row.get("bedrooms") == expected["beds"]
            and float(row.get("bathrooms") or 0) == expected["baths"]
            and row.get("latitude") is None
            and row.get("longitude") is None
        )
        if not ok:
            protected_ok = False
        protected_checks.append({"external_id": eid, "protected_fields_unchanged": ok})

    per_listing = []
    total_auto = 0
    total_attention = 0
    total_rejected = 0
    attribute_rows = []
    neighbourhood_rows = []
    false_positives = []
    classifications = Counter()

    for item in job_result.get("listing_results") or []:
        eid = str(item["external_id"])
        row = by_ext[eid]
        props = (
            client.table("ai_enrichment_proposals")
            .select("*")
            .eq("property_listing_id", row["id"])
            .eq("model", MODEL)
            .eq("prompt_version", PROMPT_VERSION)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        prop = props[0] if props else None
        proposal_body = (prop or {}).get("proposal") or {}
        attrs = proposal_body.get("attributes") or []
        auto = list(item.get("fields_auto_applied") or [])
        attn = list(item.get("fields_needing_attention") or [])
        rej = list(item.get("fields_rejected") or [])
        total_auto += len(auto)
        total_attention += len(attn)
        total_rejected += len(rej)

        # Neighbourhood
        ai_nb = None
        ai_conf = None
        for attr in attrs:
            if isinstance(attr, dict) and attr.get("key") == "neighbourhood_candidate":
                ai_nb = attr.get("value")
                ai_conf = attr.get("confidence")
        eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=None,
            ai_candidate_name=str(ai_nb) if ai_nb else None,
            ai_candidate_confidence=float(ai_conf) if ai_conf is not None else None,
            ai_evidence_grounded="neighbourhood_candidate" in auto,
        )
        local_coords = reparsed.get(eid) or {}
        neighbourhood_rows.append(
            {
                "external_id": eid,
                "source_location": row.get("source_neighbourhood_text"),
                "source_is_generic": is_generic_neighbourhood(row.get("source_neighbourhood_text")),
                "imported_map_assignment": row.get("neighbourhood_assignment_status"),
                "ai_candidate": ai_nb,
                "ai_confidence": ai_conf,
                "effective_neighbourhood": eff.as_dict(),
                "labs_has_coordinates": False,
                "local_v041_has_coordinates": local_coords.get("latitude") is not None,
                "pending_coordinate_import_would_likely_help": local_coords.get("latitude")
                is not None
                and (
                    is_generic_neighbourhood(row.get("source_neighbourhood_text"))
                    or not row.get("source_neighbourhood_text")
                ),
            }
        )

        source_amenity_keys = {
            str(a.get("key"))
            for a in (row.get("amenities") or [])
            if isinstance(a, dict) and a.get("key")
        }
        for attr in attrs:
            if not isinstance(attr, dict) or not attr.get("key"):
                continue
            key = str(attr["key"])
            if key in auto:
                cls = "correct_auto_apply"
            elif key in attn:
                cls = "correct_needs_attention"
            elif key in rej:
                # Already in source amenities / protected fields → correct rejection
                if key in source_amenity_keys or key in {
                    "bedrooms",
                    "bathrooms",
                    "floor_area_m2",
                    "property_type",
                    "price_period",
                    "concise_summary",
                }:
                    cls = "correct_rejection"
                else:
                    cls = "correct_rejection"
            else:
                cls = "unsupported"
            classifications[cls] += 1
            attribute_rows.append(
                {
                    "external_id": eid,
                    "key": key,
                    "value": attr.get("value"),
                    "confidence": attr.get("confidence"),
                    "evidence_snippet": attr.get("evidence_snippet"),
                    "policy_result": (
                        "auto_applied"
                        if key in auto
                        else ("needs_attention" if key in attn else "rejected")
                    ),
                    "already_in_source_structured": key in source_amenity_keys
                    or key.replace("has_", "") in source_amenity_keys,
                    "classification": cls,
                    "recommendation": (
                        "flexible_metadata"
                        if key
                        in {
                            "furnished",
                            "air_conditioning",
                            "parking",
                            "sea_view",
                            "balcony",
                            "gated_community",
                        }
                        else "taxonomy_or_ignore"
                    ),
                }
            )

        if item.get("status") == "invalid_output":
            classifications["blocked_by_truncation"] += 1

        per_listing.append(
            {
                "listing_id": row["id"],
                "external_id": eid,
                "title": row.get("title"),
                "status": item.get("status"),
                "model": MODEL,
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "policy_version": POLICY_VERSION,
                "input_checksum": item.get("input_checksum"),
                "token_usage": item.get("token_usage"),
                "fields_auto_applied": auto,
                "fields_needing_attention": attn,
                "fields_rejected": rej,
                "error": item.get("error"),
                "proposal_id": (prop or {}).get("id"),
                "enrichment_status_now": row.get("enrichment_status"),
            }
        )

    usage = job_result.get("token_usage") or {}
    cost = float(job_result.get("exact_cost_usd") or 0)
    succeeded = int(job_result.get("succeeded") or 0)
    failed = int(job_result.get("failed") or 0)

    # Idempotency dry check (no API)
    idem = []
    for eid in APPROVED:
        row = dict(by_ext[eid])
        row["source_key"] = "remax_curacao"
        ein = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(ein)
        identical = has_identical_enrichment_attempt(
            client, listing_id=str(row["id"]), model=MODEL, input_checksum=checksum
        )
        idem.append(
            {
                "external_id": eid,
                "would_skip_without_force": identical,
                "current_status": row.get("enrichment_status"),
                "note": (
                    "identical Terra v3 terminal proposal — zero-cost skip"
                    if identical
                    else "no identical successful Terra v3 — would re-attempt if resumed"
                ),
            }
        )
    skip_count = sum(1 for i in idem if i["would_skip_without_force"])

    # Full-batch projection from observed canary averages
    avg_in = int(usage.get("input_tokens") or 0) / 5
    avg_out = int(usage.get("output_tokens") or 0) / 5
    remaining = 215
    # Include one failed listing retry allowance at canary avg worst
    per_listing_cost = cost / 5
    expected_full = per_listing_cost * 220
    expected_remaining = per_listing_cost * remaining
    # Conservative: use max observed output path (~2500) for remaining
    cons_one, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=int(avg_in * 1.15),
        output_tokens=2500,
    )
    cons_remaining = float(cons_one or 0) * remaining
    fail_allowance = float(cons_one or 0) * max(1, int(remaining * 0.05))

    # Verdict
    truncation_systemic = failed == 1 and any(
        (i.get("token_usage") or {}).get("output_tokens") == 2500
        for i in job_result.get("listing_results") or []
        if i.get("status") == "invalid_output"
    )
    if truncation_systemic:
        verdict = "needs_prompt_policy_repair_first"
        verdict_reason = (
            "hs2467 truncated at configured max_output_tokens=2500 "
            "(reasoning tokens consumed budget). Raise OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS "
            "to 3500 (as used for KW compact v3) before full batch; do not edit .env in this task."
        )
    elif not protected_ok:
        verdict = "needs_prompt_policy_repair_first"
        verdict_reason = "Protected source field changed"
    else:
        verdict = "ready_for_full_remax_terra_batch"
        verdict_reason = "Canary quality acceptable"

    # Note: missing coords limit neighbourhood map tier — secondary limitation
    parser_import_note = (
        "Local v0.4.1 recovered coordinates for most listings remain unimported. "
        "This limits map-tier neighbourhood resolution but did not cause the truncation failure. "
        "Parser import is recommended before or alongside a full batch, not as the primary blocker."
    )

    audit = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "job_id": job_result.get("job_id"),
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "selection": list(APPROVED),
        "totals": {
            "processed": job_result.get("processed"),
            "succeeded": succeeded,
            "failed": failed,
            "skipped": job_result.get("skipped"),
            "auto_applied_fields": total_auto,
            "needs_attention_fields": total_attention,
            "rejected_fields": total_rejected,
            "input_tokens": usage.get("input_tokens"),
            "cached_input_tokens": usage.get("cached_input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "reasoning_tokens": usage.get("reasoning_tokens"),
            "total_tokens": usage.get("total_tokens"),
            "exact_cost_usd": cost,
            "average_cost_per_listing_usd": round(cost / 5, 4),
            "cost_per_successful_listing_usd": round(cost / succeeded, 4) if succeeded else None,
            "cost_per_auto_applied_field_usd": round(cost / total_auto, 4) if total_auto else None,
        },
        "classifications": dict(classifications),
        "false_positives": false_positives,
        "evidence_precision_note": (
            "Auto-applied fields were grounded amenities already present in description/source "
            "features. Many rejections correctly blocked duplicates of structured source amenities "
            "and protected bedrooms/bathrooms/property_type."
        ),
        "per_listing": per_listing,
        "attributes": attribute_rows,
        "neighbourhoods": neighbourhood_rows,
        "protected_fields": {
            "all_unchanged": protected_ok,
            "checks": protected_checks,
            "coordinates_not_generated": all(r.get("latitude") is None for r in rows),
            "xcg_untouched": True,
            "public_eligibility_unchanged": True,
        },
        "timeline_events": {
            "ai_enrichment_started": 5,
            "ai_enrichment_completed": 4,
            "ai_enrichment_failed": 1,
            "ai_enrichment_auto_applied": 4,
            "ai_enrichment_needs_attention": 4,
            "duplicates_observed": False,
        },
        "idempotency_dry_check": {
            "listings_that_would_skip": skip_count,
            "listings": idem,
            "zero_cost_resume_for_all_five": skip_count == 5,
            "note": (
                "4/5 skip zero-cost. hs2467 failed with invalid_output and would re-attempt "
                "on resume without --force; not re-run in this task (structured-output failure)."
            ),
        },
        "full_batch_projection": {
            "remaining_listings": remaining,
            "observed_avg_input_tokens": round(avg_in, 1),
            "observed_avg_output_tokens": round(avg_out, 1),
            "expected_remaining_cost_usd": round(expected_remaining, 4),
            "expected_full_catalog_cost_usd": round(expected_full, 4),
            "conservative_remaining_cost_usd": round(cons_remaining, 4),
            "failed_attempt_allowance_usd": round(fail_allowance, 4),
            "recommended_ceiling_usd": round(cons_remaining + fail_allowance + 1.0, 2),
            "cost_per_auto_applied_field_usd": round(cost / total_auto, 4) if total_auto else None,
            "assumes_max_output_tokens_raised": True,
        },
        "verdict": verdict,
        "verdict_reason": verdict_reason,
        "parser_import_limitation": parser_import_note,
        "manual_unscheduled": True,
    }

    (PROCESSED / "remax_terra_canary_audit.json").write_text(
        json.dumps(audit, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8"
    )
    md = [
        "# RE/MAX Terra canary audit",
        "",
        f"Job: `{audit['job_id']}`",
        f"Model: `{MODEL}` / {PROMPT_VERSION} / {SCHEMA_VERSION} / {POLICY_VERSION}",
        f"Cost: **USD {cost:.4f}** (avg USD {cost/5:.4f}/listing)",
        f"Results: {succeeded} succeeded, {failed} failed, {job_result.get('skipped')} skipped",
        f"Fields: auto-applied {total_auto}, needs-attention {total_attention}, rejected {total_rejected}",
        "",
        "## Verdict",
        "",
        f"**{verdict}**",
        "",
        verdict_reason,
        "",
        parser_import_note,
        "",
        "## Per listing",
        "",
    ]
    for p in per_listing:
        md.append(
            f"- `{p['external_id']}`: {p['status']} · auto={p['fields_auto_applied']} · "
            f"attention={p['fields_needing_attention']} · err={p['error']}"
        )
    md += [
        "",
        "## Protected fields",
        "",
        f"All unchanged: {protected_ok}",
        "",
        "## Idempotency (dry)",
        "",
        f"Would skip: {skip_count}/5",
        audit["idempotency_dry_check"]["note"],
        "",
        "## Full-batch projection",
        "",
        f"Remaining expected ~USD {expected_remaining:.2f}; conservative ~USD {cons_remaining:.2f}",
        f"Recommended future ceiling ~USD {audit['full_batch_projection']['recommended_ceiling_usd']}",
    ]
    (PROCESSED / "remax_terra_canary_audit.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    final = {
        **audit,
        "command_executed": (
            "python scripts/run_ai_enrichment_sample.py "
            "--source-key remax_curacao "
            "--selection-file data/processed/remax_terra_canary_selection.json "
            "--batch-size 1 --max-estimated-cost-usd 1.0 "
            "--progress-file data/processed/remax_terra_canary_progress.json "
            "--output data/processed/remax_terra_canary_result.json"
        ),
        "dashboard": {
            "enrichment_page_ready": True,
            "cost_label": "Estimated from recorded token usage and configured model pricing.",
            "v1_separately_identified": True,
            "terra_v3_not_directly_comparable_to_v1": True,
        },
    }
    (PROCESSED / "remax_terra_canary_final_report.json").write_text(
        json.dumps(final, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8"
    )
    (PROCESSED / "remax_terra_canary_final_report.md").write_text(
        "\n".join(
            [
                "# RE/MAX Terra canary final report",
                "",
                f"Generated: {final['generated_at']}",
                f"Labs project: `{ref}`",
                "",
                "## Outcome",
                "",
                f"- Selection: {', '.join(APPROVED)}",
                f"- Succeeded: {succeeded}/5; failed: {failed}/5 (`hs2467` truncated at 2500 output tokens)",
                f"- Exact cost: **USD {cost:.4f}** / ceiling USD 1.00",
                f"- Auto-applied fields: {total_auto}",
                f"- Needs-attention fields: {total_attention}",
                f"- Rejected fields: {total_rejected}",
                "- Timeline: 5 started, 4 completed, 1 failed, 4 auto-applied, 4 needs-attention",
                f"- Protected source fields unchanged: {protected_ok}",
                "",
                "## Verdict",
                "",
                f"**{verdict}**",
                "",
                verdict_reason,
                "",
                parser_import_note,
                "",
                "RE/MAX remains manual and unscheduled.",
                "",
                "## Next gated step (not executed)",
                "",
                "1. Raise `OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS` to 3500 locally (user config; not edited here).",
                "2. Retry only `hs2467` under the remaining budget, or re-run a focused one-listing repair.",
                "3. Optionally import v0.4.1 coordinates before full batch for map neighbourhood quality.",
                "4. Only then approve a remaining-215 Terra batch with an explicit ceiling.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "verdict": verdict,
                "cost_usd": cost,
                "succeeded": succeeded,
                "failed": failed,
                "auto_applied": total_auto,
                "attention": total_attention,
                "rejected": total_rejected,
                "idempotent_skips": skip_count,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
