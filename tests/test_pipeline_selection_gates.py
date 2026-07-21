"""Regression tests for automatic pipeline selection / hash gates."""

from __future__ import annotations

from typing import Any

from merkado_labs.enrichment import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    compute_input_checksum,
    compute_legacy_input_checksum,
)
from merkado_labs.enrichment.jobs import (
    has_identical_enrichment_attempt,
    listing_to_enrichment_input,
    should_skip_unchanged_enrichment,
)
from merkado_labs.pipeline.change_hash import (
    HASH_CONTRACT_VERSION,
    compute_enrichment_input_hash,
    compute_semantic_source_checksum,
)


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self._filters: list[tuple[str, Any]] = []
        self._in_field: str | None = None
        self._in_values: list[Any] | None = None
        self._limit: int | None = None

    def select(self, *_a: Any, **_k: Any) -> _Query:
        return self

    def eq(self, field: str, value: Any) -> _Query:
        self._filters.append((field, value))
        return self

    def in_(self, field: str, values: list[Any]) -> _Query:
        self._in_field = field
        self._in_values = list(values)
        return self

    def limit(self, n: int) -> _Query:
        self._limit = n
        return self

    def execute(self) -> _Result:
        data = list(self.rows)
        for field, value in self._filters:
            data = [row for row in data if row.get(field) == value]
        if self._in_field is not None:
            data = [row for row in data if row.get(self._in_field) in self._in_values]
        if self._limit is not None:
            data = data[: self._limit]
        return _Result(data)


class _Client:
    def __init__(self, proposals: list[dict[str, Any]] | None = None) -> None:
        self.proposals = list(proposals or [])

    def table(self, name: str) -> _Query:
        assert name == "ai_enrichment_proposals"
        return _Query(self.proposals)


def _row(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": "listing-1",
        "external_id": "HS-1",
        "source_key": "remax_curacao",
        "source_url": "https://example.com/hs1",
        "title": "Villa",
        "description": "A bright home with pool",
        "listing_type": "sale",
        "property_type": "villa",
        "bedrooms": 3,
        "bathrooms": 2,
        "source_neighbourhood_text": "Jan Thiel",
        "amenities": [{"key": "pool", "value": True}, {"key": "garden", "value": True}],
        "public_eligible": True,
    }
    base.update(overrides)
    return base


def test_hash_contract_versioned_and_stable() -> None:
    assert HASH_CONTRACT_VERSION == "enrichment_input_hash_v1"
    row = _row()
    assert compute_enrichment_input_hash(row) == compute_enrichment_input_hash(row)
    assert compute_semantic_source_checksum(row) == compute_input_checksum(
        listing_to_enrichment_input(row)
    )


def test_formatting_whitespace_and_feature_order_do_not_flip_hash() -> None:
    a = _row(
        description="A bright   home\nwith pool",
        amenities=[{"key": "pool", "value": True}, {"key": "garden", "value": True}],
    )
    b = _row(
        description="A bright home with pool",
        amenities=[{"key": "garden", "value": True}, {"key": "pool", "value": True}],
    )
    # Semantic enrichment checksum sorts via json; description whitespace is
    # collapsed inside change_hash normalization for the contract hash.
    assert compute_enrichment_input_hash(a) == compute_enrichment_input_hash(
        {**a, "description": "A bright home with pool"}
    )
    # Feature-array order has no semantic meaning for the contract hash payload.
    assert compute_enrichment_input_hash(a) == compute_enrichment_input_hash(b)


def test_image_only_change_does_not_flip_hash() -> None:
    base = _row(image_urls=["b.jpg", "a.jpg?w=800"])
    changed = {**base, "image_urls": ["a.jpg?w=400", "c.jpg"]}
    assert compute_enrichment_input_hash(base) == compute_enrichment_input_hash(changed)


def test_currency_and_price_only_changes_do_not_flip_hash() -> None:
    """Asking money / official alts must not rebill presentation copy."""

    base = _row(
        original_price=664,
        original_currency="EUR",
        benchmark_price_xcg=1350,
        official_alternate_prices=[{"currency": "XCG", "amount": 1350}],
    )
    money_only = {
        **base,
        "original_price": 700,
        "original_currency": "USD",
        "benchmark_price_xcg": 9999,
        "official_alternate_prices": [{"currency": "XCG", "amount": 9999}],
    }
    assert compute_semantic_source_checksum(base) == compute_semantic_source_checksum(
        money_only
    )
    assert compute_enrichment_input_hash(base) == compute_enrichment_input_hash(
        money_only
    )


def test_run_metadata_and_timestamps_do_not_feed_hash() -> None:
    base = _row()
    noisy = {
        **base,
        "updated_at": "2026-07-21T00:00:00Z",
        "created_at": "2026-07-20T00:00:00Z",
        "pipeline_run_id": "run-99",
        "source_run_id": "src-run-99",
        "enrichment_status": "succeeded",
        "display_description": "AI rewritten marketing copy",
        "image_urls": ["z.jpg", "a.jpg"],
    }
    assert compute_enrichment_input_hash(base) == compute_enrichment_input_hash(noisy)
    assert compute_semantic_source_checksum(base) == compute_semantic_source_checksum(
        noisy
    )


def test_genuine_description_change_flips_hash() -> None:
    base = _row(description="Original text")
    changed = _row(description="Changed text about a renovated kitchen")
    assert compute_semantic_source_checksum(base) != compute_semantic_source_checksum(
        changed
    )
    assert compute_enrichment_input_hash(base) != compute_enrichment_input_hash(changed)


def _complete_english_proposal(**overrides: Any) -> dict[str, Any]:
    row = {
        "id": "prop-1",
        "property_listing_id": "listing-1",
        "model": "gpt-5.6-terra",
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "status": "succeeded",
        # Nested under proposal — matches find_matching_enrichment_attempt shape.
        "proposal": {
            "field_decisions": [
                {
                    "key": "display_title",
                    "final_status": "auto_applied",
                    "resulting_effective": "3-Bedroom Villa in Jan Thiel",
                },
                {
                    "key": "display_summary",
                    "final_status": "auto_applied",
                    "resulting_effective": "A bright villa with pool near the beach.",
                },
                {
                    "key": "display_overview",
                    "final_status": "auto_applied",
                    "resulting_effective": "This villa offers a pool and garden.",
                },
            ]
        },
    }
    row.update(overrides)
    return row


def test_cross_version_terra_match_is_zero_cost_skip() -> None:
    row = _row()
    enrichment_input = listing_to_enrichment_input(row)
    checksum = compute_input_checksum(enrichment_input)
    client = _Client(
        [
            _complete_english_proposal(
                prompt_version="listing_enrichment_v3",
                schema_version="listing_enrichment_schema_v3",
                input_checksum=checksum,
            )
        ]
    )
    assert has_identical_enrichment_attempt(
        client,
        listing_id="listing-1",
        model="gpt-5.6-terra",
        input_checksum=checksum,
        match_any_prompt_schema=True,
    )
    assert should_skip_unchanged_enrichment(
        client, row=row, model="gpt-5.6-terra"
    )


def test_new_listing_without_proposal_is_billable() -> None:
    row = _row(id="listing-new", external_id="NEW-1")
    client = _Client([])
    assert not should_skip_unchanged_enrichment(
        client, row=row, model="gpt-5.6-terra"
    )


def test_current_version_match_still_skips() -> None:
    row = _row()
    enrichment_input = listing_to_enrichment_input(row)
    checksum = compute_input_checksum(enrichment_input)
    legacy = compute_legacy_input_checksum(enrichment_input)
    client = _Client(
        [
            _complete_english_proposal(
                id="prop-2",
                input_checksum=checksum,
            )
        ]
    )
    assert should_skip_unchanged_enrichment(client, row=row, model="gpt-5.6-terra")
    assert has_identical_enrichment_attempt(
        client,
        listing_id="listing-1",
        model="gpt-5.6-terra",
        input_checksum=checksum,
        alternate_checksums=[legacy],
    )
