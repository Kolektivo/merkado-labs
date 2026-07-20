"""Build KW activation preflight + artifact integrity reports (no network/writes)."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

DRY_RUN = ROOT / "data/processed/kw_catalog_dry_run.json"
RECON = ROOT / "data/processed/kw_import_reconciliation.json"
LIFE = ROOT / "data/processed/kw_lifecycle_preview.json"
LEXICON = ROOT / "data/reference/neighbourhood_lexicon.json"
CACHE = ROOT / "data/raw/keller_williams_curacao/cache"
OUT_INTEGRITY = ROOT / "data/processed/kw_preimport_artifact_integrity.json"
OUT_PREFLIGHT = ROOT / "data/processed/kw_activation_preflight.json"


def _file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    project_ref = assert_labs_project_ref()
    settings = get_settings()
    dry = json.loads(DRY_RUN.read_text(encoding="utf-8"))
    recon = json.loads(RECON.read_text(encoding="utf-8"))
    life = json.loads(LIFE.read_text(encoding="utf-8"))
    run = dry.get("run") or {}
    disc = dry.get("discovery") or {}
    listings = dry.get("listings") or []

    ext_ids = [item["external_id"] for item in listings]
    urls = [item["url"] for item in listings]
    recomputed = hashlib.sha256(
        "|".join(sorted(f"{ext}:{url}" for ext, url in zip(ext_ids, urls, strict=True))).encode()
    ).hexdigest()

    missing_cache: list[str] = []
    cached = 0
    for item in listings:
        key = hashlib.sha256(item["url"].encode()).hexdigest()
        path = CACHE / f"{key}.html"
        if path.exists():
            cached += 1
        else:
            missing_cache.append(str(item["external_id"]))

    summary = recon.get("summary") or {}
    integrity = {
        "generated_at": datetime.now(UTC).isoformat(),
        "target_project_ref": project_ref,
        "artifacts": {
            "kw_catalog_dry_run.json": {
                "path": str(DRY_RUN).replace("\\", "/"),
                "sha256": _file_sha(DRY_RUN),
                "bytes": DRY_RUN.stat().st_size,
            },
            "kw_import_reconciliation.json": {
                "path": str(RECON).replace("\\", "/"),
                "sha256": _file_sha(RECON),
                "bytes": RECON.stat().st_size,
            },
            "kw_lifecycle_preview.json": {
                "path": str(LIFE).replace("\\", "/"),
                "sha256": _file_sha(LIFE),
                "bytes": LIFE.stat().st_size,
            },
            "neighbourhood_lexicon.json": {
                "path": str(LEXICON).replace("\\", "/"),
                "sha256": _file_sha(LEXICON) if LEXICON.exists() else None,
                "bytes": LEXICON.stat().st_size if LEXICON.exists() else 0,
                "exists": LEXICON.exists(),
            },
        },
        "catalog": {
            "complete_catalog": run.get("complete_catalog") is True
            and disc.get("complete") is True,
            "catalog_checksum": disc.get("catalog_checksum"),
            "expected_checksum": EXPECTED_CATALOG_CHECKSUM,
            "checksum_match": disc.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM,
            "recomputed_from_listing_pairs": recomputed,
            "recomputed_match": recomputed == EXPECTED_CATALOG_CHECKSUM,
            "listing_count": len(listings),
            "unique_external_ids": len(set(ext_ids)),
            "unique_canonical_urls": len(set(urls)),
            "unresolved_external_ids": int(run.get("unresolved_external_ids") or 0),
            "duplicate_external_ids": disc.get("duplicate_external_ids") or 0,
            "identity_conflicts": summary.get("identity_conflict", 0),
            "sale": sum(1 for item in listings if item.get("listing_type") == "sale"),
            "rent": sum(1 for item in listings if item.get("listing_type") == "rent"),
            "no_price": sum(1 for item in listings if not item.get("price")),
            "adapter_version_in_artifact": run.get("adapter_version"),
            "import_adapter_version_target": "0.3.0",
        },
        "cache": {
            "cache_dir": str(CACHE).replace("\\", "/"),
            "html_files_total": len(list(CACHE.glob("*.html"))),
            "listings_with_cached_html": cached,
            "missing_cached_html": missing_cache,
            "evidence_exceptions": [],
        },
        "reconciliation_summary": summary,
        "lifecycle_summary": {
            "proposed_missing_events": life.get("proposed_missing_events"),
            "proposed_removed_events": life.get("proposed_removed_events"),
            "failed": life.get("failed"),
            "failure_reasons": life.get("failure_reasons"),
        },
    }
    integrity["passed"] = (
        integrity["catalog"]["complete_catalog"]
        and integrity["catalog"]["checksum_match"]
        and integrity["catalog"]["recomputed_match"]
        and integrity["catalog"]["listing_count"] == 84
        and integrity["catalog"]["unique_external_ids"] == 84
        and integrity["catalog"]["unique_canonical_urls"] == 84
        and integrity["catalog"]["unresolved_external_ids"] == 0
        and integrity["catalog"]["duplicate_external_ids"] == 0
        and integrity["catalog"]["identity_conflicts"] == 0
        and integrity["catalog"]["no_price"] == 3
        and not missing_cache
        and summary.get("insert") == 44
        and summary.get("update") == 0
        and summary.get("no_change") == 40
        and summary.get("absent_from_catalog") == 0
        and life.get("proposed_missing_events") == 0
        and life.get("proposed_removed_events") == 0
        and project_ref == LABS_PROJECT_REF
    )

    OUT_INTEGRITY.write_text(json.dumps(integrity, indent=2) + "\n", encoding="utf-8")

    # Current Labs counts via service role (read-only).
    from merkado_labs.scrapers.import_pipeline import create_labs_client, resolve_property_source

    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    source_id = str(source["id"])
    kw_rows = (
        client.table("property_listings")
        .select("id,external_id,status,public_eligible,original_price")
        .eq("property_source_id", source_id)
        .execute()
        .data
        or []
    )
    runs = (
        client.table("property_source_runs")
        .select("id", count="exact")
        .eq("source_key", "keller_williams_curacao")
        .execute()
    )
    ai_jobs = client.table("ai_enrichment_jobs").select("id", count="exact").execute()
    ai_props = client.table("ai_enrichment_proposals").select("id", count="exact").execute()

    preflight = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "PRE-WRITE CHECKPOINT",
        "target_supabase_project_reference": project_ref,
        "supabase_url_contains_labs_ref": LABS_PROJECT_REF in str(settings.supabase_url),
        "forbidden_production_ref_absent": "jkrfyvukhhsapoivntms"
        not in str(settings.supabase_url),
        "openai_enrichment_model": settings.openai_enrichment_model,
        "artifact_checksums": {
            name: meta["sha256"] for name, meta in integrity["artifacts"].items()
        },
        "catalog_checksum": integrity["catalog"]["catalog_checksum"],
        "expected_catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
        "integrity_passed": integrity["passed"],
        "current_labs_counts": {
            "kw_listings": len(kw_rows),
            "kw_source_runs": runs.count,
            "ai_enrichment_jobs": ai_jobs.count,
            "ai_enrichment_proposals": ai_props.count,
            "kw_public_eligible": sum(1 for row in kw_rows if row.get("public_eligible")),
            "kw_no_price": sum(1 for row in kw_rows if row.get("original_price") is None),
        },
        "expected_post_import_counts": {
            "kw_listings": 84,
            "inserts": 44,
            "updates": 0,
            "unchanged": 40,
            "absent": 0,
            "missing_transitions": 0,
            "removal_transitions": 0,
            "no_price": 3,
            "sale": 52,
            "rent": 32,
        },
        "planned_writes_by_table": {
            "property_source_runs": 1,
            "property_listings": {"insert": 44, "update_touch": 40},
            "listing_observations": 84,
            "price_observations": "up_to_81_priced_listings_if_changed_or_new",
            "listing_activity_events": "first_seen_for_44_inserts_plus_any_material_changes",
            "geospatial_assignments": "where_coordinates_exist",
            "ai_enrichment_jobs": 0,
            "ai_enrichment_proposals": 0,
        },
        "planned_evidence_uploads": {
            "bucket": "listing-raw-evidence",
            "objects": 84,
            "source": "local_cache_html_only",
            "live_website_requests": False,
        },
        "planned_lifecycle_events": {
            "missing_from_source": 0,
            "removed_from_source": 0,
            "first_seen": 44,
        },
        "planned_public_eligibility": {
            "priced_active_candidates": 81,
            "no_price_must_remain_ineligible": 3,
            "under_contract_never_sold": True,
        },
        "stop_conditions_clear": integrity["passed"],
    }
    OUT_PREFLIGHT.write_text(json.dumps(preflight, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "integrity_passed": integrity["passed"],
                "preflight": OUT_PREFLIGHT.name,
            },
            indent=2,
        )
    )
    return 0 if integrity["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
