"""Compare the newest CHH snapshot with the most recent earlier snapshot."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from .create_snapshot import canonical_realtor_url
    from .extract_sample import write_json
except ImportError:
    from create_snapshot import canonical_realtor_url
    from extract_sample import write_json

BASE_DIR = Path(__file__).resolve().parent
SNAPSHOTS_DIR = BASE_DIR / "snapshots"
HEALTH_PATH = BASE_DIR / "snapshot-health.json"
MIN_COMPARISON_AGE_HOURS = 6
CHANGE_FIELDS = (
    "price",
    "currency",
    "listing_type",
    "property_type",
    "bedrooms",
    "floor_area_m2",
    "neighbourhood",
    "latitude",
    "longitude",
    "primary_image_url",
    "original_realtor_url",
)


class SnapshotFormatError(ValueError):
    """A snapshot artifact is empty or malformed."""


def load_snapshot(snapshot_dir: Path) -> dict[str, Any]:
    """Load and validate one formal snapshot directory."""

    metadata_path = snapshot_dir / "metadata.json"
    index_path = snapshot_dir / "normalized-index.json"
    source_path = snapshot_dir / "source.json"
    if not all(path.exists() for path in (metadata_path, index_path, source_path)):
        raise SnapshotFormatError(f"Snapshot is incomplete: {snapshot_dir}")
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SnapshotFormatError(f"Snapshot JSON is malformed: {snapshot_dir}") from error
    if not isinstance(metadata, dict):
        raise SnapshotFormatError("metadata.json must contain an object")
    if not isinstance(index, list) or not index:
        raise SnapshotFormatError("normalized-index.json must contain a non-empty array")
    if not all(isinstance(record, dict) for record in index):
        raise SnapshotFormatError("normalized-index.json records must be objects")
    required_metadata = {
        "snapshot_id",
        "observed_at",
        "source_url",
        "request_count",
        "http_status",
        "record_count",
        "language",
        "cachebust_value",
        "source_sha256",
        "extractor_version",
    }
    missing = required_metadata - metadata.keys()
    if missing:
        raise SnapshotFormatError(f"metadata.json is missing: {sorted(missing)}")
    if metadata["record_count"] != len(index):
        raise SnapshotFormatError("metadata record_count does not match normalized index")
    return {"directory": snapshot_dir, "metadata": metadata, "index": index}


def find_snapshots() -> list[dict[str, Any]]:
    """Return all complete formal snapshots ordered by observation time."""

    if not SNAPSHOTS_DIR.exists():
        return []
    snapshots = [
        load_snapshot(path)
        for path in SNAPSHOTS_DIR.iterdir()
        if path.is_dir()
        and (path / "metadata.json").exists()
        and (path / "normalized-index.json").exists()
        and (path / "source.json").exists()
    ]
    return sorted(snapshots, key=lambda item: item["metadata"]["observed_at"])


def duplicate_urlids(index: list[dict[str, Any]]) -> dict[str, int]:
    """Return duplicate non-null urlid counts."""

    counts = Counter(str(record["urlid"]) for record in index if record.get("urlid") is not None)
    return {urlid: count for urlid, count in sorted(counts.items()) if count > 1}


def unique_id_map(index: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Map each non-null urlid to its first record."""

    result: dict[str, dict[str, Any]] = {}
    for record in index:
        if record.get("urlid") is not None:
            result.setdefault(str(record["urlid"]), record)
    return result


def values_equal(field: str, before: Any, after: Any) -> bool:
    """Compare fields with URL canonicalization and tolerant coordinate precision."""

    if field == "original_realtor_url":
        return canonical_realtor_url(before) == canonical_realtor_url(after)
    if field in {"latitude", "longitude"} and before is not None and after is not None:
        return round(float(before), 6) == round(float(after), 6)
    return before == after


def changed_fields(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """Return before/after values for changed observation fields."""

    return {
        field: {"before": before.get(field), "after": after.get(field)}
        for field in CHANGE_FIELDS
        if not values_equal(field, before.get(field), after.get(field))
    }


def identity_collision_fields(
    before: dict[str, Any], after: dict[str, Any]
) -> list[str]:
    """Return identity signals that changed substantially for a shared urlid."""

    changes: list[str] = []
    if not values_equal(
        "original_realtor_url",
        before.get("original_realtor_url"),
        after.get("original_realtor_url"),
    ):
        changes.append("original_realtor_url")
    for field in ("property_type", "neighbourhood"):
        if before.get(field) != after.get(field):
            changes.append(field)
    coordinates_changed = any(
        not values_equal(field, before.get(field), after.get(field))
        for field in ("latitude", "longitude")
    )
    if coordinates_changed:
        changes.append("coordinates")
    return changes


def identity_collisions(
    shared_ids: set[str],
    previous_map: dict[str, dict[str, Any]],
    current_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Flag shared IDs with at least two changed identity signals."""

    collisions = []
    for urlid in sorted(shared_ids):
        fields = identity_collision_fields(previous_map[urlid], current_map[urlid])
        if len(fields) >= 2:
            collisions.append({"urlid": urlid, "changed_identity_fields": fields})
    return collisions


def fingerprint_id_changes(
    previous_index: list[dict[str, Any]],
    current_index: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Find stable-looking fingerprints assigned to different urlid values."""

    previous: dict[str, set[str]] = defaultdict(set)
    current: dict[str, set[str]] = defaultdict(set)
    for record in previous_index:
        if record.get("comparison_fingerprint") and record.get("urlid") is not None:
            previous[str(record["comparison_fingerprint"])].add(str(record["urlid"]))
    for record in current_index:
        if record.get("comparison_fingerprint") and record.get("urlid") is not None:
            current[str(record["comparison_fingerprint"])].add(str(record["urlid"]))
    changes = []
    for fingerprint in sorted(previous.keys() & current.keys()):
        if previous[fingerprint] != current[fingerprint]:
            changes.append(
                {
                    "comparison_fingerprint": fingerprint,
                    "previous_urlids": sorted(previous[fingerprint]),
                    "current_urlids": sorted(current[fingerprint]),
                }
            )
    return changes


def comparison_age_hours(previous: dict[str, Any], current: dict[str, Any]) -> float:
    """Calculate snapshot spacing from metadata timestamps."""

    try:
        earlier = datetime.fromisoformat(previous["metadata"]["observed_at"])
        later = datetime.fromisoformat(current["metadata"]["observed_at"])
    except (TypeError, ValueError) as error:
        raise SnapshotFormatError("Snapshot observed_at must be an ISO timestamp") from error
    return round((later - earlier).total_seconds() / 3600, 2)


def classify_stability(
    *,
    previous: dict[str, Any] | None,
    current: dict[str, Any],
    age_hours: float | None,
    shared_count: int | None,
    previous_duplicates: dict[str, int],
    current_duplicates: dict[str, int],
    collisions: list[dict[str, Any]],
    fingerprint_changes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Classify point-in-time identifier evidence conservatively."""

    reasons: list[str] = []
    if previous is None:
        return {
            "status": "insufficient_evidence",
            "reasons": ["No earlier full formal snapshot is available."],
            "caveat": "One snapshot cannot establish identifier stability.",
        }
    if previous["metadata"]["source_sha256"] == current["metadata"]["source_sha256"]:
        reasons.append("The bulk source checksum is unchanged.")
    if age_hours is not None and age_hours < MIN_COMPARISON_AGE_HOURS:
        reasons.append(
            f"Snapshots are only {age_hours:g} hours apart; "
            f"at least {MIN_COMPARISON_AGE_HOURS} hours is required."
        )
    if reasons:
        return {
            "status": "insufficient_evidence",
            "reasons": reasons,
            "caveat": "A later changed snapshot is required before judging stability.",
        }
    if previous_duplicates or current_duplicates:
        return {
            "status": "unstable",
            "reasons": ["Duplicate urlid values exist inside a snapshot."],
            "caveat": "This is point-in-time evidence, not a long-term guarantee.",
        }
    if collisions:
        return {
            "status": "unstable",
            "reasons": ["Shared urlid values map to substantially different identity fields."],
            "caveat": "This is point-in-time evidence, not a long-term guarantee.",
        }
    if shared_count is not None and shared_count == 0:
        return {
            "status": "unstable",
            "reasons": ["No urlid values were retained between non-empty snapshots."],
            "caveat": "This is point-in-time evidence, not a long-term guarantee.",
        }
    if fingerprint_changes:
        return {
            "status": "mostly_stable" if len(fingerprint_changes) <= 2 else "unstable",
            "reasons": [
                f"{len(fingerprint_changes)} stable-looking fingerprints changed urlid."
            ],
            "caveat": "This is point-in-time evidence, not a long-term guarantee.",
        }
    return {
        "status": "stable",
        "reasons": ["No duplicate IDs, identity collisions, or fingerprint ID changes were found."],
        "caveat": "This is one comparison only and does not prove long-term stability.",
    }


def no_baseline_result(current: dict[str, Any]) -> dict[str, Any]:
    """Build an explicit one-snapshot result without fabricated comparisons."""

    current_duplicates = duplicate_urlids(current["index"])
    stability = classify_stability(
        previous=None,
        current=current,
        age_hours=None,
        shared_count=None,
        previous_duplicates={},
        current_duplicates=current_duplicates,
        collisions=[],
        fingerprint_changes=[],
    )
    return {
        "current_snapshot": current["metadata"],
        "previous_snapshot": None,
        "comparison_age_hours": None,
        "shared_urlids": None,
        "new_urlids": None,
        "disappeared_urlids": None,
        "duplicate_urlids": {"previous": {}, "current": current_duplicates},
        "identity_collisions": [],
        "fingerprint_urlid_changes": [],
        "listing_changes": {
            "changed_records": None,
            "by_field": {field: None for field in CHANGE_FIELDS},
            "records": [],
        },
        "stability": stability,
    }


def compare_pair(previous: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """Compare two validated snapshots without mutating either one."""

    previous_map = unique_id_map(previous["index"])
    current_map = unique_id_map(current["index"])
    previous_ids = set(previous_map)
    current_ids = set(current_map)
    shared_ids = previous_ids & current_ids
    new_ids = current_ids - previous_ids
    disappeared_ids = previous_ids - current_ids
    previous_duplicates = duplicate_urlids(previous["index"])
    current_duplicates = duplicate_urlids(current["index"])
    collisions = identity_collisions(shared_ids, previous_map, current_map)
    fingerprint_changes = fingerprint_id_changes(previous["index"], current["index"])

    change_records = []
    field_counts = Counter()
    for urlid in sorted(shared_ids):
        changes = changed_fields(previous_map[urlid], current_map[urlid])
        if changes:
            change_records.append({"urlid": urlid, "changes": changes})
            field_counts.update(changes.keys())
    age_hours = comparison_age_hours(previous, current)
    stability = classify_stability(
        previous=previous,
        current=current,
        age_hours=age_hours,
        shared_count=len(shared_ids),
        previous_duplicates=previous_duplicates,
        current_duplicates=current_duplicates,
        collisions=collisions,
        fingerprint_changes=fingerprint_changes,
    )
    return {
        "current_snapshot": current["metadata"],
        "previous_snapshot": previous["metadata"],
        "comparison_age_hours": age_hours,
        "shared_urlids": len(shared_ids),
        "new_urlids": len(new_ids),
        "disappeared_urlids": len(disappeared_ids),
        "duplicate_urlids": {
            "previous": previous_duplicates,
            "current": current_duplicates,
        },
        "identity_collisions": collisions,
        "fingerprint_urlid_changes": fingerprint_changes,
        "listing_changes": {
            "changed_records": len(change_records),
            "by_field": {field: field_counts.get(field, 0) for field in CHANGE_FIELDS},
            "records": change_records,
        },
        "stability": stability,
    }


def build_health(result: dict[str, Any]) -> dict[str, Any]:
    """Create the compact UI-facing snapshot health summary."""

    current_duplicates = result["duplicate_urlids"]["current"]
    return {
        "current_snapshot_id": result["current_snapshot"]["snapshot_id"],
        "current_snapshot_date": result["current_snapshot"]["observed_at"],
        "current_record_count": result["current_snapshot"]["record_count"],
        "previous_snapshot_id": (
            result["previous_snapshot"]["snapshot_id"] if result["previous_snapshot"] else None
        ),
        "previous_snapshot_date": (
            result["previous_snapshot"]["observed_at"] if result["previous_snapshot"] else None
        ),
        "shared_ids": result["shared_urlids"],
        "new_listings": result["new_urlids"],
        "disappeared_listings": result["disappeared_urlids"],
        "changed_prices": result["listing_changes"]["by_field"]["price"],
        "duplicate_ids": sum(count - 1 for count in current_duplicates.values()),
        "identity_collisions": len(result["identity_collisions"]),
        "identifier_stability_status": result["stability"]["status"],
        "stability_reasons": result["stability"]["reasons"],
    }


def compare_latest_snapshots() -> dict[str, Any]:
    """Compare the newest two snapshots and persist detailed and UI summaries."""

    snapshots = find_snapshots()
    if not snapshots:
        raise SnapshotFormatError("No formal snapshots are available")
    current = snapshots[-1]
    result = no_baseline_result(current) if len(snapshots) == 1 else compare_pair(
        snapshots[-2], current
    )
    write_json(current["directory"] / "comparison.json", result)
    write_json(HEALTH_PATH, build_health(result))
    return result


def parse_args() -> argparse.Namespace:
    """Parse the comparison CLI."""

    parser = argparse.ArgumentParser(description=__doc__)
    return parser.parse_args()


def main() -> None:
    """CLI entrypoint."""

    parse_args()
    result = compare_latest_snapshots()
    print(
        f"{result['stability']['status']}: "
        f"{result['current_snapshot']['snapshot_id']} compared with "
        f"{result['previous_snapshot']['snapshot_id'] if result['previous_snapshot'] else 'none'}"
    )


if __name__ == "__main__":
    main()
