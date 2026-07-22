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
    assert DAILY_CRON_UTC == "0 4 * * *"
    assert AUTOMATIC_REFRESH_ENABLED is True
    meta = schedule_metadata()
    assert meta["automatic_refresh"] == "On"
    assert meta["enabled"] is True
    assert meta["documented_cron_utc"] == "0 4 * * *"
    assert meta["intended_local_time"] == "00:00"
    assert "sothebys_curacao" in meta["excluded_sources"]
    meta_off = schedule_metadata(enabled=False)
    assert meta_off["automatic_refresh"] == "Off"
    assert meta_off["enabled"] is False


def test_next_scheduled_run_is_next_0400_utc() -> None:
    before = datetime(2026, 7, 21, 3, 59, tzinfo=UTC)
    assert next_scheduled_run_utc(before) == datetime(2026, 7, 21, 4, 0, tzinfo=UTC)
    after = datetime(2026, 7, 21, 4, 0, tzinfo=UTC)
    assert next_scheduled_run_utc(after) == datetime(2026, 7, 22, 4, 0, tzinfo=UTC)


def test_workflow_has_daily_cron_and_dispatch() -> None:
    workflow_path = Path(".github/workflows/property-pipeline-labs.yml")
    workflow = workflow_path.read_text(encoding="utf-8")
    assert "workflow_dispatch:" in workflow
    assert "\n  schedule:" in workflow
    assert 'cron: "35 11 * * *"' in workflow
    assert 'trigger="scheduled"' in workflow
    assert "cancel-in-progress: false" in workflow
    assert "github.event_name" in workflow
    assert "csaefdkpwukshtouyixg" in workflow
    assert "jkrfyvukhhsapoivntms" in workflow  # production forbid guard
    assert "sothebys" not in workflow.lower()
    assert "caribbeanhousehunt" not in workflow.lower()


def test_workflow_sets_enrichment_model_and_budget_caps() -> None:
    """Regression: scheduled RE/MAX failed when OPENAI_ENRICHMENT_MODEL was unset."""

    workflow = Path(".github/workflows/property-pipeline-labs.yml").read_text(
        encoding="utf-8"
    )
    assert 'OPENAI_ENRICHMENT_MODEL: "gpt-5.6-terra"' in workflow
    assert 'PROPERTY_AI_DAILY_BUDGET_USD: "2.00"' in workflow
    assert 'PROPERTY_AI_MONTHLY_BUDGET_USD: "25.00"' in workflow
    assert 'MAX_LISTINGS_PER_DAILY_RUN: "25"' in workflow
    assert 'PROPERTY_AI_MAX_LISTINGS_PER_DAILY_RUN: "25"' in workflow
