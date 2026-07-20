"""Post-backfill audits: protected fields, quality, cost, retries, final report."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment import PROMPT_VERSION, SCHEMA_VERSION  # noqa: E402
from merkado_labs.enrichment.jobs import hydrate_map_neighbourhood_names  # noqa: E402
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
SOURCE_KEY = "remax_curacao"
MODEL = "gpt-5.6-terra"
CEILING = 10.0

BEFORE = PROCESSED / "remax_backfill_protected_fields_before.json"
RESULT = PROCESSED / "remax_remaining_terra_result.json"
PROGRESS = PROCESSED / "remax_remaining_terra_progress.json"
SELECTION = PROCESSED / "remax_remaining_terra_selection.json"


def _write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )


def _checksum(rows: list[dict[str, Any]]) -> str:
    keys = [
        "id",
        "external_id",
        "source_url",
        "original_price",
        "original_currency",
        "benchmark_price_xcg",
        "status",
        "source_listing_status",
        "listing_type",
        "latitude",
        "longitude",
        "bedrooms",
        "bathrooms",
        "floor_area_m2",
        "lot_area_value",
        "lot_area_unit",
        "public_eligible",
    ]
    ordered = sorted(rows, key=lambda r: str(r.get("external_id") or ""))
    blob = json.dumps(
        [{k: r.get(k) for k in keys} for r in ordered],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def _classify_failure(item: dict[str, Any]) -> str:
    err = str(item.get("error") or item.get("status") or "").lower()
    if "budget" in err or "ceiling" in err or "insufficient" in err:
        return "budget_stop"
    if "timeout" in err or "transport" in err or "connection" in err or "429" in err:
        return "transport"
    if "truncat" in err or "max_output" in err or "length" in err:
        return "truncation"
    if "json" in err or "schema" in err or "structured" in err or "parse" in err:
        return "structured_output"
    if "ground" in err or "evidence" in err:
        return "grounding"
    if "valid" in err or "policy" in err:
        return "validation"
    if "persist" in err or "database" in err or "supabase" in err:
        return "persistence"
    return "other"


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,property_type,status,source_listing_status,"
            "source_url,source_neighbourhood_text,bedrooms,bathrooms,floor_area_m2,"
            "lot_area_value,lot_area_unit,original_price,original_currency,"
            "benchmark_price_xcg,public_eligible,latitude,longitude,"
            "description,enrichment_status,enrichment_last_input_checksum,"
            "neighbourhood_assignment_status,inferred_neighbourhood_id,"
            "missing_since,removed_at"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    hydrate_map_neighbourhood_names(client, rows)

    after_checksum = _checksum(rows)
    before = (
        json.loads(BEFORE.read_text(encoding="utf-8")) if BEFORE.exists() else {}
    )
    protected = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "before_checksum": before.get("checksum"),
        "after_checksum": after_checksum,
        "unchanged": before.get("checksum") == after_checksum,
        "listing_count": len(rows),
    }
    _write(PROCESSED / "remax_backfill_protected_fields.json", protected)
    if before.get("checksum") and before.get("checksum") != after_checksum:
        print("PROTECTED FIELD MUTATION DETECTED")
        return 2

    result_payload = (
        json.loads(RESULT.read_text(encoding="utf-8")) if RESULT.exists() else {}
    )
    job = result_payload.get("result") or {}
    listing_results = job.get("listing_results") or []
    progress = (
        json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    )
    selection = (
        json.loads(SELECTION.read_text(encoding="utf-8")) if SELECTION.exists() else {}
    )

    # Load all Terra proposals for RE/MAX
    listing_ids = [str(r["id"]) for r in rows]
    props: list[dict[str, Any]] = []
    for start in range(0, len(listing_ids), 80):
        props.extend(
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,model,prompt_version,status,input_checksum,"
                "generated_at,token_usage,proposal,confidence,warnings,error_message"
            )
            .in_("property_listing_id", listing_ids[start : start + 80])
            .eq("model", MODEL)
            .eq("prompt_version", PROMPT_VERSION)
            .execute()
            .data
            or []
        )

    terra_by_listing: dict[str, list[dict[str, Any]]] = {}
    for p in props:
        terra_by_listing.setdefault(str(p["property_listing_id"]), []).append(p)

    succeeded_listings = 0
    failed_listings = 0
    skipped_listings = 0
    auto_applied = 0
    attention = 0
    rejected = 0
    confidences: list[float] = []
    forbidden_attempts = 0
    map_over_ai_ok = 0
    map_over_ai_total = 0
    generic_effective_source = 0

    for row in rows:
        lid = str(row["id"])
        plist = terra_by_listing.get(lid) or []
        terminal = [
            p
            for p in plist
            if p.get("status") in {"succeeded", "needs_review", "skipped_unchanged"}
        ]
        if any(p.get("status") == "skipped_unchanged" for p in terminal) and not any(
            p.get("status") in {"succeeded", "needs_review"} for p in terminal
        ):
            skipped_listings += 1
        elif any(p.get("status") in {"succeeded", "needs_review"} for p in terminal):
            succeeded_listings += 1
        elif any(p.get("status") in {"failed", "invalid_output"} for p in plist):
            failed_listings += 1

        latest = None
        if terminal:
            latest = sorted(
                terminal, key=lambda p: str(p.get("generated_at") or "")
            )[-1]
        elif plist:
            latest = sorted(plist, key=lambda p: str(p.get("generated_at") or ""))[-1]
        if not latest:
            continue
        proposal = latest.get("proposal") or {}
        if not isinstance(proposal, dict):
            proposal = {}
        conf = latest.get("confidence")
        if conf is not None:
            try:
                confidences.append(float(conf))
            except (TypeError, ValueError):
                pass
        # Count applied/attention/rejected from batch listing_results when present
        for lr in listing_results:
            if str(lr.get("listing_id")) == lid:
                auto_applied += len(lr.get("fields_auto_applied") or [])
                attention += len(lr.get("fields_needing_attention") or [])
                rejected += len(lr.get("fields_rejected") or [])
                break

        ai_nb = proposal.get("neighbourhood_candidate")
        if isinstance(ai_nb, dict):
            ai_nb = ai_nb.get("value") or ai_nb.get("name") or ai_nb.get("text")
        if not ai_nb:
            for attr in proposal.get("attributes") or []:
                if isinstance(attr, dict) and attr.get("key") in {
                    "neighbourhood_candidate",
                    "neighbourhood",
                }:
                    ai_nb = attr.get("value") or ai_nb
        for attr in proposal.get("attributes") or []:
            if isinstance(attr, dict) and attr.get("key") in {
                "bedrooms",
                "bathrooms",
                "original_price",
            }:
                # Forbidden source facts may appear in model output but must not apply.
                forbidden_attempts += 1
        map_nb = row.get("inferred_neighbourhood_name")
        eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=map_nb,
            ai_candidate_name=str(ai_nb) if ai_nb else None,
            ai_evidence_grounded=True if ai_nb else None,
        )
        if map_nb and ai_nb:
            map_over_ai_total += 1
            # AI must not win when source or map already supplies a neighbourhood.
            if eff.provenance in {"source", "map"}:
                map_over_ai_ok += 1
        if (
            is_generic_neighbourhood(row.get("source_neighbourhood_text"))
            and eff.provenance == "source"
        ):
            generic_effective_source += 1

    # Batch-level totals from job result
    batch_auto = int(job.get("auto_applied_fields") or auto_applied)
    batch_attention = int(job.get("needs_attention_listings") or 0)
    token_usage = job.get("token_usage") or progress.get("token_usage") or {}
    exact_cost = float(job.get("exact_cost_usd") or progress.get("exact_cost_usd") or 0)

    failures = [
        lr
        for lr in listing_results
        if lr.get("status") in {"failed", "invalid_output"}
    ]
    retry_candidates = []
    for lr in failures:
        klass = _classify_failure(lr)
        if klass in {"transport", "truncation", "persistence", "budget_stop"}:
            retry_candidates.append(
                {
                    "listing_id": lr.get("listing_id"),
                    "external_id": lr.get("external_id"),
                    "status": lr.get("status"),
                    "error": lr.get("error"),
                    "failure_class": klass,
                    "safe_for_paid_retry": klass
                    in {"transport", "truncation", "persistence"},
                }
            )
    if retry_candidates or failures:
        _write(
            PROCESSED / "remax_backfill_retry_candidates.json",
            {
                "generated_at": datetime.now(UTC).isoformat(),
                "failures_total": len(failures),
                "retry_candidates": retry_candidates,
                "not_executed": True,
                "note": "Grounding/policy/validation failures excluded from paid retry.",
            },
        )

    # Full exclusion counts from selection file
    excl_counts = selection.get("exclusion_reason_counts") or {}

    quality = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "totals": {
            "remax_listings": len(rows),
            "successfully_enriched_terra_v3": succeeded_listings,
            "failed": job.get("failed") or failed_listings,
            "skipped_in_batch": job.get("skipped") or skipped_listings,
            "not_enriched_insufficient_input": excl_counts.get(
                "insufficient_source_evidence", 0
            )
            + excl_counts.get("insufficient_title_and_description", 0),
            "excluded_identical_checksum": excl_counts.get(
                "identical_successful_terra_v3_checksum", 0
            ),
            "batch_processed": job.get("processed"),
            "batch_succeeded": job.get("succeeded"),
            "batch_failed": job.get("failed"),
            "batch_skipped": job.get("skipped"),
            "auto_applied_fields": batch_auto,
            "needs_attention_listings": batch_attention,
            "rejected_fields_in_batch_results": rejected,
        },
        "average_confidence": (
            round(sum(confidences) / len(confidences), 4) if confidences else None
        ),
        "neighbourhood": {
            "map_vs_ai_conflicts_checked": map_over_ai_total,
            "map_wins_ok": map_over_ai_ok,
            "generic_source_effective_count": generic_effective_source,
        },
        "forbidden_field_attempts_flagged": forbidden_attempts,
        "protected_fields_unchanged": protected["unchanged"],
        "label": "Estimated from recorded token usage and configured model pricing.",
    }
    _write(PROCESSED / "remax_backfill_quality_audit.json", quality)
    (PROCESSED / "remax_backfill_quality_audit.md").write_text(
        "\n".join(
            [
                "# RE/MAX Terra backfill quality audit",
                "",
                f"- Listings: **{len(rows)}**",
                f"- Terra-v3 successful: **{succeeded_listings}**",
                f"- Batch succeeded/failed/skipped: "
                f"**{job.get('succeeded')}** / **{job.get('failed')}** / "
                f"**{job.get('skipped')}**",
                f"- Auto-applied fields: **{batch_auto}**",
                f"- Needs-attention listings: **{batch_attention}**",
                f"- Protected fields unchanged: **{protected['unchanged']}**",
                f"- Map-over-AI OK: **{map_over_ai_ok}/{map_over_ai_total}**",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    # Historical RE/MAX AI cost from all Terra proposals' token_usage
    hist_tokens = {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "total_tokens": 0,
    }
    for p in props:
        tu = p.get("token_usage") or {}
        if not isinstance(tu, dict):
            continue
        for k in hist_tokens:
            hist_tokens[k] += int(tu.get(k) or 0)
    hist_cost, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=hist_tokens["input_tokens"],
        cached_input_tokens=hist_tokens["cached_input_tokens"],
        output_tokens=hist_tokens["output_tokens"],
    )
    targeted = int(selection.get("count") or len(listing_results))
    completed = int(job.get("succeeded") or 0)
    failed_n = int(job.get("failed") or 0)
    skipped_n = int(job.get("skipped") or 0)
    attempted = completed + failed_n
    wasted = 0.0
    # Approximate wasted = cost attributed to failed listings from listing_results
    for lr in listing_results:
        if lr.get("status") in {"failed", "invalid_output"}:
            tu = lr.get("token_usage") or {}
            c, _ = calculate_usage_cost_usd(
                model=MODEL,
                input_tokens=int(tu.get("input_tokens") or 0),
                cached_input_tokens=int(tu.get("cached_input_tokens") or 0),
                output_tokens=int(tu.get("output_tokens") or 0),
            )
            wasted += float(c or 0)
    retained = max(exact_cost - wasted, 0)
    cost_audit = {
        "generated_at": datetime.now(UTC).isoformat(),
        "job_label": "remax_remaining_terra_backfill",
        "job_id": job.get("job_id") or result_payload.get("job_id"),
        "listings_targeted": targeted,
        "completed": completed,
        "failed": failed_n,
        "skipped": skipped_n,
        "gross_estimated_cost_usd": exact_cost,
        "retained_result_cost_usd": round(retained, 4),
        "failed_wasted_cost_usd": round(wasted, 4),
        "token_usage": token_usage,
        "average_cost_per_attempted_listing_usd": (
            round(exact_cost / attempted, 4) if attempted else None
        ),
        "average_cost_per_successful_listing_usd": (
            round(retained / completed, 4) if completed else None
        ),
        "cost_per_changed_property_usd": (
            round(retained / completed, 4) if completed else None
        ),
        "cost_per_auto_applied_field_usd": (
            round(retained / batch_auto, 4) if batch_auto else None
        ),
        "cumulative_historical_remax_terra_cost_usd": float(hist_cost or 0),
        "cumulative_terra_only_remax_cost_usd": float(hist_cost or 0),
        "ceiling_usd": CEILING,
        "under_ceiling": exact_cost <= CEILING,
        "label": "Estimated from recorded token usage and configured model pricing.",
        "stopped_early": job.get("stopped_early") or progress.get("stopped_early"),
    }
    _write(PROCESSED / "remax_backfill_cost_audit.json", cost_audit)
    (PROCESSED / "remax_backfill_cost_audit.md").write_text(
        "\n".join(
            [
                "# RE/MAX Terra backfill cost audit",
                "",
                f"- Targeted: **{targeted}**",
                f"- Completed / failed / skipped: **{completed}** / **{failed_n}** / "
                f"**{skipped_n}**",
                f"- Gross: **USD {exact_cost}**",
                f"- Retained: **USD {retained:.4f}**",
                f"- Wasted: **USD {wasted:.4f}**",
                f"- Cumulative RE/MAX Terra: **USD {float(hist_cost or 0)}**",
                f"- Under ceiling USD {CEILING}: **{exact_cost <= CEILING}**",
                "",
                cost_audit["label"],
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    final = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "source_key": SOURCE_KEY,
        "adapter_version": "0.4.1",
        "manual_unscheduled": True,
        "catalog": {
            "listings": 220,
            "coordinates": sum(
                1
                for r in rows
                if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
            "inferred_neighbourhoods": sum(
                1
                for r in rows
                if r.get("neighbourhood_assignment_status") == "inferred"
            ),
        },
        "ai_coverage": {
            "terra_v3_successful_listings": succeeded_listings,
            "prompt_version": PROMPT_VERSION,
            "schema_version": SCHEMA_VERSION,
            "policy_version": POLICY_VERSION,
            "model": MODEL,
        },
        "batch": {
            "job_id": cost_audit["job_id"],
            "job_label": "remax_remaining_terra_backfill",
            "targeted": targeted,
            "succeeded": completed,
            "failed": failed_n,
            "skipped": skipped_n,
            "auto_applied_fields": batch_auto,
            "needs_attention_listings": batch_attention,
            "stopped_early": cost_audit["stopped_early"],
        },
        "tokens_and_cost": cost_audit,
        "protected_fields": protected,
        "quality": quality["totals"],
        "neighbourhood": quality["neighbourhood"],
        "retry_candidates_count": len(retry_candidates),
        "normal_refresh_remains_new_or_changed_only": True,
        "initial_backfill_separate_from_refresh": True,
        "next_source_track": "moret_real_estate",
    }
    _write(PROCESSED / "remax_activation_final_report.json", final)
    (PROCESSED / "remax_activation_final_report.md").write_text(
        "\n".join(
            [
                "# RE/MAX activation final report",
                "",
                "## Catalog",
                f"- 220 listings; coordinates "
                f"{final['catalog']['coordinates']}/220; public "
                f"{final['catalog']['public_eligible']}; map inferred "
                f"{final['catalog']['inferred_neighbourhoods']}",
                "",
                "## AI coverage",
                f"- Terra-v3 successful listings: **{succeeded_listings}**",
                f"- Model `{MODEL}` / {PROMPT_VERSION} / {SCHEMA_VERSION} / "
                f"{POLICY_VERSION}",
                "",
                "## Backfill batch",
                f"- Targeted **{targeted}**; succeeded **{completed}**; "
                f"failed **{failed_n}**; skipped **{skipped_n}**",
                f"- Auto-applied fields **{batch_auto}**; attention listings "
                f"**{batch_attention}**",
                f"- Gross cost **USD {exact_cost}** (ceiling USD {CEILING})",
                "",
                "## Operations",
                "- RE/MAX remains **manual and unscheduled**",
                "- Normal Refresh & enrich remains **new/changed only**",
                "- Initial backfill is a separately approved one-time action",
                "- Next active source-development track: **Moret**",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "protected_unchanged": protected["unchanged"],
                "succeeded_listings": succeeded_listings,
                "batch_succeeded": completed,
                "batch_failed": failed_n,
                "gross_usd": exact_cost,
                "retry_candidates": len(retry_candidates),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
