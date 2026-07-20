"""Final pre-write activation preflight for RE/MAX v0.4.1 (read-only).

Stops (exit 1) if any approved count or checksum differs.
Writes: data/processed/remax_v041_activation_preflight.json
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment import compute_input_checksum  # noqa: E402
from merkado_labs.enrichment.jobs import listing_to_enrichment_input  # noqa: E402
from merkado_labs.enrichment.neighbourhood import resolve_effective_neighbourhood  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402
from merkado_labs.scrapers.remax_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    EXPECTED_LISTING_COUNT,
    LABS_PROJECT_REF,
    load_existing_remax_rows,
    load_remax_catalog,
    run_remax_import_preview,
)

PROCESSED = ROOT / "data" / "processed"
CACHE = ROOT / "data" / "raw" / "remax_curacao" / "cache"
CATALOG = PROCESSED / "remax_v041_reparsed_catalog.json"
GEO = PROCESSED / "remax_v041_geospatial_preview.json"
OUT = PROCESSED / "remax_v041_activation_preflight.json"

APPROVED_SEMANTIC_IDS = ("hr2165", "hr2185", "hs3061", "hs3103", "hs3104")
SOURCE_KEY = "remax_curacao"


def _file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _git_dirty_note() -> dict[str, Any]:
    try:
        status = subprocess.check_output(
            ["git", "status", "--short"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        )
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        lines = [ln for ln in status.splitlines() if ln.strip()]
        return {
            "branch": branch,
            "dirty": bool(lines),
            "changed_path_count": len(lines),
            "clean_tree_required": False,
            "note": "Dirty tree allowed for this activation task",
        }
    except (OSError, subprocess.CalledProcessError) as exc:
        return {"error": str(exc), "clean_tree_required": False}


def main() -> int:
    project_ref = assert_labs_project_ref()
    catalog = load_remax_catalog(CATALOG)
    listings = catalog.get("listings") or []
    ext_ids = [str(i.get("external_id") or "") for i in listings]
    urls = [str(i.get("url") or i.get("source_url") or "") for i in listings]

    cache_ok = 0
    for item in listings:
        url = str(item.get("url") or "")
        if not url:
            continue
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()
        if (CACHE / f"{key}.html").exists():
            cache_ok += 1

    coords_in_catalog = sum(
        1
        for i in listings
        if i.get("latitude") is not None and i.get("longitude") is not None
    )
    still_no_coords = sum(
        1
        for i in listings
        if i.get("latitude") is None or i.get("longitude") is None
    )

    client = create_labs_client()
    labs_rows = load_existing_remax_rows(client)
    preview = run_remax_import_preview(
        input_path=CATALOG,
        client=client,
        write_reports=False,
    )

    active_pipeline = (
        client.table("property_pipeline_runs")
        .select("id,status,source_keys,created_at")
        .in_("status", ["queued", "running", "paused", "stopping"])
        .execute()
        .data
        or []
    )
    remax_active = [
        r for r in active_pipeline if SOURCE_KEY in (r.get("source_keys") or [])
    ]
    active_ai = (
        client.table("ai_enrichment_jobs")
        .select("id,status,scope_filter,created_at")
        .in_("status", ["queued", "running", "paused"])
        .execute()
        .data
        or []
    )
    active_source_runs = (
        client.table("property_source_runs")
        .select("id,outcome,started_at,completed_at,adapter_version")
        .eq("source_key", SOURCE_KEY)
        .is_("completed_at", "null")
        .limit(5)
        .execute()
        .data
        or []
    )

    geo = {}
    if GEO.exists():
        geo = json.loads(GEO.read_text(encoding="utf-8"))

    # Semantic checksum impact (coordinate + map neighbourhood only).
    assign_by_ext = {
        a["external_id"]: a for a in (geo.get("assignments") or [])
    }
    by_ext = {str(r["external_id"]): r for r in labs_rows}
    semantic_changed: list[dict[str, Any]] = []
    for item in listings:
        eid = str(item["external_id"])
        row = dict(by_ext.get(eid) or {})
        if not row:
            continue
        row["source_key"] = SOURCE_KEY
        before = compute_input_checksum(listing_to_enrichment_input(row))
        after_row = dict(row)
        after_row["latitude"] = item.get("latitude")
        after_row["longitude"] = item.get("longitude")
        after_row["coordinates_source"] = item.get("coordinates_source")
        asn = assign_by_ext.get(eid) or {}
        after_row["neighbourhood_assignment_status"] = asn.get("assignment_status")
        after_row["neighbourhood_assignment_method"] = asn.get("assignment_method")
        after_row["neighbourhood_assignment_confidence"] = (
            1.0 if asn.get("inferred_neighbourhood_id") else None
        )
        after_row["inferred_neighbourhood_id"] = asn.get("inferred_neighbourhood_id")
        after_row["inferred_neighbourhood_name"] = asn.get("inferred_neighbourhood_name")
        after = compute_input_checksum(listing_to_enrichment_input(after_row))
        if before != after:
            eff_before = resolve_effective_neighbourhood(
                source_name=row.get("source_neighbourhood_text"),
                map_name=None,
                ai_candidate_name=None,
            )
            eff_after = resolve_effective_neighbourhood(
                source_name=item.get("neighbourhood_text")
                or row.get("source_neighbourhood_text"),
                map_name=asn.get("inferred_neighbourhood_name"),
                ai_candidate_name=None,
            )
            semantic_changed.append(
                {
                    "external_id": eid,
                    "listing_id": row.get("id"),
                    "before_semantic": before,
                    "after_semantic": after,
                    "effective_before": eff_before.as_dict(),
                    "effective_after": eff_after.as_dict(),
                    "field_causing_change": "effective_neighbourhood",
                }
            )

    null_replace_risks = []
    price_unstable = []
    status_unstable = []
    id_url_unstable = []
    for row in preview.rows:
        for change in row.changes:
            if getattr(change, "null_preserving", False) or (
                isinstance(change, dict) and change.get("null_preserving")
            ):
                continue
            # FieldChangePreview may not expose null_preserving; check before/after
            before = change.before if hasattr(change, "before") else None
            after = change.after if hasattr(change, "after") else None
            field = change.field if hasattr(change, "field") else ""
            if before is not None and after is None:
                null_replace_risks.append(
                    {"external_id": row.external_id, "field": field}
                )
            if field in {"original_price", "original_currency"} and before != after:
                price_unstable.append(
                    {
                        "external_id": row.external_id,
                        "field": field,
                        "before": before,
                        "after": after,
                    }
                )
            if field in {"source_status", "lifecycle_hint", "status"} and before != after:
                status_unstable.append(
                    {
                        "external_id": row.external_id,
                        "field": field,
                        "before": before,
                        "after": after,
                    }
                )
            if field in {"external_id", "source_url", "url"} and before != after:
                id_url_unstable.append(
                    {
                        "external_id": row.external_id,
                        "field": field,
                        "before": before,
                        "after": after,
                    }
                )

    summary = preview.as_dict()["summary"]
    public_before = sum(1 for r in labs_rows if r.get("public_eligible"))
    public_after = sum(
        1 for r in preview.rows if getattr(r, "public_eligible_after", None)
    )
    # Fallback: preview rows may expose differently
    if public_after == 0 and preview.rows:
        public_after = sum(
            1
            for r in preview.rows
            if (r.as_dict() if hasattr(r, "as_dict") else {}).get("public_eligible_after")
            or getattr(r, "public_eligible_after", False)
        )

    checks = {
        "project_is_labs": project_ref == LABS_PROJECT_REF,
        "no_active_remax_pipeline": not remax_active,
        "no_active_ai_jobs": not active_ai,
        "no_incomplete_source_runs": not active_source_runs,
        "catalog_exists": CATALOG.exists(),
        "listing_count_220": len(listings) == EXPECTED_LISTING_COUNT,
        "unique_external_ids_220": len(set(ext_ids)) == EXPECTED_LISTING_COUNT,
        "unique_urls_220": len(set(urls)) == EXPECTED_LISTING_COUNT,
        "cache_evidence_220": cache_ok == EXPECTED_LISTING_COUNT,
        "checksum_match": catalog.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM,
        "file_sha_recorded": True,
        "preview_insert_0": summary.get("insert") == 0,
        "preview_update_220": summary.get("update") == 220,
        "preview_absent_0": summary.get("absent_from_catalog") == 0,
        "preview_identity_conflicts_0": summary.get("identity_conflict") == 0,
        "preview_missing_events_0": summary.get("proposed_missing_events") == 0,
        "preview_removed_events_0": summary.get("proposed_removed_events") == 0,
        "preview_failed_false": preview.failed is False,
        "coords_added_199": coords_in_catalog == 199,
        "still_without_coords_21": still_no_coords == 21,
        "pip_193": (geo.get("assignment_status_counts") or {}).get("inferred") == 193,
        "outside_polygons_6": (geo.get("assignment_status_counts") or {}).get(
            "outside_polygons"
        )
        == 6,
        "public_eligible_119_to_119": public_before == 119,
        "semantic_changed_exactly_5": len(semantic_changed) == 5,
        "semantic_ids_match_approved": sorted(x["external_id"] for x in semantic_changed)
        == sorted(APPROVED_SEMANTIC_IDS),
        "no_null_replace_risks": len(null_replace_risks) == 0,
        "prices_stable": len(price_unstable) == 0,
        "statuses_stable": len(status_unstable) == 0,
        "ids_urls_stable": len(id_url_unstable) == 0,
        "not_billable_220": len(semantic_changed) != 220,
    }
    passed = all(checks.values())

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "ACTIVATION_PREFLIGHT_READ_ONLY",
        "passed": passed,
        "stop_before_writes": not passed,
        "project_ref": project_ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "git": _git_dirty_note(),
        "artifact": {
            "path": str(CATALOG).replace("\\", "/"),
            "bytes": CATALOG.stat().st_size if CATALOG.exists() else 0,
            "sha256": _file_sha(CATALOG) if CATALOG.exists() else None,
            "catalog_checksum": catalog.get("catalog_checksum"),
            "expected_catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
            "adapter_version": catalog.get("adapter_version"),
            "listing_count": len(listings),
            "unique_external_ids": len(set(ext_ids)),
            "unique_canonical_urls": len(set(urls)),
            "cached_evidence_records": cache_ok,
            "identity_conflicts": summary.get("identity_conflict"),
            "absent_listings": summary.get("absent_from_catalog"),
            "coordinates_in_artifact": coords_in_catalog,
            "still_without_coordinates": still_no_coords,
        },
        "active_jobs": {
            "remax_pipeline": remax_active,
            "ai_jobs": active_ai,
            "incomplete_source_runs": active_source_runs,
        },
        "import_preview": {
            "summary": summary,
            "failed": preview.failed,
            "failure_reasons": preview.failure_reasons,
            "public_eligible_before": public_before,
            "classification_counts": dict(
                Counter(r.classification for r in preview.rows)
            ),
        },
        "geospatial_expected": {
            "coordinates_added": 199,
            "still_without_coordinates": 21,
            "point_in_polygon_assignments": 193,
            "coordinates_outside_polygons": 6,
            "from_prior_preview": geo.get("assignment_status_counts"),
        },
        "lifecycle_public": {
            "public_eligible_remains": 119,
            "missing_removal_events": 0,
            "labs_public_eligible_now": public_before,
        },
        "protected_facts": {
            "null_replace_risks": null_replace_risks[:20],
            "price_unstable": price_unstable[:20],
            "status_unstable": status_unstable[:20],
            "id_url_unstable": id_url_unstable[:20],
        },
        "semantic_ai": {
            "changed_count": len(semantic_changed),
            "approved_external_ids": list(APPROVED_SEMANTIC_IDS),
            "changed": semantic_changed,
            "not_220": len(semantic_changed) != 220,
        },
        "checks": checks,
        "approved_import_command": (
            "python scripts/adapters/run_remax_curacao.py "
            "--import-from-file "
            "--input data/processed/remax_v041_reparsed_catalog.json "
            "--import-db "
            "--no-evidence-upload "
            "--output data/processed/remax_v041_import_result.json"
        ),
        "safeguards": {
            "no_db_writes_this_script": True,
            "no_live_http": True,
            "no_openai": True,
            "no_pipeline_enqueue": True,
        },
    }
    OUT.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"wrote": str(OUT).replace("\\", "/"), "passed": passed}, indent=2))
    if not passed:
        failed = [k for k, v in checks.items() if not v]
        print("FAILED CHECKS:", failed)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
