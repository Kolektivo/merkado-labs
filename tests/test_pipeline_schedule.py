from pathlib import Path

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


def test_workflow_is_dispatch_only() -> None:
    workflow_path = Path(".github/workflows/property-pipeline-labs.yml")
    workflow = workflow_path.read_text(encoding="utf-8")
    assert "workflow_dispatch:" in workflow
    assert "\n  schedule:" not in workflow
    assert "cancel-in-progress: false" in workflow
