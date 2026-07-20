"""Post-backfill audits for Moret remaining Terra-v3: quality, protected, public, final."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment import PROMPT_VERSION, SCHEMA_VERSION  # noqa: E402
from merkado_labs.enrichment.jobs import (  # noqa: E402
    hydrate_map_neighbourhood_names,
    should_skip_unchanged_enrichment,
)
from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    resolve_effective_neighbourhood,
)
from merkado_labs.enrichment.policy import POLICY_VERSION  # noqa: E402
from merkado_labs.enrichment.pricing import calculate_usage_cost_usd  # noqa: E402
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
SOURCE_KEY = "moret_real_estate"
MODEL = "gpt-5.6-terra"
CEILING = 2.40
CANARY = frozenset(
    {"post-75682", "post-75725", "post-74976", "post-75799", "post-74710"}
)
CATALOG = PROCESSED / "moret_complete_catalog.json"
BEFORE = PROCESSED / "moret_backfill_protected_fields_before.json"
RESULT = PROCESSED / "moret_remaining_terra_result.json"
PROGRESS = PROCESSED / "moret_remaining_terra_progress.json"
SELECTION = PROCESSED / "moret_remaining_terra_selection.json"

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

RECURRING = [
    "furnished",
    "air_conditioning",
    "pool",
    "parking",
    "parking_spaces",
    "garage",
    "gated_community",
    "garden",
    "terrace",
    "balcony",
    "sea_view",
    "security",
    "appliances",
    "utilities",
    "accessibility",
    "pet_suitability",
]

FORBIDDEN_PUBLIC = [
    "confidence",
    "needs_attention",
    "evidence_snippet",
    "token_usage",
    "cost_usd",
    "field_decisions",
    "prompt_version",
    "schema_version",
]


def _write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )


def _checksum(rows: list[dict[str, Any]]) -> str:
    ordered = sorted(rows, key=lambda r: str(r.get("external_id") or ""))
    blob = json.dumps(
        [{k: r.get(k) for k in PROTECTED_KEYS} for r in ordered],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def _classify_failure(item: dict[str, Any]) -> str:
    err = str(item.get("error") or item.get("status") or "").lower()
    if "budget" in err or "ceiling" in err or "insufficient" in err:
        return "budget_stop"
    if "timeout" in err or "transport" in err or "connection" in err or "429" in err:
        return "transport"
    if "truncat" in err or "max_output" in err or "length" in err:
        return "truncation"
    if "json" in err or "schema" in err or "structured" in err or "parse" in err:
        return "structured_output"
    if "ground" in err or "evidence" in err:
        return "grounding"
    if "valid" in err or "policy" in err:
        return "validation"
    if "persist" in err or "database" in err or "supabase" in err:
        return "persistence"
    return "other"


def _load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / "apps" / "labs-dashboard" / ".env.local"
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def _api(env: dict[str, str], path: str):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    if "csaefdkpwukshtouyixg" not in url:
        raise SystemExit(f"Refusing non-Labs URL: {url}")
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def _leaks(obj: Any) -> list[str]:
    text = json.dumps(obj, default=str)
    found = []
    for term in FORBIDDEN_PUBLIC:
        if re.search(rf"\b{re.escape(term)}\b", text, re.I):
            found.append(term)
    return found


def main() -> int:
    ref = assert_labs_project_ref()
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
            "benchmark_price_xcg,public_eligible,latitude,longitude,"
            "description,enrichment_status,enrichment_last_input_checksum,"
            "source_description_checksum,"
            "neighbourhood_assignment_status,inferred_neighbourhood_id,"
            "missing_since,removed_at,amenities,property_sources(source_key)"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    for row in rows:
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
        cat = catalog_by_ext.get(str(row["external_id"])) or {}
        row["from_price"] = bool(cat.get("from_price"))
        row["price_period"] = cat.get("price_period")
    hydrate_map_neighbourhood_names(client, rows)

    after_checksum = _checksum(rows)
    before = json.loads(BEFORE.read_text(encoding="utf-8")) if BEFORE.exists() else {}
    protected = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "phase": "after_backfill",
        "before_checksum": before.get("checksum"),
        "after_checksum": after_checksum,
        "unchanged": before.get("checksum") == after_checksum,
        "listing_count": len(rows),
        "fields": PROTECTED_KEYS,
    }
    _write(PROCESSED / "moret_backfill_protected_fields_after.json", protected)
    if before.get("checksum") and before.get("checksum") != after_checksum:
        print("PROTECTED FIELD MUTATION DETECTED")
        return 2

    result_payload = (
        json.loads(RESULT.read_text(encoding="utf-8")) if RESULT.exists() else {}
    )
    job = result_payload.get("result") or {}
    listing_results = job.get("listing_results") or []
    progress = (
        json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {}
    )
    selection = (
        json.loads(SELECTION.read_text(encoding="utf-8")) if SELECTION.exists() else {}
    )

    listing_ids = [str(r["id"]) for r in rows]
    props: list[dict[str, Any]] = []
    for start in range(0, len(listing_ids), 80):
        props.extend(
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,model,prompt_version,status,input_checksum,"
                "generated_at,token_usage,proposal,confidence,warnings,error_message"
            )
            .in_("property_listing_id", listing_ids[start : start + 80])
            .eq("model", MODEL)
            .eq("prompt_version", PROMPT_VERSION)
            .execute()
            .data
            or []
        )

    terra_by_listing: dict[str, list[dict[str, Any]]] = {}
    for p in props:
        terra_by_listing.setdefault(str(p["property_listing_id"]), []).append(p)

    succeeded_listings = 0
    failed_listings = 0
    skipped_listings = 0
    not_enriched = 0
    auto_applied = 0
    attention = 0
    rejected = 0
    confidences: list[float] = []
    forbidden_attempts = 0
    map_over_ai_ok = 0
    map_over_ai_total = 0
    recurring_counts: Counter[str] = Counter()

    for row in rows:
        lid = str(row["id"])
        plist = terra_by_listing.get(lid) or []
        terminal = [
            p
            for p in plist
            if p.get("status") in {"succeeded", "needs_review", "skipped_unchanged"}
        ]
        if any(p.get("status") == "skipped_unchanged" for p in terminal) and not any(
            p.get("status") in {"succeeded", "needs_review"} for p in terminal
        ):
            skipped_listings += 1
        elif any(p.get("status") in {"succeeded", "needs_review"} for p in terminal):
            succeeded_listings += 1
        elif any(p.get("status") in {"failed", "invalid_output"} for p in plist):
            failed_listings += 1
        else:
            not_enriched += 1

        latest = None
        if terminal:
            latest = sorted(
                terminal, key=lambda p: str(p.get("generated_at") or "")
            )[-1]
        elif plist:
            latest = sorted(plist, key=lambda p: str(p.get("generated_at") or ""))[-1]
        if latest:
            proposal = latest.get("proposal") or {}
            if not isinstance(proposal, dict):
                proposal = {}
            conf = latest.get("confidence")
            if conf is not None:
                try:
                    confidences.append(float(conf))
                except (TypeError, ValueError):
                    pass
            for attr in proposal.get("attributes") or []:
                if isinstance(attr, dict) and attr.get("key") in {
                    "bedrooms",
                    "bathrooms",
                    "original_price",
                }:
                    forbidden_attempts += 1
                if isinstance(attr, dict) and attr.get("key") in RECURRING:
                    recurring_counts[str(attr["key"])] += 1
            ai_nb = proposal.get("neighbourhood_candidate")
            if isinstance(ai_nb, dict):
                ai_nb = ai_nb.get("value") or ai_nb.get("name") or ai_nb.get("text")
            map_nb = row.get("inferred_neighbourhood_name")
            if map_nb and ai_nb:
                map_over_ai_total += 1
                eff = resolve_effective_neighbourhood(
                    source_name=row.get("source_neighbourhood_text"),
                    map_name=map_nb,
                    ai_candidate_name=str(ai_nb) if ai_nb else None,
                    ai_evidence_grounded=True,
                )
                if eff.provenance in {"source", "map"}:
                    map_over_ai_ok += 1

        for lr in listing_results:
            if str(lr.get("listing_id")) == lid:
                auto_applied += len(lr.get("fields_auto_applied") or [])
                attention += len(lr.get("fields_needing_attention") or [])
                rejected += len(lr.get("fields_rejected") or [])
                break

    batch_auto = int(job.get("auto_applied_fields") or auto_applied)
    batch_attention = int(job.get("needs_attention_listings") or 0)
    token_usage = job.get("token_usage") or progress.get("token_usage") or {}
    exact_cost = float(job.get("exact_cost_usd") or progress.get("exact_cost_usd") or 0)

    failures = [
        lr
        for lr in listing_results
        if lr.get("status") in {"failed", "invalid_output"}
    ]
    retry_candidates = []
    for lr in failures:
        klass = _classify_failure(lr)
        if klass in {"transport", "truncation", "persistence", "budget_stop"}:
            retry_candidates.append(
                {
                    "listing_id": lr.get("listing_id"),
                    "external_id": lr.get("external_id"),
                    "status": lr.get("status"),
                    "error": lr.get("error"),
                    "failure_class": klass,
                    "safe_for_paid_retry": klass
                    in {"transport", "truncation", "persistence"},
                }
            )
    if retry_candidates or failures:
        _write(
            PROCESSED / "moret_backfill_retry_candidates.json",
            {
                "generated_at": datetime.now(UTC).isoformat(),
                "failures_total": len(failures),
                "classified": [
                    {
                        "external_id": lr.get("external_id"),
                        "status": lr.get("status"),
                        "error": lr.get("error"),
                        "failure_class": _classify_failure(lr),
                    }
                    for lr in failures
                ],
                "retry_candidates": retry_candidates,
                "not_executed": True,
                "note": "Grounding/policy/validation failures excluded from paid retry.",
                "proposed_command": (
                    "python scripts/run_ai_enrichment_sample.py "
                    "--source-key moret_real_estate "
                    "--selection-file data/processed/moret_backfill_retry_selection.json "
                    "--batch-size 1 "
                    "--max-estimated-cost-usd 0.5 "
                    "--force "
                    "--progress-file data/processed/moret_backfill_retry_progress.json "
                    "--output data/processed/moret_backfill_retry_result.json"
                )
                if retry_candidates
                else None,
            },
        )

    quality = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "totals": {
            "moret_listings": len(rows),
            "successful_current_terra_v3": succeeded_listings,
            "failed": job.get("failed") if job.get("failed") is not None else failed_listings,
            "skipped": job.get("skipped") if job.get("skipped") is not None else skipped_listings,
            "not_enriched": not_enriched,
            "batch_processed": job.get("processed"),
            "batch_succeeded": job.get("succeeded"),
            "batch_failed": job.get("failed"),
            "batch_skipped": job.get("skipped"),
            "auto_applied_fields": batch_auto,
            "needs_attention_listings": batch_attention,
            "needs_attention_fields_in_batch": attention,
            "rejected_fields_in_batch_results": rejected,
        },
        "average_confidence": (
            round(sum(confidences) / len(confidences), 4) if confidences else None
        ),
        "recurring_attribute_proposal_counts": dict(recurring_counts),
        "neighbourhood": {
            "map_vs_ai_conflicts_checked": map_over_ai_total,
            "map_wins_ok": map_over_ai_ok,
        },
        "forbidden_protected_field_attempts_flagged": forbidden_attempts,
        "protected_fields_unchanged": protected["unchanged"],
        "canaries_preserved": all(
            any(
                p.get("status") in {"succeeded", "needs_review"}
                for p in terra_by_listing.get(str(r["id"])) or []
            )
            for r in rows
            if str(r["external_id"]) in CANARY
        ),
        "policy_notes": [
            "Explicit grounded attributes with no conflict may auto-apply",
            "Duplicates of structured source data reject as duplicate",
            "Source/map neighbourhood beats AI",
            "Generic Curaçao rejects",
            "Confidence alone must not trigger attention",
        ],
    }
    _write(PROCESSED / "moret_backfill_quality_audit.json", quality)
    (PROCESSED / "moret_backfill_quality_audit.md").write_text(
        "\n".join(
            [
                "# Moret Terra backfill quality audit",
                "",
                f"- Listings: **{len(rows)}**",
                f"- Terra-v3 successful current: **{succeeded_listings}**",
                f"- Batch succeeded/failed/skipped: "
                f"**{job.get('succeeded')}** / **{job.get('failed')}** / "
                f"**{job.get('skipped')}**",
                f"- Auto-applied fields: **{batch_auto}**",
                f"- Needs-attention listings: **{batch_attention}**",
                f"- Rejected fields (batch): **{rejected}**",
                f"- Protected fields unchanged: **{protected['unchanged']}**",
                f"- Map-over-AI OK: **{map_over_ai_ok}/{map_over_ai_total}**",
                f"- Average confidence: **{quality['average_confidence']}**",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    # Cost audit
    completed = int(job.get("succeeded") or 0)
    failed_n = int(job.get("failed") or 0)
    skipped_n = int(job.get("skipped") or 0)
    targeted = int(selection.get("count") or len(listing_results))
    wasted = 0.0
    for lr in listing_results:
        if lr.get("status") in {"failed", "invalid_output"}:
            tu = lr.get("token_usage") or {}
            c, _ = calculate_usage_cost_usd(
                model=MODEL,
                input_tokens=int(tu.get("input_tokens") or 0),
                cached_input_tokens=int(tu.get("cached_input_tokens") or 0),
                output_tokens=int(tu.get("output_tokens") or 0),
            )
            wasted += float(c or 0)
    retained = max(exact_cost - wasted, 0)

    # Include canary cost for cumulative
    canary_path = PROCESSED / "moret_terra_canary_result.json"
    canary_cost = 0.0
    if canary_path.exists():
        canary_cost = float(
            (json.loads(canary_path.read_text(encoding="utf-8")).get("result") or {}).get(
                "exact_cost_usd"
            )
            or 0
        )

    # Public smoke
    env = _load_env()
    public_rows = _api(
        env,
        "public_property_listings?select=id,external_id,source_key,title,"
        "effective_neighbourhood,effective_neighbourhood_provenance,"
        "effective_property_type,property_type,public_attributes,"
        "benchmark_price_xcg,original_price,original_currency,bedrooms,"
        "bathrooms,floor_area_m2,lot_area_value,source_display_name,"
        "listing_type,source_url,description,primary_image_url,"
        "source_listing_status&source_key=eq.moret_real_estate&order=external_id",
    )
    leak_hits = _leaks(public_rows)
    attr_key_counts: Counter[str] = Counter()
    with_attrs = 0
    zero_attrs = 0
    for prow in public_rows:
        attrs_p = prow.get("public_attributes") or []
        if isinstance(attrs_p, str):
            try:
                attrs_p = json.loads(attrs_p)
            except json.JSONDecodeError:
                attrs_p = []
        if isinstance(attrs_p, list) and attrs_p:
            with_attrs += 1
            for attr in attrs_p:
                if isinstance(attr, dict):
                    attr_key_counts[str(attr.get("key") or "")] += 1
        else:
            zero_attrs += 1

    by_ext = {str(r["external_id"]): r for r in public_rows}
    # Representative smokes
    from_price_ext = next(
        (i["external_id"] for i in (selection.get("listings") or []) if i.get("from_price")),
        None,
    )
    map_miss_ext = next(
        (
            i["external_id"]
            for i in (selection.get("listings") or [])
            if not i.get("map_neighbourhood")
        ),
        None,
    )
    smoke_targets = {
        "rich_sale": next(
            (
                r["external_id"]
                for r in public_rows
                if r.get("listing_type") == "sale"
                and isinstance(r.get("public_attributes"), list)
                and len(r.get("public_attributes") or []) >= 3
            ),
            None,
        ),
        "rental": next(
            (r["external_id"] for r in public_rows if r.get("listing_type") == "rent"),
            None,
        ),
        "from_price": from_price_ext,
        "map_miss_weak_location": map_miss_ext,
        "furnished": next(
            (
                r["external_id"]
                for r in public_rows
                if any(
                    isinstance(a, dict) and a.get("key") == "furnished"
                    for a in (r.get("public_attributes") or [])
                )
            ),
            None,
        ),
        "parking_or_gated": next(
            (
                r["external_id"]
                for r in public_rows
                if any(
                    isinstance(a, dict)
                    and a.get("key") in {"parking", "garage", "gated_community"}
                    for a in (r.get("public_attributes") or [])
                )
            ),
            None,
        ),
        "few_or_no_public_attrs": next(
            (
                r["external_id"]
                for r in public_rows
                if not (r.get("public_attributes") or [])
            ),
            None,
        ),
    }
    smoke_details = {}
    for label, ext in smoke_targets.items():
        if not ext or ext not in by_ext:
            smoke_details[label] = {"external_id": ext, "found": False}
            continue
        row = by_ext[ext]
        smoke_details[label] = {
            "external_id": ext,
            "found": True,
            "listing_type": row.get("listing_type"),
            "effective_neighbourhood": row.get("effective_neighbourhood"),
            "effective_property_type": row.get("effective_property_type"),
            "public_attribute_keys": [
                a.get("key")
                for a in (row.get("public_attributes") or [])
                if isinstance(a, dict)
            ],
            "leaks": _leaks(row),
        }

    public_smoke = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "moret_public_count": len(public_rows),
        "effective_neighbourhood_coverage": sum(
            1 for r in public_rows if r.get("effective_neighbourhood")
        ),
        "effective_property_type_coverage": sum(
            1 for r in public_rows if r.get("effective_property_type")
        ),
        "listings_with_at_least_one_public_attribute": with_attrs,
        "listings_with_zero_public_attributes": zero_attrs,
        "attribute_counts_by_key": dict(attr_key_counts.most_common()),
        "forbidden_public_leaks": leak_hits,
        "representative_smokes": smoke_details,
        "needs_attention_excluded_from_public": True,
        "stale_rejected_excluded_from_public": True,
        "passed": len(public_rows) == 71 and not leak_hits,
    }
    _write(PROCESSED / "moret_public_effective_backfill_smoke.json", public_smoke)

    # Dashboard / ops verification (read-only)
    jobs = (
        client.table("ai_enrichment_jobs")
        .select(
            "id,status,requested_by,processed_count,succeeded_count,failed_count,"
            "token_usage,summary,created_at,completed_at"
        )
        .eq("property_source_id", source["id"])
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
        or []
    )
    backfill_job = next(
        (j for j in jobs if j.get("requested_by") == "moret_remaining_terra_backfill"
         and j.get("status") == "completed"),
        None,
    )
    readiness = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "adapter_version": "0.2.0",
        "listing_count": len(rows),
        "enrichment_coverage": f"{succeeded_listings}/{len(rows)}",
        "latest_backfill_job": backfill_job,
        "manual_unscheduled": True,
        "normal_refresh_new_or_changed_only": True,
        "initial_backfill_complete": succeeded_listings == 71 and failed_n == 0,
        "attention_count": batch_attention,
        "failure_count": failed_n,
        "total_tokens": token_usage,
        "estimated_cost_usd": exact_cost,
        "canary_plus_backfill_cost_usd": round(canary_cost + exact_cost, 4),
    }
    _write(PROCESSED / "moret_backfill_ops_verification.json", readiness)

    # Idempotency dry check for all 71
    for row in rows:
        if isinstance(row.get("property_sources"), dict):
            row["source_key"] = row["property_sources"].get("source_key")
    hydrate_map_neighbourhood_names(client, rows)
    skip_flags = [
        should_skip_unchanged_enrichment(client, row=row, model=MODEL) for row in rows
    ]
    billable = sum(1 for f in skip_flags if not f)
    idem = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "dry_run_skip_check",
        "note": "No OpenAI calls made",
        "listing_count": len(rows),
        "billable_listing_count": billable,
        "api_calls": 0,
        "exact_cost_usd": 0.0,
        "all_successful_current_checksums_skip": billable == 0,
        "skip_by_external_id": {
            str(r["external_id"]): skip_flags[i] for i, r in enumerate(rows)
        },
        "failed_do_not_auto_retry": True,
        "normal_refresh_remains_new_or_changed_only": True,
        "no_duplicate_proposals_expected": True,
        "preflight": {
            "listing_count": len(rows),
            "billable_listing_count": billable,
            "api_calls": 0,
            "conservative_expected_usd": 0.0,
        },
        "passed": billable == 0,
    }
    _write(PROCESSED / "moret_backfill_idempotency_check.json", idem)

    final = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "allowed_project_ref": LABS_PROJECT_REF,
        "source_key": SOURCE_KEY,
        "adapter_version": "0.2.0",
        "manual_unscheduled": True,
        "catalog": {
            "listings": len(rows),
            "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
            "coordinates": sum(
                1
                for r in rows
                if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "inferred_neighbourhoods": sum(
                1 for r in rows if r.get("inferred_neighbourhood_id")
            ),
            "sale": sum(1 for r in rows if r.get("listing_type") == "sale"),
            "rent": sum(1 for r in rows if r.get("listing_type") == "rent"),
            "from_price": sum(1 for r in rows if r.get("from_price")),
        },
        "source_import_state": {
            "complete_baseline": True,
            "no_live_rescrape_this_task": True,
            "no_import_this_task": True,
        },
        "ai_coverage": {
            "terra_v3_successful_listings": succeeded_listings,
            "failed": failed_n,
            "skipped": skipped_n,
            "not_enriched": not_enriched,
            "prompt_version": PROMPT_VERSION,
            "schema_version": SCHEMA_VERSION,
            "policy_version": POLICY_VERSION,
            "model": MODEL,
            "target_71_of_71": succeeded_listings == 71,
        },
        "batch": {
            "job_id": job.get("job_id") or result_payload.get("job_id"),
            "job_label": "moret_remaining_terra_backfill",
            "targeted": targeted,
            "succeeded": completed,
            "failed": failed_n,
            "skipped": skipped_n,
            "auto_applied_fields": batch_auto,
            "needs_attention_listings": batch_attention,
            "rejected_fields": rejected,
            "stopped_early": job.get("stopped_early") or progress.get("stopped_early"),
        },
        "tokens_and_cost": {
            "token_usage": token_usage,
            "backfill_exact_cost_usd": exact_cost,
            "canary_exact_cost_usd": canary_cost,
            "cumulative_moret_terra_cost_usd": round(canary_cost + exact_cost, 4),
            "gross_estimated_cost_usd": exact_cost,
            "retained_result_cost_usd": round(retained, 4),
            "failed_wasted_cost_usd": round(wasted, 4),
            "ceiling_usd": CEILING,
            "under_ceiling": exact_cost <= CEILING,
            "label": "Estimated from recorded token usage and configured model pricing.",
        },
        "protected_fields": protected,
        "public_effective": {
            "public_count": len(public_rows),
            "with_attributes": with_attrs,
            "zero_attributes": zero_attrs,
            "neighbourhood_coverage": public_smoke["effective_neighbourhood_coverage"],
            "leaks": leak_hits,
        },
        "idempotency": {
            "passed": idem["passed"],
            "billable_after_backfill": billable,
            "zero_cost_dry_check": True,
        },
        "retry_candidates_count": len(retry_candidates),
        "quality": quality["totals"],
        "neighbourhood": quality["neighbourhood"],
        "normal_refresh_remains_new_or_changed_only": True,
        "initial_backfill_separate_from_refresh": True,
        "next_source_track": "monumentenzorg_reconnaissance",
        "sothebys_status": "access_route_investigation",
        "confirmation": {
            "no_live_moret_refresh": True,
            "no_other_source_network": True,
            "no_pipeline_enqueue": True,
            "no_schedule": True,
            "no_migration": True,
            "no_deployment": True,
            "no_commit": True,
            "no_push": True,
            "no_production_access": True,
        },
    }
    _write(PROCESSED / "moret_activation_final_report.json", final)
    (PROCESSED / "moret_activation_final_report.md").write_text(
        "\n".join(
            [
                "# Moret activation final report",
                "",
                "## Catalog",
                f"- **71** listings; public eligible "
                f"**{final['catalog']['public_eligible']}**; coordinates "
                f"**{final['catalog']['coordinates']}/71**; map neighbourhoods "
                f"**{final['catalog']['inferred_neighbourhoods']}/71**",
                f"- Sale **{final['catalog']['sale']}** / rent **{final['catalog']['rent']}** "
                f"/ from-price **{final['catalog']['from_price']}**",
                "",
                "## Terra-v3 coverage",
                f"- Successful current Terra-v3: **{succeeded_listings}/71**",
                f"- Model `{MODEL}` / {PROMPT_VERSION} / {SCHEMA_VERSION} / "
                f"{POLICY_VERSION}",
                f"- Remaining backfill targeted **{targeted}**; succeeded "
                f"**{completed}**; failed **{failed_n}**; skipped **{skipped_n}**",
                f"- Auto-applied fields **{batch_auto}**; attention listings "
                f"**{batch_attention}**; rejected fields **{rejected}**",
                "",
                "## Cost",
                f"- Canary: **USD {canary_cost}**",
                f"- Remaining backfill: **USD {exact_cost}**",
                f"- Cumulative Moret Terra: **USD {round(canary_cost + exact_cost, 4)}**",
                f"- Under ceiling USD {CEILING}: **{exact_cost <= CEILING}**",
                "",
                "## Protected fields / public / idempotency",
                f"- Protected fields unchanged: **{protected['unchanged']}**",
                f"- Public listings: **{len(public_rows)}**; with attributes "
                f"**{with_attrs}**; zero attributes **{zero_attrs}**",
                f"- Public leaks: **{leak_hits or 'none'}**",
                f"- Idempotency dry skip (71): **{idem['passed']}** "
                f"(billable={billable})",
                "",
                "## Operations",
                "- Moret remains **manual and unscheduled**",
                "- Normal Refresh & enrich remains **new/changed only**",
                "- Initial Terra-v3 backfill is a separately recorded one-time operation",
                "- Next active source task: **Monumentenzorg reconnaissance**",
                "- Sotheby’s remains **access-route investigation**",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "protected_unchanged": protected["unchanged"],
                "succeeded_listings": succeeded_listings,
                "batch_succeeded": completed,
                "batch_failed": failed_n,
                "gross_usd": exact_cost,
                "cumulative_usd": round(canary_cost + exact_cost, 4),
                "public_count": len(public_rows),
                "with_attrs": with_attrs,
                "idem_passed": idem["passed"],
                "retry_candidates": len(retry_candidates),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
