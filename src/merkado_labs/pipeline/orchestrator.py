"""Labs property pipeline orchestration across all automation-ready sources."""

from __future__ import annotations

import os
import socket
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from merkado_labs.normalization.ecb_rates import EcbEurRateProvider
from merkado_labs.pipeline.adapters import scrape_source
from merkado_labs.pipeline.anomaly import evaluate_catalog_anomaly
from merkado_labs.pipeline.budgets import (
    decide_ai_budget,
    load_budget_usage,
    record_ai_spend,
)
from merkado_labs.pipeline.change_hash import compute_enrichment_input_hash
from merkado_labs.pipeline.locks import (
    acquire_source_lock,
    assert_no_overlapping_active_run,
    release_source_lock,
)
from merkado_labs.pipeline.readiness import LABS_PROJECT_REF
from merkado_labs.pipeline.sources import CACHE_DIRS, ordered_ready_keys
from merkado_labs.pipeline.store import (
    append_event,
    enqueue_pipeline_run,
    update_stage,
)
from merkado_labs.scrapers.import_pipeline import import_snapshots

TRIGGER_TYPES = frozenset({"scheduled", "manual", "local", "dry_run"})


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _load_run(client: Any, pipeline_run_id: str) -> dict[str, Any]:
    rows = (
        client.table("property_pipeline_runs")
        .select("*")
        .eq("id", pipeline_run_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise LookupError(f"Pipeline run {pipeline_run_id} not found")
    return rows[0]


def _claim_run(client: Any, run: dict[str, Any], requested_by: str) -> dict[str, Any]:
    if run.get("status") == "running":
        return run
    if run.get("status") != "queued":
        raise RuntimeError(f"Pipeline run is not queued: {run.get('status')}")
    owner = f"{socket.gethostname()}:{requested_by}"
    payload = {
        "status": "running",
        "locked_by": owner,
        "locked_at": _now(),
        "started_at": run.get("started_at") or _now(),
    }
    if os.getenv("GITHUB_RUN_ID"):
        payload.update(
            {
                "github_run_id": os.environ["GITHUB_RUN_ID"],
                "github_workflow_ref": os.getenv("GITHUB_WORKFLOW_REF"),
                "dispatch_status": "running",
            }
        )
    rows = (
        client.table("property_pipeline_runs")
        .update(payload)
        .eq("id", run["id"])
        .eq("status", "queued")
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError("Pipeline run was claimed by another worker")
    return rows[0]


def _stage_counts(total: int, *, succeeded: int = 0, failed: int = 0, warnings: int = 0):
    return {
        "processed_count": succeeded + failed,
        "total_count": total,
        "succeeded_count": succeeded,
        "failed_count": failed,
        "warning_count": warnings,
    }


def _mark_remaining_failed(
    client: Any,
    *,
    run: dict[str, Any],
    source_key: str,
    error: str,
) -> None:
    rows = (
        client.table("property_pipeline_source_stages")
        .select("stage,status")
        .eq("pipeline_run_id", run["id"])
        .eq("source_key", source_key)
        .execute()
        .data
        or []
    )
    for row in rows:
        if row.get("status") == "waiting":
            update_stage(
                client,
                pipeline_run_id=str(run["id"]),
                correlation_id=str(run["correlation_id"]),
                source_key=source_key,
                stage=str(row["stage"]),
                status="failed",
                error_message=error,
            )


def _persist_change_hashes(client: Any, rows: list[dict[str, Any]]) -> None:
    """Record semantic selection hashes independently from gallery tracking."""

    for row in rows:
        checksum = compute_enrichment_input_hash(row)
        if row.get("enrichment_last_change_checksum") == checksum:
            continue
        client.table("property_listings").update(
            {"enrichment_last_change_checksum": checksum}
        ).eq("id", row["id"]).execute()
        row["enrichment_last_change_checksum"] = checksum


def run_property_pipeline(
    client: Any,
    trigger_type: str,
    source_keys: list[str] | None = None,
    pipeline_run_id: str | None = None,
    dry_run: bool | None = None,
    requested_by: str = "property_pipeline",
    execute_live: bool = True,
) -> dict[str, Any]:
    """Run ready sources sequentially with source isolation and fail-closed lifecycle."""

    # Resolve through worker for backward-compatible test/ops monkeypatching.
    from merkado_labs.pipeline import worker as worker_module

    ref = worker_module.assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise PermissionError("Labs project only")
    trigger = str(trigger_type).strip()
    if trigger not in TRIGGER_TYPES:
        raise ValueError(f"Unsupported trigger_type: {trigger_type!r}")
    is_dry_run = trigger == "dry_run" if dry_run is None else bool(dry_run)

    if pipeline_run_id:
        run = _load_run(client, pipeline_run_id)
        keys = ordered_ready_keys(source_keys or run.get("source_keys") or None)
        if source_keys and set(keys) != set(run.get("source_keys") or []):
            raise ValueError("source_keys do not match the queued pipeline run")
        if run.get("trigger_type") and run.get("trigger_type") != trigger:
            raise ValueError("trigger_type does not match the queued pipeline run")
    else:
        keys = ordered_ready_keys(source_keys)
        run = enqueue_pipeline_run(
            client,
            source_keys=keys,
            trigger_mode="run_all_ready" if len(keys) > 1 else "single_source",
            trigger_type=trigger,
            requested_by=requested_by,
            project_ref=ref,
        )

    assert_no_overlapping_active_run(
        client, keys, exclude_pipeline_run_id=str(run["id"])
    )
    run = _claim_run(client, run, requested_by)
    summary: dict[str, Any] = {
        "trigger_type": trigger,
        "dry_run": is_dry_run,
        "execute_live": bool(execute_live),
        "source_order": keys,
        "sources": {},
    }
    errors: list[dict[str, str]] = []

    for source_key in keys:
        source_summary: dict[str, Any] = {"status": "running"}
        summary["sources"][source_key] = source_summary
        locked = acquire_source_lock(
            client,
            source_key=source_key,
            pipeline_run_id=str(run["id"]),
            locked_by=requested_by,
        )
        if not locked:
            error = "Source is locked by another active pipeline run"
            errors.append({"source_key": source_key, "error": error})
            source_summary.update(status="failed", error=error)
            _mark_remaining_failed(
                client, run=run, source_key=source_key, error=error
            )
            continue

        try:
            # Import lazily to preserve worker compatibility monkeypatches.
            worker = worker_module

            worker._run_preflight_stage(client, run=run, source_key=source_key)
            prior_rows = worker._listing_rows_for_source(client, source_key)
            prior_count = len(prior_rows)

            if not execute_live:
                for stage, message in (
                    ("scraping", "Catalog scrape deferred (execute_live=false)"),
                    ("validation", "Catalog validation deferred"),
                    ("import", "Import deferred"),
                    ("location", "Location assignment deferred"),
                ):
                    worker._run_passthrough_stage(
                        client,
                        run=run,
                        source_key=source_key,
                        stage=stage,
                        message=message,
                        total=prior_count,
                        execute_live=False,
                    )
                ai = worker._run_ai_stage(
                    client,
                    run=run,
                    source_key=source_key,
                    execute_live=False,
                )
                source_summary.update(status="completed", ai=ai, deferred=True)
            else:
                update_stage(
                    client,
                    pipeline_run_id=str(run["id"]),
                    correlation_id=str(run["correlation_id"]),
                    source_key=source_key,
                    stage="scraping",
                    status="running",
                    metrics={"prior_listing_count": prior_count},
                )
                record, snapshots, adapter_meta = scrape_source(
                    source_key,
                    CACHE_DIRS[source_key],
                    is_dry_run,
                    prior_count,
                )
                request_metrics = adapter_meta.get("request_metrics") or {}
                complete = bool(record.metadata.get("complete_catalog"))
                scrape_status = (
                    "completed"
                    if complete
                    else "completed_with_warnings"
                )
                update_stage(
                    client,
                    pipeline_run_id=str(run["id"]),
                    correlation_id=str(run["correlation_id"]),
                    source_key=source_key,
                    stage="scraping",
                    status=scrape_status,
                    metrics={
                        "complete_catalog": complete,
                        "outcome": record.outcome.value,
                        "adapter": adapter_meta,
                    },
                    **_stage_counts(
                        record.discovered_count,
                        succeeded=record.parsed_count,
                        failed=record.error_count,
                        warnings=record.warning_count,
                    ),
                    http_request_count=int(
                        request_metrics.get("network_requests_total") or 0
                    ),
                    cache_hit_count=int(request_metrics.get("cache_hits_total") or 0),
                )

                update_stage(
                    client,
                    pipeline_run_id=str(run["id"]),
                    correlation_id=str(run["correlation_id"]),
                    source_key=source_key,
                    stage="validation",
                    status="running",
                )
                anomaly = evaluate_catalog_anomaly(
                    source_key, prior_count, record.discovered_count
                )
                if anomaly.anomalous:
                    record = replace(
                        record,
                        metadata={
                            **record.metadata,
                            "complete_catalog": False,
                            "catalog_anomaly": anomaly.reason,
                        },
                    )
                    complete = False
                validation_status = (
                    "completed"
                    if complete and not anomaly.anomalous
                    else "completed_with_warnings"
                )
                update_stage(
                    client,
                    pipeline_run_id=str(run["id"]),
                    correlation_id=str(run["correlation_id"]),
                    source_key=source_key,
                    stage="validation",
                    status=validation_status,
                    metrics={
                        "complete_catalog": complete,
                        "anomalous": anomaly.anomalous,
                        "anomaly_reason": anomaly.reason,
                        "lifecycle_absence_allowed": complete,
                    },
                    **_stage_counts(
                        len(snapshots),
                        succeeded=len(snapshots),
                        warnings=1 if anomaly.anomalous else 0,
                    ),
                )

                update_stage(
                    client,
                    pipeline_run_id=str(run["id"]),
                    correlation_id=str(run["correlation_id"]),
                    source_key=source_key,
                    stage="import",
                    status="running",
                )
                imported = import_snapshots(
                    client=client,
                    source_key=source_key,
                    run=record,
                    snapshots=snapshots,
                    dry_run=is_dry_run,
                    eur_provider=EcbEurRateProvider(),
                    apply_geospatial=True,
                )
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
                        "dry_run": imported.dry_run,
                        "complete_catalog": complete,
                    },
                    **_stage_counts(
                        len(snapshots),
                        succeeded=imported.imported_count + imported.updated_count,
                    ),
                )
                update_stage(
                    client,
                    pipeline_run_id=str(run["id"]),
                    correlation_id=str(run["correlation_id"]),
                    source_key=source_key,
                    stage="location",
                    status="completed",
                    metrics={"applied_during_import": not is_dry_run},
                    **_stage_counts(
                        len(snapshots),
                        succeeded=0 if is_dry_run else len(snapshots),
                    ),
                )

                rows = worker._listing_rows_for_source(client, source_key)
                _persist_change_hashes(client, rows)
                billable = worker._billable_enrichment_ids(
                    client, rows, model="gpt-5.6-terra"
                )
                usage = load_budget_usage(client)
                decision = decide_ai_budget(
                    usage=usage,
                    requested_listings=len(billable),
                    estimated_cost_usd=Decimal("0.05") * len(billable),
                )
                if not decision.allowed or decision.approved_listings <= 0:
                    update_stage(
                        client,
                        pipeline_run_id=str(run["id"]),
                        correlation_id=str(run["correlation_id"]),
                        source_key=source_key,
                        stage="ai_enrichment",
                        status="completed_with_warnings",
                        metrics={
                            "status": "budget_deferred",
                            "reason": decision.reason,
                            "billable": len(billable),
                            "approved_listings": decision.approved_listings,
                        },
                        **_stage_counts(len(rows), warnings=1),
                    )
                    ai = {
                        "status": "budget_deferred",
                        "billable": len(billable),
                        "reason": decision.reason,
                    }
                else:
                    # Hard-cap the live enrichment set to the approved budget prefix.
                    if decision.approved_listings < len(billable):
                        billable = billable[: decision.approved_listings]
                    ai = worker._run_ai_stage(
                        client,
                        run=run,
                        source_key=source_key,
                        execute_live=not is_dry_run,
                    )
                    if decision.reason and str(decision.reason).startswith(
                        "partial_budget:"
                    ):
                        ai = {
                            **ai,
                            "status": "partial_budget",
                            "budget_reason": decision.reason,
                            "budget_deferred_remainder": True,
                        }
                    if not is_dry_run and ai.get("exact_cost_usd"):
                        record_ai_spend(
                            client,
                            pipeline_run_id=str(run["id"]),
                            listings_count=int(ai.get("billable") or 0),
                            cost_usd=ai["exact_cost_usd"],
                        )
                source_summary.update(
                    status="completed",
                    prior_count=prior_count,
                    discovered_count=record.discovered_count,
                    parsed_count=record.parsed_count,
                    complete_catalog=complete,
                    anomaly={
                        "anomalous": anomaly.anomalous,
                        "reason": anomaly.reason,
                    },
                    import_result={
                        "imported": imported.imported_count,
                        "updated": imported.updated_count,
                        "dry_run": imported.dry_run,
                    },
                    ai=ai,
                )

            update_stage(
                client,
                pipeline_run_id=str(run["id"]),
                correlation_id=str(run["correlation_id"]),
                source_key=source_key,
                stage="verification",
                status="completed",
                metrics={"source_summary": source_summary},
            )
        except Exception as exc:  # noqa: BLE001 - isolate source failures
            error = str(exc)
            errors.append({"source_key": source_key, "error": error})
            source_summary.update(status="failed", error=error)
            append_event(
                client,
                pipeline_run_id=str(run["id"]),
                correlation_id=str(run["correlation_id"]),
                source_key=source_key,
                event_type="error",
                message=error,
            )
            _mark_remaining_failed(
                client, run=run, source_key=source_key, error=error
            )
        finally:
            release_source_lock(
                client,
                source_key=source_key,
                pipeline_run_id=str(run["id"]),
            )

    final_status = "completed"
    if errors:
        final_status = (
            "failed"
            if len(errors) == len(keys)
            else "completed_with_errors"
        )
    summary["errors"] = errors
    summary["completed_at"] = _now()
    updated = (
        client.table("property_pipeline_runs")
        .update(
            {
                "status": final_status,
                "completed_at": _now(),
                "locked_by": None,
                "error_summary": errors,
                "run_summary": summary,
                "dispatch_status": (
                    "completed"
                    if run.get("dispatch_status") in {"dispatched", "running"}
                    or os.getenv("GITHUB_RUN_ID")
                    else run.get("dispatch_status")
                ),
                "progress": {
                    "message": (
                        "Completed" if not errors else "Completed with errors"
                    ),
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
        details={"errors": errors, "run_summary": summary},
    )
    return updated[0] if updated else {**run, "status": final_status, "run_summary": summary}
