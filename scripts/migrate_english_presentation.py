#!/usr/bin/env python3
"""One-time Labs English presentation migration (v5) for public Ready listings.

Selects active public-eligible listings that lack a complete English presentation
contract and runs gpt-5.6-terra once per listing (title + summary + description
+ sparse attributes). Resumable. Caps: USD 15 / 320 calls.

Default is preflight (no OpenAI). Pass ``--apply`` to run billable calls.

Usage (PowerShell):
  $env:PYTHONPATH="src"; python scripts/migrate_english_presentation.py
  $env:PYTHONPATH="src"; python scripts/migrate_english_presentation.py --apply
  $env:PYTHONPATH="src"; python scripts/migrate_english_presentation.py --apply --resume
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "apps" / "labs-dashboard" / ".env.local", override=False)

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment import (  # noqa: E402
    PROMPT_VERSION,
    SCHEMA_VERSION,
)
from merkado_labs.enrichment.jobs import (  # noqa: E402
    create_enrichment_job,
    hydrate_map_neighbourhood_names,
    listing_to_enrichment_input,
    process_enrichment_job,
    should_skip_unchanged_enrichment,
)
from merkado_labs.enrichment.policy import POLICY_VERSION  # noqa: E402
from merkado_labs.enrichment.presentation import (  # noqa: E402
    has_complete_english_presentation,
)
from merkado_labs.enrichment.pricing import estimate_enrichment_cost  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"
FORBIDDEN = "jkrfyvukhhsapoivntms"
MODEL = "gpt-5.6-terra"
MAX_COST_USD = Decimal("15")
MAX_CALLS = 320
PROGRESS_PATH = ROOT / "data" / "processed" / "english_presentation_migration_progress.json"
REPORT_PATH = ROOT / "data" / "processed" / "english_presentation_migration_report.json"
READY_SOURCES = (
    "remax_curacao",
    "keller_williams_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)


def _require_labs() -> str:
    settings = get_settings()
    ref = settings.supabase_project_ref
    if ref != LABS:
        raise SystemExit(f"Refusing non-Labs project ref {ref!r}")
    if FORBIDDEN in str(settings.supabase_url or ""):
        raise SystemExit("Production Supabase URL detected — refuse")
    if LABS not in str(settings.supabase_url or ""):
        raise SystemExit(f"Labs URL required, got {settings.supabase_url!r}")
    return ref


def _active_pipeline_workers(client: Any) -> list[dict[str, Any]]:
    locks = (
        client.table("property_pipeline_source_locks")
        .select("source_key,locked_by,expires_at")
        .gt("expires_at", datetime.now(UTC).isoformat())
        .execute()
        .data
        or []
    )
    runs = (
        client.table("property_pipeline_runs")
        .select("id,status,created_at")
        .in_("status", ["queued", "running", "cancelling"])
        .limit(10)
        .execute()
        .data
        or []
    )
    jobs = (
        client.table("ai_enrichment_jobs")
        .select("id,status,created_at,model")
        .in_("status", ["queued", "running"])
        .limit(10)
        .execute()
        .data
        or []
    )
    return [{"kind": "lock", **row} for row in locks] + [
        {"kind": "pipeline_run", **row} for row in runs
    ] + [{"kind": "ai_job", **row} for row in jobs]


def _latest_proposal(client: Any, listing_id: str) -> dict[str, Any] | None:
    rows = (
        client.table("ai_enrichment_proposals")
        .select(
            "id,prompt_version,schema_version,status,proposal,generated_at,input_checksum"
        )
        .eq("property_listing_id", listing_id)
        .in_("status", ["succeeded", "needs_review", "skipped_unchanged"])
        .order("generated_at", desc=True)
        .limit(5)
        .execute()
        .data
        or []
    )
    for row in rows:
        proposal = row.get("proposal")
        if isinstance(proposal, dict) and has_complete_english_presentation(proposal):
            return row
    return rows[0] if rows else None


def _fetch_active_ready_rows(client: Any) -> list[dict[str, Any]]:
    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(READY_SOURCES))
        .execute()
        .data
        or []
    )
    source_ids = [str(s["id"]) for s in sources]
    source_by_id = {str(s["id"]): s["source_key"] for s in sources}
    rows: list[dict[str, Any]] = []
    start = 0
    page = 200
    while True:
        chunk = (
            client.table("property_listings")
            .select(
                "id,external_id,source_url,title,description,listing_type,"
                "property_type,source_listing_status,status,bedrooms,bathrooms,"
                "floor_area_m2,lot_area_value,lot_area_unit,"
                "source_neighbourhood_text,original_price,original_currency,"
                "latitude,longitude,amenities,enrichment_status,"
                "enrichment_last_input_checksum,public_eligible,"
                "neighbourhood_assignment_status,neighbourhood_assignment_method,"
                "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
                "property_source_id,missing_since,removed_at"
            )
            .in_("property_source_id", source_ids)
            .eq("status", "active")
            .range(start, start + page - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        for row in chunk:
            row["source_key"] = source_by_id.get(str(row.get("property_source_id")))
            rows.append(row)
        if len(chunk) < page:
            break
        start += page
    return hydrate_map_neighbourhood_names(client, rows)


def select_migration_allowlist(
    client: Any, *, model: str = MODEL
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (selected, already_complete) for English presentation migration."""

    selected: list[dict[str, Any]] = []
    complete: list[dict[str, Any]] = []
    for row in _fetch_active_ready_rows(client):
        lid = str(row["id"])
        if row.get("missing_since") or row.get("removed_at"):
            continue
        # Include all active Ready listings (public + no-price). Public-eligible
        # rows are the main browser surface; no-price rows still need English
        # presentation for internal Passport / future eligibility.
        if not row.get("source_url"):
            continue
        prior = _latest_proposal(client, lid)
        proposal = prior.get("proposal") if prior else None
        if isinstance(proposal, dict) and has_complete_english_presentation(proposal):
            # Also require skip path agrees (checksum + complete).
            if should_skip_unchanged_enrichment(client, row=row, model=model):
                complete.append(
                    {
                        "listing_id": lid,
                        "external_id": row.get("external_id"),
                        "source_key": row.get("source_key"),
                        "reason": "complete_english_presentation",
                    }
                )
                continue
        title = (row.get("title") or "").strip()
        desc = (row.get("description") or "").strip()
        if len(title) < 3 and len(desc) < 40:
            continue
        selected.append(
            {
                "listing_id": lid,
                "external_id": row.get("external_id"),
                "source_key": row.get("source_key"),
                "title_len": len(title),
                "description_len": len(desc),
                "prior_prompt": (prior or {}).get("prompt_version"),
            }
        )
    selected.sort(key=lambda r: (str(r.get("source_key")), str(r.get("external_id"))))
    return selected, complete


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-cost-usd", type=Decimal, default=MAX_COST_USD)
    parser.add_argument("--max-calls", type=int, default=MAX_CALLS)
    args = parser.parse_args()

    ref = _require_labs()
    settings = get_settings()
    model = (settings.openai_enrichment_model or "").strip() or MODEL
    if model != MODEL:
        raise SystemExit(
            f"Expected OPENAI_ENRICHMENT_MODEL={MODEL!r}, got {model!r}"
        )

    client = create_labs_client()
    workers = _active_pipeline_workers(client)
    if workers and args.apply:
        raise SystemExit(
            f"Active pipeline/AI workers detected — stop before migration: {workers}"
        )

    selected, complete = select_migration_allowlist(client, model=model)
    if args.limit is not None:
        selected = selected[: max(0, args.limit)]

    estimate = estimate_enrichment_cost(model=model, listing_count=len(selected))
    preflight = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "apply": bool(args.apply),
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "reasoning_effort": settings.openai_enrichment_reasoning_effort,
        "max_output_tokens": settings.openai_enrichment_max_output_tokens,
        "selected_count": len(selected),
        "already_complete_count": len(complete),
        "selected_listing_ids": [s["listing_id"] for s in selected],
        "selected_by_source": {},
        "estimate": {
            "estimated_usd": str(estimate.estimated_usd),
            "input_tokens": estimate.input_tokens,
            "output_tokens": estimate.output_tokens,
            "notes": estimate.notes,
        },
        "caps": {
            "max_cost_usd": str(args.max_cost_usd),
            "max_calls": args.max_calls,
        },
        "active_workers": workers,
        "checks": {
            "labs_ref": ref == LABS,
            "under_cost_cap": estimate.estimated_usd <= args.max_cost_usd,
            "under_call_cap": len(selected) <= args.max_calls,
            "no_active_workers": not workers,
            "prompt_is_v5": PROMPT_VERSION == "listing_enrichment_v5",
        },
    }
    by_source: dict[str, int] = {}
    for item in selected:
        key = str(item.get("source_key") or "unknown")
        by_source[key] = by_source.get(key, 0) + 1
    preflight["selected_by_source"] = by_source

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(preflight, indent=2), encoding="utf-8")
    print(json.dumps({k: preflight[k] for k in (
        "selected_count", "already_complete_count", "selected_by_source",
        "estimate", "caps", "checks", "apply",
    )}, indent=2))

    if not all(preflight["checks"].values()):
        failed = [k for k, v in preflight["checks"].items() if not v]
        raise SystemExit(f"Preflight failed: {failed}")

    if not args.apply:
        print(f"Dry-run only. Report: {REPORT_PATH}")
        return 0

    if not selected:
        print("Nothing to migrate — all selected listings already complete.")
        return 0

    if estimate.estimated_usd > args.max_cost_usd:
        raise SystemExit(
            f"Estimate {estimate.estimated_usd} exceeds cap {args.max_cost_usd}"
        )
    if len(selected) > args.max_calls:
        raise SystemExit(
            f"Selected {len(selected)} exceeds max calls {args.max_calls}"
        )

    listing_ids = [str(s["listing_id"]) for s in selected]
    job_id = create_enrichment_job(
        client,
        scope_type="manual_selection",
        scope_filter={
            "migration": "english_presentation_v5",
            "one_time": True,
            "max_cost_usd": str(args.max_cost_usd),
        },
        listing_ids=listing_ids,
        model=model,
        requested_by="scripts/migrate_english_presentation.py",
    )
    print(f"Created job {job_id} for {len(listing_ids)} listings")

    result = process_enrichment_job(
        job_id,
        listing_ids=listing_ids,
        batch_size=1,
        force=True,
        model=model,
        client=client,
        persist_timeline=True,
        max_estimated_cost_usd=float(args.max_cost_usd),
        resume=bool(args.resume),
        progress_path=PROGRESS_PATH,
    )
    report = {
        **preflight,
        "job_id": job_id,
        "result": result,
        "finished_at": datetime.now(UTC).isoformat(),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({
        "job_id": job_id,
        "succeeded": result.get("succeeded"),
        "failed": result.get("failed"),
        "skipped": result.get("skipped"),
        "estimated_or_actual_cost": result.get("total_estimated_cost_usd")
        or result.get("total_cost_usd"),
        "report": str(REPORT_PATH),
    }, indent=2, default=str))
    return 0 if not result.get("failed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
