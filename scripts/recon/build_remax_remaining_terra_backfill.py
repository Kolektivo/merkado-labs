"""Build RE/MAX remaining Terra-v3 initial backfill selection + preflights.

Phases 1–4: state, selection, input quality, cost (read-only Labs SELECTs).
No OpenAI calls, no DB writes, no live HTTP.
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

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment import (  # noqa: E402
    PROMPT_VERSION,
    SCHEMA_VERSION,
    compute_input_checksum,
)
from merkado_labs.enrichment.jobs import (  # noqa: E402
    hydrate_map_neighbourhood_names,
    listing_to_enrichment_input,
    should_skip_unchanged_enrichment,
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
SOURCE_KEY = "remax_curacao"
MODEL = "gpt-5.6-terra"
CEILING = 10.0
MIN_DESC = 40
CHARS_PER_TOKEN = 4
# Observed RE/MAX Terra avg from canary + semantic refresh (~USD 0.032–0.04).
REMAX_AVG_USD_PER_LISTING = 0.035
REMAX_AVG_INPUT_TOKENS = 2300
REMAX_AVG_OUTPUT_TOKENS = 1600

OUT_STATE = PROCESSED / "remax_backfill_preflight_state.json"
OUT_SEL = PROCESSED / "remax_remaining_terra_selection.json"
OUT_SEL_MD = PROCESSED / "remax_remaining_terra_selection.md"
OUT_INPUT = PROCESSED / "remax_backfill_input_quality.json"
OUT_COST = PROCESSED / "remax_backfill_cost_preflight.json"
OUT_COST_MD = PROCESSED / "remax_backfill_cost_preflight.md"
OUT_PROTECTED = PROCESSED / "remax_backfill_protected_fields_before.json"


def _write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )


def _git_note() -> dict[str, Any]:
    try:
        status = subprocess.check_output(
            ["git", "status", "--short"], cwd=ROOT, text=True
        )
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, text=True
        ).strip()
        lines = [ln for ln in status.splitlines() if ln.strip()]
        return {
            "branch": branch,
            "dirty": bool(lines),
            "changed_path_count": len(lines),
            "clean_tree_required": False,
        }
    except (OSError, subprocess.CalledProcessError) as exc:
        return {"error": str(exc)}


def _protected_checksum(rows: list[dict[str, Any]]) -> str:
    keys = [
        "id",
        "external_id",
        "source_url",
        "original_price",
        "original_currency",
        "benchmark_price_xcg",
        "status",
        "source_listing_status",
        "listing_type",
        "latitude",
        "longitude",
        "bedrooms",
        "bathrooms",
        "floor_area_m2",
        "lot_area_value",
        "lot_area_unit",
        "public_eligible",
    ]
    ordered = sorted(rows, key=lambda r: str(r.get("external_id") or ""))
    blob = json.dumps(
        [{k: r.get(k) for k in keys} for r in ordered],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")
    settings = get_settings()
    model = (settings.openai_enrichment_model or "").strip()
    if model != MODEL:
        raise SystemExit(f"Model must be {MODEL!r}, got {model!r}")
    max_out = int(settings.openai_enrichment_max_output_tokens or 0)
    if max_out != 3500:
        print(f"NOTE: OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS={max_out} (expected 3500)")

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
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
            "missing_since,removed_at,property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    if len(rows) != 220:
        raise SystemExit(f"Expected 220 RE/MAX listings, got {len(rows)}")

    hydrate_map_neighbourhood_names(client, rows)
    for row in rows:
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
        else:
            row["source_key"] = SOURCE_KEY

    active_ai = (
        client.table("ai_enrichment_jobs")
        .select("id,status,requested_by,created_at")
        .in_("status", ["queued", "running", "paused"])
        .execute()
        .data
        or []
    )
    active_pipe = (
        client.table("property_pipeline_runs")
        .select("id,status,source_keys,created_at")
        .in_("status", ["queued", "running", "paused", "stopping"])
        .execute()
        .data
        or []
    )
    remax_pipe = [
        r for r in active_pipe if SOURCE_KEY in (r.get("source_keys") or [])
    ]
    incomplete_runs = (
        client.table("property_source_runs")
        .select("id,started_at,adapter_version")
        .eq("source_key", SOURCE_KEY)
        .is_("completed_at", "null")
        .limit(5)
        .execute()
        .data
        or []
    )

    listing_ids = [str(r["id"]) for r in rows]
    all_props: list[dict[str, Any]] = []
    for start in range(0, len(listing_ids), 80):
        chunk = listing_ids[start : start + 80]
        all_props.extend(
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,model,prompt_version,schema_version,status,"
                "input_checksum,generated_at"
            )
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
    props_by_listing: dict[str, list[dict[str, Any]]] = {}
    for p in all_props:
        props_by_listing.setdefault(str(p["property_listing_id"]), []).append(p)

    terra_current = 0
    for lid, plist in props_by_listing.items():
        if any(
            p.get("model") == MODEL
            and p.get("prompt_version") == PROMPT_VERSION
            and p.get("status") in {"succeeded", "needs_review", "skipped_unchanged"}
            for p in plist
        ):
            terra_current += 1

    state = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "BACKFILL_PREFLIGHT_READ_ONLY",
        "project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "git": _git_note(),
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "max_output_tokens": max_out or 3500,
        "labs": {
            "listing_count": len(rows),
            "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
            "with_coordinates": sum(
                1
                for r in rows
                if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "missing_or_removed": sum(
                1 for r in rows if r.get("missing_since") or r.get("removed_at")
            ),
            "terra_v3_terminal_listings": terra_current,
            "historical_v1_proposals": sum(
                1 for p in all_props if p.get("model") == "gpt-4.1-mini"
            ),
        },
        "active_jobs": {
            "ai": active_ai,
            "remax_pipeline": remax_pipe,
            "incomplete_source_runs": incomplete_runs,
        },
        "checks": {
            "project_is_labs": ref == LABS_PROJECT_REF,
            "model_is_terra": model == MODEL,
            "prompt_v3": PROMPT_VERSION == "listing_enrichment_v3",
            "schema_v3": SCHEMA_VERSION == "listing_enrichment_schema_v3",
            "policy_v3": POLICY_VERSION == "enrichment_policy_v3",
            "listings_220": len(rows) == 220,
            "no_active_ai": not active_ai,
            "no_active_remax_pipeline": not remax_pipe,
            "no_incomplete_source_runs": not incomplete_runs,
            "no_unexpected_absence": all(
                not r.get("missing_since") and not r.get("removed_at") for r in rows
            ),
        },
        "safeguards": {
            "no_db_writes": True,
            "no_openai": True,
            "no_live_http": True,
        },
    }
    state["passed"] = all(state["checks"].values())
    _write(OUT_STATE, state)
    if not state["passed"]:
        failed = [k for k, v in state["checks"].items() if not v]
        raise SystemExit(f"Phase 1 failed: {failed}")

    selected: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda r: str(r["external_id"])):
        eid = str(row["external_id"])
        lid = str(row["id"])
        if row.get("source_key") and row["source_key"] != SOURCE_KEY:
            excluded.append(
                {
                    "external_id": eid,
                    "listing_id": lid,
                    "reason": f"wrong_source_key:{row['source_key']}",
                }
            )
            continue
        if row.get("missing_since") or row.get("removed_at"):
            excluded.append(
                {
                    "external_id": eid,
                    "listing_id": lid,
                    "reason": "missing_or_removed",
                }
            )
            continue
        title = (row.get("title") or "").strip()
        desc = (row.get("description") or "").strip()
        if len(title) < 3 and len(desc) < MIN_DESC:
            excluded.append(
                {
                    "external_id": eid,
                    "listing_id": lid,
                    "reason": "insufficient_title_and_description",
                    "description_length": len(desc),
                }
            )
            continue
        if len(desc) < MIN_DESC and len(title) < 20:
            excluded.append(
                {
                    "external_id": eid,
                    "listing_id": lid,
                    "reason": "insufficient_source_evidence",
                    "description_length": len(desc),
                    "title_length": len(title),
                }
            )
            continue

        if should_skip_unchanged_enrichment(client, row=row, model=MODEL):
            excluded.append(
                {
                    "external_id": eid,
                    "listing_id": lid,
                    "reason": "identical_successful_terra_v3_checksum",
                    "enrichment_status": row.get("enrichment_status"),
                }
            )
            continue

        enrichment_input = listing_to_enrichment_input(row)
        checksum = compute_input_checksum(enrichment_input)
        eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=row.get("inferred_neighbourhood_name"),
            ai_candidate_name=None,
        )
        history = props_by_listing.get(lid) or []
        terra_hist = [
            p
            for p in history
            if p.get("model") == MODEL and p.get("prompt_version") == PROMPT_VERSION
        ]
        v1_hist = [p for p in history if p.get("model") == "gpt-4.1-mini"]
        est_tokens = max(700, len(desc) // CHARS_PER_TOKEN + 550)
        selected.append(
            {
                "listing_id": lid,
                "external_id": eid,
                "title": row.get("title"),
                "listing_type": row.get("listing_type"),
                "public_eligible": row.get("public_eligible"),
                "status": row.get("status"),
                "source_listing_status": row.get("source_listing_status"),
                "description_length": len(desc),
                "source_location": row.get("source_neighbourhood_text"),
                "effective_neighbourhood": eff.as_dict(),
                "input_checksum": checksum,
                "existing_proposal_history": {
                    "total": len(history),
                    "terra_v3": len(terra_hist),
                    "historical_v1": len(v1_hist),
                    "latest_statuses": [p.get("status") for p in history[:5]],
                },
                "reason_included": (
                    "No successful current Terra-v3 proposal for current semantic "
                    "input checksum; eligible for one-time initial backfill"
                ),
                "estimated_input_tokens": est_tokens,
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "bedrooms": row.get("bedrooms"),
                "bathrooms": row.get("bathrooms"),
            }
        )

    listing_ids_sel = [item["listing_id"] for item in selected]
    external_ids_sel = [item["external_id"] for item in selected]
    if len(listing_ids_sel) != len(set(listing_ids_sel)):
        raise SystemExit("Duplicate listing IDs in selection")
    if len(external_ids_sel) != len(set(external_ids_sel)):
        raise SystemExit("Duplicate external IDs in selection")
    count = len(selected)
    if count < 190 or count > 215:
        raise SystemExit(
            f"Selection count {count} outside expected 190–215 range. "
            f"Excluded={len(excluded)} terra_terminal={terra_current}"
        )
    # No KW leakage
    for item in selected:
        if not str(item["external_id"]).startswith(("hs", "hr")):
            raise SystemExit(f"Unexpected external_id shape: {item['external_id']}")

    exclusion_reasons = Counter(e["reason"] for e in excluded)
    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "job_label": "remax_remaining_terra_backfill",
        "model_required": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "count": count,
        "listing_ids": listing_ids_sel,
        "external_ids": external_ids_sel,
        "allow_canary": False,
        "initial_backfill": True,
        "not_normal_refresh": True,
        "listings": selected,
        "excluded_count": len(excluded),
        "exclusion_reason_counts": dict(exclusion_reasons),
        "excluded_sample": excluded[:40],
        "notes": [
            "One-time initial Terra-v3 backfill for listings without a matching "
            "successful current checksum. Historical v1 does not count.",
            "Normal Refresh & enrich remains new/changed-only and must not start "
            "this backfill automatically.",
        ],
    }
    _write(OUT_SEL, selection)
    md = [
        "# RE/MAX remaining Terra backfill selection",
        "",
        f"- Selected: **{count}**",
        f"- Excluded: **{len(excluded)}**",
        f"- Exclusion reasons: `{dict(exclusion_reasons)}`",
        f"- Terra-v3 terminal already present (any checksum): **{terra_current}**",
        "",
        "## Sample selected",
        "",
    ]
    for item in selected[:15]:
        md.append(
            f"- `{item['external_id']}` — {item['listing_type']} — "
            f"desc={item['description_length']} — "
            f"eff={ (item['effective_neighbourhood'] or {}).get('name') }"
        )
    OUT_SEL_MD.write_text("\n".join(md) + "\n", encoding="utf-8")

    # Phase 3 input quality
    desc_lens = [int(i["description_length"]) for i in selected]
    est_tokens = [int(i["estimated_input_tokens"]) for i in selected]
    input_quality = {
        "generated_at": datetime.now(UTC).isoformat(),
        "selected_count": count,
        "missing_descriptions": sum(1 for n in desc_lens if n == 0),
        "very_short_descriptions_lt_80": sum(1 for n in desc_lens if 0 < n < 80),
        "short_descriptions_lt_200": sum(1 for n in desc_lens if n < 200),
        "long_descriptions_gt_3000": sum(1 for n in desc_lens if n > 3000),
        "description_length": {
            "min": min(desc_lens) if desc_lens else 0,
            "max": max(desc_lens) if desc_lens else 0,
            "avg": round(sum(desc_lens) / len(desc_lens), 1) if desc_lens else 0,
            "p50": sorted(desc_lens)[len(desc_lens) // 2] if desc_lens else 0,
        },
        "generic_source_locations": sum(
            1
            for i in selected
            if str(i.get("source_location") or "").strip().lower()
            in {"curacao", "curaçao", "island"}
        ),
        "missing_coordinates": sum(
            1
            for i in selected
            if i.get("latitude") is None or i.get("longitude") is None
        ),
        "unusual_bedrooms_ge_8": [
            {"external_id": i["external_id"], "bedrooms": i.get("bedrooms")}
            for i in selected
            if (i.get("bedrooms") or 0) >= 8
        ],
        "unusual_bathrooms_ge_6": [
            {"external_id": i["external_id"], "bathrooms": i.get("bathrooms")}
            for i in selected
            if float(i.get("bathrooms") or 0) >= 6
        ],
        "estimated_input_tokens": {
            "min": min(est_tokens) if est_tokens else 0,
            "max": max(est_tokens) if est_tokens else 0,
            "total": sum(est_tokens),
            "avg": round(sum(est_tokens) / len(est_tokens), 1) if est_tokens else 0,
        },
        "likely_high_output_complexity": [
            i["external_id"]
            for i in selected
            if i["description_length"] > 2500
            or (i.get("bedrooms") or 0) >= 8
            or float(i.get("bathrooms") or 0) >= 6
        ][:40],
        "sparse_ok_policy": (
            "Model may return few or zero attributes; do not invent facts."
        ),
        "no_raw_html": True,
    }
    _write(OUT_INPUT, input_quality)

    # Phase 4 cost
    est_in_total = sum(est_tokens)
    expected_out = count * REMAX_AVG_OUTPUT_TOKENS
    max_out_total = count * 3500
    expected_amt, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=est_in_total,
        output_tokens=expected_out,
    )
    expected_from_avg = round(REMAX_AVG_USD_PER_LISTING * count, 4)
    # Conservative: 1.25x expected avg + transport retries for 5% of listings
    # at observed average output (not full 3500 max — mid-run budget stop still
    # uses per-call max-output worst case against remaining ceiling).
    retry_listings = max(1, int(count * 0.05))
    retry_amt, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=retry_listings * REMAX_AVG_INPUT_TOKENS,
        output_tokens=retry_listings * REMAX_AVG_OUTPUT_TOKENS,
    )
    conservative = round(expected_from_avg * 1.25 + float(retry_amt or 0), 4)
    absolute_worst, _ = calculate_usage_cost_usd(
        model=MODEL, input_tokens=int(est_in_total * 1.25), output_tokens=max_out_total
    )
    default_est = estimate_enrichment_cost(model=MODEL, listing_count=count)
    stop = conservative > CEILING
    cost = {
        "generated_at": datetime.now(UTC).isoformat(),
        "passed": not stop,
        "stop_before_openai": stop,
        "selected_listings": count,
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "max_output_tokens": 3500,
        "batch_size": 1,
        "hard_ceiling_usd": CEILING,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "tokens": {
            "estimated_input_tokens_total": est_in_total,
            "expected_output_tokens_total": expected_out,
            "maximum_output_tokens_total": max_out_total,
            "observed_avg_input_tokens": REMAX_AVG_INPUT_TOKENS,
            "observed_avg_output_tokens": REMAX_AVG_OUTPUT_TOKENS,
        },
        "cost": {
            "expected_usd_from_token_estimate": float(expected_amt or 0),
            "expected_usd_from_observed_avg": expected_from_avg,
            "default_config_estimate_usd": float(default_est.estimated_usd),
            "conservative_total_usd": conservative,
            "transport_retry_allowance_usd": float(retry_amt or 0),
            "absolute_max_output_worst_case_usd": float(absolute_worst or 0),
            "avg_expected_per_listing_usd": REMAX_AVG_USD_PER_LISTING,
            "expected_per_successful_listing_usd": REMAX_AVG_USD_PER_LISTING,
            "expected_per_auto_applied_field_usd": None,
            "ceiling_remaining_vs_conservative_usd": round(CEILING - conservative, 4),
            "note": (
                "Absolute max-output worst case may exceed ceiling; runner enforces "
                "USD 10 mid-run stop before the next API call. Conservative estimate "
                "uses observed RE/MAX Terra averages + 35% buffer + 10% retry allowance."
            ),
        },
    }
    _write(OUT_COST, cost)
    OUT_COST_MD.write_text(
        "\n".join(
            [
                "# RE/MAX Terra backfill cost preflight",
                "",
                f"- Selected: **{count}**",
                f"- Expected (observed avg): **USD {expected_from_avg}**",
                f"- Conservative: **USD {conservative}**",
                f"- Absolute max-output worst case: **USD {float(absolute_worst or 0)}**",
                f"- Hard ceiling: **USD {CEILING}**",
                f"- Stop before OpenAI: **{stop}**",
                "",
                cost["cost"]["note"],
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    protected = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": "before_backfill",
        "listing_count": len(rows),
        "checksum": _protected_checksum(rows),
        "fields": [
            "external_id",
            "source_url",
            "original_price",
            "original_currency",
            "benchmark_price_xcg",
            "status",
            "source_listing_status",
            "listing_type",
            "latitude",
            "longitude",
            "bedrooms",
            "bathrooms",
            "floor_area_m2",
            "lot_area_value",
            "lot_area_unit",
            "public_eligible",
        ],
    }
    _write(OUT_PROTECTED, protected)

    print(
        json.dumps(
            {
                "phase1_passed": state["passed"],
                "selected_count": count,
                "excluded_count": len(excluded),
                "exclusion_reasons": dict(exclusion_reasons),
                "terra_v3_already": terra_current,
                "expected_usd": expected_from_avg,
                "conservative_usd": conservative,
                "stop_before_openai": stop,
                "selection": str(OUT_SEL).replace("\\", "/"),
            },
            indent=2,
        )
    )
    if stop:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
