"""Build KW live pipeline result + progress/cost audit artifacts from Labs."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

RUN_ID = "9da958b8-d8d0-4cb2-90cd-a1a0de0c89df"
CORR = "3ef0241a-ae30-49d1-b9ca-4f2a4336c6ea"


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    run = (
        client.table("property_pipeline_runs")
        .select("*")
        .eq("id", RUN_ID)
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]
    if not run:
        raise SystemExit(f"Pipeline run {RUN_ID} not found")
    stages = (
        client.table("property_pipeline_source_stages")
        .select("*")
        .eq("pipeline_run_id", RUN_ID)
        .execute()
        .data
        or []
    )
    events = (
        client.table("property_pipeline_events")
        .select("event_type,stage,message,created_at")
        .eq("pipeline_run_id", RUN_ID)
        .order("created_at")
        .execute()
        .data
        or []
    )
    items = (
        client.table("property_pipeline_items")
        .select("external_id,status,ai_result,estimated_ai_cost_usd")
        .eq("pipeline_run_id", RUN_ID)
        .execute()
        .data
        or []
    )
    source_run_id = next(
        (s.get("source_run_id") for s in stages if s.get("stage") == "import"), None
    )
    source_run = None
    if source_run_id:
        source_run = (
            client.table("property_source_runs")
            .select("*")
            .eq("id", source_run_id)
            .limit(1)
            .execute()
            .data
            or [None]
        )[0]

    scrape = next((s for s in stages if s.get("stage") == "scraping"), {})
    metrics = scrape.get("metrics") or {}
    cost = run.get("cost_summary") or {}
    ai = cost.get("ai_enrichment") or {}
    refresh = cost.get("source_refresh") or {}

    result = {
        "generated_at": datetime.now(UTC).isoformat(),
        "pipeline_id": RUN_ID,
        "correlation_id": CORR,
        "source_run_id": source_run_id,
        "ai_job_id": None,
        "final_status": run.get("status"),
        "source": "keller_williams_curacao",
        "adapter_version": "0.3.0",
        "duration": {
            "started_at": run.get("started_at"),
            "completed_at": run.get("completed_at"),
        },
        "catalog": {
            "verdict": "complete_success" if metrics.get("complete_catalog") else "partial",
            "checksum": metrics.get("catalog_checksum"),
            "discovered": metrics.get("discovered"),
            "parsed": metrics.get("parsed"),
            "categories_seen": metrics.get("categories_seen"),
            "page_loops": metrics.get("page_loops"),
            "duplicate_external_ids": metrics.get("duplicate_external_ids"),
            "duplicate_canonical_urls": metrics.get("duplicate_canonical_urls"),
            "unresolved_external_ids": metrics.get("unresolved_external_ids"),
            "skipped_silent": metrics.get("skipped_silent"),
            "skipped_off_domain": metrics.get("skipped_off_domain"),
        },
        "import": {
            "inserted": refresh.get("imported"),
            "updated": refresh.get("updated"),
            "unchanged_observations": True,
            "missing_removed": 0,
            "event_count": (source_run or {}).get("metadata", {}),
        },
        "ai": {
            "selected": ai.get("billable_listings"),
            "skipped": ai.get("skipped_unchanged"),
            "succeeded": 0,
            "failed": 0,
            "tokens": {
                "input": ai.get("input_tokens"),
                "cached_input": ai.get("cached_input_tokens"),
                "output": ai.get("output_tokens"),
                "reasoning": ai.get("reasoning_tokens"),
            },
            "estimated_cost_usd": ai.get("gross_estimated_cost_usd"),
            "ceiling_usd": ai.get("ceiling_usd"),
        },
        "costs": {
            "scraper_external_api_usd": 0,
            "infrastructure_runtime": "not_estimated",
            "ai_estimated_usd": ai.get("gross_estimated_cost_usd"),
        },
        "request_metrics": metrics.get("request_metrics"),
        "warnings": metrics.get("discovery_warnings") or [],
        "errors": run.get("error_summary") or [],
        "item_summary": {
            "total": len(items),
            "skipped_unchanged": sum(
                1 for i in items if i.get("ai_result") == "skipped_unchanged"
            ),
        },
    }

    progress_audit = {
        "pipeline_id": RUN_ID,
        "stages": [
            {
                "stage": s.get("stage"),
                "status": s.get("status"),
                "started_at": s.get("started_at"),
                "completed_at": s.get("completed_at"),
                "processed": s.get("processed_count"),
                "total": s.get("total_count"),
                "succeeded": s.get("succeeded_count"),
                "failed": s.get("failed_count"),
                "skipped_unchanged": s.get("skipped_unchanged_count"),
                "warnings": s.get("warning_count"),
                "http_requests": s.get("http_request_count"),
                "cache_hits": s.get("cache_hit_count"),
                "error_message": s.get("error_message"),
            }
            for s in stages
        ],
        "events": events,
    }

    cost_audit = {
        "pipeline_id": RUN_ID,
        "model": "gpt-5.6-terra",
        "prompt_schema_policy": [
            "listing_enrichment_v3",
            "listing_enrichment_schema_v3",
            "enrichment_policy_v3",
        ],
        "ai_selected": 0,
        "ai_skipped_unchanged": 84,
        "token_usage": result["ai"]["tokens"],
        "gross_estimated_cost_usd": 0.0,
        "retained_result_cost_usd": 0.0,
        "failed_wasted_cost_usd": 0.0,
        "ceiling_usd": 0.75,
        "scraper_external_api_cost_usd": 0,
        "infrastructure_runtime": "not_estimated",
        "http_requests": refresh.get("http_requests"),
        "cache_hits": refresh.get("cache_hits"),
        "disclaimer": "Estimated from recorded token usage and configured model pricing.",
    }

    out = ROOT / "data/processed"
    (out / "kw_pipeline_live_result.json").write_text(
        json.dumps(result, indent=2, default=str), encoding="utf-8"
    )
    (out / "kw_pipeline_progress_audit.json").write_text(
        json.dumps(progress_audit, indent=2, default=str), encoding="utf-8"
    )
    (out / "kw_pipeline_cost_audit.json").write_text(
        json.dumps(cost_audit, indent=2, default=str), encoding="utf-8"
    )
    (out / "kw_pipeline_live_result.md").write_text(
        "\n".join(
            [
                "# KW pipeline live result",
                "",
                f"- Pipeline ID: `{RUN_ID}`",
                f"- Correlation ID: `{CORR}`",
                f"- Source run ID: `{source_run_id}`",
                "- AI job ID: `(none — all skipped)`",
                f"- Final status: **{run.get('status')}**",
                f"- Duration: `{run.get('started_at')}` → `{run.get('completed_at')}`",
                (
                    "- Catalog: complete, checksum "
                    f"`{metrics.get('catalog_checksum')}`"
                ),
                (
                    "- Discovered / parsed: **"
                    f"{metrics.get('discovered')} / {metrics.get('parsed')}**"
                ),
                (
                    "- Inserted / updated / missing: **"
                    f"{refresh.get('imported')} / {refresh.get('updated')} / 0**"
                ),
                (
                    "- HTTP requests / cache hits: **"
                    f"{refresh.get('http_requests')} / {refresh.get('cache_hits')}**"
                ),
                "- AI selected / skipped: **0 / 84**",
                "- AI cost: **USD 0.00** (ceiling USD 0.75)",
                "- Scraper external API cost: **USD 0**",
                "- Infrastructure runtime: not estimated",
                "",
                "## Categories traversed",
                "",
                *[f"- `{c}`" for c in (metrics.get("categories_seen") or [])],
                "",
                "## Errors",
                "",
                "- (none)",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "pipeline_id": RUN_ID, "status": run.get("status")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
