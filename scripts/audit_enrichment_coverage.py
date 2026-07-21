#!/usr/bin/env python3
"""Read-only AI enrichment coverage audit for all active Ready listings.

Uses ``should_skip_unchanged_enrichment`` as the billing ground truth, then
layers display_description / deferred / failed causes.

Categories:
  - ai_current
  - ai_never_run
  - ai_failed
  - ai_stale
  - ai_deferred
  - ai_ran_no_display_description

No OpenAI calls. No Supabase writes.

Usage:
  PYTHONPATH=src python scripts/audit_enrichment_coverage.py
  PYTHONPATH=src python scripts/audit_enrichment_coverage.py --out data/processed/enrichment_coverage_audit.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment import compute_input_checksum  # noqa: E402
from merkado_labs.enrichment.jobs import (  # noqa: E402
    listing_to_enrichment_input,
    should_skip_unchanged_enrichment,
)
from merkado_labs.enrichment.pricing import estimate_enrichment_cost  # noqa: E402
from merkado_labs.enrichment.public_effective import (  # noqa: E402
    project_public_display_description,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"
PROD_FORBIDDEN = "jkrfyvukhhsapoivntms"
READY = (
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)
DISPLAY_KEYS = (
    "display_overview",
    "display_layout",
    "display_outdoor",
    "display_location",
    "display_condition",
)
FAILED_PROPOSAL = frozenset({"failed", "invalid_output"})
SUCCESS_PROPOSAL = frozenset(
    {"succeeded", "needs_review", "auto_applied", "skipped_unchanged"}
)


def _page(
    client: Any, table: str, select: str, *, filters: list[tuple] | None = None
) -> list[dict]:
    rows: list[dict] = []
    start = 0
    page = 1000
    while True:
        q = client.table(table).select(select)
        for op, *args in filters or []:
            q = getattr(q, op)(*args)
        chunk = q.range(start, start + page - 1).execute().data or []
        rows.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    return rows


def _proposal_body(proposal: dict[str, Any] | None) -> dict[str, Any] | None:
    if not proposal:
        return None
    body = proposal.get("proposal")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            return None
    return body if isinstance(body, dict) else None


def _display_cause(
    proposal_body: dict[str, Any] | None, public_dd: Any, projected: Any
) -> str | None:
    if public_dd not in (None, {}, []) or projected not in (None, {}, []):
        return None
    if not proposal_body:
        return "no_proposal_body"

    decisions = [
        d
        for d in (proposal_body.get("field_decisions") or [])
        if isinstance(d, dict) and str(d.get("key", "")).startswith("display_")
    ]
    produced = False
    dd = proposal_body.get("display_description")
    if isinstance(dd, dict) and any(v not in (None, "", []) for v in dd.values()):
        produced = True
    for key in DISPLAY_KEYS:
        if proposal_body.get(key) not in (None, "", []):
            produced = True
            break
    if not produced:
        for key in ("overview", "layout", "outdoor", "location", "condition"):
            if isinstance(dd, dict) and dd.get(key) not in (None, "", []):
                produced = True
                break

    if not decisions and not produced:
        return "model_did_not_produce_display_description"

    statuses = {str(d.get("final_status") or d.get("status") or "") for d in decisions}
    reasons: list[str] = []
    for d in decisions:
        for r in d.get("reasons") or []:
            if isinstance(r, str):
                reasons.append(r)
            elif isinstance(r, dict) and r.get("code"):
                reasons.append(str(r["code"]))

    if "auto_applied" in statuses and projected in (None, {}, []):
        return "auto_applied_but_not_projected"
    if "rejected" in statuses:
        top = Counter(reasons).most_common(3)
        return (
            "display_description_rejected:" + ",".join(c for c, _ in top)
            if top
            else "display_description_rejected"
        )
    if "needs_attention" in statuses:
        return "display_description_needs_attention"
    if produced and not decisions:
        return "produced_but_no_field_decision"
    if produced:
        return "produced_but_not_auto_applied:" + ",".join(
            sorted(s for s in statuses if s) or ["unknown"]
        )
    return "display_fields_present_without_usable_value"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "data" / "processed" / "enrichment_coverage_audit.json",
    )
    args = parser.parse_args()

    settings = get_settings()
    url = str(settings.supabase_url or "").lower()
    if PROD_FORBIDDEN in url:
        raise SystemExit("Refusing to run against production project")
    if LABS not in url:
        print(f"WARNING: supabase URL does not clearly include Labs ref {LABS}", flush=True)

    client = create_labs_client()
    model = (settings.openai_enrichment_model or "gpt-5.6-terra").strip()

    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(READY))
        .execute()
        .data
        or []
    )
    source_by_id = {r["id"]: r["source_key"] for r in sources}
    source_ids = list(source_by_id)

    listings = _page(
        client,
        "property_listings",
        # Full row: checksum must see the same fields the enrichment job used.
        "*",
        filters=[("in_", "property_source_id", source_ids), ("eq", "status", "active")],
    )
    for row in listings:
        row["source_key"] = source_by_id.get(row.get("property_source_id"), "")
    # Do NOT hydrate map neighbourhood names here — pipeline billable selection
    # and should_skip_unchanged_enrichment intentionally skip hydrate so
    # checksums stay comparable (see repair_enrichment_hash_contract.py).

    proposals = _page(
        client,
        "ai_enrichment_proposals",
        "id,property_listing_id,status,prompt_version,schema_version,input_checksum,"
        "proposal,review_status,created_at,generated_at,error_message,model,"
        "token_usage,enrichment_job_id",
    )
    latest_prop: dict[str, dict] = {}
    for p in sorted(proposals, key=lambda r: r.get("created_at") or ""):
        latest_prop[str(p["property_listing_id"])] = p

    public_rows = _page(
        client,
        "public_property_listings",
        "id,display_description,effective_summary",
    )
    public_dd = {str(r["id"]): r.get("display_description") for r in public_rows}

    pipe_items = _page(
        client,
        "property_pipeline_items",
        "property_listing_id,ai_result,status,created_at,metadata",
    )
    latest_pipe: dict[str, dict] = {}
    for item in sorted(pipe_items, key=lambda r: r.get("created_at") or ""):
        lid = item.get("property_listing_id")
        if lid:
            latest_pipe[str(lid)] = item

    job_ids = sorted(
        {
            str(p["enrichment_job_id"])
            for p in latest_prop.values()
            if p.get("enrichment_job_id")
        }
    )
    jobs: dict[str, dict] = {}
    for i in range(0, len(job_ids), 50):
        chunk = job_ids[i : i + 50]
        rows = (
            client.table("ai_enrichment_jobs")
            .select("id,status,model,prompt_version,schema_version,created_at,summary")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        for row in rows:
            jobs[str(row["id"])] = row

    by_cat: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_source_cat: dict[str, Counter] = defaultdict(Counter)
    cause_counter: Counter = Counter()

    for row in listings:
        lid = str(row["id"])
        source_key = source_by_id.get(row["property_source_id"], "?")
        prop = latest_prop.get(lid)
        pipe = latest_pipe.get(lid)
        pipe_ai = (pipe or {}).get("ai_result")
        status = row.get("enrichment_status")
        prop_status = (prop or {}).get("status")
        body = _proposal_body(prop)
        projected = project_public_display_description(body)
        pub = public_dd.get(lid)

        try:
            enrichment_input = listing_to_enrichment_input(row)
            checksum = compute_input_checksum(enrichment_input)
            would_skip = should_skip_unchanged_enrichment(
                client, row=row, model=model
            )
            checksum_error = None
        except Exception as exc:  # noqa: BLE001
            checksum = None
            would_skip = False
            checksum_error = f"{type(exc).__name__}: {exc}"

        display_cause = _display_cause(body, pub, projected)

        # Classification priority — billing skip gate wins over a newer failed
        # attempt when an older matching Terra proposal still covers the input.
        if str(pipe_ai or "") == "budget_deferred":
            cat, cause = "ai_deferred", "pipeline_item_ai_result_budget_deferred"
        elif would_skip:
            if display_cause:
                cat, cause = "ai_ran_no_display_description", display_cause
            else:
                cat, cause = "ai_current", None
                if prop_status in FAILED_PROPOSAL:
                    cause = (
                        "skip_true_via_prior_success;"
                        f"latest_proposal_status={prop_status}"
                    )
        elif status == "failed" or prop_status in FAILED_PROPOSAL:
            cat, cause = (
                "ai_failed",
                f"enrichment_status={status};proposal_status={prop_status}",
            )
        elif status in {None, "", "not_run", "queued", "running"} and not prop:
            cat, cause = "ai_never_run", f"enrichment_status={status!r}"
        elif prop_status in SUCCESS_PROPOSAL or status in {
            "succeeded",
            "needs_review",
            "skipped_unchanged",
        }:
            cat, cause = (
                "ai_stale",
                "should_skip_unchanged_enrichment=false_source_or_checksum_drift",
            )
        elif not prop:
            cat, cause = "ai_never_run", f"enrichment_status={status!r}"
        else:
            cat, cause = (
                "ai_failed",
                f"unclassified enrichment_status={status};proposal_status={prop_status}",
            )

        if cause:
            cause_counter[cause] += 1

        job = jobs.get(str((prop or {}).get("enrichment_job_id") or ""))
        entry = {
            "listing_id": lid,
            "external_id": row.get("external_id"),
            "source_key": source_key,
            "category": cat,
            "cause": cause,
            "enrichment_status": status,
            "enrichment_last_input_checksum": row.get("enrichment_last_input_checksum"),
            "current_input_checksum": checksum,
            "would_skip_unchanged": would_skip,
            "checksum_error": checksum_error,
            "latest_proposal_id": (prop or {}).get("id"),
            "latest_proposal_status": prop_status,
            "latest_proposal_checksum": (prop or {}).get("input_checksum"),
            "latest_prompt_version": (prop or {}).get("prompt_version"),
            "latest_job_id": (prop or {}).get("enrichment_job_id"),
            "latest_job_status": (job or {}).get("status"),
            "pipeline_ai_result": pipe_ai,
            "public_has_display_description": pub not in (None, {}, []),
            "projected_display_description": projected,
            "display_cause": display_cause,
            "public_eligible": row.get("public_eligible"),
        }
        by_cat[cat].append(entry)
        by_source_cat[source_key][cat] += 1

    # Billable = would actually call OpenAI under current skip gate
    billable_cats = ("ai_never_run", "ai_failed", "ai_stale", "ai_deferred")
    billable_ids = sorted(
        {e["listing_id"] for cat in billable_cats for e in by_cat.get(cat, [])}
    )
    # model_did_not_produce may need paid re-run; rejected/not projected → zero-cost first
    paid_display_missing = [
        e["listing_id"]
        for e in by_cat.get("ai_ran_no_display_description", [])
        if str(e.get("cause") or "").startswith("model_did_not_produce")
    ]
    billable_ids = sorted(set(billable_ids) | set(paid_display_missing))
    cost = estimate_enrichment_cost(model=model, listing_count=len(billable_ids))

    zero_cost_display = [
        e["listing_id"]
        for e in by_cat.get("ai_ran_no_display_description", [])
        if e["listing_id"] not in set(paid_display_missing)
    ]

    report = {
        "audited_at": datetime.now(UTC).isoformat(),
        "labs_project": LABS,
        "active_listings": len(listings),
        "model_for_estimate": model,
        "billing_ground_truth": "should_skip_unchanged_enrichment",
        "counts_by_category": {k: len(v) for k, v in sorted(by_cat.items())},
        "counts_by_source_and_category": {
            sk: dict(counter) for sk, counter in sorted(by_source_cat.items())
        },
        "display_missing_causes": dict(cause_counter.most_common()),
        "listing_ids_by_category": {
            k: [e["listing_id"] for e in v] for k, v in sorted(by_cat.items())
        },
        "external_ids_by_category": {
            k: [f"{e['source_key']}:{e['external_id']}" for e in v]
            for k, v in sorted(by_cat.items())
        },
        "billable_estimate": {
            "listing_count": len(billable_ids),
            "listing_ids": billable_ids,
            "estimated_usd": str(cost.estimated_usd),
            "pricing_as_of": cost.pricing_as_of,
            "notes": cost.notes,
            "includes_categories": list(billable_cats)
            + ["ai_ran_no_display_description(model_did_not_produce*)"],
            "excludes": [
                "ai_current — should_skip_unchanged_enrichment=true → $0",
                "ai_ran_no_display_description rejected/not-projected — zero-cost policy replay first",
            ],
        },
        "unchanged_successfully_enriched_will_not_be_billed": {
            "count": len(by_cat.get("ai_current", [])),
            "mechanism": (
                "should_skip_unchanged_enrichment matches current/legacy/"
                "operational-geo twin checksum against prior successful Terra "
                "proposals — no OpenAI call"
            ),
            "plus_no_display_but_skip_true": len(
                by_cat.get("ai_ran_no_display_description", [])
            ),
        },
        "recommended_targeted_batch": {
            "priority_1_never_run": [
                e["listing_id"] for e in by_cat.get("ai_never_run", [])
            ],
            "priority_2_failed": [e["listing_id"] for e in by_cat.get("ai_failed", [])],
            "priority_3_stale": [e["listing_id"] for e in by_cat.get("ai_stale", [])],
            "priority_4_deferred": [
                e["listing_id"] for e in by_cat.get("ai_deferred", [])
            ],
            "zero_cost_first_no_display": zero_cost_display,
            "paid_display_missing_only": paid_display_missing,
        },
        "deterministic_fixes": [
            {
                "issue": "display_description produced but rejected/not projected",
                "fix": (
                    "Zero-cost reeval with enrichment_policy_v4_2; refresh "
                    "public_property_listings projection — no OpenAI"
                ),
                "script": "scripts/reeval_stored_proposals_zero_cost.py",
                "count": len(zero_cost_display),
            },
            {
                "issue": "should_skip=false on succeeded listings (stale/drift)",
                "fix": (
                    "Dry-run scripts/repair_enrichment_hash_contract.py; if still "
                    "not skippable, targeted paid enrichment for ai_stale IDs only"
                ),
                "count": len(by_cat.get("ai_stale", [])),
            },
            {
                "issue": "budget_deferred pipeline items",
                "fix": "Resume AI stage when daily budget allows; no full scrape",
                "count": len(by_cat.get("ai_deferred", [])),
            },
            {
                "issue": "RE/MAX official XCG via currency cookie not stored",
                "fix": (
                    "After import approval: GET /currency/NAF/ (sets currency=NAF "
                    "cookie) then re-fetch detail; persist official_alternate_prices; "
                    "prefer listed-in XCG when amount known"
                ),
                "evidence": "data/processed/multi_currency_probe.json",
            },
        ],
        "details_non_current": [
            e
            for cat in (
                "ai_never_run",
                "ai_failed",
                "ai_stale",
                "ai_deferred",
                "ai_ran_no_display_description",
            )
            for e in by_cat.get(cat, [])
        ],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report["counts_by_category"], indent=2))
    print(json.dumps(report["counts_by_source_and_category"], indent=2))
    print(
        f"billable~={report['billable_estimate']['listing_count']} "
        f"est_usd={report['billable_estimate']['estimated_usd']} "
        f"ai_current_skip={report['unchanged_successfully_enriched_will_not_be_billed']['count']}"
    )
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
