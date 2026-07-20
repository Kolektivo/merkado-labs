"""Build KW Refresh & enrich live preflight (Labs read + local catalog estimate).

Does not enqueue, scrape, import, or call OpenAI.
Stops (exit 2) when approved gates fail.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
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
from merkado_labs.enrichment.policy import POLICY_VERSION  # noqa: E402
from merkado_labs.enrichment.pricing import estimate_enrichment_cost  # noqa: E402
from merkado_labs.pipeline.worker import (  # noqa: E402
    MAX_MISSING_REMOVALS_BEFORE_STOP,
    PIPELINE_AI_COST_CEILING_USD,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

OUT_JSON = ROOT / "data/processed/kw_pipeline_live_preflight.json"
OUT_MD = ROOT / "data/processed/kw_pipeline_live_preflight.md"
PRIOR_CATALOG = ROOT / "data/processed/kw_catalog_dry_run.json"
CACHE_DIR = ROOT / "data/raw/keller_williams_curacao/cache"
FORBIDDEN_REF = "jkrfyvukhhsapoivntms"


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF or ref == FORBIDDEN_REF:
        print(f"STOP: production or non-Labs project {ref!r}")
        return 2

    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    rows = (
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
            "property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    for row in rows:
        ps = row.get("property_sources")
        row["source_key"] = (
            ps.get("source_key")
            if isinstance(ps, dict) and ps.get("source_key")
            else "keller_williams_curacao"
        )

    active_pipeline = [
        row
        for row in (
            client.table("property_pipeline_runs")
            .select("id,status,source_keys")
            .in_("status", ["queued", "running", "stopping"])
            .execute()
            .data
            or []
        )
        if "keller_williams_curacao" in (row.get("source_keys") or [])
    ]
    active_ai = (
        client.table("ai_enrichment_jobs")
        .select("id,status")
        .eq("property_source_id", source["id"])
        .in_("status", ["queued", "running", "processing"])
        .execute()
        .data
        or []
    )

    prior = json.loads(PRIOR_CATALOG.read_text(encoding="utf-8")) if PRIOR_CATALOG.exists() else {}
    prior_run = prior.get("run") or {}
    prior_listings = prior.get("listings") or []
    prior_external = {str(item.get("external_id")) for item in prior_listings}
    labs_external = {str(row.get("external_id")) for row in rows}

    billable: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []
    for row in rows:
        enrichment_input = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(enrichment_input)
        lid = str(row["id"])
        if has_identical_enrichment_attempt(
            client,
            listing_id=lid,
            model="gpt-5.6-terra",
            input_checksum=checksum,
        ):
            skipped.append(
                {
                    "listing_id": lid,
                    "external_id": str(row.get("external_id")),
                    "reason": "unchanged_successful_checksum",
                }
            )
        else:
            status = str(row.get("enrichment_status") or "not_run")
            reason = "new_or_changed_checksum"
            if status == "failed":
                reason = "failed_retry_candidate"
            billable.append(
                {
                    "listing_id": lid,
                    "external_id": str(row.get("external_id")),
                    "reason": reason,
                    "enrichment_status": status,
                }
            )

    ai_estimate = estimate_enrichment_cost(
        model="gpt-5.6-terra", listing_count=len(billable)
    )
    cache_files = len(list(CACHE_DIR.glob("*.html"))) if CACHE_DIR.exists() else 0
    req = prior_run.get("request_metrics") or {}

    # Catalog delta vs last dry-run artifact (live scrape may differ).
    possible_missing = sorted(labs_external - prior_external - {""})
    possible_added = sorted(prior_external - labs_external - {""})

    stop_reasons: list[str] = []
    if float(ai_estimate.estimated_usd) > PIPELINE_AI_COST_CEILING_USD:
        stop_reasons.append(
            f"expected_ai_spend {ai_estimate.estimated_usd} > ceiling "
            f"{PIPELINE_AI_COST_CEILING_USD}"
        )
    if len(possible_missing) > MAX_MISSING_REMOVALS_BEFORE_STOP:
        stop_reasons.append(
            f"predicted_missing {len(possible_missing)} > "
            f"{MAX_MISSING_REMOVALS_BEFORE_STOP}"
        )
    if active_pipeline:
        stop_reasons.append(f"active_pipeline_run:{active_pipeline[0]['id']}")
    if active_ai:
        stop_reasons.append(f"active_ai_job:{active_ai[0]['id']}")
    if ref == FORBIDDEN_REF:
        stop_reasons.append("production_configuration")

    public_eligible = sum(1 for row in rows if row.get("public_eligible"))
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": "keller_williams_curacao",
        "adapter_version": "0.3.0",
        "schedule": "manual_only",
        "scope_metadata": {
            "prompt_version": PROMPT_VERSION,
            "schema_version": SCHEMA_VERSION,
            "policy_version": POLICY_VERSION,
            "model": "gpt-5.6-terra",
        },
        "current_kw_state": {
            "imported_listings": len(rows),
            "public_eligible": public_eligible,
            "enrichment_status_skipped_unchanged": sum(
                1 for row in rows if row.get("enrichment_status") == "skipped_unchanged"
            ),
            "active_pipeline_runs": len(active_pipeline),
            "active_ai_jobs": len(active_ai),
            "source_enabled": bool(source.get("enabled")),
            "adapter_status": source.get("adapter_status"),
        },
        "expected_requests": {
            "category_index_requests": int(req.get("index_requests") or 5),
            "detail_requests": int(req.get("detail_requests") or 84),
            "network_requests_total_prior": int(req.get("network_requests_total") or 0),
            "cache_hits_total_prior": int(req.get("cache_hits_total") or 0),
            "local_cache_html_files": cache_files,
            "cache_behavior": (
                "use_cache=True; Crawl-Delay 20s on network misses; "
                "sequential detail GETs; robots enforced"
            ),
            "silent_listings_excluded": True,
            "five_section_complete_discovery": True,
        },
        "catalog_expectations": {
            "prior_dry_run_discovered": prior_run.get("discovered"),
            "prior_complete_catalog": prior_run.get("complete_catalog"),
            "current_labs_count": len(rows),
            "expected_inserts": len(possible_added),
            "expected_updates": "unknown_until_live_diff",
            "expected_unchanged_listings": "majority_if_catalog_stable",
            "expected_possible_missing": possible_missing,
            "expected_possible_missing_count": len(possible_missing),
            "lifecycle_risk": (
                "Missing/removed only if live run is complete successful catalog. "
                "Partial/failed never mark absence."
            ),
            "evidence_uploads": "private listing-raw-evidence on import when HTML preserved",
        },
        "ai_selection": {
            "total_listings": len(rows),
            "selected_for_ai": len(billable),
            "skipped_unchanged": len(skipped),
            "selected": billable,
            "skipped_sample": skipped[:10],
            "estimated_tokens": {
                "input": ai_estimate.input_tokens,
                "output": ai_estimate.output_tokens,
            },
            "estimated_ai_cost_usd": float(ai_estimate.estimated_usd),
            "maximum_ai_cost_usd": PIPELINE_AI_COST_CEILING_USD,
            "within_ceiling": float(ai_estimate.estimated_usd)
            <= PIPELINE_AI_COST_CEILING_USD,
        },
        "stop_gates": {
            "reasons": stop_reasons,
            "may_proceed": len(stop_reasons) == 0,
        },
        "dashboard_confirmation_equivalent": {
            "sources": ["Keller Williams Curaçao"],
            "expected_request_scope": "manual refresh & enrich",
            "import_will_occur": True,
            "approved_ai_ceiling_usd": PIPELINE_AI_COST_CEILING_USD,
            "lifecycle_risk": (
                "missing/removed only on complete successful catalogs; "
                "partial/failed never mark absence"
            ),
        },
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    OUT_MD.write_text(
        "\n".join(
            [
                "# KW pipeline live preflight",
                "",
                f"- Generated: `{payload['generated_at']}`",
                f"- Project: `{ref}` (Labs only)",
                "- Source: `keller_williams_curacao` adapter `0.3.0`",
                f"- Scope: `{PROMPT_VERSION}` / `{SCHEMA_VERSION}` / `{POLICY_VERSION}`",
                f"- Current listings: **{len(rows)}** (public eligible ~{public_eligible})",
                f"- Active pipeline: **{len(active_pipeline)}** · Active AI: **{len(active_ai)}**",
                f"- Cache HTML files: **{cache_files}**",
                (
                    "- Expected index requests: **"
                    f"{payload['expected_requests']['category_index_requests']}**"
                ),
                (
                    "- Expected detail requests: **"
                    f"{payload['expected_requests']['detail_requests']}**"
                ),
                f"- Possible missing vs prior dry-run: **{len(possible_missing)}**",
                (
                    f"- AI selected: **{len(billable)}** · "
                    f"skipped unchanged: **{len(skipped)}**"
                ),
                f"- Estimated AI cost: **USD {ai_estimate.estimated_usd}**",
                f"- Approved ceiling: **USD {PIPELINE_AI_COST_CEILING_USD}**",
                f"- May proceed: **{payload['stop_gates']['may_proceed']}**",
                "",
                "## Stop reasons",
                "",
                *(
                    [f"- {r}" for r in stop_reasons]
                    if stop_reasons
                    else ["- (none)"]
                ),
                "",
                "## Selected for AI",
                "",
                *(
                    [
                        (
                            f"- `{item['external_id']}` "
                            f"({item['listing_id']}): {item['reason']}"
                        )
                        for item in billable
                    ]
                    if billable
                    else ["- (none — all unchanged successful checksums)"]
                ),
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": True,
                "path": str(OUT_JSON),
                "may_proceed": not stop_reasons,
                "stop_reasons": stop_reasons,
            },
            indent=2,
        )
    )
    return 2 if stop_reasons else 0


if __name__ == "__main__":
    raise SystemExit(main())
