from datetime import date
from decimal import Decimal

from merkado_labs.pipeline.budgets import (
    MAX_LISTINGS_PER_DAILY_RUN,
    PROPERTY_AI_DAILY_BUDGET_USD,
    PROPERTY_AI_MONTHLY_BUDGET_USD,
    BudgetUsage,
    decide_ai_budget,
    load_budget_usage,
    record_ai_spend,
)


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.payload = None

    def select(self, *_args):
        return self

    def insert(self, payload):
        self.payload = dict(payload)
        return self

    def execute(self):
        if self.payload is not None:
            self.rows.append(self.payload)
            return _Result([self.payload])
        return _Result(list(self.rows))


class _Client:
    def __init__(self):
        self.rows = [
            {"spent_on": "2026-07-20", "listings_count": 2, "cost_usd": 0.5},
            {"spent_on": "2026-07-01", "listings_count": 3, "cost_usd": 1.25},
            {"spent_on": "2026-06-30", "listings_count": 8, "cost_usd": 4},
        ]

    def table(self, name):
        assert name == "property_pipeline_ai_spend"
        return _Query(self.rows)


def test_budget_defaults_and_usage() -> None:
    assert PROPERTY_AI_DAILY_BUDGET_USD == Decimal("2")
    assert PROPERTY_AI_MONTHLY_BUDGET_USD == Decimal("25")
    assert MAX_LISTINGS_PER_DAILY_RUN == 25
    usage = load_budget_usage(_Client(), spent_on=date(2026, 7, 20))
    assert usage.daily_cost_usd == Decimal("0.5")
    assert usage.monthly_cost_usd == Decimal("1.75")


def test_budget_defers_without_failing_import() -> None:
    usage = BudgetUsage(date(2026, 7, 20), Decimal("1.9"), Decimal("10"), 3, 10)
    decision = decide_ai_budget(
        usage=usage, requested_listings=2, estimated_cost_usd=Decimal("0.2")
    )
    # $0.10 remaining funds one ~$0.10 listing; remainder stays deferred.
    assert decision.allowed
    assert decision.status == "partial"
    assert decision.approved_listings == 1
    assert decision.reason and decision.reason.startswith("partial_budget:")

    exhausted = decide_ai_budget(
        usage=BudgetUsage(date(2026, 7, 20), Decimal("2"), Decimal("10"), 25, 25),
        requested_listings=2,
        estimated_cost_usd=Decimal("0.2"),
    )
    assert not exhausted.allowed
    assert exhausted.status == "budget_deferred"


def test_listing_cap_approves_remaining_prefix() -> None:
    usage = BudgetUsage(date(2026, 7, 20), Decimal("0"), Decimal("0"), 3, 3)
    decision = decide_ai_budget(
        usage=usage, requested_listings=26, estimated_cost_usd=Decimal("0")
    )
    assert decision.allowed
    assert decision.approved_listings == 22
    assert decision.reason and decision.reason.startswith("partial_budget:")


def test_record_ai_spend_appends_ledger_row() -> None:
    client = _Client()
    row = record_ai_spend(
        client,
        pipeline_run_id="run-1",
        listings_count=4,
        cost_usd="0.25",
        spent_on=date(2026, 7, 20),
    )
    assert row["pipeline_run_id"] == "run-1"
    assert row["cost_usd"] == 0.25
