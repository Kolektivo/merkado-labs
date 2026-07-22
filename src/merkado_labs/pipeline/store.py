"""Persistence helpers for Labs property pipeline runs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from merkado_labs.pipeline.budgets import PROPERTY_AI_DAILY_BUDGET_USD
from merkado_labs.pipeline.locks import assert_no_overlapping_active_run
from merkado_labs.pipeline.readiness import (
    PIPELINE_STAGES,
    assert_can_enqueue_full_refresh,
    assert_labs_project_ref,
    filter_run_all_ready,
    resolve_source_readiness,
)
from merkado_labs.pipeline.schedule import AUTOMATIC_REFRESH_ENABLED, schedule_metadata
from merkado_labs.pipeline.sources import ordered_ready_keys
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref as assert_ref


def _now() -> str:
    return datetime.now(UTC).isoformat()


def claim_started_at_for_run(run: dict[str, Any], *, now: str | None = None) -> str:
    """Pick started_at that satisfies CHECK (started_at >= created_at).

    Local worker clocks can lag the database ``created_at`` default by a few
    hundred milliseconds; clamping prevents claim updates from failing.
    """

    if run.get("started_at"):
        return str(run["started_at"])
    stamp = now or _now()
    created = run.get("created_at")
    if not created:
        return stamp
    try:
        created_dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        now_dt = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return stamp
    if created_dt.tzinfo is None:
        created_dt = created_dt.replace(tzinfo=UTC)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=UTC)
    return str(created) if now_dt < created_dt else stamp


def append_event(
    client: Any,
    *,
    pipeline_run_id: str,
    correlation_id: str,
    message: str,
    event_type: str = "progress",
    source_key: str | None = None,
    stage: str | None = None,
    property_listing_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    client.table("property_pipeline_events").insert(
        {
            "pipeline_run_id": pipeline_run_id,
            "correlation_id": correlation_id,
            "source_key": source_key,
            "stage": stage,
            "property_listing_id": property_listing_id,
            "event_type": event_type,
            "message": message,
            "details": details or {},
        }
    ).execute()


def _seed_stages(
    client: Any,
    *,
    pipeline_run_id: str,
    correlation_id: str,
    source_keys: list[str],
) -> None:
    rows = []
    for source_key in source_keys:
        for stage in PIPELINE_STAGES:
            rows.append(
                {
                    "pipeline_run_id": pipeline_run_id,
                    "correlation_id": correlation_id,
                    "source_key": source_key,
                    "stage": stage,
                    "status": "waiting",
                }
            )
    if rows:
        client.table("property_pipeline_source_stages").insert(rows).execute()


def build_preflight(
    *,
    source_keys: list[str],
    trigger_mode: str,
    project_ref: str,
    expected_ai_listing_count: int = 0,
    trigger_type: str = "manual",
) -> dict[str, Any]:
    assert_labs_project_ref(project_ref)
    sources = []
    for key in source_keys:
        info = resolve_source_readiness(key)
        sources.append(
            {
                "source_key": info.source_key,
                "display_name": info.display_name,
                "readiness": info.readiness,
                "adapter_version": info.adapter_version,
                "import_will_occur": info.allows_full_refresh,
                "lifecycle_absence_allowed": info.allows_lifecycle_absence,
                "catalog_status": info.catalog_status,
                "current_issue": info.current_issue,
            }
        )
    # Billable listing selection happens in the worker via checksum skip.
    approved_ceiling_usd = float(PROPERTY_AI_DAILY_BUDGET_USD)
    return {
        "generated_at": _now(),
        "project_ref": project_ref,
        "trigger_mode": trigger_mode,
        "trigger_type": trigger_type,
        "sources_included": sources,
        # Shared scope for dashboard Run now and future scheduled runs.
        "expected_request_scope": "manual_refresh_and_enrich",
        "import_will_occur": any(s["import_will_occur"] for s in sources),
        "expected_ai_listing_count": int(expected_ai_listing_count),
        "estimated_ai_ceiling_usd": approved_ceiling_usd,
        "lifecycle_risk_summary": (
            "Missing/removed transitions only when a source completes a full "
            "successful catalog. Partial or failed catalogs never mark absence."
        ),
        "cost_disclaimer": (
            "Estimated from recorded token usage and configured model pricing."
        ),
        "schedule": "on" if AUTOMATIC_REFRESH_ENABLED else "off",
        "schedule_metadata": schedule_metadata(enabled=AUTOMATIC_REFRESH_ENABLED),
    }


def enqueue_pipeline_run(
    client: Any,
    *,
    source_keys: list[str],
    trigger_mode: str = "single_source",
    trigger_type: str = "manual",
    requested_by: str = "labs_admin",
    expected_ai_listing_count: int = 0,
    project_ref: str | None = None,
) -> dict[str, Any]:
    """Enqueue a Labs run. Never executes scrape/AI inside this call."""

    ref = assert_ref() if project_ref is None else assert_labs_project_ref(project_ref)
    if trigger_type not in {"scheduled", "manual", "local", "dry_run"}:
        raise ValueError(f"Unsupported trigger_type: {trigger_type!r}")
    if trigger_mode == "run_all_ready":
        keys = ordered_ready_keys(filter_run_all_ready(source_keys or None))
        if not keys:
            raise PermissionError("No ready sources available for Run all ready sources")
    else:
        requested_keys = [str(k).strip() for k in source_keys if str(k).strip()]
        if not requested_keys:
            raise ValueError("At least one source_key is required")
        for key in requested_keys:
            assert_can_enqueue_full_refresh(key)
        keys = ordered_ready_keys(requested_keys)

    assert_no_overlapping_active_run(client, keys)

    preflight = build_preflight(
        source_keys=keys,
        trigger_mode=trigger_mode,
        project_ref=ref,
        expected_ai_listing_count=expected_ai_listing_count,
        trigger_type=trigger_type,
    )
    correlation_id = str(uuid4())
    inserted = (
        client.table("property_pipeline_runs")
        .insert(
            {
                "correlation_id": correlation_id,
                "trigger_mode": trigger_mode,
                "trigger_type": trigger_type,
                "status": "queued",
                "requested_by": requested_by,
                # Snapshot must match preflight schedule_metadata.enabled.
                "automatic_refresh_enabled": AUTOMATIC_REFRESH_ENABLED,
                "source_keys": keys,
                "preflight": preflight,
                "progress": {
                    "message": "Queued — waiting for worker",
                    "sources": {
                        key: {"stage": None, "status": "queued"} for key in keys
                    },
                },
                "cost_summary": {
                    "source_refresh": {
                        "http_requests": 0,
                        "external_api_cost_usd": 0,
                        "infrastructure_runtime": "not_estimated",
                    },
                    "ai_enrichment": {
                        "model": "gpt-5.6-terra",
                        "estimated_ceiling_usd": preflight["estimated_ai_ceiling_usd"],
                        "disclaimer": preflight["cost_disclaimer"],
                    },
                },
            }
        )
        .execute()
        .data
        or []
    )
    if not inserted:
        raise RuntimeError("Failed to enqueue pipeline run")
    run = inserted[0]
    _seed_stages(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=correlation_id,
        source_keys=keys,
    )
    append_event(
        client,
        pipeline_run_id=str(run["id"]),
        correlation_id=correlation_id,
        event_type="queued",
        message="Queued — waiting for worker",
        details={
            "source_keys": keys,
            "trigger_mode": trigger_mode,
            "trigger_type": trigger_type,
        },
    )
    return run


def cancel_queued_run(client: Any, *, pipeline_run_id: str) -> dict[str, Any]:
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
    run = rows[0]
    if run["status"] != "queued":
        raise RuntimeError("Only queued runs can be cancelled")
    now = _now()
    updated = (
        client.table("property_pipeline_runs")
        .update(
            {
                "status": "cancelled",
                # Check constraint requires started_at when completed_at is set.
                "started_at": run.get("started_at") or run.get("created_at") or now,
                "completed_at": now,
                "progress": {
                    **(run.get("progress") or {}),
                    "message": "Cancelled while queued",
                },
            }
        )
        .eq("id", pipeline_run_id)
        .eq("status", "queued")
        .execute()
        .data
        or []
    )
    if not updated:
        raise RuntimeError("Cancel failed — run may have started")
    append_event(
        client,
        pipeline_run_id=pipeline_run_id,
        correlation_id=str(run["correlation_id"]),
        event_type="cancelled",
        message="Cancelled while queued",
    )
    return updated[0]


def request_stop_after_current_item(
    client: Any, *, pipeline_run_id: str
) -> dict[str, Any]:
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
    run = rows[0]
    if run["status"] not in {"running", "stopping"}:
        raise RuntimeError("Stop-after-current only applies to running jobs")
    updated = (
        client.table("property_pipeline_runs")
        .update({"status": "stopping", "stop_after_current_item": True})
        .eq("id", pipeline_run_id)
        .execute()
        .data
        or []
    )
    append_event(
        client,
        pipeline_run_id=pipeline_run_id,
        correlation_id=str(run["correlation_id"]),
        event_type="stop_requested",
        message="Stop after current item requested",
    )
    return (updated or rows)[0]


def update_stage(
    client: Any,
    *,
    pipeline_run_id: str,
    correlation_id: str,
    source_key: str,
    stage: str,
    status: str,
    **fields: Any,
) -> None:
    payload = {"status": status, **fields}
    if status == "running" and "started_at" not in payload:
        payload["started_at"] = _now()
    if status in {"completed", "completed_with_warnings", "failed", "skipped", "blocked"}:
        payload["completed_at"] = _now()
    client.table("property_pipeline_source_stages").update(payload).eq(
        "pipeline_run_id", pipeline_run_id
    ).eq("source_key", source_key).eq("stage", stage).execute()
    client.table("property_pipeline_runs").update(
        {
            "current_source_key": source_key,
            "current_stage": stage,
            "progress": {
                "message": f"{source_key}: {stage} → {status}",
                "updated_at": _now(),
            },
        }
    ).eq("id", pipeline_run_id).execute()
    append_event(
        client,
        pipeline_run_id=pipeline_run_id,
        correlation_id=correlation_id,
        source_key=source_key,
        stage=stage,
        event_type="stage",
        message=f"{stage} {status}",
        details={k: v for k, v in fields.items() if k not in {"started_at", "completed_at"}},
    )
