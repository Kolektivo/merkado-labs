"""Run Labs AI enrichment for an explicit listing selection (KW canary or remaining)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment.jobs import (  # noqa: E402
    create_enrichment_job,
    hydrate_map_neighbourhood_names,
    process_enrichment_job,
    should_skip_unchanged_enrichment,
)
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

DEFAULT_REMAX_IDS = ("hs3080", "hs3059", "hs2540", "hr2155", "hr1394")
CANARY_EXTERNAL_IDS = frozenset(
    {"001JVD", "ADL-0006", "ZK2423", "JC-003", "ID-002"}
)
REMAX_TERRA_CANARY_EXTERNAL_IDS = frozenset(
    {"hs2467", "hr1013", "hr2165", "hs2941", "hr1393"}
)
MORET_TERRA_CANARY_EXTERNAL_IDS = frozenset(
    {"post-75682", "post-75725", "post-74976", "post-75799", "post-74710"}
)
KW_SOURCE = "keller_williams_curacao"
REMAX_SOURCE = "remax_curacao"
MORET_SOURCE = "moret_real_estate"


def _load_selection(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    listing_ids = [str(item) for item in (payload.get("listing_ids") or [])]
    if not listing_ids and payload.get("listings"):
        listing_ids = [str(item["listing_id"]) for item in payload["listings"]]
    if not listing_ids:
        raise SystemExit(f"Selection file {path} has no listing_ids")
    payload["listing_ids"] = listing_ids
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listing-ids", default=None, help="Comma-separated listing UUIDs")
    parser.add_argument("--external-ids", nargs="*", default=None)
    parser.add_argument(
        "--selection-file",
        type=Path,
        default=None,
        help="Deterministic JSON selection (required for batches larger than 5)",
    )
    parser.add_argument(
        "--source-key",
        default=KW_SOURCE,
        help="Property source key when resolving --external-ids / selection",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Must match OPENAI_ENRICHMENT_MODEL when provided (verification only)",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--max-estimated-cost-usd", type=float, default=None)
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip listings already completed for the current input checksum",
    )
    parser.add_argument("--dry-run-skip-check", action="store_true")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--progress-file",
        type=Path,
        default=None,
        help="Resumable progress JSON written after every listing",
    )
    args = parser.parse_args()

    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project ref {ref!r}")

    settings = get_settings()
    env_model = (settings.openai_enrichment_model or "").strip()
    if not env_model:
        raise SystemExit(
            "OPENAI_ENRICHMENT_MODEL is required locally (expected gpt-5.6-terra)"
        )
    if args.model and args.model.strip() != env_model:
        raise SystemExit(
            f"--model {args.model!r} does not match OPENAI_ENRICHMENT_MODEL={env_model!r}"
        )
    if env_model != "gpt-5.6-terra":
        raise SystemExit(
            f"Refusing run: OPENAI_ENRICHMENT_MODEL={env_model!r}, "
            "expected exactly 'gpt-5.6-terra'"
        )
    if args.batch_size != 1:
        raise SystemExit("--batch-size must be 1 for safe per-listing persistence")

    client = create_labs_client()
    listing_ids: list[str] = []
    selected_rows: list[dict] = []
    selection_meta: dict | None = None
    mode = "legacy_external_ids"

    if args.selection_file:
        mode = "selection_file"
        selection_meta = _load_selection(args.selection_file)
        if selection_meta.get("source_key") not in {None, args.source_key}:
            raise SystemExit(
                f"Selection source_key {selection_meta.get('source_key')!r} "
                f"does not match --source-key {args.source_key!r}"
            )
        if selection_meta.get("model_required") not in {None, env_model}:
            raise SystemExit(
                f"Selection model_required {selection_meta.get('model_required')!r} "
                f"does not match {env_model!r}"
            )
        listing_ids = list(selection_meta["listing_ids"])
        expected_count = selection_meta.get("count")
        if expected_count is not None and int(expected_count) != len(listing_ids):
            raise SystemExit(
                f"Selection count {expected_count} != listing_ids length {len(listing_ids)}"
            )
        if len(listing_ids) != len(set(listing_ids)):
            raise SystemExit("Selection contains duplicate listing IDs")
        if args.source_key == REMAX_SOURCE and selection_meta.get("allow_canary"):
            external_ids = [str(x) for x in (selection_meta.get("external_ids") or [])]
            if set(external_ids) != REMAX_TERRA_CANARY_EXTERNAL_IDS:
                raise SystemExit(
                    "RE/MAX Terra canary selection must be exactly "
                    f"{sorted(REMAX_TERRA_CANARY_EXTERNAL_IDS)}; got {sorted(external_ids)}"
                )
            if len(listing_ids) != 5:
                raise SystemExit(
                    f"RE/MAX Terra canary must target exactly 5 listings, got {len(listing_ids)}"
                )
        if args.source_key == MORET_SOURCE and selection_meta.get("allow_canary"):
            external_ids = [str(x) for x in (selection_meta.get("external_ids") or [])]
            if set(external_ids) != MORET_TERRA_CANARY_EXTERNAL_IDS:
                raise SystemExit(
                    "Moret Terra canary selection must be exactly "
                    f"{sorted(MORET_TERRA_CANARY_EXTERNAL_IDS)}; got {sorted(external_ids)}"
                )
            if len(listing_ids) != 5:
                raise SystemExit(
                    f"Moret Terra canary must target exactly 5 listings, got {len(listing_ids)}"
                )
    elif args.listing_ids:
        mode = "listing_ids"
        listing_ids = [part.strip() for part in args.listing_ids.split(",") if part.strip()]
    else:
        external_ids = args.external_ids or list(DEFAULT_REMAX_IDS)
        source = resolve_property_source(client, args.source_key)
        rows = (
            client.table("property_listings")
            .select(
                "id,external_id,title,status,listing_type,source_listing_status,"
                "source_neighbourhood_text,bedrooms,bathrooms,original_price,"
                "public_eligible,enrichment_status,description,property_source_id"
            )
            .eq("property_source_id", source["id"])
            .in_("external_id", external_ids)
            .execute()
            .data
            or []
        )
        selected_rows = rows
        listing_ids = [str(row["id"]) for row in rows]

    if not listing_ids:
        raise SystemExit("No listings found for requested ids")
    if mode != "selection_file" and len(listing_ids) > 5:
        raise SystemExit(
            "Batches larger than 5 require --selection-file "
            "(refuses manually pasted comma-separated lists)"
        )

    source = resolve_property_source(client, args.source_key)
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,status,listing_type,source_listing_status,"
            "source_neighbourhood_text,bedrooms,bathrooms,original_price,"
            "public_eligible,enrichment_status,description,property_source_id,"
            "property_sources(source_key)"
        )
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )
    by_id = {str(row["id"]): row for row in rows}
    if len(by_id) != len(listing_ids):
        missing = [lid for lid in listing_ids if lid not in by_id]
        raise SystemExit(f"Selection contains unknown listing IDs: {missing[:10]}")
    # Preserve selection order.
    selected_rows = [by_id[lid] for lid in listing_ids]

    for row in selected_rows:
        source_key = None
        if isinstance(row.get("property_sources"), dict):
            source_key = row["property_sources"].get("source_key")
        if source_key and source_key != args.source_key:
            raise SystemExit(
                f"Listing {row['external_id']} source_key={source_key!r} "
                f"is outside approved source {args.source_key!r}"
            )
        if str(row.get("property_source_id")) != str(source["id"]):
            raise SystemExit(
                f"Listing {row['external_id']} is not in source {args.source_key}"
            )
        if (
            args.source_key == KW_SOURCE
            and mode == "selection_file"
            and str(row.get("external_id")) in CANARY_EXTERNAL_IDS
            and not (selection_meta or {}).get("idempotency_check")
            and not (selection_meta or {}).get("allow_canary")
        ):
            raise SystemExit(
                f"Refusing canary listing {row['external_id']} in remaining batch"
            )
        if (
            args.source_key == MORET_SOURCE
            and mode == "selection_file"
            and str(row.get("external_id")) in MORET_TERRA_CANARY_EXTERNAL_IDS
            and not (selection_meta or {}).get("idempotency_check")
            and not (selection_meta or {}).get("allow_canary")
        ):
            raise SystemExit(
                f"Refusing Moret canary listing {row['external_id']} in remaining batch"
            )

    running = (
        client.table("ai_enrichment_jobs")
        .select("id,status,created_at")
        .eq("status", "running")
        .execute()
        .data
        or []
    )
    if running and not args.resume:
        raise SystemExit(f"Refusing: running enrichment job(s): {running}")

    max_output = int(settings.openai_enrichment_max_output_tokens or 3500)
    # When not forcing, exclude listings that already have an identical
    # model+prompt+schema+checksum terminal proposal (v1 never blocks v3).
    billable_ids = list(listing_ids)
    if not args.force:
        billable_ids = []
        preview_rows: list[dict] = []
        for row in selected_rows:
            preview = dict(row)
            if isinstance(preview.get("property_sources"), dict):
                preview["source_key"] = preview["property_sources"].get("source_key")
            # Need full fields for checksum; fetch when thin.
            if (
                preview.get("enrichment_last_input_checksum") is None
                or "amenities" not in preview
                or (
                    preview.get("inferred_neighbourhood_id")
                    and not preview.get("inferred_neighbourhood_name")
                )
            ):
                full = (
                    client.table("property_listings")
                    .select(
                        "id,external_id,source_url,title,description,listing_type,"
                        "property_type,source_listing_status,status,bedrooms,bathrooms,"
                        "floor_area_m2,lot_area_value,lot_area_unit,"
                        "source_neighbourhood_text,original_price,original_currency,"
                        "latitude,longitude,amenities,enrichment_status,"
                        "enrichment_last_input_checksum,"
                        "neighbourhood_assignment_status,neighbourhood_assignment_method,"
                        "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
                        "property_sources(source_key)"
                    )
                    .eq("id", row["id"])
                    .limit(1)
                    .execute()
                    .data
                    or [preview]
                )
                preview = full[0]
                if isinstance(preview.get("property_sources"), dict):
                    preview["source_key"] = preview["property_sources"].get("source_key")
            preview_rows.append(preview)
        hydrate_map_neighbourhood_names(client, preview_rows)
        for preview in preview_rows:
            if should_skip_unchanged_enrichment(
                client, row=preview, model=env_model
            ):
                continue
            billable_ids.append(str(preview["id"]))

    estimate = estimate_enrichment_cost(model=env_model, listing_count=len(billable_ids))
    worst_output = len(billable_ids) * max_output
    worst_cost, worst_note = calculate_usage_cost_usd(
        model=env_model,
        input_tokens=estimate.input_tokens,
        cached_input_tokens=0,
        output_tokens=worst_output,
    )
    # Observed per-listing averages for preflight gating on large batches.
    # Absolute max-output worst case can exceed the approved ceiling even when
    # the expected/conservative run is well under it; mid-run budget stop in
    # process_enrichment_job still refuses the next call when remaining budget
    # cannot cover a single listing's max-output worst case.
    if args.source_key == REMAX_SOURCE:
        observed_avg_usd = 0.035
    elif args.source_key == MORET_SOURCE:
        # Observed Moret Terra canary average (5/5 @ USD 0.1165 exact).
        observed_avg_usd = 0.0233
    else:
        observed_avg_usd = 0.03956
    expected_from_canary = round(observed_avg_usd * len(billable_ids), 4)
    retry_count = max(0, int(len(billable_ids) * 0.05))
    avg_out_for_retry = 1600 if args.source_key == REMAX_SOURCE else 700
    retry_cost, _ = calculate_usage_cost_usd(
        model=env_model,
        input_tokens=retry_count
        * max(estimate.input_tokens // max(len(billable_ids), 1), 1),
        cached_input_tokens=0,
        output_tokens=retry_count * avg_out_for_retry,
    )
    conservative_usd = round(
        expected_from_canary * 1.25 + float(retry_cost or 0), 4
    )
    preflight = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "mode": mode,
        "model": env_model,
        "source_key": args.source_key,
        "listing_count": len(listing_ids),
        "billable_listing_count": len(billable_ids),
        "api_calls": len(billable_ids),
        "potential_retry_allowance": len(billable_ids),  # at most one transport retry each
        "estimated_input_tokens": estimate.input_tokens,
        "estimated_output_tokens": estimate.output_tokens,
        "expected_cost_usd_default_rates": float(estimate.estimated_usd),
        "expected_cost_usd_from_canary_avg": expected_from_canary,
        "conservative_expected_usd": conservative_usd,
        "worst_case_output_tokens": worst_output,
        "worst_case_cost_usd": float(worst_cost) if worst_cost is not None else None,
        "worst_case_note": worst_note,
        "max_output_tokens_per_listing": max_output,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "max_estimated_cost_usd": args.max_estimated_cost_usd,
        "resume": bool(args.resume),
        "selection_file": str(args.selection_file) if args.selection_file else None,
        "excluded_canary_external_ids": sorted(CANARY_EXTERNAL_IDS)
        if mode == "selection_file"
        else [],
        "selected": [
            {
                "listing_id": row["id"],
                "external_id": row["external_id"],
                "title": row.get("title"),
                "listing_type": row.get("listing_type"),
                "status": row.get("status"),
                "source_listing_status": row.get("source_listing_status"),
                "source_location": row.get("source_neighbourhood_text"),
                "bedrooms": row.get("bedrooms"),
                "bathrooms": row.get("bathrooms"),
                "original_price": row.get("original_price"),
                "public_eligible": row.get("public_eligible"),
                "enrichment_status": row.get("enrichment_status"),
                "description_length": len(row.get("description") or ""),
            }
            for row in selected_rows
        ],
    }
    print(json.dumps({"preflight": preflight}, indent=2, default=str))

    if args.max_estimated_cost_usd is not None:
        ceiling = float(args.max_estimated_cost_usd)
        # Gate on conservative expected cost for large batches and approved
        # canary selection files; absolute max-output * N is reported but not
        # used as a hard preflight refuse when mid-run budget enforcement is
        # active (process_enrichment_job still refuses the next call when the
        # remaining budget cannot cover one listing's max-output worst case).
        approved_canary = bool((selection_meta or {}).get("allow_canary"))
        gate_cost = (
            conservative_usd
            if len(billable_ids) > 20 or approved_canary
            else (float(worst_cost) if worst_cost is not None else None)
        )
        if gate_cost is None or gate_cost > ceiling:
            raise SystemExit(
                f"Conservative/preflight cost {gate_cost} exceeds ceiling {ceiling} "
                f"(absolute max-output worst case={worst_cost})"
            )

    progress_path = args.progress_file
    if progress_path is None and args.output:
        progress_path = args.output.with_name(args.output.stem + "_progress.json")

    if args.dry_run_skip_check:
        payload = {
            "mode": "dry_run_skip_check",
            "preflight": preflight,
            "note": "No OpenAI calls made",
        }
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(
                json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8"
            )
        print(json.dumps(payload, indent=2, default=str))
        return 0

    property_source_id = str(source["id"])
    selection_name = args.selection_file.name if args.selection_file else ""
    if args.source_key == "remax_curacao":
        requested_by = (
            (selection_meta or {}).get("job_label")
            if isinstance(selection_meta, dict) and (selection_meta or {}).get("job_label")
            else "remax_terra_canary"
        )
        if not requested_by and selection_name and "remaining" in selection_name:
            requested_by = "remax_remaining_terra_backfill"
    elif args.source_key == MORET_SOURCE:
        if (selection_meta or {}).get("allow_canary"):
            requested_by = "moret_terra_canary"
        elif "remaining" in selection_name:
            requested_by = "moret_remaining_terra_backfill"
        else:
            requested_by = "moret_terra_selection"
    elif mode == "selection_file" and "retry" in selection_name:
        requested_by = "kw_terra_retry_24"
    elif mode == "selection_file":
        requested_by = "kw_terra_remaining79"
    else:
        requested_by = "kw_terra_canary"

    job_id = create_enrichment_job(
        client,
        scope_type="manual_selection",
        scope_filter={
            "listing_ids": listing_ids,
            "source_key": args.source_key,
            "selection_file": str(args.selection_file) if args.selection_file else None,
            "canary": bool((selection_meta or {}).get("allow_canary"))
            if mode == "selection_file"
            else True,
            "remaining_batch": mode == "selection_file"
            and not bool((selection_meta or {}).get("allow_canary")),
            "job_label": requested_by,
        },
        listing_ids=listing_ids,
        model=env_model,
        requested_by=requested_by,
        property_source_id=property_source_id,
    )
    result = process_enrichment_job(
        job_id,
        listing_ids=listing_ids,
        batch_size=1,
        force=args.force,
        model=env_model,
        client=client,
        persist_timeline=True,
        max_estimated_cost_usd=args.max_estimated_cost_usd,
        resume=args.resume,
        progress_path=progress_path,
    )
    payload = {
        "preflight": preflight,
        "job_id": job_id,
        "result": result,
        "completed_at": datetime.now(UTC).isoformat(),
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8"
        )
    print(json.dumps(payload, indent=2, default=str))
    return 0 if result.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
