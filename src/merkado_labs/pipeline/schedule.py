"""Daily Labs property-refresh schedule metadata and next-run calculation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from merkado_labs.pipeline.sources import CURACAO_TZ, DAILY_CRON_UTC

# HOLD (2026-07-27 Product Lead): Labs fully on hold — no automatic spend.
# Live Ready inventory runs on merkado-cw. Resume only with explicit approval.
AUTOMATIC_REFRESH_ENABLED = False
# 04:00 UTC == 00:00 America/Curacao == 06:00 Amsterdam (CEST) / 05:00 Amsterdam (CET)
SCHEDULE_CRON_UTC = DAILY_CRON_UTC


def next_scheduled_run_utc(now: datetime | None = None) -> datetime:
    """Return the next daily 04:00 UTC run at or after ``now``."""

    current = now.astimezone(UTC) if now is not None else datetime.now(UTC)
    candidate = current.replace(hour=4, minute=0, second=0, microsecond=0)
    if current >= candidate:
        candidate = candidate + timedelta(days=1)
    return candidate


def schedule_metadata(*, enabled: bool = AUTOMATIC_REFRESH_ENABLED) -> dict[str, object]:
    """Shared schedule payload for preflight, dashboard, and docs."""

    next_utc = next_scheduled_run_utc() if enabled else None
    next_local = (
        next_utc.astimezone(ZoneInfo(CURACAO_TZ)).isoformat() if next_utc else None
    )
    return {
        "automatic_refresh": "On" if enabled else "Off",
        "intended_local_time": "00:00",
        "timezone": CURACAO_TZ,
        "documented_cron_utc": SCHEDULE_CRON_UTC,
        "enabled": enabled,
        "next_run_utc": next_utc.isoformat() if next_utc else None,
        "next_run_local": next_local,
        "ready_sources": [
            "monumentenzorg_curacao",
            "moret_real_estate",
            "keller_williams_curacao",
            "remax_curacao",
        ],
        "excluded_sources": ["sothebys_curacao"],
    }
