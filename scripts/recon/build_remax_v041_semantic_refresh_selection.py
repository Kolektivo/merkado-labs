"""Build exact five-listing RE/MAX v0.4.1 semantic refresh selection + cost preflight."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

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
POST = PROCESSED / "remax_v041_postimport_verification.json"
OUT_SEL = PROCESSED / "remax_v041_semantic_refresh_selection.json"
OUT_COST = PROCESSED / "remax_v041_semantic_refresh_cost_preflight.json"

APPROVED = ("hr2165", "hr2185", "hs3061", "hs3103", "hs3104")
MODEL = "gpt-5.6-terra"
CEILING = 0.75
CHARS_PER_TOKEN = 4
SOURCE_KEY = "remax_curacao"


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")

    post = json.loads(POST.read_text(encoding="utf-8"))
    changed = {
        item["external_id"]: item
        for item in (post.get("semantic_checksum") or {}).get("changed") or []
    }
    if sorted(changed) != sorted(APPROVED):
        raise SystemExit(
            f"Post-import semantic set {sorted(changed)} != approved {list(APPROVED)}"
        )

    settings = get_settings()
    model = (settings.openai_enrichment_model or "").strip()
    if model != MODEL:
        raise SystemExit(f"Model must be {MODEL!r}, got {model!r}")
    max_output = int(settings.openai_enrichment_max_output_tokens or 0)
    if max_output != 3500:
        # Allow override via temporary shell env; warn if not set yet.
        print(
            f"NOTE: OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS={max_output} "
            "(expected 3500 for paid run)"
        )

    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,property_type,status,source_listing_status,"
            "source_url,source_neighbourhood_text,bedrooms,bathrooms,floor_area_m2,"
            "lot_area_value,lot_area_unit,original_price,original_currency,"
            "benchmark_price_xcg,public_eligible,latitude,longitude,coordinates_source,"
            "description,amenities,enrichment_status,enrichment_last_input_checksum,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,image_urls"
        )
        .eq("property_source_id", source["id"])
        .in_("external_id", list(APPROVED))
        .execute()
        .data
        or []
    )
    if len(rows) != 5:
        raise SystemExit(f"Expected 5 Labs rows for approved IDs, got {len(rows)}")

    nb_rows = client.table("neighbourhoods").select("id,name").execute().data or []
    nb_map = {str(n["id"]): n["name"] for n in nb_rows}

    listing_ids = []
    external_ids = []
    listings_out: list[dict[str, Any]] = []
    est_input_tokens = 0

    for eid in APPROVED:
        row = next(r for r in rows if str(r["external_id"]) == eid)
        row = dict(row)
        row["source_key"] = SOURCE_KEY
        row["inferred_neighbourhood_name"] = nb_map.get(
            str(row.get("inferred_neighbourhood_id") or "")
        )
        enrichment_input = listing_to_enrichment_input(row)
        new_sum = compute_input_checksum(enrichment_input)
        old_sum = (changed.get(eid) or {}).get("before_semantic")
        props = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,status,model,prompt_version,schema_version,input_checksum,generated_at"
            )
            .eq("property_listing_id", row["id"])
            .order("generated_at", desc=True)
            .limit(10)
            .execute()
            .data
            or []
        )
        terra = [
            p
            for p in props
            if p.get("model") == MODEL
            and p.get("prompt_version") == PROMPT_VERSION
        ]
        identical = has_identical_enrichment_attempt(
            client,
            listing_id=str(row["id"]),
            model=MODEL,
            input_checksum=new_sum,
            prompt_version=PROMPT_VERSION,
            schema_version=SCHEMA_VERSION,
        )
        before_eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=None,
            ai_candidate_name=None,
        )
        after_eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=row.get("inferred_neighbourhood_name"),
            ai_candidate_name=None,
        )
        desc = str(row.get("description") or "")
        est_tokens = max(800, len(desc) // CHARS_PER_TOKEN + 600)
        est_input_tokens += est_tokens

        listing_ids.append(str(row["id"]))
        external_ids.append(eid)
        listings_out.append(
            {
                "listing_id": str(row["id"]),
                "external_id": eid,
                "title": row.get("title"),
                "old_input_checksum": old_sum,
                "new_semantic_checksum": new_sum,
                "field_causing_change": "effective_neighbourhood",
                "previous_effective_neighbourhood": before_eff.as_dict(),
                "new_source_neighbourhood": row.get("source_neighbourhood_text"),
                "new_map_neighbourhood": row.get("inferred_neighbourhood_name"),
                "new_effective_neighbourhood": after_eff.as_dict(),
                "existing_ai_proposal_state": {
                    "enrichment_status": row.get("enrichment_status"),
                    "terra_v3_proposals": [
                        {
                            "id": p.get("id"),
                            "status": p.get("status"),
                            "input_checksum": p.get("input_checksum"),
                            "generated_at": p.get("generated_at"),
                        }
                        for p in terra
                    ],
                    "identical_current_attempt_exists": identical,
                },
                "estimated_input_tokens": est_tokens,
                "reason_re_enrichment_required": (
                    "Point-in-polygon map neighbourhood filled a generic "
                    "'Curacao' source location gap, changing semantic "
                    "effective_neighbourhood provenance to map."
                ),
                "public_eligible": row.get("public_eligible"),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
            }
        )

    if set(external_ids) != set(APPROVED) or len(external_ids) != 5:
        raise SystemExit("Selection rejected: external IDs must be exactly the five approved")

    # Reject if any non-approved listing slipped in
    if any(eid not in APPROVED for eid in external_ids):
        raise SystemExit("Selection rejected: unexpected listing")

    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "job_label": "remax_v041_semantic_refresh",
        "model_required": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "count": 5,
        "listing_ids": listing_ids,
        "external_ids": external_ids,
        "allow_canary": False,
        "allow_canary_overlap": True,
        "approved_semantic_refresh": True,
        "initial_backfill_excluded": True,
        "listings": listings_out,
        "notes": [
            "Exactly five listings whose semantic AI input changed after v0.4.1 import.",
            "Does not include the separate ~215-listing initial Terra backfill.",
            "hr2165 overlaps the prior Terra canary set and is intentionally included.",
        ],
    }
    OUT_SEL.write_text(
        json.dumps(selection, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    cost_est = estimate_enrichment_cost(model=MODEL, listing_count=5)
    # Conservative worst case: full max output per listing + one transport retry
    worst_out = 3500 * 5
    worst_in = int(est_input_tokens * 1.25)
    worst_amt, _worst_note = calculate_usage_cost_usd(
        model=MODEL, input_tokens=worst_in, output_tokens=worst_out
    )
    retry_amt, _retry_note = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=int(est_input_tokens / 5),
        output_tokens=3500,
    )
    expected = float(cost_est.estimated_usd)
    worst_usd = float(worst_amt or 0)
    retry_usd = float(retry_amt or 0)
    conservative = worst_usd + retry_usd
    stop = conservative > CEILING

    cost_payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "passed": not stop,
        "stop_before_openai": stop,
        "project_ref": ref,
        "selection": {
            "count": 5,
            "external_ids": list(APPROVED),
            "listing_ids": listing_ids,
            "matches_approved": True,
            "no_initial_backfill_leakage": True,
        },
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "max_output_tokens": 3500,
        "batch_size": 1,
        "unchanged_listings_skip": True,
        "hard_ceiling_usd": CEILING,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "tokens": {
            "expected_input_tokens": est_input_tokens,
            "expected_output_tokens_per_listing_estimate": int(
                cost_est.output_tokens / 5
            )
            if cost_est.output_tokens
            else None,
            "expected_output_tokens_total_estimate": cost_est.output_tokens,
            "worst_case_input_tokens": worst_in,
            "worst_case_output_tokens": worst_out,
        },
        "cost": {
            "expected_usd": expected,
            "conservative_worst_case_usd": worst_usd,
            "transport_retry_allowance_usd": retry_usd,
            "conservative_with_retry_usd": conservative,
            "ceiling_remaining_usd": round(CEILING - conservative, 6),
            "estimate_detail": {
                "estimated_usd": expected,
                "input_tokens": cost_est.input_tokens,
                "output_tokens": cost_est.output_tokens,
                "notes": cost_est.notes,
            },
        },
        "listings": [
            {
                "external_id": item["external_id"],
                "estimated_input_tokens": item["estimated_input_tokens"],
                "identical_skip_now": item["existing_ai_proposal_state"][
                    "identical_current_attempt_exists"
                ],
            }
            for item in listings_out
        ],
    }
    OUT_COST.write_text(
        json.dumps(cost_payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "selection": str(OUT_SEL).replace("\\", "/"),
                "cost": str(OUT_COST).replace("\\", "/"),
                "external_ids": external_ids,
                "expected_usd": expected,
                "conservative_with_retry_usd": conservative,
                "stop_before_openai": stop,
            },
            indent=2,
        )
    )
    return 1 if stop else 0


if __name__ == "__main__":
    raise SystemExit(main())
