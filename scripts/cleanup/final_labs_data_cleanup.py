"""Final reviewed Labs cleanup for confirmed synthetic rows only.

The default mode is a read-only classification. ``--export`` writes complete
rollback payloads and a SHA-256 manifest. Deletion is gated by the verified
manifest, an explicit confirmation token, and a fresh no-lock/no-running-run
preflight. Re-running the exact cleanup after success is a safe no-op.

This script intentionally keeps all listings, observations, immutable listing
events, source runs, evidence, enrichment proposals, and the Search / Agent /
Match Report prototype fixtures.
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
CONFIRM_TOKEN = "DELETE_APPROVED_SYNTHETIC_LABS_ROWS"
EXPORT_ROOT = Path("data/processed/final_labs_cleanup_export")
PAGE_SIZE = 500
MAX_RETRIES = 5

SEARCH_REQUEST_ID = "4ec62242-3921-4aa5-be9c-97e557f32585"
ENTITLEMENT_ID = "3c6f97f7-9e30-4738-ac36-1f3a1af45067"
RENTAL_CONTRACT_ID = "4c82647d-97b5-599d-843f-a857bfd6dde9"
PROPERTY_ASSET_ID = "2d133bab-c215-5c36-97c2-40ad92dde412"
STUCK_AI_JOB_ID = "1b5a04bf-a5ca-4cbc-835a-fb1f688b3886"
DRY_RUN_PIPELINE_IDS = (
    "c60d279a-cec7-40a2-8209-10b15cb365a7",
    "b354bdc3-f939-43f4-b538-bfaba7b27c67",
    "b8d8c2d0-980f-4d18-b76f-f1f06051c20b",
    "c98d211c-8ae0-4140-baca-deb5d9624c5f",
    "aec76079-7f74-49b6-b715-418b72451606",
    "2cb69ae7-d35e-4fcf-98d8-21557477cfe3",
)

EXPORT_TABLES = (
    "contract_market_assessments",
    "rental_contracts",
    "property_assets",
    "ai_enrichment_proposals",
    "ai_enrichment_jobs",
    "property_pipeline_source_stages",
    "property_pipeline_items",
    "property_pipeline_events",
    "property_pipeline_ai_spend",
    "property_pipeline_runs",
)


def _require_labs(project_ref: str, supabase_url: str | None) -> None:
    if project_ref != LABS_PROJECT_REF:
        raise SystemExit(
            f"Refusing non-Labs project ref {project_ref!r}; expected {LABS_PROJECT_REF}"
        )
    if not supabase_url or LABS_PROJECT_REF not in supabase_url:
        raise SystemExit("Refusing missing or non-Labs SUPABASE_URL")


def _execute_with_retry(query: Any) -> Any:
    for attempt in range(MAX_RETRIES):
        try:
            return query.execute()
        except Exception as error:  # noqa: BLE001
            transient = any(
                marker in str(error).lower()
                for marker in ("520", "522", "524", "timeout", "json could not be generated")
            )
            if not transient or attempt == MAX_RETRIES - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def _rows_by_ids(client: Any, table: str, column: str, ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    rows: list[dict[str, Any]] = []
    for start in range(0, len(ids), 80):
        chunk = ids[start : start + 80]
        offset = 0
        while True:
            page = (
                _execute_with_retry(
                    client.table(table)
                    .select("*")
                    .in_(column, chunk)
                    .range(offset, offset + PAGE_SIZE - 1)
                ).data
                or []
            )
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
    return rows


def _count(client: Any, table: str, *, column: str | None = None, value: str | None = None) -> int:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        query = client.table(table).select("*")
        if column is not None:
            query = query.eq(column, value)
        page = (
            _execute_with_retry(query.range(offset, offset + PAGE_SIZE - 1)).data
            or []
        )
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return len(rows)
        offset += PAGE_SIZE


def assert_write_preflight(client: Any) -> None:
    lock_count = _count(client, "property_pipeline_source_locks")
    active = (
        _execute_with_retry(
            client.table("property_pipeline_runs")
            .select("id")
            .in_("status", ["queued", "running", "stopping"])
        ).data
        or []
    )
    if lock_count or active:
        raise SystemExit(
            f"Refusing write: source_locks={lock_count}, active_pipeline_runs={len(active)}"
        )


def gather_scope(client: Any) -> dict[str, Any]:
    pipeline_ids = list(DRY_RUN_PIPELINE_IDS)
    payloads = {
        "rental_contracts": _rows_by_ids(
            client, "rental_contracts", "id", [RENTAL_CONTRACT_ID]
        ),
        "property_assets": _rows_by_ids(client, "property_assets", "id", [PROPERTY_ASSET_ID]),
        "ai_enrichment_jobs": _rows_by_ids(
            client, "ai_enrichment_jobs", "id", [STUCK_AI_JOB_ID]
        ),
        "ai_enrichment_proposals": _rows_by_ids(
            client, "ai_enrichment_proposals", "enrichment_job_id", [STUCK_AI_JOB_ID]
        ),
        "property_pipeline_runs": _rows_by_ids(
            client, "property_pipeline_runs", "id", pipeline_ids
        ),
        "property_pipeline_source_stages": _rows_by_ids(
            client, "property_pipeline_source_stages", "pipeline_run_id", pipeline_ids
        ),
        "property_pipeline_items": _rows_by_ids(
            client, "property_pipeline_items", "pipeline_run_id", pipeline_ids
        ),
        "property_pipeline_events": _rows_by_ids(
            client, "property_pipeline_events", "pipeline_run_id", pipeline_ids
        ),
        "property_pipeline_ai_spend": _rows_by_ids(
            client, "property_pipeline_ai_spend", "pipeline_run_id", pipeline_ids
        ),
    }
    contract_ids = [str(row["id"]) for row in payloads["rental_contracts"]]
    payloads["contract_market_assessments"] = _rows_by_ids(
        client, "contract_market_assessments", "rental_contract_id", contract_ids
    )

    keep = {
        "property_search_requests": _rows_by_ids(
            client, "property_search_requests", "id", [SEARCH_REQUEST_ID]
        ),
        "merkado_agent_entitlements": _rows_by_ids(
            client, "merkado_agent_entitlements", "id", [ENTITLEMENT_ID]
        ),
        "listing_match_reports": _rows_by_ids(
            client, "listing_match_reports", "property_search_request_id", [SEARCH_REQUEST_ID]
        ),
    }
    blockers = {
        "asset_listing_refs": _count(
            client, "property_listings", column="property_asset_id", value=PROPERTY_ASSET_ID
        ),
        "asset_contract_refs_other_than_target": len(
            [
                row
                for row in _rows_by_ids(
                    client, "rental_contracts", "property_asset_id", [PROPERTY_ASSET_ID]
                )
                if str(row["id"]) != RENTAL_CONTRACT_ID
            ]
        ),
        "stuck_job_proposals": len(payloads["ai_enrichment_proposals"]),
        "stuck_job_stage_refs": len(
            _rows_by_ids(
                client,
                "property_pipeline_source_stages",
                "enrichment_job_id",
                [STUCK_AI_JOB_ID],
            )
        ),
    }
    classifications = {
        "A_legitimate_keep": {
            "scraped_listings": _count(client, "property_listings"),
            "search_request_fixture": len(keep["property_search_requests"]),
            "agent_entitlement_fixture": len(keep["merkado_agent_entitlements"]),
            "match_report_fixtures": len(keep["listing_match_reports"]),
        },
        "B_confirmed_synthetic_delete": {
            table: len(rows) for table, rows in payloads.items()
        },
        "C_duplicate_noise_keep": {
            "listing_observations": "preserved; presentation suppression only"
        },
        "D_ambiguous_keep": {
            "source_runs_with_stale_dry_run_notes": "preserved",
            "empty_evidence_folders": "preserved integrity gaps",
        },
    }
    return {
        "project_ref": LABS_PROJECT_REF,
        "payloads": payloads,
        "keep_payloads": keep,
        "blockers": blockers,
        "classifications": classifications,
    }


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> dict[str, Any]:
    text = "".join(
        json.dumps(row, default=str, ensure_ascii=False, sort_keys=True) + "\n" for row in rows
    )
    path.write_text(text, encoding="utf-8")
    parsed = [json.loads(line) for line in text.splitlines() if line]
    if len(parsed) != len(rows):
        raise SystemExit(f"Export parse verification failed for {path}")
    return {"file": path.name, "row_count": len(rows), "sha256": _sha256(path)}


def export_scope(scope: dict[str, Any], export_root: Path) -> Path:
    run_dir = export_root / datetime.now(UTC).strftime("payloads_%Y%m%dT%H%M%SZ")
    run_dir.mkdir(parents=True, exist_ok=False)
    files = [
        _write_jsonl(run_dir / f"{table}.jsonl", scope["payloads"][table])
        for table in EXPORT_TABLES
    ]
    files.extend(
        _write_jsonl(run_dir / f"KEEP_{table}.jsonl", rows)
        for table, rows in scope["keep_payloads"].items()
    )
    manifest = {
        "project_ref": LABS_PROJECT_REF,
        "exported_at": datetime.now(UTC).isoformat(),
        "mode": "complete_rollback_payload_export",
        "approved_ids": {
            "rental_contract": RENTAL_CONTRACT_ID,
            "property_asset": PROPERTY_ASSET_ID,
            "stuck_ai_job": STUCK_AI_JOB_ID,
            "dry_run_pipeline_runs": list(DRY_RUN_PIPELINE_IDS),
        },
        "keep_ids": {
            "property_search_request": SEARCH_REQUEST_ID,
            "merkado_agent_entitlement": ENTITLEMENT_ID,
        },
        "classifications": scope["classifications"],
        "blockers": scope["blockers"],
        "files": files,
    }
    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    digest = _sha256(manifest_path)
    (run_dir / "manifest.sha256").write_text(
        f"{digest}  manifest.json\n", encoding="utf-8"
    )
    verify_manifest(manifest_path)
    return manifest_path


def verify_manifest(manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("project_ref") != LABS_PROJECT_REF:
        raise SystemExit("Rollback manifest targets the wrong project")
    recorded = (manifest_path.parent / "manifest.sha256").read_text(encoding="utf-8").split()[0]
    if recorded != _sha256(manifest_path):
        raise SystemExit("Rollback manifest SHA-256 mismatch")
    for item in manifest["files"]:
        path = manifest_path.parent / item["file"]
        if _sha256(path) != item["sha256"]:
            raise SystemExit(f"Rollback payload checksum mismatch: {path}")
        row_count = sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line)
        if row_count != item["row_count"]:
            raise SystemExit(f"Rollback payload row-count mismatch: {path}")
    return manifest


def _delete_exact(client: Any, table: str, ids: list[str]) -> int:
    rows = _rows_by_ids(client, table, "id", ids)
    if not rows:
        return 0
    _execute_with_retry(client.table(table).delete().in_("id", ids))
    remaining = _rows_by_ids(client, table, "id", ids)
    if remaining:
        raise SystemExit(f"Delete verification failed for {table}: {len(remaining)} remain")
    return len(rows)


def execute_cleanup(client: Any, scope: dict[str, Any]) -> dict[str, int]:
    blockers = scope["blockers"]
    if any(blockers.values()):
        raise SystemExit(f"Refusing cleanup because dependencies drifted: {blockers}")
    if len(scope["keep_payloads"]["property_search_requests"]) != 1:
        raise SystemExit("Required Search Request fixture is missing")
    if len(scope["keep_payloads"]["merkado_agent_entitlements"]) != 1:
        raise SystemExit("Required Agent entitlement fixture is missing")
    if len(scope["keep_payloads"]["listing_match_reports"]) != 15:
        raise SystemExit("Required 15 Match Report fixtures are missing")

    deleted: dict[str, int] = {}
    deleted["ai_enrichment_jobs"] = _delete_exact(
        client, "ai_enrichment_jobs", [STUCK_AI_JOB_ID]
    )
    deleted["rental_contracts"] = _delete_exact(
        client, "rental_contracts", [RENTAL_CONTRACT_ID]
    )
    deleted["property_assets"] = _delete_exact(
        client, "property_assets", [PROPERTY_ASSET_ID]
    )
    # Child pipeline rows are exported above, then removed by declared FK cascades.
    deleted["property_pipeline_runs"] = _delete_exact(
        client, "property_pipeline_runs", list(DRY_RUN_PIPELINE_IDS)
    )
    return deleted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", action="store_true")
    parser.add_argument("--export-root", type=Path, default=EXPORT_ROOT)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()

    settings = get_settings()
    _require_labs(
        settings.supabase_project_ref,
        str(settings.supabase_url) if settings.supabase_url else None,
    )
    if settings.supabase_secret_key is None:
        raise SystemExit("Labs service-role credentials are required")
    from supabase import create_client

    client = create_client(
        str(settings.supabase_url), settings.supabase_secret_key.get_secret_value()
    )
    scope = gather_scope(client)
    result: dict[str, Any] = {
        "project_ref": LABS_PROJECT_REF,
        "classifications": scope["classifications"],
        "blockers": scope["blockers"],
    }

    generated_manifest: Path | None = None
    if args.export:
        generated_manifest = export_scope(scope, args.export_root)
        result["manifest"] = str(generated_manifest)
        result["manifest_sha256"] = _sha256(generated_manifest)

    if args.execute:
        if args.confirm != CONFIRM_TOKEN:
            raise SystemExit(f"--execute requires --confirm {CONFIRM_TOKEN}")
        manifest_path = args.manifest or generated_manifest
        if manifest_path is None:
            raise SystemExit("--execute requires --manifest or --export in the same invocation")
        verify_manifest(manifest_path)
        assert_write_preflight(client)
        deleted = execute_cleanup(client, scope)
        after = gather_scope(client)
        result["deleted"] = deleted
        result["after_delete_counts"] = after["classifications"]["B_confirmed_synthetic_delete"]
        result["idempotent_noop"] = all(count == 0 for count in deleted.values())

    print(json.dumps(result, indent=2, default=str, ensure_ascii=False))
    if not args.export and not args.execute:
        print("Dry-run only; no rows changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
