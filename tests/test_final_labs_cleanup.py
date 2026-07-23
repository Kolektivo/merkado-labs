from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "cleanup" / "final_labs_data_cleanup.py"
SPEC = importlib.util.spec_from_file_location("final_labs_data_cleanup", SCRIPT)
assert SPEC and SPEC.loader
cleanup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cleanup)


def test_cleanup_scope_keeps_prototype_fixtures_and_never_targets_listings() -> None:
    assert cleanup.SEARCH_REQUEST_ID == "4ec62242-3921-4aa5-be9c-97e557f32585"
    assert cleanup.ENTITLEMENT_ID == "3c6f97f7-9e30-4738-ac36-1f3a1af45067"
    assert len(cleanup.DRY_RUN_PIPELINE_IDS) == 6
    assert "property_listings" not in cleanup.EXPORT_TABLES
    assert "listing_activity_events" not in cleanup.EXPORT_TABLES
    assert "price_observations" not in cleanup.EXPORT_TABLES


def test_rollback_manifest_detects_payload_tampering(tmp_path: Path) -> None:
    payload = tmp_path / "rental_contracts.jsonl"
    payload.write_text('{"id":"approved"}\n', encoding="utf-8")
    file_sha = hashlib.sha256(payload.read_bytes()).hexdigest()
    manifest = {
        "project_ref": cleanup.LABS_PROJECT_REF,
        "files": [
            {
                "file": payload.name,
                "row_count": 1,
                "sha256": file_sha,
            }
        ],
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    (tmp_path / "manifest.sha256").write_text(
        f"{manifest_sha}  manifest.json\n", encoding="utf-8"
    )

    assert cleanup.verify_manifest(manifest_path)["project_ref"] == cleanup.LABS_PROJECT_REF

    payload.write_text('{"id":"tampered"}\n', encoding="utf-8")
    with pytest.raises(SystemExit, match="checksum mismatch"):
        cleanup.verify_manifest(manifest_path)
