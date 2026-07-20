"""Phase 1 preflight + Phase 2 AI usage reconciliation for KW Terra stabilization."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from decimal import Decimal
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
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
KW_SOURCE = "keller_williams_curacao"
MODEL = "gpt-5.6-terra"
PROTECTED_CHECKSUM = "86c35137d039408594b2a63aea446956f9d5bd93081c4afac9851148cf8ea2bc"


def _git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return (result.stdout or "").strip()


def _usage_cost(model: str, usage: dict) -> float:
    cost, _ = calculate_usage_cost_usd(
        model=model,
        input_tokens=int(usage.get("input_tokens") or 0),
        cached_input_tokens=int(
            usage.get("cached_input_tokens") or usage.get("input_tokens_cached") or 0
        ),
        output_tokens=int(usage.get("output_tokens") or 0),
    )
    return float(cost or Decimal("0"))


def _empty_tokens() -> dict[str, int]:
    return {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "total_tokens": 0,
    }


def _add_tokens(target: dict[str, int], usage: dict | None) -> None:
    if not usage:
        return
    for key in (
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "reasoning_tokens",
        "total_tokens",
    ):
        target[key] += int(usage.get(key) or 0)


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")

    client = create_labs_client()
    now = datetime.now(UTC).isoformat()

    source = (
        client.table("property_sources")
        .select("id,source_key,display_name")
        .eq("source_key", KW_SOURCE)
        .limit(1)
        .execute()
    )
    if not source.data:
        raise SystemExit("KW source missing")
    source_id = source.data[0]["id"]

    listings = (
        client.table("property_listings")
        .select(
            "id,external_id,enrichment_status,public_eligible,"
            "enrichment_last_input_checksum,enrichment_last_run_at"
        )
        .eq("property_source_id", source_id)
        .execute()
    ).data or []
    listing_by_id = {row["id"]: row for row in listings}
    listing_ids = list(listing_by_id)

    # Paginate proposals (PostgREST default max rows).
    proposals: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        batch = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,enrichment_job_id,model,prompt_version,"
                "schema_version,status,token_usage,error_message,generated_at,"
                "input_checksum,supporting_evidence,api_request_id,proposal,confidence"
            )
            .in_("property_listing_id", listing_ids)
            .order("generated_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        ).data or []
        proposals.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    jobs = (
        client.table("ai_enrichment_jobs")
        .select(
            "id,status,model,prompt_version,schema_version,total_listings,"
            "processed_count,succeeded_count,failed_count,skipped_unchanged_count,"
            "token_usage,summary,created_at,started_at,completed_at,requested_by,"
            "scope_type,scope_filter,property_source_id"
        )
        .eq("property_source_id", source_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    retry = json.loads(
        (PROCESSED / "kw_terra_retry_candidates.json").read_text(encoding="utf-8")
    )
    retry_ids = [str(x) for x in retry.get("listing_ids") or []]
    protected = json.loads(
        (PROCESSED / "kw_terra_protected_fields_checksum.json").read_text(encoding="utf-8")
    )

    # Latest proposal per listing
    latest: dict[str, dict] = {}
    for prop in proposals:
        lid = prop["property_listing_id"]
        if lid not in latest:
            latest[lid] = prop

    success_ids = {
        lid
        for lid, prop in latest.items()
        if prop.get("status") in {"needs_review", "succeeded"}
    }
    failed_ids = {
        lid
        for lid, prop in latest.items()
        if prop.get("status") in {"failed", "invalid_output"}
    }
    failed_truncation = []
    for lid in sorted(failed_ids):
        prop = latest[lid]
        usage = prop.get("token_usage") or {}
        out_tok = int(usage.get("output_tokens") or 0)
        err = str(prop.get("error_message") or "")
        failed_truncation.append(
            {
                "listing_id": lid,
                "external_id": listing_by_id[lid]["external_id"],
                "status": prop.get("status"),
                "error": err,
                "output_tokens": out_tok,
                "likely_truncation": err == "missing_or_invalid_parsed_output"
                and out_tok >= 2000,
            }
        )

    running_jobs = [j for j in jobs if j.get("status") == "running"]
    public_eligible = sum(1 for row in listings if row.get("public_eligible") is True)
    public_excluded = len(listings) - public_eligible

    git_status = _git("status", "--porcelain")
    pre_existing_modified = sorted(
        {
            line[3:].replace("\\", "/")
            for line in git_status.splitlines()
            if line.strip() and not line.startswith("??")
        }
    )
    pre_existing_untracked = sorted(
        {
            line[3:].replace("\\", "/")
            for line in git_status.splitlines()
            if line.startswith("??")
        }
    )

    retry_set = set(retry_ids)
    success_in_retry = sorted(retry_set & success_ids)
    failed_not_in_retry = sorted(failed_ids - retry_set)
    retry_not_failed = sorted(retry_set - failed_ids)

    preflight = {
        "generated_at": now,
        "project_ref": ref,
        "branch": _git("branch", "--show-current"),
        "origin_main": _git("rev-parse", "origin/main"),
        "model_env_required": MODEL,
        "kw_listings": len(listings),
        "public_eligible": public_eligible,
        "public_excluded": public_excluded,
        "successful_terra_proposals": len(success_ids),
        "failed_terra_proposals": len(failed_ids),
        "failed_all_invalid_output": all(
            item["status"] == "invalid_output" for item in failed_truncation
        ),
        "failed_all_likely_truncation": all(
            item["likely_truncation"] for item in failed_truncation
        ),
        "running_kw_jobs": len(running_jobs),
        "running_job_ids": [j["id"] for j in running_jobs],
        "retry_file_count": len(retry_ids),
        "retry_matches_failed": retry_set == failed_ids,
        "success_in_retry": success_in_retry,
        "failed_not_in_retry": failed_not_in_retry,
        "retry_not_failed": retry_not_failed,
        "protected_field_checksum_expected": PROTECTED_CHECKSUM,
        "protected_field_checksum_file": protected.get(
            "protected_field_checksum_sha256"
        ),
        "protected_checksum_unchanged": protected.get("protected_field_checksum_sha256")
        == PROTECTED_CHECKSUM,
        "pre_existing_modified_files": pre_existing_modified,
        "pre_existing_untracked_files": pre_existing_untracked,
        "failed_details": failed_truncation,
        "stop_conditions": {
            "project_is_labs": ref == LABS_PROJECT_REF,
            "no_running_jobs": len(running_jobs) == 0,
            "retry_exact_24": len(retry_ids) == 24 and retry_set == failed_ids,
            "no_success_in_retry": not success_in_retry,
        },
    }
    (PROCESSED / "kw_enrichment_stabilization_preflight.json").write_text(
        json.dumps(preflight, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # --- Phase 2: usage reconciliation ---
    # Primary source of truth: proposal rows (each API attempt that produced a row).
    # Local progress files are secondary and may duplicate DB rows; dedupe by
    # (listing_id, generated_at minute, input/output tokens) and prefer DB.
    attempts: list[dict] = []
    seen_keys: set[str] = set()

    for prop in sorted(proposals, key=lambda p: p.get("generated_at") or ""):
        usage = prop.get("token_usage") or {}
        model = prop.get("model") or MODEL
        cost = _usage_cost(model, usage) if usage else 0.0
        lid = prop["property_listing_id"]
        retained = latest.get(lid, {}).get("id") == prop["id"]
        status = prop.get("status")
        paid = cost > 0
        key = f"db:{prop['id']}"
        seen_keys.add(key)
        attempts.append(
            {
                "source_of_record": "ai_enrichment_proposals",
                "attempt_key": key,
                "proposal_id": prop["id"],
                "job_id": prop.get("enrichment_job_id"),
                "listing_id": lid,
                "external_id": listing_by_id.get(lid, {}).get("external_id"),
                "source": KW_SOURCE,
                "model": model,
                "prompt_version": prop.get("prompt_version"),
                "schema_version": prop.get("schema_version"),
                "policy_version": (prop.get("supporting_evidence") or {})
                .get("run_audit", {})
                .get("policy_version"),
                "timestamp": prop.get("generated_at"),
                "attempt_number": None,
                "status": status,
                "success": status in {"needs_review", "succeeded"},
                "failure": status in {"failed", "invalid_output"},
                "skipped": status == "skipped_unchanged",
                "input_tokens": int(usage.get("input_tokens") or 0),
                "cached_input_tokens": int(usage.get("cached_input_tokens") or 0),
                "output_tokens": int(usage.get("output_tokens") or 0),
                "reasoning_tokens": int(usage.get("reasoning_tokens") or 0),
                "calculated_cost_usd": cost,
                "pricing_version": PRICING_SOURCE,
                "pricing_as_of": PRICING_AS_OF,
                "retained_result": retained and status in {"needs_review", "succeeded"},
                "replaced_by_retry": (not retained)
                and status in {"needs_review", "succeeded", "failed", "invalid_output"},
                "changed_effective_value": bool(
                    ((prop.get("proposal") or {}).get("field_decisions") or [])
                    and any(
                        d.get("final_status") == "auto_applied"
                        for d in (prop.get("proposal") or {}).get("field_decisions")
                        or []
                        if isinstance(d, dict)
                    )
                ),
                "api_request_id": prop.get("api_request_id"),
                "paid_attempt": paid,
            }
        )

    # Supplement from local progress/result artifacts when DB may miss transport-only spends.
    artifact_files = [
        PROCESSED / "kw_terra_canary_result.json",
        PROCESSED / "kw_terra_remaining79_progress.json",
        PROCESSED / "kw_terra_remaining59_progress.json",
        PROCESSED / "kw_terra_remaining79_result.json",
        PROCESSED / "kw_terra_remaining59_result.json",
    ]
    artifact_only_attempts: list[dict] = []
    for path in artifact_files:
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        listing_results = []
        if isinstance(payload, dict):
            if isinstance(payload.get("listing_results"), list):
                listing_results = payload["listing_results"]
            elif isinstance(payload.get("result"), dict):
                listing_results = payload["result"].get("listing_results") or []
            elif isinstance(payload.get("phases"), list):
                for phase in payload["phases"]:
                    prog = phase.get("progress") or phase.get("result") or {}
                    listing_results.extend(prog.get("listing_results") or [])
        for item in listing_results:
            if not isinstance(item, dict):
                continue
            usage = item.get("token_usage") or {}
            if not usage or not any(usage.values()):
                continue
            lid = str(item.get("listing_id") or "")
            cost = _usage_cost(MODEL, usage)
            fingerprint = (
                f"art:{lid}:{usage.get('input_tokens')}:{usage.get('output_tokens')}:"
                f"{usage.get('cached_input_tokens')}:{item.get('status')}"
            )
            # Skip if a DB proposal already accounts for the same tokens+listing.
            duplicate = False
            for att in attempts:
                if (
                    att["listing_id"] == lid
                    and att["input_tokens"] == int(usage.get("input_tokens") or 0)
                    and att["output_tokens"] == int(usage.get("output_tokens") or 0)
                    and att["cached_input_tokens"]
                    == int(usage.get("cached_input_tokens") or 0)
                ):
                    duplicate = True
                    break
            if duplicate:
                continue
            artifact_only_attempts.append(
                {
                    "source_of_record": str(path.name),
                    "attempt_key": fingerprint,
                    "proposal_id": None,
                    "job_id": payload.get("job_id")
                    if isinstance(payload, dict)
                    else None,
                    "listing_id": lid,
                    "external_id": item.get("external_id"),
                    "source": KW_SOURCE,
                    "model": MODEL,
                    "prompt_version": "listing_enrichment_v2",
                    "schema_version": "listing_enrichment_schema_v2",
                    "policy_version": None,
                    "timestamp": None,
                    "attempt_number": None,
                    "status": item.get("status"),
                    "success": item.get("status")
                    in {"needs_review", "succeeded"},
                    "failure": item.get("status")
                    in {"failed", "invalid_output"},
                    "skipped": item.get("status") == "skipped_unchanged",
                    "input_tokens": int(usage.get("input_tokens") or 0),
                    "cached_input_tokens": int(usage.get("cached_input_tokens") or 0),
                    "output_tokens": int(usage.get("output_tokens") or 0),
                    "reasoning_tokens": int(usage.get("reasoning_tokens") or 0),
                    "calculated_cost_usd": cost,
                    "pricing_version": PRICING_SOURCE,
                    "pricing_as_of": PRICING_AS_OF,
                    "retained_result": False,
                    "replaced_by_retry": True,
                    "changed_effective_value": False,
                    "api_request_id": None,
                    "paid_attempt": cost > 0,
                    "note": "Artifact-only; not matched to a DB proposal row",
                }
            )

    all_attempts = attempts + artifact_only_attempts
    gross = sum(a["calculated_cost_usd"] for a in all_attempts if a["paid_attempt"])
    retained = sum(
        a["calculated_cost_usd"] for a in all_attempts if a.get("retained_result")
    )
    wasted = sum(
        a["calculated_cost_usd"]
        for a in all_attempts
        if a["paid_attempt"] and not a.get("retained_result")
    )
    token_totals = _empty_tokens()
    retained_tokens = _empty_tokens()
    wasted_tokens = _empty_tokens()
    for a in all_attempts:
        usage = {
            "input_tokens": a["input_tokens"],
            "cached_input_tokens": a["cached_input_tokens"],
            "output_tokens": a["output_tokens"],
            "reasoning_tokens": a["reasoning_tokens"],
            "total_tokens": a["input_tokens"] + a["output_tokens"],
        }
        _add_tokens(token_totals, usage)
        if a.get("retained_result"):
            _add_tokens(retained_tokens, usage)
        elif a["paid_attempt"]:
            _add_tokens(wasted_tokens, usage)

    # Job-level reported costs (may under/over count vs proposals)
    job_reported_cost = 0.0
    for job in jobs:
        summary = job.get("summary") or {}
        if summary.get("exact_cost_usd") is not None:
            try:
                job_reported_cost += float(summary["exact_cost_usd"])
            except (TypeError, ValueError):
                pass

    final_report_cost = 3.4415
    try:
        final_report = json.loads(
            (PROCESSED / "kw_activation_final_report.json").read_text(encoding="utf-8")
        )
        final_report_cost = float(final_report.get("total_terra_cost_usd") or 3.4415)
    except OSError:
        final_report = {}

    # Why 3.4415: typically sum of retained successful + failed latest proposals.
    latest_only_cost = sum(
        _usage_cost(p.get("model") or MODEL, p.get("token_usage") or {})
        for p in latest.values()
        if p.get("token_usage")
    )
    success_latest_cost = sum(
        _usage_cost(p.get("model") or MODEL, p.get("token_usage") or {})
        for lid, p in latest.items()
        if lid in success_ids and p.get("token_usage")
    )
    failed_latest_cost = sum(
        _usage_cost(p.get("model") or MODEL, p.get("token_usage") or {})
        for lid, p in latest.items()
        if lid in failed_ids and p.get("token_usage")
    )

    reconciliation = {
        "generated_at": now,
        "project_ref": ref,
        "cost_label": (
            "Estimated from recorded token usage and configured model pricing."
        ),
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "model_rates_usd_per_1m": {
            "gpt-5.6-terra": {
                "input": 2.50,
                "cached_input": 0.25,
                "output": 15.00,
            }
        },
        "storage_map": {
            "ai_enrichment_jobs.token_usage": "Per-run summed tokens",
            "ai_enrichment_jobs.summary.exact_cost_usd": "Per-run estimated cost",
            "ai_enrichment_proposals.token_usage": "Per-listing API attempt tokens",
            "ai_enrichment_proposals.supporting_evidence.run_audit": (
                "Per-listing estimated_cost_usd and versions"
            ),
            "listing_activity_events": "Timeline only; not a cost ledger",
            "local_progress_files": (
                "kw_terra_*_progress/result JSON; may duplicate DB rows"
            ),
            "not_stored": (
                "OpenAI billing invoice amounts; transport retries without a "
                "proposal row; provider-side adjustments"
            ),
        },
        "attempt_counts": {
            "db_proposal_rows": len(attempts),
            "artifact_only_unmatched": len(artifact_only_attempts),
            "total_reconstructed_attempts": len(all_attempts),
            "paid_attempts": sum(1 for a in all_attempts if a["paid_attempt"]),
            "retained_successful_latest": len(success_ids),
            "failed_latest": len(failed_ids),
        },
        "gross_estimated_spend_usd": round(gross, 4),
        "retained_result_cost_usd": round(retained, 4),
        "wasted_deferred_cost_usd": round(wasted, 4),
        "latest_proposals_only_cost_usd": round(latest_only_cost, 4),
        "latest_success_cost_usd": round(success_latest_cost, 4),
        "latest_failed_cost_usd": round(failed_latest_cost, 4),
        "job_summary_exact_cost_sum_usd": round(job_reported_cost, 4),
        "activation_final_report_cost_usd": final_report_cost,
        "token_totals_all_attempts": token_totals,
        "token_totals_retained": retained_tokens,
        "token_totals_wasted": wasted_tokens,
        "explanation_of_3_4415": {
            "reported_value": final_report_cost,
            "closest_reconstruction": round(latest_only_cost, 4),
            "match": abs(latest_only_cost - final_report_cost) < 0.01,
            "meaning": (
                "USD 3.4415 is the estimated cost of the latest Terra proposal "
                "per KW listing (60 successes + 24 truncated failures), using "
                "labs_configured_model_rates_v1. It is not an OpenAI invoice total."
            ),
        },
        "openai_billing_gap": {
            "user_observed_approx_usd": 5.0,
            "reconstructed_gross_usd": round(gross, 4),
            "difference_vs_user_approx": round(5.0 - gross, 4),
            "can_reconstruct_exact_invoice": False,
            "likely_gap_sources": [
                "Earlier non-Terra models (e.g. gpt-4.1-mini) not in this KW Terra total",
                "Canary / restore / duplicate API calls if tokens were not persisted",
                "OpenAI account-level usage outside Labs KW enrichment",
                "Pricing table mismatch vs OpenAI invoice rates or discounts",
                "Reasoning tokens billed differently than our output-inclusive assumption",
            ],
        },
        "attempts": all_attempts,
    }

    (PROCESSED / "ai_usage_reconciliation.json").write_text(
        json.dumps(reconciliation, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    md = f"""# AI usage reconciliation

Generated: {now}

**Estimated from recorded token usage and configured model pricing.**

## Where usage is stored

| Location | Role |
|---|---|
| `ai_enrichment_proposals.token_usage` | Per-listing API attempt (primary) |
| `ai_enrichment_jobs.token_usage` / `summary.exact_cost_usd` | Per-run aggregates |
| `supporting_evidence.run_audit` | Per-listing cost + versions |
| Local `kw_terra_*_progress/result` JSON | Resume artifacts; may duplicate DB |
| OpenAI billing | **Not available in Labs** — not reconstructed here |

## Cost definitions

| Metric | USD |
|---|---|
| Gross estimated spend (all paid reconstructed attempts) | {gross:.4f} |
| Retained-result cost (latest successful proposals) | {retained:.4f} |
| Wasted/deferred cost (failed, superseded, non-retained) | {wasted:.4f} |
| Latest proposal per listing (success + fail) | {latest_only_cost:.4f} |
| Activation final report (`total_terra_cost_usd`) | {final_report_cost:.4f} |
| Sum of job `exact_cost_usd` | {job_reported_cost:.4f} |

## Why the repo reports USD 3.4415

{reconciliation["explanation_of_3_4415"]["meaning"]}

Closest reconstruction from latest proposals: **USD {latest_only_cost:.4f}**
(match={reconciliation["explanation_of_3_4415"]["match"]}).

## Difference from ~USD 5 OpenAI usage

Exact OpenAI billing **cannot** be reconstructed from Labs data alone.

- Reconstructed gross from recorded attempts: **USD {gross:.4f}**
- User-observed approximate OpenAI usage: **~USD 5**
- Gap may include non-Terra models, unmatched retries, account-wide usage, or rate differences.

## Tokens (all reconstructed paid+unpaid attempts with usage)

- Input: {token_totals["input_tokens"]}
- Cached input: {token_totals["cached_input_tokens"]}
- Output: {token_totals["output_tokens"]}
- Reasoning: {token_totals["reasoning_tokens"]}

## Attempt counts

- DB proposal rows: {len(attempts)}
- Artifact-only unmatched: {len(artifact_only_attempts)}
- Paid attempts: {sum(1 for a in all_attempts if a["paid_attempt"])}
"""
    (PROCESSED / "ai_usage_reconciliation.md").write_text(md, encoding="utf-8")

    print(json.dumps({
        "preflight": str(PROCESSED / "kw_enrichment_stabilization_preflight.json"),
        "reconciliation": str(PROCESSED / "ai_usage_reconciliation.json"),
        "kw_listings": len(listings),
        "success": len(success_ids),
        "failed": len(failed_ids),
        "retry_match": retry_set == failed_ids,
        "running_jobs": len(running_jobs),
        "gross_usd": round(gross, 4),
        "retained_usd": round(retained, 4),
        "wasted_usd": round(wasted, 4),
        "latest_only_usd": round(latest_only_cost, 4),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
