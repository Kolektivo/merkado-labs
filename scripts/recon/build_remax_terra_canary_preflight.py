"""Build RE/MAX Terra canary preflight, input, and cost reports (no OpenAI calls)."""

# ruff: noqa: E501

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment import (  # noqa: E402
    PROMPT_VERSION,
    SCHEMA_VERSION,
    compute_input_checksum,
)
from merkado_labs.enrichment.jobs import (  # noqa: E402
    has_identical_enrichment_attempt,
    listing_to_enrichment_input,
)
from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    resolve_effective_neighbourhood,
)
from merkado_labs.enrichment.policy import POLICY_VERSION  # noqa: E402
from merkado_labs.enrichment.pricing import (  # noqa: E402
    PRICING_AS_OF,
    PRICING_SOURCE,
    calculate_usage_cost_usd,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
SELECTION = PROCESSED / "remax_terra_canary_selection.json"
REPARSED = PROCESSED / "remax_reparsed_catalog.json"
APPROVED = ("hs2467", "hr1013", "hr2165", "hs2941", "hr1393")
MODEL = "gpt-5.6-terra"
CEILING = 1.0
CHARS_PER_TOKEN = 4


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")
    settings = get_settings()
    model = (settings.openai_enrichment_model or "").strip()
    if model != MODEL:
        raise SystemExit(f"Model must be {MODEL!r}, got {model!r}")
    max_output = int(settings.openai_enrichment_max_output_tokens or 3500)

    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    external_ids = [str(x) for x in selection.get("external_ids") or []]
    listing_ids = [str(x) for x in selection.get("listing_ids") or []]
    if set(external_ids) != set(APPROVED) or len(external_ids) != 5:
        raise SystemExit(f"Selection external_ids must be exactly {list(APPROVED)}")
    if len(listing_ids) != 5 or len(set(listing_ids)) != 5:
        raise SystemExit("Selection must contain exactly five unique listing IDs")
    if selection.get("source_key") != "remax_curacao":
        raise SystemExit("Selection source_key must be remax_curacao")

    reparsed_by_ext = {}
    if REPARSED.exists():
        for item in json.loads(REPARSED.read_text(encoding="utf-8")).get("listings") or []:
            reparsed_by_ext[str(item.get("external_id"))] = item

    client = create_labs_client()
    source = resolve_property_source(client, "remax_curacao")
    running = (
        client.table("ai_enrichment_jobs")
        .select("id,status")
        .eq("status", "running")
        .execute()
        .data
        or []
    )
    if running:
        raise SystemExit(f"Running enrichment job(s) present: {running}")

    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,property_type,status,source_listing_status,"
            "source_url,source_neighbourhood_text,bedrooms,bathrooms,floor_area_m2,"
            "lot_area_value,lot_area_unit,original_price,original_currency,"
            "benchmark_price_xcg,public_eligible,latitude,longitude,coordinates_source,"
            "description,amenities,enrichment_status,enrichment_last_input_checksum,"
            "enrichment_last_run_at,neighbourhood_assignment_status,"
            "neighbourhood_assignment_method,neighbourhood_assignment_confidence,"
            "inferred_neighbourhood_id,property_source_id"
        )
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )
    by_id = {str(r["id"]): r for r in rows}
    if len(by_id) != 5:
        raise SystemExit("Not all selected listing IDs resolve in Labs")

    reason_by_ext = {
        str(item["external_id"]): item.get("reason_selected")
        for item in selection.get("listings") or []
    }

    preflight_listings = []
    input_audits = []
    historical = []
    total_est_tokens = 0

    for lid in listing_ids:
        row = by_id[lid]
        if str(row.get("property_source_id")) != str(source["id"]):
            raise SystemExit(f"{row['external_id']} is not remax_curacao")
        if row.get("status") in {"missing", "removed"}:
            raise SystemExit(f"{row['external_id']} has status {row.get('status')}")
        eid = str(row["external_id"])
        reparsed = reparsed_by_ext.get(eid) or {}
        props = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,model,prompt_version,schema_version,status,review_status,"
                "input_checksum,token_usage,generated_at"
            )
            .eq("property_listing_id", lid)
            .order("generated_at", desc=True)
            .execute()
            .data
            or []
        )
        row["source_key"] = "remax_curacao"
        ein = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(ein)
        payload = {
            "title": ein.title,
            "description": ein.source_description,
            "deterministic_fields": ein.deterministic_fields,
            "amenities": ein.amenities,
        }
        blob = json.dumps(payload, ensure_ascii=False, default=str)
        est_tokens = max(1, (len(blob) + 3) // 4) + 1600
        total_est_tokens += est_tokens
        identical_v3 = has_identical_enrichment_attempt(
            client, listing_id=lid, model=MODEL, input_checksum=checksum
        )
        eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=None,
            ai_candidate_name=None,
            ai_candidate_confidence=None,
            ai_evidence_grounded=False,
        )
        hist = props[0] if props else None
        historical.append(
            {
                "external_id": eid,
                "historical_proposal_exists": bool(props),
                "historical_model": (hist or {}).get("model"),
                "historical_schema": (hist or {}).get("schema_version"),
                "historical_prompt": (hist or {}).get("prompt_version"),
                "historical_status": (hist or {}).get("status"),
                "historical_review_status": (hist or {}).get("review_status"),
                "was_applied": (hist or {}).get("review_status")
                in {"accepted", "applied", "auto_applied"},
                "obsolete_for_v3": bool(props)
                and (
                    (hist or {}).get("model") != MODEL
                    or (hist or {}).get("prompt_version") != PROMPT_VERSION
                    or (hist or {}).get("schema_version") != SCHEMA_VERSION
                ),
                "identical_terra_v3_exists": identical_v3,
                "v3_run_required": not identical_v3,
                "reason": (
                    "identical Terra v3 already present — skip"
                    if identical_v3
                    else "no identical Terra v3 attempt; historical v1 does not block"
                ),
            }
        )
        preflight_listings.append(
            {
                "listing_id": lid,
                "external_id": eid,
                "title": row.get("title"),
                "sale_rent": row.get("listing_type"),
                "public_eligible": row.get("public_eligible"),
                "current_status": row.get("status"),
                "original_price": row.get("original_price"),
                "original_currency": row.get("original_currency"),
                "xcg_benchmark": row.get("benchmark_price_xcg"),
                "source_location": row.get("source_neighbourhood_text"),
                "effective_neighbourhood": eff.as_dict(),
                "coordinates_in_labs": row.get("latitude") is not None
                and row.get("longitude") is not None,
                "coordinates_in_local_v041_reparse": reparsed.get("latitude") is not None
                and reparsed.get("longitude") is not None,
                "local_reparse_coords_not_imported": True,
                "description_length": len(row.get("description") or ""),
                "historical_ai_proposal_state": {
                    "enrichment_status": row.get("enrichment_status"),
                    "proposal_count": len(props),
                    "latest_model": (hist or {}).get("model"),
                },
                "input_checksum": checksum,
                "reason_selected": reason_by_ext.get(eid),
                "source_evidence_available": bool(row.get("description")),
            }
        )
        missing = [
            name
            for name, value in {
                "title": ein.title,
                "description": ein.source_description,
                "listing_type": ein.deterministic_fields.get("listing_type"),
                "bedrooms": ein.deterministic_fields.get("bedrooms"),
                "bathrooms": ein.deterministic_fields.get("bathrooms"),
                "source_location": ein.deterministic_fields.get("source_neighbourhood_text"),
                "coordinates": ein.deterministic_fields.get("coordinates_available"),
            }.items()
            if not value
        ]
        input_audits.append(
            {
                "listing_id": lid,
                "external_id": eid,
                "character_count": len(blob),
                "estimated_input_tokens": est_tokens,
                "description_length": len(row.get("description") or ""),
                "structured_field_count": sum(
                    1 for v in ein.deterministic_fields.values() if v not in (None, "", [], {})
                ),
                "missing_important_fields": missing,
                "expected_output_complexity": (
                    "high"
                    if len(row.get("description") or "") > 2000
                    or (row.get("bedrooms") or 0) >= 8
                    else "medium"
                ),
                "possible_truncation_risk": max_output < 3000,
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "policy_version": POLICY_VERSION,
                "input_checksum": checksum,
                "uses_imported_labs_truth_only": True,
                "pending_v041_coords_excluded_from_ai_input": True,
            }
        )

    avg_in = round(total_est_tokens / 5)
    expected = estimate_enrichment_cost(
        model=MODEL,
        listing_count=5,
        input_tokens_per_listing=avg_in,
        output_tokens_per_listing=900,
    )
    worst, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=int(avg_in * 1.2) * 5,
        output_tokens=max_output * 5,
    )
    retry, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=int(avg_in * 1.2),
        output_tokens=max_output,
    )
    worst_with_retry = float(worst or 0) + float(retry or 0)
    if worst_with_retry > CEILING:
        raise SystemExit(
            f"Worst-case {worst_with_retry} exceeds ceiling {CEILING}; refusing API run"
        )

    preflight = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": "remax_curacao",
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "approved_external_ids": list(APPROVED),
        "selection_file": "data/processed/remax_terra_canary_selection.json",
        "running_jobs": 0,
        "listings": preflight_listings,
        "historical_isolation": historical,
        "distinctions": {
            "imported_labs_data": "Used for paid canary AI input",
            "local_v041_reparse": "Audit-only; coordinates/agents not imported",
        },
        "ready_for_execution": True,
        "v3_runs_required": sum(1 for h in historical if h["v3_run_required"]),
    }
    cost = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "model": MODEL,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "configured_max_output_tokens": max_output,
        "total_estimated_input_tokens": total_est_tokens,
        "expected_output_tokens_per_listing": 900,
        "expected_total_cost_usd": float(expected.estimated_usd),
        "conservative_worst_case_cost_usd": float(worst or 0),
        "transport_retry_allowance_usd": float(retry or 0),
        "worst_case_including_one_retry_usd": worst_with_retry,
        "approved_budget_usd": CEILING,
        "projected_remaining_budget_usd": round(CEILING - worst_with_retry, 4),
        "within_ceiling": worst_with_retry <= CEILING,
        "reference_prep_expected_usd": 0.098,
        "reference_prep_conservative_usd": 0.36,
    }
    inputs = {
        "generated_at": datetime.now(UTC).isoformat(),
        "listing_count": 5,
        "listings": input_audits,
        "excludes": [
            "raw_html",
            "secrets",
            "unimported_v041_coordinates_as_source_facts",
            "duplicate_description_blocks",
        ],
    }

    for name, payload in (
        ("remax_terra_canary_preflight.json", preflight),
        ("remax_terra_canary_input_audit.json", inputs),
        ("remax_terra_canary_cost_preflight.json", cost),
    ):
        path = PROCESSED / name
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
        print(f"wrote {path}")

    print(
        json.dumps(
            {
                "ready": True,
                "v3_required": preflight["v3_runs_required"],
                "worst_case_with_retry": worst_with_retry,
                "ceiling": CEILING,
                "max_output_tokens": max_output,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
