"""Build Moret remaining Terra-v3 initial backfill selection + preflights.

Phases 1–6: state, selection, input quality, cost, protected baseline.
Read-only Labs SELECTs only. No OpenAI calls, no DB writes, no live HTTP.
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
CATALOG = PROCESSED / "moret_complete_catalog.json"
CANARY_RESULT = PROCESSED / "moret_terra_canary_result.json"
SOURCE_KEY = "moret_real_estate"
MODEL = "gpt-5.6-terra"
CEILING = 2.40
MIN_DESC = 40
CHARS_PER_TOKEN = 4
EXPECTED_SELECTED = 66
EXPECTED_LISTINGS = 71
CANARY = frozenset(
    {"post-75682", "post-75725", "post-74976", "post-75799", "post-74710"}
)

OUT_STATE = PROCESSED / "moret_backfill_preflight_state.json"
OUT_SEL = PROCESSED / "moret_remaining_terra_selection.json"
OUT_SEL_MD = PROCESSED / "moret_remaining_terra_selection.md"
OUT_INPUT = PROCESSED / "moret_backfill_input_quality.json"
OUT_COST = PROCESSED / "moret_backfill_cost_preflight.json"
OUT_COST_MD = PROCESSED / "moret_backfill_cost_preflight.md"
OUT_PROTECTED = PROCESSED / "moret_backfill_protected_fields_before.json"


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
        head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], cwd=ROOT, text=True
        ).strip()
        lines = [ln for ln in status.splitlines() if ln.strip()]
        return {
            "branch": branch,
            "head": head,
            "remote": remote,
            "dirty": bool(lines),
            "changed_path_count": len(lines),
            "clean_tree_required": False,
            "expected_head": "62b622c2f82658bc6dbaba5430169b928e23109a",
            "head_matches_expected": head
            == "62b622c2f82658bc6dbaba5430169b928e23109a",
            "repo_is_kolektivo_merkado_labs": "Kolektivo/merkado-labs" in remote,
        }
    except (OSError, subprocess.CalledProcessError) as exc:
        return {"error": str(exc)}


PROTECTED_KEYS = [
    "id",
    "external_id",
    "source_url",
    "original_price",
    "original_currency",
    "benchmark_price_xcg",
    "listing_type",
    "status",
    "source_listing_status",
    "latitude",
    "longitude",
    "bedrooms",
    "bathrooms",
    "floor_area_m2",
    "lot_area_value",
    "lot_area_unit",
    "public_eligible",
    "source_description_checksum",
    "from_price",
    "price_period",
]


def _protected_checksum(rows: list[dict[str, Any]]) -> str:
    ordered = sorted(rows, key=lambda r: str(r.get("external_id") or ""))
    blob = json.dumps(
        [{k: r.get(k) for k in PROTECTED_KEYS} for r in ordered],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def _canary_observed() -> tuple[float, float, int, int]:
    """Return avg_usd, exact_usd, avg_input_tokens, avg_output_tokens."""
    if not CANARY_RESULT.exists():
        return 0.0233, 0.1165, 2250, 1180
    payload = json.loads(CANARY_RESULT.read_text(encoding="utf-8"))
    result = payload.get("result") or {}
    exact = float(result.get("exact_cost_usd") or 0.1165)
    listing_results = result.get("listing_results") or []
    n = max(len(listing_results), 1)
    avg_in = int(
        sum(int((lr.get("token_usage") or {}).get("input_tokens") or 0) for lr in listing_results)
        / n
    )
    avg_out = int(
        sum(int((lr.get("token_usage") or {}).get("output_tokens") or 0) for lr in listing_results)
        / n
    )
    return round(exact / n, 6), exact, avg_in or 2250, avg_out or 1180


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
        raise SystemExit(
            f"OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS must be 3500, got {max_out}"
        )
    if "jkrfyvukhhsapoivntms" in str(settings.supabase_url):
        raise SystemExit("Production project configuration detected — abort")

    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    catalog = (
        json.loads(CATALOG.read_text(encoding="utf-8")) if CATALOG.exists() else {}
    )
    catalog_by_ext = {
        str(item["external_id"]): item for item in (catalog.get("listings") or [])
    }

    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,property_type,status,source_listing_status,"
            "source_url,source_neighbourhood_text,bedrooms,bathrooms,floor_area_m2,"
            "lot_area_value,lot_area_unit,original_price,original_currency,"
            "benchmark_price_xcg,public_eligible,latitude,longitude,coordinates_source,"
            "description,amenities,enrichment_status,enrichment_last_input_checksum,"
            "source_description_checksum,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
            "missing_since,removed_at,property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    if len(rows) != EXPECTED_LISTINGS:
        raise SystemExit(f"Expected {EXPECTED_LISTINGS} Moret listings, got {len(rows)}")

    for row in rows:
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
        else:
            row["source_key"] = SOURCE_KEY
        cat = catalog_by_ext.get(str(row["external_id"])) or {}
        row["from_price"] = bool(cat.get("from_price"))
        row["price_period"] = cat.get("price_period")

    hydrate_map_neighbourhood_names(client, rows)

    active_ai = (
        client.table("ai_enrichment_jobs")
        .select("id,status,requested_by,property_source_id,created_at")
        .in_("status", ["queued", "running", "paused", "pending"])
        .execute()
        .data
        or []
    )
    moret_ai = [
        r for r in active_ai if str(r.get("property_source_id")) == str(source["id"])
    ]
    active_pipe = (
        client.table("property_pipeline_runs")
        .select("id,status,source_keys,created_at")
        .in_("status", ["queued", "running", "paused", "stopping"])
        .execute()
        .data
        or []
    )
    moret_pipe = [
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
    canary_terra_ok = 0
    for row in rows:
        lid = str(row["id"])
        plist = props_by_listing.get(lid) or []
        if any(
            p.get("model") == MODEL
            and p.get("prompt_version") == PROMPT_VERSION
            and p.get("status") in {"succeeded", "needs_review", "skipped_unchanged"}
            for p in plist
        ):
            terra_current += 1
            if str(row["external_id"]) in CANARY:
                canary_terra_ok += 1

    git = _git_note()
    state = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "BACKFILL_PREFLIGHT_READ_ONLY",
        "project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "forbidden_project_ref": "jkrfyvukhhsapoivntms",
        "production_config_loaded": False,
        "git": git,
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "max_output_tokens": max_out,
        "source_key": SOURCE_KEY,
        "adapter_version_expected": "0.2.0",
        "labs": {
            "listing_count": len(rows),
            "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
            "with_coordinates": sum(
                1
                for r in rows
                if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "effective_neighbourhood_ids": sum(
                1 for r in rows if r.get("inferred_neighbourhood_id")
            ),
            "missing_or_removed": sum(
                1 for r in rows if r.get("missing_since") or r.get("removed_at")
            ),
            "terra_v3_terminal_listings": terra_current,
            "canary_terra_terminal": canary_terra_ok,
            "from_price_listings": sum(1 for r in rows if r.get("from_price")),
            "rent_period_listings": sum(1 for r in rows if r.get("price_period")),
        },
        "active_jobs": {
            "ai_all": active_ai,
            "moret_ai": moret_ai,
            "moret_pipeline": moret_pipe,
            "incomplete_source_runs": incomplete_runs,
        },
        "checks": {
            "project_is_labs": ref == LABS_PROJECT_REF,
            "repo_is_kolektivo": bool(git.get("repo_is_kolektivo_merkado_labs")),
            "branch_is_main": git.get("branch") == "main",
            "head_matches_expected": bool(git.get("head_matches_expected")),
            "model_is_terra": model == MODEL,
            "prompt_v3": PROMPT_VERSION == "listing_enrichment_v3",
            "schema_v3": SCHEMA_VERSION == "listing_enrichment_schema_v3",
            "policy_v3": POLICY_VERSION == "enrichment_policy_v3",
            "max_output_3500": max_out == 3500,
            "listings_71": len(rows) == EXPECTED_LISTINGS,
            "canaries_5_terminal": canary_terra_ok == 5,
            "no_active_moret_ai": not moret_ai,
            "no_active_moret_pipeline": not moret_pipe,
            "no_incomplete_source_runs": not incomplete_runs,
            "no_unexpected_absence": all(
                not r.get("missing_since") and not r.get("removed_at") for r in rows
            ),
            "production_not_loaded": "jkrfyvukhhsapoivntms"
            not in str(settings.supabase_url),
        },
        "safeguards": {
            "no_db_writes": True,
            "no_openai": True,
            "no_live_http": True,
            "no_branch_stash_reset_commit_push": True,
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
        if eid in CANARY:
            excluded.append(
                {
                    "external_id": eid,
                    "listing_id": lid,
                    "reason": "successful_terra_canary",
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
                "original_price": row.get("original_price"),
                "original_currency": row.get("original_currency"),
                "benchmark_price_xcg": row.get("benchmark_price_xcg"),
                "from_price": bool(row.get("from_price")),
                "price_period": row.get("price_period"),
                "status": row.get("status"),
                "source_listing_status": row.get("source_listing_status"),
                "description_length": len(desc),
                "source_location": row.get("source_neighbourhood_text"),
                "map_neighbourhood": row.get("inferred_neighbourhood_name"),
                "effective_neighbourhood": eff.as_dict(),
                "has_coordinates": row.get("latitude") is not None
                and row.get("longitude") is not None,
                "current_semantic_checksum": checksum,
                "existing_proposal_history": {
                    "total": len(history),
                    "terra_v3": len(terra_hist),
                    "historical_v1": len(v1_hist),
                    "latest_statuses": [p.get("status") for p in history[:5]],
                },
                "reason_selected": (
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
    if any(eid in CANARY for eid in external_ids_sel):
        raise SystemExit("Canary listing leaked into remaining selection")
    if any(not str(eid).startswith("post-") for eid in external_ids_sel):
        raise SystemExit("Non-Moret external_id shape in selection")
    count = len(selected)
    if count != EXPECTED_SELECTED:
        raise SystemExit(
            f"Selection count {count} != expected {EXPECTED_SELECTED}. "
            f"Excluded={len(excluded)} terra_terminal={terra_current} "
            f"reasons={dict(Counter(e['reason'] for e in excluded))}"
        )

    exclusion_reasons = Counter(e["reason"] for e in excluded)
    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "job_label": "moret_remaining_terra_backfill",
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
        "excluded_canary_external_ids": sorted(CANARY),
        "listings": selected,
        "excluded_count": len(excluded),
        "exclusion_reason_counts": dict(exclusion_reasons),
        "excluded_sample": excluded[:40],
        "notes": [
            "One-time initial Terra-v3 backfill for listings without a matching "
            "successful current checksum. Five successful canaries excluded.",
            "Normal Refresh & enrich remains new/changed-only and must not start "
            "this backfill automatically.",
        ],
        "command": (
            "python scripts/run_ai_enrichment_sample.py "
            "--source-key moret_real_estate "
            "--selection-file data/processed/moret_remaining_terra_selection.json "
            "--batch-size 1 "
            "--max-estimated-cost-usd 2.4 "
            "--progress-file data/processed/moret_remaining_terra_progress.json "
            "--output data/processed/moret_remaining_terra_result.json"
        ),
    }
    _write(OUT_SEL, selection)
    md = [
        "# Moret remaining Terra backfill selection",
        "",
        f"- Selected: **{count}**",
        f"- Excluded: **{len(excluded)}**",
        f"- Exclusion reasons: `{dict(exclusion_reasons)}`",
        f"- Terra-v3 terminal already present (any checksum): **{terra_current}**",
        f"- Excluded canaries: `{sorted(CANARY)}`",
        "",
        "## Selected listings",
        "",
    ]
    for item in selected:
        md.append(
            f"- `{item['external_id']}` — {item['listing_type']} — "
            f"desc={item['description_length']} — "
            f"from_price={item['from_price']} — "
            f"coords={item['has_coordinates']} — "
            f"eff={(item['effective_neighbourhood'] or {}).get('name')}"
        )
    OUT_SEL_MD.write_text("\n".join(md) + "\n", encoding="utf-8")

    # Phase 3 input quality
    desc_lens = [int(i["description_length"]) for i in selected]
    est_tokens = [int(i["estimated_input_tokens"]) for i in selected]
    map_misses = [
        i["external_id"]
        for i in selected
        if not i.get("map_neighbourhood")
        or str((i.get("effective_neighbourhood") or {}).get("provenance") or "")
        not in {"map", "source"}
        and i.get("latitude") is None
    ]
    # Prefer explicit: listings without inferred neighbourhood id / map name
    map_miss_ids = [
        i["external_id"]
        for i in selected
        if not i.get("map_neighbourhood")
    ]
    # Cross-check against full catalog map coverage (expect ~4 among all 71)
    all_map_miss = [
        str(r["external_id"])
        for r in rows
        if not r.get("inferred_neighbourhood_name")
        and str(r["external_id"]) not in CANARY
    ]
    long_desc = [
        {"external_id": i["external_id"], "description_length": i["description_length"]}
        for i in selected
        if i["description_length"] > 3000
    ]
    sparse = [
        {"external_id": i["external_id"], "description_length": i["description_length"]}
        for i in selected
        if i["description_length"] < 200
    ]
    input_quality = {
        "generated_at": datetime.now(UTC).isoformat(),
        "selected_count": count,
        "description_length_distribution": {
            "min": min(desc_lens) if desc_lens else 0,
            "max": max(desc_lens) if desc_lens else 0,
            "avg": round(sum(desc_lens) / len(desc_lens), 1) if desc_lens else 0,
            "p50": sorted(desc_lens)[len(desc_lens) // 2] if desc_lens else 0,
            "lt_200": sum(1 for n in desc_lens if n < 200),
            "lt_500": sum(1 for n in desc_lens if n < 500),
            "gte_1000": sum(1 for n in desc_lens if n >= 1000),
            "gte_3000": sum(1 for n in desc_lens if n > 3000),
        },
        "unusually_long_descriptions": long_desc,
        "sparse_descriptions": sparse,
        "missing_structured_fields": {
            "missing_bedrooms": sum(1 for i in selected if i.get("bedrooms") is None),
            "missing_bathrooms": sum(1 for i in selected if i.get("bathrooms") is None),
            "missing_coordinates": sum(
                1 for i in selected if not i.get("has_coordinates")
            ),
        },
        "weak_generic_locations": [
            i["external_id"]
            for i in selected
            if str(i.get("source_location") or "").strip().lower()
            in {"curacao", "curaçao", "island", "curaçao ", "curacao "}
        ],
        "map_miss_listings_in_selection": map_miss_ids,
        "map_miss_listings_remaining_expected_subset": all_map_miss,
        "from_price_listings": [
            i["external_id"] for i in selected if i.get("from_price")
        ],
        "rent_period_listings": [
            {"external_id": i["external_id"], "price_period": i.get("price_period")}
            for i in selected
            if i.get("price_period")
        ],
        "rent_listings": sum(1 for i in selected if i.get("listing_type") == "rent"),
        "sale_listings": sum(1 for i in selected if i.get("listing_type") == "sale"),
        "high_bedroom_outliers_ge_8": [
            {"external_id": i["external_id"], "bedrooms": i.get("bedrooms")}
            for i in selected
            if (i.get("bedrooms") or 0) >= 8
        ],
        "high_bathroom_outliers_ge_6": [
            {"external_id": i["external_id"], "bathrooms": i.get("bathrooms")}
            for i in selected
            if float(i.get("bathrooms") or 0) >= 6
        ],
        "likely_multi_unit": [
            i["external_id"]
            for i in selected
            if (i.get("bedrooms") or 0) >= 8
            or "apartment complex" in str(i.get("title") or "").lower()
            or "units" in str(i.get("title") or "").lower()
        ],
        "likely_many_attributes": [
            i["external_id"]
            for i in selected
            if i["description_length"] > 2000
            or (i.get("bedrooms") or 0) >= 6
        ][:40],
        "potential_truncation_risk": [
            i["external_id"]
            for i in selected
            if i["description_length"] > 3500
            or (i.get("bedrooms") or 0) >= 10
        ],
        "estimated_input_tokens": {
            "min": min(est_tokens) if est_tokens else 0,
            "max": max(est_tokens) if est_tokens else 0,
            "total": sum(est_tokens),
            "avg": round(sum(est_tokens) / len(est_tokens), 1) if est_tokens else 0,
        },
        "sparse_ok_policy": (
            "Model may return few or zero attributes when evidence is sparse; "
            "must not invent common Curaçao amenities."
        ),
        "no_raw_html": True,
        "map_miss_note": map_misses,
    }
    _write(OUT_INPUT, input_quality)

    # Phase 4 cost
    avg_usd, canary_exact, avg_in, avg_out = _canary_observed()
    est_in_total = sum(est_tokens)
    expected_out = count * avg_out
    max_out_total = count * 3500
    expected_amt, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=est_in_total,
        output_tokens=expected_out,
    )
    expected_from_avg = round(avg_usd * count, 4)
    retry_listings = max(1, int(count * 0.05))
    retry_amt, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=retry_listings * avg_in,
        output_tokens=retry_listings * avg_out,
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
        "canary_observed": {
            "exact_cost_usd": canary_exact,
            "avg_usd_per_listing": avg_usd,
            "avg_input_tokens": avg_in,
            "avg_output_tokens": avg_out,
        },
        "tokens": {
            "estimated_input_tokens_total": est_in_total,
            "expected_output_tokens_total": expected_out,
            "maximum_output_tokens_total": max_out_total,
            "configured_max_output_tokens_per_listing": 3500,
            "observed_avg_input_tokens": avg_in,
            "observed_avg_output_tokens": avg_out,
        },
        "cost": {
            "expected_usd_from_token_estimate": float(expected_amt or 0),
            "expected_usd_from_observed_avg": expected_from_avg,
            "default_config_estimate_usd": float(default_est.estimated_usd),
            "conservative_total_usd": conservative,
            "transport_retry_allowance_usd": float(retry_amt or 0),
            "absolute_max_output_worst_case_usd": float(absolute_worst or 0),
            "avg_expected_per_listing_usd": avg_usd,
            "expected_per_successful_listing_usd": avg_usd,
            "remaining_approved_budget_usd": round(CEILING - conservative, 4),
            "ceiling_remaining_vs_conservative_usd": round(CEILING - conservative, 4),
            "note": (
                "Absolute max-output worst case may exceed ceiling; runner enforces "
                "USD 2.40 mid-run stop before the next API call. Conservative estimate "
                "uses observed Moret Terra canary averages + 25% buffer + ~5% retry."
            ),
        },
    }
    _write(OUT_COST, cost)
    OUT_COST_MD.write_text(
        "\n".join(
            [
                "# Moret Terra backfill cost preflight",
                "",
                f"- Selected: **{count}**",
                f"- Canary exact (5): **USD {canary_exact}** (avg **USD {avg_usd}**)",
                f"- Expected (observed avg): **USD {expected_from_avg}**",
                f"- Conservative: **USD {conservative}**",
                f"- Transport retry allowance: **USD {float(retry_amt or 0)}**",
                f"- Absolute max-output worst case: **USD {float(absolute_worst or 0)}**",
                f"- Hard ceiling: **USD {CEILING}**",
                f"- Remaining vs conservative: **USD {round(CEILING - conservative, 4)}**",
                f"- Stop before OpenAI: **{stop}**",
                "",
                cost["cost"]["note"],
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    if stop:
        raise SystemExit(
            f"Conservative expected cost {conservative} exceeds ceiling {CEILING}"
        )

    # Phase 6 protected baseline
    protected = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": "before_backfill",
        "listing_count": len(rows),
        "checksum": _protected_checksum(rows),
        "fields": PROTECTED_KEYS,
        "listings": [
            {k: r.get(k) for k in PROTECTED_KEYS}
            for r in sorted(rows, key=lambda x: str(x.get("external_id") or ""))
        ],
        "note": "AI enrichment must not mutate these protected source facts.",
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
                "canary_excluded": 5,
                "expected_usd": expected_from_avg,
                "conservative_usd": conservative,
                "stop_before_openai": stop,
                "selection": str(OUT_SEL).replace("\\", "/"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
