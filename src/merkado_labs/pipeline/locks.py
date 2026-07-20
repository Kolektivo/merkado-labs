"""Database-backed source locks for overlapping Labs pipeline protection."""

from __future__ import annotations

import socket
from datetime import UTC, datetime, timedelta
from typing import Any


def _as_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def assert_no_overlapping_active_run(
    client: Any,
    source_keys: list[str],
    *,
    exclude_pipeline_run_id: str | None = None,
) -> None:
    """Reject queued/running runs that overlap the requested source set."""

    active = (
        client.table("property_pipeline_runs")
        .select("id,status,source_keys")
        .in_("status", ["queued", "running", "stopping"])
        .execute()
        .data
        or []
    )
    requested = set(source_keys)
    for row in active:
        if exclude_pipeline_run_id and str(row.get("id")) == exclude_pipeline_run_id:
            continue
        overlap = requested & set(row.get("source_keys") or [])
        if overlap:
            raise RuntimeError(
                f"Active pipeline run {row.get('id')} already covers {sorted(overlap)}"
            )


def acquire_source_lock(
    client: Any,
    *,
    source_key: str,
    pipeline_run_id: str,
    locked_by: str | None = None,
    ttl_seconds: int = 6 * 60 * 60,
    now: datetime | None = None,
) -> bool:
    """Acquire a source lock, recovering an expired lock atomically enough for workers."""

    current = now or datetime.now(UTC)
    owner = locked_by or socket.gethostname()
    rows = (
        client.table("property_pipeline_source_locks")
        .select("*")
        .eq("source_key", source_key)
        .limit(1)
        .execute()
        .data
        or []
    )
    payload = {
        "pipeline_run_id": pipeline_run_id,
        "locked_by": owner,
        "locked_at": current.isoformat(),
        "expires_at": (current + timedelta(seconds=max(1, ttl_seconds))).isoformat(),
    }
    if not rows:
        try:
            client.table("property_pipeline_source_locks").insert(
                {"source_key": source_key, **payload}
            ).execute()
            return True
        except Exception:  # another worker may win the primary-key race
            return False

    existing = rows[0]
    if str(existing.get("pipeline_run_id")) == pipeline_run_id:
        client.table("property_pipeline_source_locks").update(payload).eq(
            "source_key", source_key
        ).execute()
        return True

    expires_at = _as_datetime(existing.get("expires_at"))
    if expires_at is not None and expires_at <= current:
        updated = (
            client.table("property_pipeline_source_locks")
            .update(payload)
            .eq("source_key", source_key)
            .eq("pipeline_run_id", existing.get("pipeline_run_id"))
            .execute()
            .data
            or []
        )
        return bool(updated)
    return False


def release_source_lock(
    client: Any,
    *,
    source_key: str,
    pipeline_run_id: str,
) -> None:
    """Release only the lock owned by this pipeline run."""

    client.table("property_pipeline_source_locks").delete().eq(
        "source_key", source_key
    ).eq("pipeline_run_id", pipeline_run_id).execute()
