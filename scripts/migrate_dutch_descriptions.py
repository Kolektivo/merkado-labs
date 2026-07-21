#!/usr/bin/env python3
"""One-time Labs Dutch display-description backfill for public listings.

Selects public-ready listings that already have a valid English description and
lack a current Dutch description for the same presentation-input hash. Runs
gpt-5.6-terra Dutch-only (never regenerates English). Resumable.

Caps: USD 5 / 320 calls. Default is preflight (no OpenAI). Pass ``--apply``.

Usage (PowerShell):
  $env:PYTHONPATH="src"; python scripts/migrate_dutch_descriptions.py
  $env:PYTHONPATH="src"; python scripts/migrate_dutch_descriptions.py --apply
  $env:PYTHONPATH="src"; python scripts/migrate_dutch_descriptions.py --apply --resume
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
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
from merkado_labs.enrichment.display_description import (  # noqa: E402
    detect_dominant_language,
)
from merkado_labs.enrichment.nl_description import (  # noqa: E402
    DEFAULT_NL_INPUT_TOKENS,
    DEFAULT_NL_OUTPUT_TOKENS,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    compute_presentation_input_hash,
    ensure_dutch_description_for_listing,
    extract_english_presentation_blocks,
    has_valid_dutch_description,
    should_skip_dutch_description,
)
from merkado_labs.enrichment.presentation import (  # noqa: E402
    has_complete_english_presentation,
)
from merkado_labs.enrichment.pricing import estimate_enrichment_cost  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"
FORBIDDEN = "jkrfyvukhhsapoivntms"
MODEL = "gpt-5.6-terra"
MAX_COST_USD = Decimal("5")
MAX_CALLS = 320
PROGRESS_PATH = ROOT / "data" / "processed" / "dutch_description_migration_progress.json"
REPORT_PATH = ROOT / "data" / "processed" / "dutch_description_migration_report.json"
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
    return (
        [{"kind": "lock", **row} for row in locks]
        + [{"kind": "pipeline_run", **row} for row in runs]
        + [{"kind": "ai_job", **row} for row in jobs]
    )


def _load_progress() -> dict[str, Any]:
    if not PROGRESS_PATH.exists():
        return {"completed_listing_ids": [], "results": []}
    try:
        return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"completed_listing_ids": [], "results": []}


def _save_progress(progress: dict[str, Any]) -> None:
    PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2, default=str), encoding="utf-8")


def _english_proposal_for_public_listing(
    client: Any, listing_id: str
) -> dict[str, Any] | None:
    rows = (
        client.table("ai_enrichment_proposals")
        .select(
            "id,prompt_version,schema_version,status,proposal,generated_at,input_checksum"
        )
        .eq("property_listing_id", listing_id)
        .in_("status", ["succeeded", "needs_review"])
        .order("generated_at", desc=True)
        .limit(8)
        .execute()
        .data
        or []
    )
    # Prefer v5 with complete English presentation.
    for row in rows:
        if row.get("prompt_version") != "listing_enrichment_v5":
            continue
        proposal = row.get("proposal")
        if isinstance(proposal, dict) and has_complete_english_presentation(proposal):
            if extract_english_presentation_blocks(proposal):
                return row
    for row in rows:
        proposal = row.get("proposal")
        if isinstance(proposal, dict) and has_complete_english_presentation(proposal):
            if extract_english_presentation_blocks(proposal):
                return row
    return None


def _fetch_public_ready_rows(client: Any) -> list[dict[str, Any]]:
    """Listings that can appear on a property detail page (public view)."""

    rows: list[dict[str, Any]] = []
    start = 0
    page = 200
    while True:
        chunk = (
            client.table("public_property_listings")
            .select(
                "id,external_id,source_key,title,description,listing_type,"
                "property_type,effective_property_type,bedrooms,bathrooms,"
                "floor_area_m2,lot_area_value,lot_area_unit,"
                "effective_neighbourhood,amenities,display_description,"
                "display_description_nl"
            )
            .in_("source_key", list(READY_SOURCES))
            .range(start, start + page - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    return rows


def select_dutch_backfill(
    client: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (selected billable, already_complete zero-cost)."""

    selected: list[dict[str, Any]] = []
    complete: list[dict[str, Any]] = []
    for row in _fetch_public_ready_rows(client):
        lid = str(row["id"])
        en_desc = row.get("display_description")
        if not isinstance(en_desc, dict) or not str(en_desc.get("overview") or "").strip():
            continue
        proposal_row = _english_proposal_for_public_listing(client, lid)
        if not proposal_row:
            continue
        proposal = proposal_row["proposal"]
        english_blocks = extract_english_presentation_blocks(proposal)
        if not english_blocks:
            continue
        source_language = proposal.get("source_language")
        if not isinstance(source_language, str) or not source_language.strip():
            source_language = detect_dominant_language(
                f"{row.get('title') or ''}\n{row.get('description') or ''}"
            )
        checksum = compute_presentation_input_hash(
            english_blocks=english_blocks,
            source_title=row.get("title"),
            source_description=row.get("description"),
            source_language=source_language,
            listing_type=row.get("listing_type"),
            property_type=row.get("property_type") or row.get("effective_property_type"),
            bedrooms=row.get("bedrooms"),
            bathrooms=row.get("bathrooms"),
        )
        item = {
            "listing_id": lid,
            "external_id": row.get("external_id"),
            "source_key": row.get("source_key"),
            "source_language": source_language,
            "presentation_input_hash": checksum,
            "proposal_id": proposal_row.get("id"),
            "listing_type": row.get("listing_type"),
            "property_type": row.get("property_type") or row.get("effective_property_type"),
        }
        if should_skip_dutch_description(
            client, listing_id=lid, presentation_input_hash=checksum
        ):
            complete.append({**item, "reason": "dutch_current_for_hash"})
            continue
        # Also treat projected NL as complete when hash row missing but view has NL
        # (defensive — normally table drives skip).
        nl = row.get("display_description_nl")
        if has_valid_dutch_description(nl if isinstance(nl, dict) else None):
            # View may show latest NL; still billable if hash differs.
            pass
        selected.append(item)
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
    raw_key = settings.openai_api_key
    if hasattr(raw_key, "get_secret_value"):
        api_key = str(raw_key.get_secret_value() or "").strip()
    else:
        api_key = str(raw_key or "").strip()
    if args.apply and not api_key:
        raise SystemExit("OPENAI_API_KEY required for --apply")

    client = create_labs_client()
    workers = _active_pipeline_workers(client)
    if workers and args.apply:
        raise SystemExit(
            f"Active pipeline/AI workers detected — stop before migration: {workers}"
        )

    selected, complete = select_dutch_backfill(client)
    progress = _load_progress() if args.resume else {"completed_listing_ids": [], "results": []}
    done_ids = set(progress.get("completed_listing_ids") or [])
    if args.resume and done_ids:
        selected = [s for s in selected if s["listing_id"] not in done_ids]

    if args.limit is not None:
        selected = selected[: max(0, args.limit)]

    estimate = estimate_enrichment_cost(
        model=model,
        listing_count=len(selected),
        input_tokens_per_listing=DEFAULT_NL_INPUT_TOKENS,
        output_tokens_per_listing=DEFAULT_NL_OUTPUT_TOKENS,
    )
    lang_dist = Counter(str(s.get("source_language") or "unknown") for s in selected)
    by_source = Counter(str(s.get("source_key") or "unknown") for s in selected)

    preflight = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "apply": bool(args.apply),
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "english_enrichment_untouched": True,
        "selected_count": len(selected),
        "already_complete_count": len(complete),
        "selected_by_source": dict(by_source),
        "original_language_distribution": dict(lang_dist),
        "maximum_calls": min(len(selected), args.max_calls),
        "estimate": {
            "estimated_usd": str(estimate.estimated_usd),
            "input_tokens": estimate.input_tokens,
            "output_tokens": estimate.output_tokens,
            "notes": estimate.notes,
            "tokens_per_listing": {
                "input": DEFAULT_NL_INPUT_TOKENS,
                "output": DEFAULT_NL_OUTPUT_TOKENS,
            },
        },
        "caps": {
            "max_cost_usd": str(args.max_cost_usd),
            "max_calls": args.max_calls,
            "daily_budget_usd_unchanged": "2",
            "monthly_budget_usd_unchanged": "25",
        },
        "active_workers": workers,
        "checks": {
            "labs_ref": ref == LABS,
            "under_cost_cap": estimate.estimated_usd <= args.max_cost_usd,
            "under_call_cap": len(selected) <= args.max_calls,
            "no_active_workers": not workers,
            "english_untouched": True,
        },
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(preflight, indent=2, default=str), encoding="utf-8")
    print(
        json.dumps(
            {
                k: preflight[k]
                for k in (
                    "selected_count",
                    "already_complete_count",
                    "selected_by_source",
                    "original_language_distribution",
                    "model",
                    "prompt_version",
                    "schema_version",
                    "estimate",
                    "caps",
                    "checks",
                    "english_enrichment_untouched",
                    "apply",
                )
            },
            indent=2,
        )
    )

    if not all(preflight["checks"].values()):
        failed = [k for k, v in preflight["checks"].items() if not v]
        raise SystemExit(f"Preflight failed: {failed}")

    if not args.apply:
        print(f"Dry-run only. Report: {REPORT_PATH}")
        return 0

    if not selected:
        print("Nothing to migrate — all selected listings already have current Dutch.")
        return 0

    if estimate.estimated_usd > args.max_cost_usd:
        raise SystemExit(
            f"Estimate {estimate.estimated_usd} exceeds cap {args.max_cost_usd} — stop before calls"
        )

    succeeded = failed = skipped = repaired = 0
    total_cost = Decimal("0")
    total_input = total_output = 0
    results: list[dict[str, Any]] = list(progress.get("results") or [])

    for index, item in enumerate(selected, start=1):
        if total_cost >= args.max_cost_usd:
            print(f"Stopping at cost cap {args.max_cost_usd}")
            break
        if succeeded + failed + skipped >= args.max_calls:
            print(f"Stopping at call cap {args.max_calls}")
            break

        lid = item["listing_id"]
        listing_row = (
            client.table("public_property_listings")
            .select(
                "id,external_id,source_key,title,description,listing_type,"
                "property_type,effective_property_type,bedrooms,bathrooms,"
                "floor_area_m2,lot_area_value,lot_area_unit,"
                "effective_neighbourhood,amenities"
            )
            .eq("id", lid)
            .limit(1)
            .execute()
            .data
            or [None]
        )[0]
        proposal_row = _english_proposal_for_public_listing(client, lid)
        if not listing_row or not proposal_row:
            failed += 1
            results.append({"listing_id": lid, "status": "failed", "error": "missing_rows"})
            continue

        print(
            f"[{index}/{len(selected)}] {item.get('source_key')} "
            f"{item.get('external_id')} …",
            flush=True,
        )
        result = ensure_dutch_description_for_listing(
            client,
            listing_id=lid,
            proposal_row=proposal_row,
            listing_row=listing_row,
            api_key=api_key,
            model=model,
            force=False,
        )
        in_t = int(result.token_usage.get("input_tokens") or 0)
        out_t = int(result.token_usage.get("output_tokens") or 0)
        total_input += in_t
        total_output += out_t
        if result.cost_usd:
            total_cost += Decimal(str(result.cost_usd))
        if result.token_usage.get("repair_attempted"):
            repaired += 1
        if result.status == "skipped_unchanged":
            skipped += 1
        elif result.status in {"succeeded", "needs_review"}:
            succeeded += 1
        else:
            failed += 1

        results.append(
            {
                "listing_id": lid,
                "external_id": item.get("external_id"),
                "source_key": item.get("source_key"),
                "source_language": item.get("source_language"),
                "status": result.status,
                "cost_usd": result.cost_usd,
                "token_usage": result.token_usage,
                "error": result.error_message,
                "presentation_input_hash": result.presentation_input_hash,
            }
        )
        done_ids.add(lid)
        progress = {
            "completed_listing_ids": sorted(done_ids),
            "results": results,
            "running_cost_usd": str(total_cost),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        _save_progress(progress)

    # Zero-cost rerun proof
    selected_after, complete_after = select_dutch_backfill(client)
    report = {
        **preflight,
        "finished_at": datetime.now(UTC).isoformat(),
        "apply_result": {
            "succeeded": succeeded,
            "failed": failed,
            "skipped": skipped,
            "repair_retries": repaired,
            "total_cost_usd": str(total_cost),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "billable_calls_approx": succeeded + failed + repaired,
        },
        "rerun_selection": {
            "selected_count": len(selected_after),
            "already_complete_count": len(complete_after),
            "selected_by_source": dict(
                Counter(str(s.get("source_key") or "unknown") for s in selected_after)
            ),
            "zero_billable_unchanged": len(selected_after) == 0,
        },
        "results": results,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(
        json.dumps(
            {
                "apply_result": report["apply_result"],
                "rerun_selection": report["rerun_selection"],
                "report": str(REPORT_PATH),
            },
            indent=2,
            default=str,
        )
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
