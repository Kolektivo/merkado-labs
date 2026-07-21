from datetime import UTC, datetime
from pathlib import Path

from merkado_labs.pipeline.schedule import (
    AUTOMATIC_REFRESH_ENABLED,
    next_scheduled_run_utc,
    schedule_metadata,
)
from merkado_labs.pipeline.sources import (
    CURACAO_TZ,
    DAILY_CRON_UTC,
    READY_SOURCE_ORDER,
    ordered_ready_keys,
)


def test_ready_order_and_schedule_metadata() -> None:
    assert READY_SOURCE_ORDER == (
        "monumentenzorg_curacao",
        "moret_real_estate",
        "keller_williams_curacao",
        "remax_curacao",
    )
    assert ordered_ready_keys(["remax_curacao", "monumentenzorg_curacao"]) == [
        "monumentenzorg_curacao",
        "remax_curacao",
    ]
    assert CURACAO_TZ == "America/Curacao"
    assert DAILY_CRON_UTC == "0 10 * * *"
    assert AUTOMATIC_REFRESH_ENABLED is True
    meta = schedule_metadata(enabled=True)
    assert meta["automatic_refresh"] == "On"
    assert meta["enabled"] is True
    assert meta["documented_cron_utc"] == "0 10 * * *"
    assert "sothebys_curacao" in meta["excluded_sources"]


def test_next_scheduled_run_is_next_1000_utc() -> None:
    before = datetime(2026, 7, 21, 9, 59, tzinfo=UTC)
    assert next_scheduled_run_utc(before) == datetime(2026, 7, 21, 10, 0, tzinfo=UTC)
    after = datetime(2026, 7, 21, 10, 0, tzinfo=UTC)
    assert next_scheduled_run_utc(after) == datetime(2026, 7, 22, 10, 0, tzinfo=UTC)


def test_workflow_has_daily_cron_and_dispatch() -> None:
    workflow_path = Path(".github/workflows/property-pipeline-labs.yml")
    workflow = workflow_path.read_text(encoding="utf-8")
    assert "workflow_dispatch:" in workflow
    assert "\n  schedule:" in workflow
    assert 'cron: "0 10 * * *"' in workflow
    assert 'trigger="scheduled"' in workflow
    assert "cancel-in-progress: false" in workflow
    assert "github.event_name" in workflow
