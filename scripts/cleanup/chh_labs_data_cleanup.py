"""CHH Labs data cleanup: dry-run counts, full payload export, and gated delete.

Safety:
- Target Labs project only: csaefdkpwukshtouyixg
- Default mode is dry-run (non-destructive)
- --export writes complete row payloads + verified manifest
- Destructive delete requires --execute and --confirm DELETE_CHH_LABS_DATA
- --execute verifies the existing rollback export before deleting

Usage:
  python scripts/cleanup/chh_labs_data_cleanup.py
  python scripts/cleanup/chh_labs_data_cleanup.py --export
  python scripts/cleanup/chh_labs_data_cleanup.py --execute --confirm DELETE_CHH_LABS_DATA
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
CONFIRM_TOKEN = "DELETE_CHH_LABS_DATA"
PAGE_SIZE = 500
IN_CHUNK = 80
DELETE_CHUNK = 80
MAX_RETRIES = 5
RETRY_SLEEP_SECONDS = 2.0

VERIFIED_EXPORT_DIR = Path("data/processed/chh_cleanup_export/payloads_20260716T165840Z")
EXPECTED_MANIFEST_SHA256 = "63913ece20570a016d8d212f756c3a89ea5186848d8c1aafe77ec7a3cd65a792"
VERIFIED_CHH_SOURCE_ID = "0998e571-ac7b-4941-a50d-4a9326c3d850"

# Dependency-safe deletion order (children before parents).
DELETION_ORDER = (
    "contract_market_assessments",
    "signal_evidence",
    "listing_activity_events",
    "listing_enrichment_observations",
    "listing_field_conflicts",
    "price_observations",
    "listing_observations",
    "ingestion_quarantine",
    "property_listings",
    "market_signals",
    "property_sources",
)

EXPECTED_COUNTS = {
    "property_sources": 1,
    "property_listings": 1549,
    "listing_observations": 2873,
    "price_observations": 2683,
    "listing_enrichment_observations": 38,
    "listing_field_conflicts": 8,
    "listing_activity_events": 0,
    "signal_evidence": 238,
    "ingestion_quarantine": 7,
    "market_signals": 102,
    "contract_market_assessments": 1,
    "property_assets_linked": 0,
}

# Offline fallback from last verified Labs inspection (used without credentials).
OFFLINE_COUNTS = dict(EXPECTED_COUNTS)

APPROVED_SOURCE_KEYS = (
    "keller_williams_curacao",
    "sothebys_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)


def _require_labs(settings_project_ref: str, supabase_url: str | None) -> None:
    if settings_project_ref != LABS_PROJECT_REF:
        raise SystemExit(
            f"Refusing non-Labs project ref {settings_project_ref!r}; expected {LABS_PROJECT_REF}"
        )
    if supabase_url and LABS_PROJECT_REF not in supabase_url:
        raise SystemExit(f"Refusing non-Labs SUPABASE_URL: {supabase_url}")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _execute_with_retry(query: Any) -> Any:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return query.execute()
        except Exception as error:  # noqa: BLE001 - retry transient gateway failures
            last_error = error
            message = str(error).lower()
            transient = any(
                token in message
                for token in ("520", "522", "524", "timeout", "json could not be generated")
            )
            if not transient or attempt >= MAX_RETRIES - 1:
                raise
            time.sleep(RETRY_SLEEP_SECONDS * (attempt + 1))
    raise RuntimeError(str(last_error))


def _paginate(client: Any, table: str, select: str, **filters: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        query = client.table(table).select(select)
        for key, value in filters.items():
            if key == "in_":
                column, values = value
                if not values:
                    return []
                query = query.in_(column, values)
            elif key == "eq_":
                column, expected = value
                query = query.eq(column, expected)
            else:
                raise ValueError(f"Unknown filter {key}")
        page = _execute_with_retry(query.range(start, start + PAGE_SIZE - 1)).data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def _paginate_in_chunks(
    client: Any,
    table: str,
    select: str,
    column: str,
    values: list[str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for i in range(0, len(values), IN_CHUNK):
        chunk = values[i : i + IN_CHUNK]
        rows.extend(_paginate(client, table, select, in_=(column, chunk)))
    return rows


def resolve_chh_source_ids(client: Any) -> list[dict[str, Any]]:
    return (
        client.table("property_sources")
        .select("id,name,base_url,source_key,enabled,adapter_status")
        .or_(
            "source_key.eq.caribbeanhousehunt_com,"
            "source_key.eq.caribbeanhousehunt,"
            "name.ilike.%CaribbeanHouseHunt%,"
            "base_url.ilike.%caribbeanhousehunt%"
        )
        .execute()
        .data
        or []
    )


def gather_scope(client: Any) -> dict[str, Any]:
    """Identify CHH-derived row IDs and counts deterministically."""

    sources = resolve_chh_source_ids(client)
    source_ids = [str(row["id"]) for row in sources]
    scope: dict[str, Any] = {
        "sources": sources,
        "source_ids": source_ids,
        "ids": {},
        "counts": {"property_sources": len(sources)},
        "notes": [],
    }
    if not source_ids:
        for name in DELETION_ORDER:
            scope["counts"].setdefault(name, 0)
            scope["ids"].setdefault(name, [])
        scope["counts"]["property_assets_linked"] = 0
        scope["ids"]["property_assets_linked"] = []
        return scope

    listings = _paginate(
        client,
        "property_listings",
        "id,property_source_id,property_asset_id",
        in_=("property_source_id", source_ids),
    )
    listing_ids = [str(row["id"]) for row in listings]
    scope["ids"]["property_listings"] = listing_ids
    scope["counts"]["property_listings"] = len(listing_ids)

    linked_assets = sorted(
        {str(row["property_asset_id"]) for row in listings if row.get("property_asset_id")}
    )
    scope["ids"]["property_assets_linked"] = linked_assets
    scope["counts"]["property_assets_linked"] = len(linked_assets)
    if linked_assets:
        scope["notes"].append(
            "Linked property_assets exist; export them but do not auto-delete "
            "without confirming no non-CHH listings share the asset."
        )

    def by_listing(table: str) -> list[str]:
        if not listing_ids:
            return []
        rows = _paginate_in_chunks(client, table, "id", "property_listing_id", listing_ids)
        return [str(row["id"]) for row in rows]

    for table in (
        "listing_observations",
        "price_observations",
        "listing_enrichment_observations",
        "listing_field_conflicts",
        "listing_activity_events",
        "signal_evidence",
    ):
        try:
            ids = by_listing(table)
        except Exception as error:  # noqa: BLE001
            scope["notes"].append(f"{table}: {error}")
            ids = []
        scope["ids"][table] = ids
        scope["counts"][table] = len(ids)

    quarantine = _paginate(
        client,
        "ingestion_quarantine",
        "id",
        in_=("property_source_id", source_ids),
    )
    scope["ids"]["ingestion_quarantine"] = [str(row["id"]) for row in quarantine]
    scope["counts"]["ingestion_quarantine"] = len(quarantine)

    # Market signals: exclusively CHH-evidenced when every evidence row is CHH.
    signal_ids = (
        sorted(
            {
                str(row["market_signal_id"])
                for row in _paginate_in_chunks(
                    client,
                    "signal_evidence",
                    "id,market_signal_id,property_listing_id",
                    "property_listing_id",
                    listing_ids,
                )
                if row.get("market_signal_id")
            }
        )
        if listing_ids
        else []
    )
    non_chh_evidence = 0
    if signal_ids:
        evidence = _paginate_in_chunks(
            client,
            "signal_evidence",
            "id,market_signal_id,property_listing_id",
            "market_signal_id",
            signal_ids,
        )
        listing_id_set = set(listing_ids)
        for row in evidence:
            if str(row.get("property_listing_id")) not in listing_id_set:
                non_chh_evidence += 1
    if non_chh_evidence:
        scope["notes"].append(
            f"Blocked auto-delete of market_signals: {non_chh_evidence} "
            "evidence rows reference non-CHH listings."
        )
        scope["ids"]["market_signals"] = []
        scope["counts"]["market_signals"] = 0
    else:
        scope["ids"]["market_signals"] = signal_ids
        scope["counts"]["market_signals"] = len(signal_ids)

    assessment_ids: list[str] = []
    if scope["ids"]["market_signals"]:
        rows = _paginate_in_chunks(
            client,
            "contract_market_assessments",
            "id",
            "market_signal_id",
            scope["ids"]["market_signals"],
        )
        assessment_ids = [str(row["id"]) for row in rows]
    scope["ids"]["contract_market_assessments"] = assessment_ids
    scope["counts"]["contract_market_assessments"] = len(assessment_ids)
    scope["ids"]["property_sources"] = source_ids
    return scope


def gather_counts(client: Any) -> dict[str, int]:
    return gather_scope(client)["counts"]


def verify_existing_export(export_dir: Path) -> dict[str, Any]:
    """Validate the verified rollback export without modifying it."""

    if not export_dir.is_dir():
        raise SystemExit(f"Verified export directory missing: {export_dir}")

    manifest_path = export_dir / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"manifest.json missing in {export_dir}")

    manifest_text = manifest_path.read_text(encoding="utf-8")
    manifest_sha = hashlib.sha256(manifest_text.encode("utf-8")).hexdigest()
    if manifest_sha != EXPECTED_MANIFEST_SHA256:
        raise SystemExit(
            f"Manifest SHA-256 mismatch: got {manifest_sha}, expected {EXPECTED_MANIFEST_SHA256}"
        )

    recorded_sha_path = export_dir / "manifest.sha256"
    if recorded_sha_path.is_file():
        recorded = recorded_sha_path.read_text(encoding="utf-8").split()[0]
        if recorded != manifest_sha:
            raise SystemExit("manifest.sha256 does not match manifest.json")

    manifest = json.loads(manifest_text)
    if manifest.get("project_ref") != LABS_PROJECT_REF:
        raise SystemExit(f"Export project_ref mismatch: {manifest.get('project_ref')}")

    source_ids = [str(item) for item in manifest.get("source_ids", [])]
    if source_ids != [VERIFIED_CHH_SOURCE_ID]:
        raise SystemExit(f"Export source_ids mismatch: {source_ids}")

    for key, expected in EXPECTED_COUNTS.items():
        actual = manifest.get("counts", {}).get(key)
        if actual != expected:
            raise SystemExit(f"Export count mismatch for {key}: {actual} != {expected}")

    files_meta = manifest.get("files") or []
    verified_files: list[dict[str, Any]] = []
    for item in files_meta:
        path = export_dir / item["file"]
        if not path.is_file():
            raise SystemExit(f"Missing export file: {path}")
        digest = _sha256_file(path)
        if digest != item["sha256"]:
            raise SystemExit(f"Checksum mismatch for {item['file']}: {digest}")
        parsed = 0
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                json.loads(line)
                parsed += 1
        if parsed != int(item["row_count"]):
            raise SystemExit(
                f"Row count mismatch for {item['file']}: parsed {parsed} "
                f"!= declared {item['row_count']}"
            )
        verified_files.append({"file": item["file"], "row_count": parsed, "sha256": digest})

    # Original export recorded verification on the CLI result, not inside the
    # immutable manifest. Treat checksum + parse success as export_verified.
    return {
        "export_dir": str(export_dir),
        "project_ref": LABS_PROJECT_REF,
        "manifest_sha256": manifest_sha,
        "export_verified": True,
        "source_ids": source_ids,
        "counts": dict(manifest["counts"]),
        "files": verified_files,
    }


def assert_counts_match_expected(counts: dict[str, int], *, label: str) -> None:
    mismatches = {
        key: {"actual": counts.get(key), "expected": expected}
        for key, expected in EXPECTED_COUNTS.items()
        if counts.get(key) != expected
    }
    if mismatches:
        raise SystemExit(f"{label} count mismatch vs verified export: {mismatches}")


def _delete_ids(client: Any, table: str, ids: list[str]) -> int:
    """Delete only the provided primary keys. Returns deleted row count."""

    if not ids:
        print(f"[delete] {table}: 0 (nothing in scope)")
        return 0

    unique_ids = sorted(set(ids))

    # Immutable observation tables require a service-role SQL helper.
    if table in {"price_observations", "listing_observations"}:
        return _delete_immutable_observations(client, table, unique_ids)

    deleted = 0
    for i in range(0, len(unique_ids), DELETE_CHUNK):
        chunk = unique_ids[i : i + DELETE_CHUNK]
        before = _paginate(client, table, "id", in_=("id", chunk))
        if not before:
            continue
        response = _execute_with_retry(client.table(table).delete().in_("id", chunk))
        remaining = _paginate(client, table, "id", in_=("id", chunk))
        if remaining:
            raise SystemExit(
                f"Delete failed for {table}: {len(remaining)} of {len(chunk)} "
                f"ids still present after delete"
            )
        batch_deleted = len(before)
        deleted += batch_deleted
        print(
            f"[delete] {table}: batch {i // DELETE_CHUNK + 1} "
            f"deleted {batch_deleted} (response_rows={len(response.data or [])})"
        )

    leftover = _paginate_in_chunks(client, table, "id", "id", unique_ids)
    if leftover:
        raise SystemExit(f"Integrity failure: {len(leftover)} {table} rows remain after delete")
    print(f"[delete] {table}: total deleted {deleted} (expected {len(unique_ids)})")
    if deleted != len(unique_ids):
        raise SystemExit(
            f"Deleted count mismatch for {table}: deleted {deleted}, scoped {len(unique_ids)}"
        )
    return deleted


def _delete_immutable_observations(client: Any, table: str, ids: list[str]) -> int:
    """Delete immutable observation rows via service-role SQL helper."""

    before = _paginate_in_chunks(client, table, "id", "id", ids)
    if len(before) != len(ids):
        raise SystemExit(f"Scope drift for {table}: found {len(before)} rows, scoped {len(ids)}")

    # Chunk RPC payloads to keep request size bounded.
    deleted = 0
    for i in range(0, len(ids), DELETE_CHUNK):
        chunk = ids[i : i + DELETE_CHUNK]
        if table == "listing_observations":
            payload = {
                "p_listing_observation_ids": chunk,
                "p_price_observation_ids": [],
            }
            key = "listing_observations_deleted"
        else:
            payload = {
                "p_listing_observation_ids": [],
                "p_price_observation_ids": chunk,
            }
            key = "price_observations_deleted"
        response = _execute_with_retry(
            client.rpc("labs_delete_immutable_observation_rows", payload)
        )
        data = response.data
        if isinstance(data, list):
            data = data[0] if data else {}
        if not isinstance(data, dict):
            try:
                data = json.loads(data)
            except (TypeError, json.JSONDecodeError) as error:
                raise SystemExit(f"Unexpected RPC response for {table}: {data!r}") from error
        batch_deleted = int(data.get(key, 0))
        deleted += batch_deleted
        print(f"[delete] {table}: RPC batch {i // DELETE_CHUNK + 1} deleted {batch_deleted}")

    leftover = _paginate_in_chunks(client, table, "id", "id", ids)
    if leftover:
        raise SystemExit(f"Integrity failure: {len(leftover)} {table} rows remain after RPC delete")
    print(f"[delete] {table}: total deleted {deleted} (expected {len(ids)})")
    if deleted != len(ids):
        raise SystemExit(
            f"Deleted count mismatch for {table}: deleted {deleted}, scoped {len(ids)}"
        )
    return deleted


def execute_cleanup(client: Any, scope: dict[str, Any]) -> dict[str, int]:
    """Delete scoped CHH-derived rows in dependency-safe order."""

    if scope["notes"]:
        raise SystemExit(f"Refusing execute with scope notes: {scope['notes']}")

    source_ids = scope["source_ids"]
    if source_ids != [VERIFIED_CHH_SOURCE_ID]:
        raise SystemExit(
            f"Refusing execute: live CHH source ids {source_ids} "
            f"!= verified {VERIFIED_CHH_SOURCE_ID}"
        )

    # Never delete approved direct sources.
    approved = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(APPROVED_SOURCE_KEYS))
        .execute()
        .data
        or []
    )
    approved_ids = {str(row["id"]) for row in approved}
    if approved_ids & set(source_ids):
        raise SystemExit("Refusing execute: CHH source id overlaps approved sources")
    if len(approved) != 5:
        raise SystemExit(f"Refusing execute: expected 5 approved sources, found {len(approved)}")

    if scope["counts"].get("property_assets_linked", 0) != 0:
        raise SystemExit("Refusing execute: linked property_assets are in scope")

    assets_before = _execute_with_retry(client.table("property_assets").select("id")).data or []
    assets_before_count = len(assets_before)

    deleted: dict[str, int] = {}
    print("Starting CHH Labs deletion against", LABS_PROJECT_REF)
    print("Affected counts:", json.dumps(scope["counts"], sort_keys=True))

    for table in DELETION_ORDER:
        ids = scope["ids"].get(table, [])
        deleted[table] = _delete_ids(client, table, ids)

    # Post-delete scoped counts must be zero.
    after = gather_scope(client)
    if any(after["counts"].get(table, 0) for table in DELETION_ORDER):
        raise SystemExit(f"Post-delete CHH scope not empty: {after['counts']}")

    assets_after = _execute_with_retry(client.table("property_assets").select("id")).data or []
    if len(assets_after) != assets_before_count:
        raise SystemExit(
            f"property_assets count changed: before {assets_before_count}, "
            f"after {len(assets_after)}"
        )

    approved_after = (
        client.table("property_sources")
        .select("id,source_key,enabled,adapter_status")
        .in_("source_key", list(APPROVED_SOURCE_KEYS))
        .execute()
        .data
        or []
    )
    if len(approved_after) != 5:
        raise SystemExit("Approved direct sources missing after delete")

    print("[delete] complete; property_assets unchanged:", assets_before_count)
    return deleted


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, default=str, ensure_ascii=False) + "\n")
    parsed = 0
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            json.loads(line)
            parsed += 1
    if parsed != len(rows):
        raise RuntimeError(f"Parse verification failed for {path}: {parsed} != {len(rows)}")
    checksum = _sha256_file(path)
    return {
        "file": path.name,
        "path": str(path),
        "row_count": len(rows),
        "sha256": checksum,
    }


def export_payloads(client: Any, export_dir: Path, scope: dict[str, Any]) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir = export_dir / f"payloads_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    files: list[dict[str, Any]] = []
    sources = scope["sources"]
    files.append(_write_jsonl(run_dir / "property_sources.jsonl", sources))

    source_ids = scope["source_ids"]
    listing_ids = scope["ids"].get("property_listings", [])

    if listing_ids:
        listing_rows = _paginate_in_chunks(client, "property_listings", "*", "id", listing_ids)
        files.append(_write_jsonl(run_dir / "property_listings.jsonl", listing_rows))
    else:
        files.append(_write_jsonl(run_dir / "property_listings.jsonl", []))

    for table in (
        "listing_observations",
        "price_observations",
        "listing_enrichment_observations",
        "listing_field_conflicts",
        "listing_activity_events",
        "signal_evidence",
    ):
        ids = scope["ids"].get(table, [])
        rows = _paginate_in_chunks(client, table, "*", "id", ids) if ids else []
        files.append(_write_jsonl(run_dir / f"{table}.jsonl", rows))

    quarantine_ids = scope["ids"].get("ingestion_quarantine", [])
    quarantine_rows = (
        _paginate_in_chunks(client, "ingestion_quarantine", "*", "id", quarantine_ids)
        if quarantine_ids
        else []
    )
    files.append(_write_jsonl(run_dir / "ingestion_quarantine.jsonl", quarantine_rows))

    signal_ids = scope["ids"].get("market_signals", [])
    signal_rows = (
        _paginate_in_chunks(client, "market_signals", "*", "id", signal_ids) if signal_ids else []
    )
    files.append(_write_jsonl(run_dir / "market_signals.jsonl", signal_rows))

    assessment_ids = scope["ids"].get("contract_market_assessments", [])
    assessment_rows = (
        _paginate_in_chunks(client, "contract_market_assessments", "*", "id", assessment_ids)
        if assessment_ids
        else []
    )
    files.append(_write_jsonl(run_dir / "contract_market_assessments.jsonl", assessment_rows))

    asset_ids = scope["ids"].get("property_assets_linked", [])
    asset_rows = (
        _paginate_in_chunks(client, "property_assets", "*", "id", asset_ids) if asset_ids else []
    )
    files.append(_write_jsonl(run_dir / "property_assets_linked.jsonl", asset_rows))

    fresh = gather_scope(client)
    mismatches = {
        key: {"export": scope["counts"].get(key), "fresh": fresh["counts"].get(key)}
        for key in sorted(set(scope["counts"]) | set(fresh["counts"]))
        if scope["counts"].get(key) != fresh["counts"].get(key)
    }
    if mismatches:
        raise SystemExit(f"Export aborted: count mismatch vs fresh dry-run: {mismatches}")

    file_checksums = {item["file"]: item["sha256"] for item in files}
    manifest_body = {
        "project_ref": LABS_PROJECT_REF,
        "exported_at": datetime.now(UTC).isoformat(),
        "mode": "full_payload_export",
        "deletion_order": list(DELETION_ORDER),
        "counts": scope["counts"],
        "notes": scope["notes"],
        "files": files,
        "source_ids": source_ids,
    }
    manifest_path = run_dir / "manifest.json"
    manifest_text = json.dumps(manifest_body, indent=2, sort_keys=True) + "\n"
    manifest_path.write_text(manifest_text, encoding="utf-8")
    manifest_sha = hashlib.sha256(manifest_text.encode("utf-8")).hexdigest()
    (run_dir / "manifest.sha256").write_text(
        f"{manifest_sha}  manifest.json\n",
        encoding="utf-8",
    )
    (run_dir / "files.sha256").write_text(
        "".join(f"{sha}  {name}\n" for name, sha in sorted(file_checksums.items())),
        encoding="utf-8",
    )
    json.loads(manifest_path.read_text(encoding="utf-8"))
    return manifest_path


def write_plan_only(
    export_dir: Path,
    counts: dict[str, int],
    *,
    offline: bool = False,
) -> Path:
    export_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    payload = {
        "project_ref": LABS_PROJECT_REF,
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "dry_run",
        "offline": offline,
        "deletion_order": list(DELETION_ORDER),
        "counts": counts,
    }
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    path = export_dir / f"chh_cleanup_plan_{stamp}.json"
    path.write_text(text, encoding="utf-8")
    checksum = hashlib.sha256(text.encode("utf-8")).hexdigest()
    (export_dir / f"chh_cleanup_plan_{stamp}.sha256").write_text(
        f"{checksum}  {path.name}\n",
        encoding="utf-8",
    )
    return path


def write_deletion_report(
    export_dir: Path,
    *,
    before_counts: dict[str, int],
    deleted: dict[str, int],
    after_counts: dict[str, int],
) -> Path:
    export_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    payload = {
        "project_ref": LABS_PROJECT_REF,
        "deleted_at": datetime.now(UTC).isoformat(),
        "mode": "execute",
        "verified_export_dir": str(VERIFIED_EXPORT_DIR),
        "manifest_sha256": EXPECTED_MANIFEST_SHA256,
        "deletion_order": list(DELETION_ORDER),
        "before_counts": before_counts,
        "deleted": deleted,
        "after_counts": after_counts,
    }
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    path = export_dir / f"chh_cleanup_delete_report_{stamp}.json"
    path.write_text(text, encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--export-dir",
        type=Path,
        default=Path("data/processed/chh_cleanup_export"),
    )
    parser.add_argument(
        "--verified-export-dir",
        type=Path,
        default=VERIFIED_EXPORT_DIR,
        help="Existing verified rollback export (never overwritten)",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Write complete CHH row payloads + verified manifesto",
    )
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()

    settings = get_settings()
    _require_labs(
        settings.supabase_project_ref,
        str(settings.supabase_url) if settings.supabase_url else None,
    )

    if settings.supabase_url is None or settings.supabase_secret_key is None:
        path = write_plan_only(args.export_dir, OFFLINE_COUNTS, offline=True)
        print(json.dumps({"counts": OFFLINE_COUNTS, "plan": str(path)}, indent=2))
        print("Deletion order:", " -> ".join(DELETION_ORDER))
        if args.export or args.execute:
            raise SystemExit("Refusing --export/--execute without Labs credentials")
        return 0

    try:
        from supabase import create_client
    except ImportError:
        path = write_plan_only(args.export_dir, OFFLINE_COUNTS, offline=True)
        print(json.dumps({"counts": OFFLINE_COUNTS, "plan": str(path)}, indent=2))
        if args.export or args.execute:
            raise SystemExit("Refusing --export/--execute without supabase package")
        return 0

    client = create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )
    scope = gather_scope(client)
    plan = write_plan_only(args.export_dir, scope["counts"])
    result: dict[str, Any] = {
        "counts": scope["counts"],
        "plan": str(plan),
        "notes": scope["notes"],
        "deletion_order": list(DELETION_ORDER),
        "project_ref": LABS_PROJECT_REF,
    }

    if args.export:
        # Never overwrite the verified export directory used for rollback.
        if args.export_dir.resolve() == args.verified_export_dir.resolve():
            raise SystemExit("Refusing --export into the verified rollback directory")
        if args.verified_export_dir.name in str(args.export_dir):
            # Still allow parent dir exports that create new payloads_* folders.
            pass
        manifest = export_payloads(client, args.export_dir, scope)
        if Path(manifest).resolve().parent == args.verified_export_dir.resolve():
            raise SystemExit("Refusing to overwrite verified export payloads")
        result["manifest"] = str(manifest)
        result["export_verified"] = True

    print(json.dumps(result, indent=2))
    print("Deletion order:", " -> ".join(DELETION_ORDER))

    if not args.execute:
        if not args.export:
            print("Dry-run only. Use --export for full payload rollback evidence.")
        return 0

    if args.confirm != CONFIRM_TOKEN:
        raise SystemExit(f"--execute requires --confirm {CONFIRM_TOKEN}")

    export_check = verify_existing_export(args.verified_export_dir)
    result["export_check"] = {
        "export_verified": export_check["export_verified"],
        "manifest_sha256": export_check["manifest_sha256"],
        "export_dir": export_check["export_dir"],
    }
    print("Export verification:", json.dumps(result["export_check"], indent=2))

    if not scope["source_ids"] and all(
        scope["counts"].get(table, 0) == 0 for table in DELETION_ORDER
    ):
        raise SystemExit(
            "CHH Labs scope is already empty. Nothing to delete. "
            "Verified export remains at "
            f"{args.verified_export_dir}"
        )

    assert_counts_match_expected(scope["counts"], label="Fresh dry-run")
    assert_counts_match_expected(export_check["counts"], label="Verified export")

    before_counts = dict(scope["counts"])
    deleted = execute_cleanup(client, scope)
    after_scope = gather_scope(client)
    report = write_deletion_report(
        args.export_dir,
        before_counts=before_counts,
        deleted=deleted,
        after_counts=after_scope["counts"],
    )
    summary = {
        "project_ref": LABS_PROJECT_REF,
        "deleted": deleted,
        "before_counts": before_counts,
        "after_counts": after_scope["counts"],
        "report": str(report),
        "export_verified": True,
        "manifest_sha256": EXPECTED_MANIFEST_SHA256,
    }
    print(json.dumps(summary, indent=2))
    print("CHH Labs cleanup executed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
