"""Queue compatibility worker delegating execution to the Labs orchestrator."""

from __future__ import annotations

import os
import socket
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

from merkado_labs.enrichment.jobs import (
    create_enrichment_job,
    process_enrichment_job,
    should_skip_unchanged_enrichment,
)
from merkado_labs.enrichment.pricing import calculate_usage_cost_usd
from merkado_labs.normalization.ecb_rates import EcbEurRateProvider
from merkado_labs.pipeline.budgets import PROPERTY_AI_DAILY_BUDGET_USD
from merkado_labs.pipeline.readiness import (
    PIPELINE_STAGES,
    resolve_source_readiness,
)
from merkado_labs.pipeline.store import append_event, update_stage
from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    SOURCE_KEY as KW_SOURCE_KEY,
)
from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    KellerWilliamsCuracaoAdapter,
)
from merkado_labs.scrapers.contracts import SourceRunOutcome
from merkado_labs.scrapers.import_pipeline import import_snapshots, resolve_property_source
from merkado_labs.scrapers.kw_import_preview import (
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

# The orchestrator additionally enforces the monthly and listing-count budgets.
PIPELINE_AI_COST_CEILING_USD = float(PROPERTY_AI_DAILY_BUDGET_USD)
# Pause before paid AI if checksum selection unexpectedly invalidates many rows.
MAX_UNEXPECTED_AI_WITHOUT_INVESTIGATION = 10
MAX_MISSING_REMOVALS_BEFORE_STOP = 5
KW_CACHE_DIR = Path("data/raw/keller_williams_curacao/cache")


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid4().hex[:8]}"


def claim_next_queued_run(client: Any, *, worker_id: str | None = None) -> dict[str, Any] | None:
    """Atomically claim the oldest queued run (safe lock)."""

    wid = worker_id or _worker_id()
    queued = (
        client.table("property_pipeline_runs")
        .select("*")
        .eq("status", "queued")
        .order("created_at")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not queued:
        return None
    run = queued[0]
    claimed = (
        client.table("property_pipeline_runs")
        .update(
            {
                "status": "running",
                "locked_by": wid,
                "locked_at": _now(),
                "started_at": _now(),
                "progress": {
                    **(run.get("progress") or {}),
                    "message": "Worker claimed run",
                    "worker_id": wid,
                },
            }
        )
        .eq("id", run["id"])
        .eq("status", "queued")
        .execute()
        .data
        or []
    )
    if not claimed:
        return None
    append_event(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        event_type="claimed",
        message=f"Claimed by {wid}",
    )
    return claimed[0]


def _should_stop(client: Any, pipeline_run_id: str) -> bool:
    rows = (
        client.table("property_pipeline_runs")
        .select("status,stop_after_current_item")
        .eq("id", pipeline_run_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return True
    return bool(rows[0].get("stop_after_current_item")) or rows[0]["status"] == "stopping"


def _listing_rows_for_source(client: Any, source_key: str) -> list[dict[str, Any]]:
    """Load listing rows with the same columns enrichment checksums use.

    A narrower select previously omitted ``source_url`` / nested source_key and
    falsely invalidated all KW checksums (84 billable). Keep this in lockstep
    with ``process_enrichment_job`` preview selects.
    """

    source = resolve_property_source(client, source_key)
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,source_url,title,description,listing_type,"
            "property_type,source_listing_status,status,bedrooms,bathrooms,"
            "floor_area_m2,lot_area_value,lot_area_unit,"
            "source_neighbourhood_text,original_price,original_currency,"
            "latitude,longitude,amenities,enrichment_status,"
            "enrichment_last_input_checksum,"
            "enrichment_last_change_checksum,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
            "property_source_id,public_eligible,"
            "property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    for row in rows:
        ps = row.get("property_sources")
        if isinstance(ps, dict) and ps.get("source_key"):
            row["source_key"] = ps["source_key"]
        else:
            row["source_key"] = source_key
    return rows


def _billable_enrichment_ids(
    client: Any, rows: list[dict[str, Any]], *, model: str
) -> list[str]:
    """Return public-eligible listing IDs that still need paid enrichment."""

    billable: list[str] = []
    for row in rows:
        if not row.get("public_eligible"):
            continue
        preview = dict(row)
        if should_skip_unchanged_enrichment(client, row=preview, model=model):
            continue
        billable.append(str(row["id"]))
    return billable


def _classify_billable_selection(
    client: Any,
    rows: list[dict[str, Any]],
    billable_ids: list[str],
    *,
    model: str,
) -> dict[str, list[str]]:
    """Split billable IDs into new, changed, and unexpected anomaly buckets.

    - ``new_listings``: never successfully enriched with this model
    - ``content_changed``: prior Terra result exists but semantic checksum differs
    - ``unexpected``: still billable despite a matching semantic checksum on a
      prior Terra proposal (selection/hash bug). These trip the fail-safe guard.
    """

    from merkado_labs.enrichment import (
        compute_input_checksum,
        compute_legacy_input_checksum,
    )
    from merkado_labs.enrichment.jobs import listing_to_enrichment_input

    by_id = {str(row["id"]): row for row in rows}
    new_listings: list[str] = []
    content_changed: list[str] = []
    unexpected: list[str] = []
    for lid in billable_ids:
        row = by_id.get(lid)
        if row is None:
            unexpected.append(lid)
            continue
        enrichment_input = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(enrichment_input)
        legacy = compute_legacy_input_checksum(enrichment_input)
        priors = (
            client.table("ai_enrichment_proposals")
            .select("id,input_checksum,status")
            .eq("property_listing_id", lid)
            .eq("model", model)
            .in_("status", ["succeeded", "needs_review", "skipped_unchanged"])
            .execute()
            .data
            or []
        )
        if not priors:
            new_listings.append(lid)
            continue
        prior_checksums = {
            str(item.get("input_checksum") or "") for item in priors if item.get("input_checksum")
        }
        if checksum in prior_checksums or legacy in prior_checksums:
            unexpected.append(lid)
        else:
            content_changed.append(lid)
    return {
        "new_listings": new_listings,
        "content_changed": content_changed,
        "unexpected": unexpected,
        "legitimate": new_listings + content_changed,
    }


def _complete_stage_counts(
    *,
    total: int,
    succeeded: int = 0,
    failed: int = 0,
    skipped: int = 0,
    warnings: int = 0,
    http_requests: int = 0,
    cache_hits: int = 0,
) -> dict[str, Any]:
    return {
        "processed_count": succeeded + failed + skipped,
        "total_count": total,
        "succeeded_count": succeeded,
        "failed_count": failed,
        "skipped_unchanged_count": skipped,
        "warning_count": warnings,
        "http_request_count": http_requests,
        "cache_hit_count": cache_hits,
    }


def _run_preflight_stage(
    client: Any,
    *,
    run: dict[str, Any],
    source_key: str,
) -> None:
    info = resolve_source_readiness(source_key)
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="preflight",
        status="running",
    )
    if info.readiness == "blocked":
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="preflight",
            status="blocked",
            error_message=info.current_issue,
            **_complete_stage_counts(total=0),
        )
        raise PermissionError(info.current_issue or "Source blocked")
    if not info.allows_full_refresh:
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="preflight",
            status="blocked",
            error_message=info.current_issue,
            **_complete_stage_counts(total=0),
        )
        raise PermissionError(info.current_issue or "Partial source cannot full-refresh")
    rows = _listing_rows_for_source(client, source_key)
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="preflight",
        status="completed",
        metrics={
            "adapter_version": info.adapter_version,
            "existing_listing_count": len(rows),
            "catalog_status": info.catalog_status,
            "ai_cost_ceiling_usd": PIPELINE_AI_COST_CEILING_USD,
        },
        **_complete_stage_counts(total=len(rows), succeeded=len(rows)),
    )


def _run_passthrough_stage(
    client: Any,
    *,
    run: dict[str, Any],
    source_key: str,
    stage: str,
    message: str,
    total: int,
    http_requests: int = 0,
    execute_live: bool,
) -> None:
    """Mark non-KW / deferred stages. Live KW uses ``_run_kw_live_refresh``."""

    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage=stage,
        status="running",
    )
    status = "completed"
    warnings = 0
    metrics: dict[str, Any] = {
        "execute_live": execute_live,
        "note": message,
        "external_api_cost_usd": 0,
        "infrastructure_runtime": "not_estimated",
    }
    if stage in {"scraping", "import"} and not execute_live:
        metrics["deferred_to"] = (
            f"scripts/adapters/run_{source_key}.py (manual Refresh & enrich live path)"
        )
        warnings = 1
        status = "completed_with_warnings"
    elif stage in {"scraping", "import"} and execute_live and source_key != KW_SOURCE_KEY:
        metrics["note"] = (
            f"Live scrape/import for {source_key} is not wired in this worker; "
            "use the source adapter CLI under a separate approval."
        )
        warnings = 1
        status = "completed_with_warnings"
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage=stage,
        status=status,
        metrics=metrics,
        **_complete_stage_counts(
            total=total,
            succeeded=total,
            warnings=warnings,
            http_requests=http_requests,
        ),
    )


def _run_kw_live_refresh(
    client: Any,
    *,
    run: dict[str, Any],
) -> dict[str, Any]:
    """Execute proven KW v0.3.1 five-section catalog scrape + import + geospatial."""

    source_key = KW_SOURCE_KEY
    prior_rows = _listing_rows_for_source(client, source_key)
    prior_count = len(prior_rows)
    prior_ids = {str(row.get("external_id") or "") for row in prior_rows}

    # --- scraping ---
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="scraping",
        status="running",
        metrics={"adapter_version": "0.3.1", "prior_listing_count": prior_count},
    )
    adapter = KellerWilliamsCuracaoAdapter(cache_dir=KW_CACHE_DIR)
    record, snapshots, discovery = adapter.run_catalog(
        cache_dir=KW_CACHE_DIR,
        dry_run=False,
        honor_delay=True,
        use_cache=True,
        prior_catalog_count=prior_count,
    )
    request_metrics = record.metadata.get("request_metrics") or adapter.request_metrics.as_dict()
    http_requests = int(request_metrics.get("network_requests_total") or 0)
    cache_hits = int(request_metrics.get("cache_hits_total") or 0)
    outcome = (
        record.outcome.value
        if isinstance(record.outcome, SourceRunOutcome)
        else str(record.outcome)
    )
    scrape_status = (
        "completed"
        if record.metadata.get("complete_catalog")
        else "completed_with_warnings"
    )
    if outcome == SourceRunOutcome.FAILURE.value:
        scrape_status = "failed"
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="scraping",
        status=scrape_status,
        source_run_id=None,
        metrics={
            "complete_catalog": record.metadata.get("complete_catalog"),
            "catalog_checksum": discovery.catalog_checksum,
            "categories_seen": sorted(discovery.categories_seen),
            "index_pages": discovery.index_pages,
            "discovered": record.discovered_count,
            "parsed": record.parsed_count,
            "duplicate_external_ids": discovery.duplicate_external_ids,
            "duplicate_canonical_urls": discovery.duplicate_canonical_urls,
            "skipped_silent": discovery.skipped_silent,
            "skipped_off_domain": discovery.skipped_off_domain,
            "unresolved_external_ids": len(discovery.unresolved_no_external_id_urls),
            "page_loops": discovery.page_loops,
            "request_metrics": request_metrics,
            "external_api_cost_usd": 0,
            "infrastructure_runtime": "not_estimated",
            "discovery_errors": discovery.errors,
            "discovery_warnings": discovery.warnings,
        },
        **_complete_stage_counts(
            total=record.discovered_count,
            succeeded=record.parsed_count,
            failed=record.error_count,
            warnings=record.warning_count,
            http_requests=http_requests,
            cache_hits=cache_hits,
        ),
    )
    if scrape_status == "failed":
        raise RuntimeError("KW catalog scrape failed")

    # --- validation ---
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="validation",
        status="running",
    )
    complete = bool(record.metadata.get("complete_catalog"))
    suspicious = bool(record.metadata.get("suspicious_shrinkage"))
    unresolved = len(discovery.unresolved_no_external_id_urls)
    duplicates = int(discovery.duplicate_external_ids or 0) + int(
        discovery.duplicate_canonical_urls or 0
    )
    validation_ok = (
        complete
        and not suspicious
        and unresolved == 0
        and duplicates == 0
        and discovery.page_loops == 0
        and not discovery.errors
    )
    discovered_ids = {str(s.external_id) for s in snapshots}
    possible_missing = sorted(prior_ids - discovered_ids - {""})
    if len(possible_missing) > MAX_MISSING_REMOVALS_BEFORE_STOP and complete:
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="validation",
            status="failed",
            error_message=(
                f"Suspicious mass absence: {len(possible_missing)} missing "
                f"(>{MAX_MISSING_REMOVALS_BEFORE_STOP}); refusing import absence path"
            ),
            metrics={
                "possible_missing_external_ids": possible_missing,
                "complete_catalog": complete,
            },
            **_complete_stage_counts(total=len(snapshots), failed=1),
        )
        raise RuntimeError(
            f"Refusing KW import: {len(possible_missing)} possible removals "
            f"exceeds stop gate of {MAX_MISSING_REMOVALS_BEFORE_STOP}"
        )
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="validation",
        status="completed" if validation_ok else "completed_with_warnings",
        metrics={
            "complete_catalog": complete,
            "validation_ok": validation_ok,
            "suspicious_shrinkage": suspicious,
            "possible_missing_count": len(possible_missing),
            "possible_missing_external_ids": possible_missing,
            "lifecycle_absence_allowed": complete and validation_ok,
        },
        **_complete_stage_counts(
            total=len(snapshots),
            succeeded=len(snapshots) if validation_ok else 0,
            warnings=0 if validation_ok else 1,
        ),
    )

    # --- import (absence only when complete success) ---
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="import",
        status="running",
    )
    # Fail-closed: never import absence when validation is incomplete.
    if not complete:
        # Force metadata so import_snapshots cannot apply absence.
        record.metadata["complete_catalog"] = False
    imported = import_snapshots(
        client=client,
        source_key=source_key,
        run=record,
        snapshots=snapshots,
        dry_run=False,
        eur_provider=EcbEurRateProvider(),
        apply_geospatial=True,
    )
    # Link source run to pipeline correlation when column exists.
    if imported.source_run_id:
        try:
            client.table("property_source_runs").update(
                {"pipeline_correlation_id": str(run["correlation_id"])}
            ).eq("id", imported.source_run_id).execute()
        except Exception:
            pass
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="import",
        status="completed",
        source_run_id=imported.source_run_id,
        metrics={
            "imported_count": imported.imported_count,
            "updated_count": imported.updated_count,
            "observation_count": imported.observation_count,
            "event_count": imported.event_count,
            "notes": list(imported.notes),
            "complete_catalog": complete,
            "external_api_cost_usd": 0,
        },
        **_complete_stage_counts(
            total=len(snapshots),
            succeeded=imported.imported_count + imported.updated_count,
            http_requests=http_requests,
            cache_hits=cache_hits,
        ),
    )

    # --- location (geospatial applied inside import) ---
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="location",
        status="running",
    )
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="location",
        status="completed",
        metrics={
            "note": "Geospatial assignment applied during import_snapshots",
            "apply_geospatial": True,
        },
        **_complete_stage_counts(total=len(snapshots), succeeded=len(snapshots)),
    )

    return {
        "source_run_id": imported.source_run_id,
        "discovered": record.discovered_count,
        "parsed": record.parsed_count,
        "imported_count": imported.imported_count,
        "updated_count": imported.updated_count,
        "complete_catalog": complete,
        "catalog_checksum": discovery.catalog_checksum,
        "request_metrics": request_metrics,
        "possible_missing": possible_missing,
        "http_requests": http_requests,
        "cache_hits": cache_hits,
    }


def _run_ai_stage(
    client: Any,
    *,
    run: dict[str, Any],
    source_key: str,
    execute_live: bool,
    model: str = "gpt-5.6-terra",
) -> dict[str, Any]:
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="ai_enrichment",
        status="running",
    )
    source = resolve_property_source(client, source_key)
    rows = _listing_rows_for_source(client, source_key)
    for row in rows:
        row["source_key"] = source_key
    billable = _billable_enrichment_ids(client, rows, model=model)
    skipped = len(rows) - len(billable)

    # Seed / update item rows for ops UI (not hundreds of progress bars by default).
    item_rows = []
    for row in rows:
        lid = str(row["id"])
        if lid in billable:
            status = "waiting"
            ai_result = "pending"
        else:
            status = "skipped_unchanged"
            ai_result = "skipped_unchanged"
        item_rows.append(
            {
                "pipeline_run_id": str(run["id"]),
                "correlation_id": str(run["correlation_id"]),
                "source_key": source_key,
                "property_listing_id": lid,
                "external_id": row.get("external_id"),
                "title": row.get("title"),
                "current_stage": "ai_enrichment",
                "status": status,
                "ai_result": ai_result,
            }
        )
    if item_rows:
        client.table("property_pipeline_items").delete().eq(
            "pipeline_run_id", run["id"]
        ).eq("source_key", source_key).execute()
        for i in range(0, len(item_rows), 100):
            client.table("property_pipeline_items").insert(item_rows[i : i + 100]).execute()

    if not billable:
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="ai_enrichment",
            status="completed",
            token_usage={},
            estimated_ai_cost_usd=0,
            metrics={"status": "up_to_date", "billable": 0},
            **_complete_stage_counts(total=len(rows), skipped=skipped, succeeded=0),
        )
        return {
            "status": "up_to_date",
            "billable": 0,
            "skipped": skipped,
            "exact_cost_usd": 0,
            "token_usage": {},
            "job_id": None,
            "selected_listing_ids": [],
        }

    classification = _classify_billable_selection(
        client, rows, billable, model=model
    )
    unexpected = classification["unexpected"]
    if len(unexpected) > MAX_UNEXPECTED_AI_WITHOUT_INVESTIGATION:
        msg = (
            f"Unexpected checksum invalidation: {len(unexpected)} listings selected "
            f"for AI with matching prior semantic checksums "
            f"(>{MAX_UNEXPECTED_AI_WITHOUT_INVESTIGATION}). "
            "Refusing paid execution — investigate shared input/schema change."
        )
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="ai_enrichment",
            status="failed",
            error_message=msg,
            metrics={
                "selected_listing_ids": billable,
                "unexpected_listing_ids": unexpected,
                "new_listings": classification["new_listings"],
                "content_changed": classification["content_changed"],
                "skipped_unchanged": skipped,
                "ceiling_usd": PIPELINE_AI_COST_CEILING_USD,
            },
            **_complete_stage_counts(
                total=len(rows), failed=len(unexpected), skipped=skipped
            ),
        )
        raise RuntimeError(msg)
    # Legitimate new/changed backlog proceeds under listing/cost budgets; excess
    # is classified budget_deferred by the orchestrator, not as a checksum failure.
    # Drop residual unexpected rows (≤ threshold) from paid execution.
    billable = list(classification["legitimate"])
    if not billable:
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="ai_enrichment",
            status="completed",
            token_usage={},
            estimated_ai_cost_usd=0,
            metrics={
                "status": "up_to_date",
                "billable": 0,
                "unexpected_excluded": unexpected,
            },
            **_complete_stage_counts(total=len(rows), skipped=skipped, succeeded=0),
        )
        return {
            "status": "up_to_date",
            "billable": 0,
            "skipped": skipped,
            "exact_cost_usd": 0,
            "token_usage": {},
            "job_id": None,
            "selected_listing_ids": [],
            "unexpected_excluded": unexpected,
        }

    if not execute_live:
        update_stage(
            client,
            pipeline_run_id=str(run["id"]),
            correlation_id=str(run["correlation_id"]),
            source_key=source_key,
            stage="ai_enrichment",
            status="completed_with_warnings",
            metrics={
                "deferred_billable_listing_count": len(billable),
                "selected_listing_ids": billable,
                "note": "AI stage deferred (execute_live=false)",
            },
            estimated_ai_cost_usd=0,
            **_complete_stage_counts(
                total=len(rows), skipped=skipped, warnings=1
            ),
        )
        return {
            "billable": len(billable),
            "skipped": skipped,
            "exact_cost_usd": 0,
            "token_usage": {},
            "job_id": None,
            "deferred": True,
            "selected_listing_ids": billable,
        }

    job_id = create_enrichment_job(
        client,
        scope_type="new_or_changed",
        scope_filter={
            "source_key": source_key,
            "listing_ids": billable,
            "pipeline_correlation_id": str(run["correlation_id"]),
        },
        listing_ids=billable,
        property_source_id=str(source["id"]),
        requested_by=f"pipeline:{run['id']}",
        model=model,
    )
    try:
        client.table("ai_enrichment_jobs").update(
            {"pipeline_correlation_id": str(run["correlation_id"])}
        ).eq("id", job_id).execute()
    except Exception:
        pass

    result = process_enrichment_job(
        job_id,
        listing_ids=billable,
        client=client,
        resume=True,
        max_estimated_cost_usd=PIPELINE_AI_COST_CEILING_USD,
    )
    token_usage = result.get("token_usage") or {}
    cost, _note = calculate_usage_cost_usd(
        model=model,
        input_tokens=int(token_usage.get("input_tokens") or 0),
        cached_input_tokens=int(token_usage.get("cached_input_tokens") or 0),
        output_tokens=int(token_usage.get("output_tokens") or 0),
    )
    failed = int(result.get("failed") or 0)
    succeeded = int(result.get("succeeded") or 0)
    update_stage(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        source_key=source_key,
        stage="ai_enrichment",
        status="completed_with_warnings" if failed else "completed",
        enrichment_job_id=job_id,
        token_usage=token_usage,
        estimated_ai_cost_usd=float(cost) if cost is not None else None,
        metrics={
            "selected_listing_ids": billable,
            "ceiling_usd": PIPELINE_AI_COST_CEILING_USD,
            "stopped_early": result.get("stopped_early"),
        },
        **_complete_stage_counts(
            total=len(rows),
            succeeded=succeeded,
            failed=failed,
            skipped=skipped + int(result.get("skipped") or 0),
        ),
    )
    return {
        "billable": len(billable),
        "skipped": skipped,
        "exact_cost_usd": float(cost) if isinstance(cost, Decimal) else cost,
        "token_usage": token_usage,
        "job_id": job_id,
        "result": result,
        "selected_listing_ids": billable,
    }


def process_pipeline_run(
    client: Any,
    *,
    run: dict[str, Any],
    execute_live: bool = False,
) -> dict[str, Any]:
    """Execute one claimed run through the source-neutral orchestrator.

    execute_live defaults to False so claim/process never surprise-launches a
    full catalog crawl or paid AI batch. Pass True only for intentional ops.
    The workflow-dispatch CLI opts into live execution explicitly.
    """

    from merkado_labs.pipeline.orchestrator import run_property_pipeline

    return run_property_pipeline(
        client,
        trigger_type=str(run.get("trigger_type") or "manual"),
        source_keys=list(run.get("source_keys") or []),
        pipeline_run_id=str(run["id"]),
        dry_run=bool(run.get("trigger_type") == "dry_run"),
        requested_by=str(run.get("requested_by") or "compatibility_worker"),
        execute_live=execute_live,
    )

    # Legacy implementation retained below temporarily for helper compatibility;
    # orchestration now returns above and all source live paths use adapters.py.
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise PermissionError("Labs project only")

    source_keys = list(run.get("source_keys") or [])
    errors: list[dict[str, Any]] = []
    ai_totals = {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "exact_cost_usd": 0.0,
        "skipped_unchanged": 0,
        "billable": 0,
    }
    refresh_totals = {
        "http_requests": 0,
        "cache_hits": 0,
        "imported": 0,
        "updated": 0,
        "discovered": 0,
    }

    for source_key in source_keys:
        if _should_stop(client, str(run["id"])):
            append_event(
                client,
                pipeline_run_id=str(run["id"]),
                correlation_id=str(run["correlation_id"]),
                event_type="stopped",
                message="Stopped after current item / stop requested",
                source_key=source_key,
            )
            break
        try:
            rows = _listing_rows_for_source(client, source_key)
            total = len(rows)
            _run_preflight_stage(client, run=run, source_key=source_key)

            if execute_live and source_key == KW_SOURCE_KEY:
                kw = _run_kw_live_refresh(client, run=run)
                refresh_totals["http_requests"] += int(kw.get("http_requests") or 0)
                refresh_totals["cache_hits"] += int(kw.get("cache_hits") or 0)
                refresh_totals["imported"] += int(kw.get("imported_count") or 0)
                refresh_totals["updated"] += int(kw.get("updated_count") or 0)
                refresh_totals["discovered"] += int(kw.get("discovered") or 0)
            else:
                for stage, message in (
                    ("scraping", "Catalog scrape stage (manual adapter path)"),
                    ("validation", "Parse/validate catalog completeness contract"),
                    ("import", "Import source facts when contract permits"),
                    ("location", "Assign map / neighbourhood data"),
                ):
                    if _should_stop(client, str(run["id"])):
                        break
                    _run_passthrough_stage(
                        client,
                        run=run,
                        source_key=source_key,
                        stage=stage,
                        message=message,
                        total=total,
                        execute_live=execute_live,
                    )

            ai = _run_ai_stage(
                client,
                run=run,
                source_key=source_key,
                execute_live=execute_live,
            )
            ai_totals["skipped_unchanged"] += int(ai.get("skipped") or 0)
            ai_totals["billable"] += int(ai.get("billable") or 0)
            usage = ai.get("token_usage") or {}
            for key in (
                "input_tokens",
                "cached_input_tokens",
                "output_tokens",
                "reasoning_tokens",
            ):
                ai_totals[key] += int(usage.get(key) or 0)
            ai_totals["exact_cost_usd"] += float(ai.get("exact_cost_usd") or 0)
            update_stage(
                client,
                pipeline_run_id=str(run["id"]),
                correlation_id=str(run["correlation_id"]),
                source_key=source_key,
                stage="verification",
                status="completed",
                metrics={"ai": ai, "listing_count": total, "refresh": refresh_totals},
                **_complete_stage_counts(total=total, succeeded=total),
            )
        except Exception as exc:  # noqa: BLE001 — persist and continue next source
            errors.append({"source_key": source_key, "error": str(exc)})
            append_event(
                client,
                pipeline_run_id=str(run["id"]),
                correlation_id=str(run["correlation_id"]),
                source_key=source_key,
                event_type="error",
                message=str(exc),
            )
            for stage in PIPELINE_STAGES:
                # leave already-completed stages alone; mark waiting as failed
                pass

    final_status = "completed"
    if errors:
        final_status = "completed_with_errors" if source_keys else "failed"
        if len(errors) == len(source_keys):
            final_status = "failed"

    cost_summary = {
        "source_refresh": {
            "http_requests": refresh_totals["http_requests"],
            "cache_hits": refresh_totals["cache_hits"],
            "external_api_cost_usd": 0,
            "infrastructure_runtime": "not_estimated",
            "label_external": "External API cost: USD 0",
            "label_infra": "Infrastructure runtime not estimated",
            "imported": refresh_totals["imported"],
            "updated": refresh_totals["updated"],
            "discovered": refresh_totals["discovered"],
        },
        "ai_enrichment": {
            "model": "gpt-5.6-terra",
            "input_tokens": ai_totals["input_tokens"],
            "cached_input_tokens": ai_totals["cached_input_tokens"],
            "output_tokens": ai_totals["output_tokens"],
            "reasoning_tokens": ai_totals["reasoning_tokens"],
            "gross_estimated_cost_usd": ai_totals["exact_cost_usd"],
            "skipped_unchanged": ai_totals["skipped_unchanged"],
            "billable_listings": ai_totals["billable"],
            "ceiling_usd": PIPELINE_AI_COST_CEILING_USD,
            "disclaimer": (
                "Estimated from recorded token usage and configured model pricing."
            ),
        },
    }
    updated = (
        client.table("property_pipeline_runs")
        .update(
            {
                "status": final_status,
                "completed_at": _now(),
                "locked_by": None,
                "error_summary": errors,
                "cost_summary": cost_summary,
                "progress": {
                    "message": "Completed" if not errors else "Completed with errors",
                    "updated_at": _now(),
                },
            }
        )
        .eq("id", run["id"])
        .execute()
        .data
        or []
    )
    append_event(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=str(run["correlation_id"]),
        event_type="finished",
        message=final_status,
        details={"errors": errors, "cost_summary": cost_summary},
    )
    return updated[0] if updated else {**run, "status": final_status}


def run_once(client: Any, *, execute_live: bool = False) -> dict[str, Any] | None:
    run = claim_next_queued_run(client)
    if not run:
        return None
    return process_pipeline_run(client, run=run, execute_live=execute_live)
