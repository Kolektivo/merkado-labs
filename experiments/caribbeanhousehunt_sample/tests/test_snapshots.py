"""Focused tests for CHH snapshot creation and comparison."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from experiments.caribbeanhousehunt_sample.compare_snapshots import (
    SnapshotFormatError,
    changed_fields,
    compare_pair,
    duplicate_urlids,
    identity_collisions,
    load_snapshot,
    no_baseline_result,
)
from experiments.caribbeanhousehunt_sample.create_snapshot import (
    build_snapshot_metadata,
    comparison_fingerprint,
    validate_source_payload,
)


def index_record(urlid: str, **overrides: Any) -> dict[str, Any]:
    """Build a complete lightweight index record."""

    record = {
        "urlid": urlid,
        "original_realtor_url": f"https://realtor.example/listing/{urlid}",
        "listing_type": "sale",
        "property_type": "home",
        "price": 100_000,
        "currency": "USD",
        "bedrooms": 3,
        "floor_area_m2": 120,
        "neighbourhood": "Example",
        "latitude": 12.1,
        "longitude": -68.9,
        "primary_image_url": f"https://caribbeanhousehunt.com/images/{urlid}.webp",
        "comparison_fingerprint": f"fingerprint-{urlid}",
    }
    record.update(overrides)
    return record


def snapshot(
    snapshot_id: str,
    observed_at: str,
    records: list[dict[str, Any]],
    source_sha256: str,
) -> dict[str, Any]:
    """Build a validated in-memory snapshot shape."""

    return {
        "directory": Path(snapshot_id),
        "metadata": {
            "snapshot_id": snapshot_id,
            "observed_at": observed_at,
            "source_url": "https://caribbeanhousehunt.com/map-assets/data/test-en.json",
            "request_count": 2,
            "http_status": 200,
            "record_count": len(records),
            "language": "en",
            "cachebust_value": "test",
            "source_sha256": source_sha256,
            "extractor_version": "test",
        },
        "index": records,
    }


def test_snapshot_metadata_contract_and_checksum() -> None:
    body = b'[{"urlid":1}]'
    metadata = build_snapshot_metadata(
        snapshot_id="20260715T120000000000Z",
        observed_at="2026-07-15T12:00:00+00:00",
        source_url="https://caribbeanhousehunt.com/map-assets/data/test-en.json",
        request_count=2,
        http_status=200,
        record_count=1,
        cachebust_value="test",
        source_body=body,
    )

    assert metadata["source_sha256"] == hashlib.sha256(body).hexdigest()
    assert metadata["record_count"] == 1
    assert metadata["language"] == "en"
    assert metadata["extractor_version"] == "0.2.0"


def test_fingerprint_is_deterministic_and_excludes_price() -> None:
    raw = {
        "url_page": "https://Realtor.Example/listing/42/?utm_source=one",
        "price_usd": 100,
        "property_title": "Example",
    }
    changed_price = {
        "url_page": "https://realtor.example/listing/42?utm_source=two",
        "price_usd": 999,
        "property_title": "Changed title",
    }

    assert comparison_fingerprint(raw) == comparison_fingerprint(raw)
    assert comparison_fingerprint(raw) == comparison_fingerprint(changed_price)


def test_duplicate_urlid_detection() -> None:
    records = [index_record("1"), index_record("1"), index_record("2")]

    assert duplicate_urlids(records) == {"1": 2}


def test_new_disappeared_and_changed_fields() -> None:
    previous = snapshot(
        "old",
        "2026-07-14T00:00:00+00:00",
        [index_record("1"), index_record("2")],
        "old-sha",
    )
    current = snapshot(
        "new",
        "2026-07-15T00:00:00+00:00",
        [index_record("2", price=110_000), index_record("3")],
        "new-sha",
    )

    result = compare_pair(previous, current)

    assert result["shared_urlids"] == 1
    assert result["new_urlids"] == 1
    assert result["disappeared_urlids"] == 1
    assert result["listing_changes"]["by_field"]["price"] == 1
    assert result["listing_changes"]["records"][0]["urlid"] == "2"


def test_changed_field_detection_covers_requested_values() -> None:
    before = index_record("1")
    after = index_record(
        "1",
        currency="EUR",
        listing_type="rent",
        bedrooms=4,
        latitude=12.2,
        original_realtor_url="https://realtor.example/listing/replaced",
    )

    changes = changed_fields(before, after)

    assert set(changes) == {
        "currency",
        "listing_type",
        "bedrooms",
        "latitude",
        "original_realtor_url",
    }


def test_identity_collision_detection() -> None:
    previous_record = index_record("1")
    current_record = index_record(
        "1",
        original_realtor_url="https://other.example/different",
        property_type="commercial",
        neighbourhood="Elsewhere",
    )

    collisions = identity_collisions(
        {"1"},
        {"1": previous_record},
        {"1": current_record},
    )

    assert collisions == [
        {
            "urlid": "1",
            "changed_identity_fields": [
                "original_realtor_url",
                "property_type",
                "neighbourhood",
            ],
        }
    ]


def test_stability_classification_for_first_snapshot_and_clean_comparison() -> None:
    current = snapshot(
        "first",
        "2026-07-15T00:00:00+00:00",
        [index_record("1")],
        "first-sha",
    )
    assert no_baseline_result(current)["stability"]["status"] == "insufficient_evidence"

    previous = snapshot(
        "old",
        "2026-07-14T00:00:00+00:00",
        [index_record("1")],
        "old-sha",
    )
    assert compare_pair(previous, current)["stability"]["status"] == "stable"


def test_duplicate_or_collision_classifies_as_unstable() -> None:
    previous = snapshot(
        "old",
        "2026-07-14T00:00:00+00:00",
        [index_record("1")],
        "old-sha",
    )
    current = snapshot(
        "new",
        "2026-07-15T00:00:00+00:00",
        [
            index_record("1", property_type="commercial", neighbourhood="Other"),
            index_record("1", original_realtor_url="https://other.example/2"),
        ],
        "new-sha",
    )

    assert compare_pair(previous, current)["stability"]["status"] == "unstable"


def test_small_fingerprint_id_remap_classifies_as_mostly_stable() -> None:
    previous = snapshot(
        "old",
        "2026-07-14T00:00:00+00:00",
        [
            index_record("1"),
            index_record("2", comparison_fingerprint="same-property"),
        ],
        "old-sha",
    )
    current = snapshot(
        "new",
        "2026-07-15T00:00:00+00:00",
        [
            index_record("1"),
            index_record("3", comparison_fingerprint="same-property"),
        ],
        "new-sha",
    )

    assert compare_pair(previous, current)["stability"]["status"] == "mostly_stable"


def test_empty_or_malformed_snapshots_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(SnapshotFormatError, match="incomplete"):
        load_snapshot(tmp_path)

    (tmp_path / "metadata.json").write_text("{}", encoding="utf-8")
    (tmp_path / "normalized-index.json").write_text("[]", encoding="utf-8")
    (tmp_path / "source.json").write_text("[]", encoding="utf-8")
    with pytest.raises(SnapshotFormatError, match="non-empty"):
        load_snapshot(tmp_path)

    with pytest.raises(ValueError, match="JSON array"):
        validate_source_payload({"not": "an array"})
    with pytest.raises(ValueError, match="must be an object"):
        validate_source_payload([{"ok": True}, "bad"])


def test_malformed_snapshot_json_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "metadata.json").write_text("{", encoding="utf-8")
    (tmp_path / "normalized-index.json").write_text(json.dumps([index_record("1")]))
    (tmp_path / "source.json").write_text("[]", encoding="utf-8")

    with pytest.raises(SnapshotFormatError, match="malformed"):
        load_snapshot(tmp_path)
