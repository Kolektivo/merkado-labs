"""Property Data Operations v1 — pipeline readiness, enqueue safety, worker lock."""

from __future__ import annotations

from typing import Any

import pytest

from merkado_labs.pipeline.readiness import (
    FORBIDDEN_PROJECT_REF,
    LABS_PROJECT_REF,
    PIPELINE_STAGES,
    assert_can_enqueue_full_refresh,
    assert_labs_project_ref,
    filter_run_all_ready,
    ready_source_keys,
    resolve_source_readiness,
)
from merkado_labs.pipeline.store import build_preflight, enqueue_pipeline_run
from merkado_labs.pipeline.worker import claim_next_queued_run, process_pipeline_run


def test_ready_sources_exclude_partial_and_blocked() -> None:
    ready = ready_source_keys()
    assert "keller_williams_curacao" in ready
    assert "remax_curacao" in ready
    assert "moret_real_estate" in ready
    assert "monumentenzorg_curacao" in ready
    assert "sothebys_curacao" not in ready
    assert filter_run_all_ready() == ready


def test_blocked_cannot_full_refresh() -> None:
    with pytest.raises(PermissionError, match="blocked"):
        assert_can_enqueue_full_refresh("sothebys_curacao")
    assert assert_can_enqueue_full_refresh("monumentenzorg_curacao").allows_full_refresh
    assert assert_can_enqueue_full_refresh("moret_real_estate").allows_full_refresh
    assert assert_can_enqueue_full_refresh("keller_williams_curacao").allows_full_refresh


def test_production_project_rejected() -> None:
    with pytest.raises(PermissionError, match="forbidden"):
        assert_labs_project_ref(FORBIDDEN_PROJECT_REF)
    assert assert_labs_project_ref(LABS_PROJECT_REF) == LABS_PROJECT_REF


def test_pipeline_stages_are_seven() -> None:
    assert PIPELINE_STAGES == (
        "preflight",
        "scraping",
        "validation",
        "import",
        "location",
        "ai_enrichment",
        "verification",
    )


def test_preflight_lifecycle_risk_and_enabled_schedule() -> None:
    preflight = build_preflight(
        source_keys=["keller_williams_curacao"],
        trigger_mode="single_source",
        project_ref=LABS_PROJECT_REF,
        expected_ai_listing_count=0,
    )
    assert preflight["schedule"] == "on"
    assert preflight["schedule_metadata"]["enabled"] is True
    assert preflight["schedule_metadata"]["automatic_refresh"] == "On"
    assert preflight["schedule_metadata"]["documented_cron_utc"] == "0 4 * * *"
    assert "Missing/removed" in preflight["lifecycle_risk_summary"]
    assert preflight["import_will_occur"] is True


class _FakeQuery:
    def __init__(self, store: _FakeClient, table: str) -> None:
        self.store = store
        self.table_name = table
        self._filters: list[tuple[str, Any]] = []
        self._op: str | None = None
        self._payload: Any = None
        self._order: str | None = None
        self._limit: int | None = None
        self._in_values: list[Any] | None = None
        self._in_field: str | None = None

    def select(self, *_args: Any, **_kwargs: Any) -> _FakeQuery:
        self._op = "select"
        return self

    def insert(self, payload: Any) -> _FakeQuery:
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: Any) -> _FakeQuery:
        self._op = "update"
        self._payload = payload
        return self

    def delete(self) -> _FakeQuery:
        self._op = "delete"
        return self

    def eq(self, field: str, value: Any) -> _FakeQuery:
        self._filters.append((field, value))
        return self

    def in_(self, field: str, values: list[Any]) -> _FakeQuery:
        self._in_field = field
        self._in_values = list(values)
        return self

    def order(self, field: str, **_kwargs: Any) -> _FakeQuery:
        self._order = field
        return self

    def limit(self, n: int) -> _FakeQuery:
        self._limit = n
        return self

    def execute(self) -> Any:
        rows = self.store.tables.setdefault(self.table_name, [])
        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            created = []
            for item in items:
                row = dict(item)
                row.setdefault("id", f"{self.table_name}-{len(rows) + 1}")
                rows.append(row)
                created.append(row)
            return type("R", (), {"data": created})()
        if self._op == "update":
            updated = []
            for row in rows:
                if all(row.get(k) == v for k, v in self._filters):
                    if self._in_field and row.get(self._in_field) not in (
                        self._in_values or []
                    ):
                        continue
                    row.update(self._payload)
                    updated.append(row)
            return type("R", (), {"data": updated})()
        if self._op == "delete":
            keep = []
            for row in rows:
                if all(row.get(k) == v for k, v in self._filters):
                    continue
                keep.append(row)
            self.store.tables[self.table_name] = keep
            return type("R", (), {"data": []})()
        # select
        data = list(rows)
        for field, value in self._filters:
            data = [row for row in data if row.get(field) == value]
        if self._in_field is not None:
            data = [row for row in data if row.get(self._in_field) in self._in_values]
        if self._order:
            data = sorted(data, key=lambda row: row.get(self._order) or "")
        if self._limit is not None:
            data = data[: self._limit]
        return type("R", (), {"data": data})()


class _FakeClient:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "property_pipeline_runs": [],
            "property_pipeline_source_stages": [],
            "property_pipeline_events": [],
            "property_pipeline_items": [],
            "property_listings": [],
            "property_sources": [
                {"id": "src-kw", "source_key": "keller_williams_curacao"}
            ],
        }

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self, name)


def test_enqueue_is_queued_waiting_for_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "merkado_labs.pipeline.store.assert_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    run = enqueue_pipeline_run(
        client,
        source_keys=["keller_williams_curacao"],
        trigger_mode="single_source",
        expected_ai_listing_count=0,
        project_ref=LABS_PROJECT_REF,
    )
    assert run["status"] == "queued"
    assert run["trigger_type"] == "manual"
    assert run["progress"]["message"] == "Queued — waiting for worker"
    stages = client.tables["property_pipeline_source_stages"]
    assert len(stages) == len(PIPELINE_STAGES)
    events = client.tables["property_pipeline_events"]
    assert events[0]["message"] == "Queued — waiting for worker"


def test_enqueue_blocked_source_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "merkado_labs.pipeline.store.assert_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    with pytest.raises(PermissionError, match="blocked"):
        enqueue_pipeline_run(
            client,
            source_keys=["sothebys_curacao"],
            project_ref=LABS_PROJECT_REF,
        )


def test_worker_locking_and_safe_resume_skip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.assert_labs_project_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    client.tables["property_pipeline_runs"].append(
        {
            "id": "run-1",
            "correlation_id": "corr-1",
            "status": "queued",
            "source_keys": ["keller_williams_curacao"],
            "progress": {"message": "Queued — waiting for worker"},
            "created_at": "2026-07-20T00:00:00+00:00",
        }
    )
    for stage in PIPELINE_STAGES:
        client.tables["property_pipeline_source_stages"].append(
            {
                "pipeline_run_id": "run-1",
                "correlation_id": "corr-1",
                "source_key": "keller_williams_curacao",
                "stage": stage,
                "status": "waiting",
            }
        )

    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.resolve_property_source",
        lambda _c, key: {"id": "src-kw", "source_key": key},
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._listing_rows_for_source",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._billable_enrichment_ids",
        lambda *_a, **_k: [],
    )

    claimed = claim_next_queued_run(client, worker_id="test-worker")
    assert claimed is not None
    assert claimed["status"] == "running"
    assert claimed["locked_by"] == "test-worker"

    # Second claim finds nothing queued.
    assert claim_next_queued_run(client, worker_id="other") is None

    finished = process_pipeline_run(client, run=claimed, execute_live=False)
    assert finished["status"] in {"completed", "completed_with_errors"}
    stage_rows = client.tables["property_pipeline_source_stages"]
    assert any(row["stage"] == "preflight" and row["status"] == "completed" for row in stage_rows)
    assert any(row["stage"] == "ai_enrichment" for row in stage_rows)


def test_run_all_ready_filters_sources() -> None:
    keys = filter_run_all_ready(
        [
            "keller_williams_curacao",
            "moret_real_estate",
            "sothebys_curacao",
            "remax_curacao",
        ]
    )
    assert keys == [
        "moret_real_estate",
        "keller_williams_curacao",
        "remax_curacao",
    ]


def test_moret_ready_after_v020_catalog_proof() -> None:
    info = resolve_source_readiness("moret_real_estate")
    assert info.readiness == "ready"
    assert info.adapter_version == "0.2.0"
    assert info.listing_count_expected == 71
    assert info.catalog_status == "complete"
    assert info.allows_full_refresh is True
    assert info.primary_action == "Refresh & enrich"
    assert info.current_issue is not None
    issue = info.current_issue.lower()
    assert "first complete catalog" in issue
    assert "71" in info.current_issue
    assert "backfill" in issue
    assert "new/changed" in issue


def test_monumentenzorg_ready_and_sothebys_blocked() -> None:
    mon = resolve_source_readiness("monumentenzorg_curacao")
    sot = resolve_source_readiness("sothebys_curacao")
    assert mon.readiness == "ready"
    assert sot.readiness == "blocked"
    assert sot.adapter_version == "0.1.2"
    assert sot.blocker_kind == "waf_restriction"
    assert sot.catalog_status == "access_route_under_investigation"
    assert mon.primary_action == "Refresh & enrich"
    assert sot.primary_action == "Blocked"
    assert mon.allows_full_refresh is True
    assert sot.allows_full_refresh is False
    assert mon.adapter_version == "0.2.0"
    assert mon.listing_count_expected == 5
    assert mon.catalog_status == "complete"
    assert sot.catalog_status == "access_route_under_investigation"
    assert "5" in (mon.current_issue or "")
    assert "backfill" in (mon.current_issue or "").lower()
    assert "BLOCKED" in (sot.current_issue or "")
    assert "HTTP 202" in (sot.current_issue or "")
    assert "partner feed/api" in (sot.current_issue or "").lower()


def test_remax_ready_after_v041_activation() -> None:
    info = resolve_source_readiness("remax_curacao")
    assert info.readiness == "ready"
    assert "0.4.1" in info.adapter_version
    assert info.current_issue is not None
    issue = info.current_issue.lower()
    assert "v0.4.1" in issue or "0.4.1" in issue
    assert "active" in issue
    assert "199/220" in info.current_issue
    assert "215" in issue or "backfill" in issue
    assert "deterministic import is pending" not in issue


def test_pipeline_ai_ceiling_and_checksum_guard_constants() -> None:
    from merkado_labs.pipeline.worker import (
        MAX_UNEXPECTED_AI_WITHOUT_INVESTIGATION,
        PIPELINE_AI_COST_CEILING_USD,
    )

    assert PIPELINE_AI_COST_CEILING_USD == 2
    assert MAX_UNEXPECTED_AI_WITHOUT_INVESTIGATION == 10


def test_preflight_stores_approved_ceiling() -> None:
    preflight = build_preflight(
        source_keys=["keller_williams_curacao"],
        trigger_mode="single_source",
        project_ref=LABS_PROJECT_REF,
        expected_ai_listing_count=104,
    )
    assert preflight["estimated_ai_ceiling_usd"] == 2
    assert preflight["schedule"] == "on"


def test_empty_worker_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.assert_labs_project_ref",
        lambda: LABS_PROJECT_REF,
    )
    from merkado_labs.pipeline.worker import run_once

    client = _FakeClient()
    assert run_once(client, execute_live=False) is None


def test_completed_run_not_reclaimed() -> None:
    client = _FakeClient()
    client.tables["property_pipeline_runs"].append(
        {
            "id": "run-done",
            "correlation_id": "corr-done",
            "status": "completed",
            "source_keys": ["keller_williams_curacao"],
            "created_at": "2026-07-20T00:00:00+00:00",
        }
    )
    assert claim_next_queued_run(client, worker_id="w") is None


def test_worker_refuses_unexpected_checksum_invalidation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.assert_labs_project_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    run = {
        "id": "run-ai",
        "correlation_id": "corr-ai",
        "status": "running",
        "source_keys": ["keller_williams_curacao"],
        "progress": {},
    }
    for stage in PIPELINE_STAGES:
        client.tables["property_pipeline_source_stages"].append(
            {
                "pipeline_run_id": "run-ai",
                "correlation_id": "corr-ai",
                "source_key": "keller_williams_curacao",
                "stage": stage,
                "status": "waiting",
            }
        )
    fake_rows = [
        {
            "id": f"listing-{i}",
            "external_id": f"EXT{i}",
            "title": f"Listing {i}",
            "public_eligible": True,
            "enrichment_status": "succeeded",
        }
        for i in range(11)
    ]
    unexpected_ids = [row["id"] for row in fake_rows]
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.resolve_property_source",
        lambda _c, key: {"id": "src-kw", "source_key": key},
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._listing_rows_for_source",
        lambda *_a, **_k: fake_rows,
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._billable_enrichment_ids",
        lambda *_a, **_k: list(unexpected_ids),
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._classify_billable_selection",
        lambda *_a, **_k: {
            "new_listings": [],
            "content_changed": [],
            "unexpected": list(unexpected_ids),
            "legitimate": [],
        },
    )
    from merkado_labs.pipeline.worker import _run_ai_stage

    with pytest.raises(RuntimeError, match="Unexpected checksum invalidation"):
        _run_ai_stage(
            client,
            run=run,
            source_key="keller_williams_curacao",
            execute_live=True,
        )


def test_worker_allows_legitimate_new_listing_backlog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """>10 legitimate new listings must not trip the unexpected-checksum guard."""

    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.assert_labs_project_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    run = {
        "id": "run-ai-legit",
        "correlation_id": "corr-ai-legit",
        "status": "running",
        "source_keys": ["keller_williams_curacao"],
        "progress": {},
    }
    for stage in PIPELINE_STAGES:
        client.tables["property_pipeline_source_stages"].append(
            {
                "pipeline_run_id": "run-ai-legit",
                "correlation_id": "corr-ai-legit",
                "source_key": "keller_williams_curacao",
                "stage": stage,
                "status": "waiting",
            }
        )
    fake_rows = [
        {
            "id": f"listing-{i}",
            "external_id": f"EXT{i}",
            "title": f"Listing {i}",
            "public_eligible": True,
            "enrichment_status": "not_run",
        }
        for i in range(11)
    ]
    legit_ids = [row["id"] for row in fake_rows]
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.resolve_property_source",
        lambda _c, key: {"id": "src-kw", "source_key": key},
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._listing_rows_for_source",
        lambda *_a, **_k: fake_rows,
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._billable_enrichment_ids",
        lambda *_a, **_k: list(legit_ids),
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._classify_billable_selection",
        lambda *_a, **_k: {
            "new_listings": list(legit_ids),
            "content_changed": [],
            "unexpected": [],
            "legitimate": list(legit_ids),
        },
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.create_enrichment_job",
        lambda *_a, **_k: "job-1",
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.process_enrichment_job",
        lambda *_a, **_k: {
            "results": [],
            "token_usage": {"input_tokens": 0, "output_tokens": 0},
        },
    )
    from merkado_labs.pipeline.worker import _run_ai_stage

    result = _run_ai_stage(
        client,
        run=run,
        source_key="keller_williams_curacao",
        execute_live=True,
    )
    assert result["billable"] == 11
    assert result.get("job_id") == "job-1"


def test_trigger_type_allowlist_and_order(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "merkado_labs.pipeline.store.assert_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    with pytest.raises(ValueError, match="trigger_type"):
        enqueue_pipeline_run(
            client,
            source_keys=["remax_curacao"],
            trigger_type="cron",
            project_ref=LABS_PROJECT_REF,
        )

    run = enqueue_pipeline_run(
        client,
        source_keys=["remax_curacao", "monumentenzorg_curacao"],
        trigger_mode="run_all_ready",
        trigger_type="local",
        project_ref=LABS_PROJECT_REF,
    )
    assert run["trigger_type"] == "local"
    assert run["source_keys"] == ["monumentenzorg_curacao", "remax_curacao"]


def test_source_lock_stale_recovery() -> None:
    from datetime import UTC, datetime, timedelta

    from merkado_labs.pipeline.locks import acquire_source_lock, release_source_lock

    client = _FakeClient()
    now = datetime(2026, 7, 20, tzinfo=UTC)
    client.tables["property_pipeline_source_locks"] = [
        {
            "source_key": "remax_curacao",
            "pipeline_run_id": "old",
            "locked_by": "old-worker",
            "locked_at": (now - timedelta(hours=2)).isoformat(),
            "expires_at": (now - timedelta(hours=1)).isoformat(),
        }
    ]
    assert acquire_source_lock(
        client,
        source_key="remax_curacao",
        pipeline_run_id="new",
        locked_by="worker",
        now=now,
    )
    release_source_lock(
        client, source_key="remax_curacao", pipeline_run_id="new"
    )
    assert client.tables["property_pipeline_source_locks"] == []


def test_ai_stage_honors_approved_listing_ids_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Budget-approved listing_ids must hard-cap paid enrichment execution."""

    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.assert_labs_project_ref",
        lambda: LABS_PROJECT_REF,
    )
    client = _FakeClient()
    run = {
        "id": "run-ai-cap",
        "correlation_id": "corr-ai-cap",
        "status": "running",
        "source_keys": ["keller_williams_curacao"],
        "progress": {},
    }
    for stage in PIPELINE_STAGES:
        client.tables["property_pipeline_source_stages"].append(
            {
                "pipeline_run_id": "run-ai-cap",
                "correlation_id": "corr-ai-cap",
                "source_key": "keller_williams_curacao",
                "stage": stage,
                "status": "waiting",
            }
        )
    fake_rows = [
        {
            "id": f"listing-{i}",
            "external_id": f"EXT{i}",
            "title": f"Listing {i}",
            "public_eligible": True,
            "enrichment_status": "not_run",
        }
        for i in range(11)
    ]
    all_ids = [row["id"] for row in fake_rows]
    approved = all_ids[:3]
    captured: dict[str, Any] = {}

    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.resolve_property_source",
        lambda _c, key: {"id": "src-kw", "source_key": key},
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._listing_rows_for_source",
        lambda *_a, **_k: fake_rows,
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._billable_enrichment_ids",
        lambda *_a, **_k: list(all_ids),
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._classify_billable_selection",
        lambda *_a, **_k: {
            "new_listings": list(approved),
            "content_changed": [],
            "unexpected": [],
            "legitimate": list(approved),
        },
    )

    def _create_job(*_a: Any, listing_ids: list[str] | None = None, **_k: Any) -> str:
        captured["listing_ids"] = list(listing_ids or [])
        return "job-capped"

    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.create_enrichment_job",
        _create_job,
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.process_enrichment_job",
        lambda *_a, **_k: {
            "results": [],
            "token_usage": {"input_tokens": 0, "output_tokens": 0},
        },
    )
    from merkado_labs.pipeline.worker import _run_ai_stage

    result = _run_ai_stage(
        client,
        run=run,
        source_key="keller_williams_curacao",
        execute_live=True,
        listing_ids=approved,
    )
    assert result["billable"] == 3
    assert captured["listing_ids"] == approved


def test_overlapping_active_run_rejected() -> None:
    from merkado_labs.pipeline.locks import assert_no_overlapping_active_run

    client = _FakeClient()
    client.tables["property_pipeline_runs"] = [
        {
            "id": "run-active",
            "status": "running",
            "source_keys": ["remax_curacao", "moret_real_estate"],
        }
    ]
    with pytest.raises(RuntimeError, match="Active pipeline run"):
        assert_no_overlapping_active_run(
            client, ["remax_curacao", "keller_williams_curacao"]
        )


def test_claim_started_at_clamps_local_clock_skew() -> None:
    from datetime import UTC, datetime, timedelta

    from merkado_labs.pipeline.store import claim_started_at_for_run

    created = datetime(2026, 7, 21, 17, 29, 4, tzinfo=UTC)
    lagging = created - timedelta(milliseconds=700)
    assert (
        claim_started_at_for_run(
            {"created_at": created.isoformat()},
            now=lagging.isoformat(),
        )
        == created.isoformat()
    )
    later = created + timedelta(seconds=1)
    assert (
        claim_started_at_for_run(
            {"created_at": created.isoformat()},
            now=later.isoformat(),
        )
        == later.isoformat()
    )


def test_orchestrator_isolates_source_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One source raising must not block the remaining Ready sources."""

    from merkado_labs.pipeline import orchestrator as orch
    from merkado_labs.pipeline.orchestrator import run_property_pipeline
    from merkado_labs.scrapers.contracts import SourceRunOutcome, SourceRunRecord
    from datetime import UTC, datetime

    monkeypatch.setattr(
        "merkado_labs.pipeline.store.assert_ref",
        lambda: LABS_PROJECT_REF,
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.assert_labs_project_ref",
        lambda: LABS_PROJECT_REF,
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._run_preflight_stage",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(orch, "assert_no_overlapping_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(
        orch,
        "acquire_source_lock",
        lambda *_a, **_k: True,
    )
    monkeypatch.setattr(orch, "release_source_lock", lambda *_a, **_k: None)
    monkeypatch.setattr(
        orch,
        "load_budget_usage",
        lambda *_a, **_k: type(
            "U",
            (),
            {
                "daily_cost_usd": 0,
                "monthly_cost_usd": 0,
                "daily_listings_count": 0,
                "monthly_listings_count": 0,
            },
        )(),
    )
    monkeypatch.setattr(
        orch,
        "decide_ai_budget",
        lambda **_k: type(
            "D",
            (),
            {
                "allowed": True,
                "approved_listings": 0,
                "reason": None,
                "status": "up_to_date",
            },
        )(),
    )

    client = _FakeClient()

    def fake_scrape(source_key: str, *_a: Any, **_k: Any):
        if source_key == "moret_real_estate":
            raise TimeoutError("simulated source timeout")
        started = datetime(2026, 7, 21, tzinfo=UTC)
        record = SourceRunRecord(
            source_key=source_key,
            adapter_name=source_key,
            adapter_version="0.0.0",
            started_at=started,
            completed_at=started,
            outcome=SourceRunOutcome.SUCCESS,
            discovered_count=0,
            parsed_count=0,
            excluded_no_price_count=0,
            warning_count=0,
            error_count=0,
            snapshot_checksum="a" * 64,
            notes="fixture",
            metadata={"complete_catalog": True},
        )
        return record, [], {"request_metrics": {}}

    monkeypatch.setattr(orch, "scrape_source", fake_scrape)
    monkeypatch.setattr(
        orch,
        "import_snapshots",
        lambda *_a, **_k: type(
            "I",
            (),
            {
                "imported_count": 0,
                "updated_count": 0,
                "dry_run": True,
                "source_run_id": "src-run-1",
            },
        )(),
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._listing_rows_for_source",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._billable_enrichment_ids",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker._run_ai_stage",
        lambda *_a, **_k: {"status": "up_to_date", "billable": 0},
    )
    monkeypatch.setattr(
        "merkado_labs.pipeline.worker.resolve_property_source",
        lambda _c, key: {"id": f"src-{key}", "source_key": key},
    )

    result = run_property_pipeline(
        client,
        trigger_type="dry_run",
        source_keys=["monumentenzorg_curacao", "moret_real_estate"],
        dry_run=True,
        execute_live=True,
        requested_by="test",
    )
    assert result["status"] == "completed_with_errors"
    summary = result.get("run_summary") or {}
    sources = summary.get("sources") or {}
    assert sources["moret_real_estate"]["status"] == "failed"
    assert sources["monumentenzorg_curacao"]["status"] == "completed"
