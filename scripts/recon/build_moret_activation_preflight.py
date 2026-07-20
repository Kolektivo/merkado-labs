"""Phase 1 Moret activation preflight (read-only; no writes; no OpenAI)."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    EXPECTED_INSERTS,
    EXPECTED_LISTING_COUNT,
    EXPECTED_UPDATES,
    LABS_PROJECT_REF,
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_moret_rows,
    load_moret_catalog,
    reconcile_moret_catalog,
)

OUT = ROOT / "data/processed/moret_activation_preflight.json"
CATALOG = ROOT / "data/processed/moret_complete_catalog.json"
CANARY_IDS = (
    "post-75682",
    "post-75725",
    "post-74976",
    "post-75799",
    "post-74710",
)


def _git() -> dict[str, Any]:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    status = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )
    return {
        "head": head,
        "expected_main": "62b622c2f82658bc6dbaba5430169b928e23109a",
        "head_matches_expected": head == "62b622c2f82658bc6dbaba5430169b928e23109a",
        "dirty": bool(status.strip()),
        "intentional_working_tree_preserved": True,
    }


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    listings = load_existing_moret_rows(client)
    catalog = load_moret_catalog(CATALOG)
    preview = reconcile_moret_catalog(
        catalog=catalog,
        existing_rows=listings,
        project_ref=ref,
    )

    pipeline_active = (
        client.table("property_pipeline_runs")
        .select("id,status")
        .in_("status", ["queued", "running", "stopping"])
        .execute()
        .data
        or []
    )
    ai_active = (
        client.table("ai_enrichment_jobs")
        .select("id,status,property_source_id")
        .in_("status", ["queued", "running", "pending"])
        .execute()
        .data
        or []
    )
    moret_ai_active = [
        row
        for row in ai_active
        if str(row.get("property_source_id")) == str(source["id"])
    ]
    complete_runs = (
        client.table("property_source_runs")
        .select("id,adapter_version,outcome,metadata,started_at")
        .eq("source_key", SOURCE_KEY)
        .order("started_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    prior_complete = [
        row
        for row in complete_runs
        if (row.get("metadata") or {}).get("complete_catalog") is True
    ]

    protected_ok = True
    protected_notes: list[str] = []
    by_cat = {item["external_id"]: item for item in catalog["listings"]}
    for row in listings:
        prop = by_cat.get(row["external_id"])
        if not prop:
            protected_ok = False
            protected_notes.append(f"{row['external_id']}: missing from catalog")
            continue
        if prop["source_url"] != row["source_url"]:
            protected_ok = False
            protected_notes.append(f"{row['external_id']}: source_url changed")
        if str(prop.get("original_currency")) != str(row.get("original_currency")):
            protected_ok = False
            protected_notes.append(f"{row['external_id']}: currency changed")

    canary_in_catalog = all(ext in by_cat for ext in CANARY_IDS)
    stop_reasons: list[str] = []
    if ref != LABS_PROJECT_REF:
        stop_reasons.append("target_not_labs")
    if catalog.get("catalog_checksum") != EXPECTED_CATALOG_CHECKSUM:
        stop_reasons.append("checksum_differs")
    if len(listings) != 5:
        stop_reasons.append(f"labs_count_not_five:{len(listings)}")
    if preview.failed:
        stop_reasons.extend(preview.failure_reasons)
    if preview.inserts != EXPECTED_INSERTS or preview.updates != EXPECTED_UPDATES:
        stop_reasons.append(
            f"import_preview_drift:insert={preview.inserts},update={preview.updates}"
        )
    if preview.proposed_missing_events or preview.proposed_removed_events:
        stop_reasons.append("missing_or_removed_proposed")
    if preview.identity_conflicts:
        stop_reasons.append("identity_conflicts")
    if prior_complete:
        stop_reasons.append("prior_complete_catalog_exists")
    if pipeline_active or moret_ai_active:
        stop_reasons.append("active_runs_present")
    if not protected_ok:
        stop_reasons.append("protected_field_drift")
    if not canary_in_catalog:
        stop_reasons.append("canary_ids_missing_from_catalog")

    attribution_ok = all(
        row.get("original_realtor_name") and row.get("original_realtor_domain")
        for row in listings
    )
    if not attribution_ok:
        stop_reasons.append("public_attribution_incomplete")

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 1,
        "git": _git(),
        "labs_project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "target_is_labs": ref == LABS_PROJECT_REF,
        "source_key": SOURCE_KEY,
        "adapter_version_artifact": catalog.get("adapter_version"),
        "catalog": {
            "path": str(CATALOG).replace("\\", "/"),
            "checksum": catalog.get("catalog_checksum"),
            "expected_checksum": EXPECTED_CATALOG_CHECKSUM,
            "checksum_match": catalog.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM,
            "complete_catalog": catalog.get("complete_catalog"),
            "outcome": catalog.get("outcome"),
            "pagination_termination_reason": catalog.get("pagination_termination_reason"),
            "listing_count": len(catalog.get("listings") or []),
            "unique_external_ids": len(
                {item["external_id"] for item in catalog.get("listings") or []}
            ),
            "index_pages": len(catalog.get("index_page_checksums") or []),
        },
        "labs_state": {
            "moret_listing_count": len(listings),
            "expected_count_before_import": 5,
            "external_ids": [row["external_id"] for row in listings],
            "prior_complete_catalog_exists": bool(prior_complete),
            "active_pipeline_runs": len(pipeline_active),
            "active_ai_jobs": len(ai_active),
            "active_moret_ai_jobs": len(moret_ai_active),
        },
        "import_preview": preview.as_dict()["summary"],
        "expected_reconciliation": {
            "inserts": EXPECTED_INSERTS,
            "updates": EXPECTED_UPDATES,
            "absent": 0,
            "listing_count": EXPECTED_LISTING_COUNT,
        },
        "protected_fields_unchanged_identity": protected_ok,
        "protected_notes": protected_notes,
        "public_attribution_complete": attribution_ok,
        "terra_canary_external_ids": list(CANARY_IDS),
        "terra_canary_count": 5,
        "terra_canary_in_catalog": canary_in_catalog,
        "stop_reasons": stop_reasons,
        "proceed": not stop_reasons,
        "notes": [
            "No live Moret scrape.",
            "No database writes in this preflight.",
            "First complete catalog will establish the baseline.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"proceed": payload["proceed"], "stop_reasons": stop_reasons}, indent=2))
    return 0 if payload["proceed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
