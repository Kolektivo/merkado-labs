"""Batch enrichment job runner shared by scripts and dashboard server routes.

Applies automatic enrichment policy locally after model output. Does not
overwrite source facts. Timeline event inserts require the AI event-type
migration; drafts are always stored on the proposal for auditability.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from merkado_labs.config import get_settings
from merkado_labs.enrichment import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    EnrichmentInput,
    EnrichmentResult,
    compute_input_checksum,
    compute_legacy_input_checksum,
    enrich_listing,
    has_complete_english_presentation,
    requires_english_presentation_migration,
)
from merkado_labs.enrichment.policy import POLICY_VERSION
from merkado_labs.enrichment.pricing import (
    DEFAULT_INPUT_TOKENS_PER_LISTING,
    calculate_usage_cost_usd,
    estimate_enrichment_cost,
)
from merkado_labs.enrichment.timeline import (
    build_auto_applied_event,
    build_enrichment_completed_event,
    build_enrichment_failed_event,
    build_enrichment_skipped_event,
    build_enrichment_started_event,
    build_needs_attention_event,
    dedupe_event_drafts,
)
from merkado_labs.enrichment.values import AutoApplyStatus
from merkado_labs.scrapers.import_pipeline import create_labs_client


def _require_labs() -> None:
    settings = get_settings()
    if settings.supabase_project_ref != "csaefdkpwukshtouyixg":
        raise RuntimeError(f"Refusing non-Labs project ref {settings.supabase_project_ref!r}")


def find_matching_enrichment_attempt(
    client: Any,
    *,
    listing_id: str,
    model: str,
    input_checksum: str,
    prompt_version: str = PROMPT_VERSION,
    schema_version: str = SCHEMA_VERSION,
    alternate_checksums: Sequence[str] | None = None,
    match_any_prompt_schema: bool = False,
) -> dict[str, Any] | None:
    """Return the newest matching proposal row, or None.

    By default requires the current prompt/schema. When
    ``match_any_prompt_schema`` is True, any successful Terra proposal with the
    same semantic ``input_checksum`` matches — callers must still decide whether
    English presentation is complete enough to skip a paid re-run.

    ``alternate_checksums`` allows semantic/legacy dual-match so a coordinate-only
    import does not invalidate an otherwise unchanged Terra proposal.
    """

    candidates = [input_checksum]
    if alternate_checksums:
        candidates.extend(str(item) for item in alternate_checksums if item)
    seen: set[str] = set()
    for checksum in candidates:
        if not checksum or checksum in seen:
            continue
        seen.add(checksum)
        # Keep eq order stable for callers/tests that mock the chain:
        # listing_id → model → [prompt → schema] → input_checksum → status.
        query = (
            client.table("ai_enrichment_proposals")
            .select("id,status,proposal,prompt_version,schema_version")
            .eq("property_listing_id", listing_id)
            .eq("model", model)
        )
        if not match_any_prompt_schema:
            query = query.eq("prompt_version", prompt_version).eq(
                "schema_version", schema_version
            )
        rows = (
            query.eq("input_checksum", checksum)
            .in_("status", ["succeeded", "needs_review", "skipped_unchanged"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0] if isinstance(rows[0], dict) else dict(rows[0])
    return None


def has_identical_enrichment_attempt(
    client: Any,
    *,
    listing_id: str,
    model: str,
    input_checksum: str,
    prompt_version: str = PROMPT_VERSION,
    schema_version: str = SCHEMA_VERSION,
    alternate_checksums: Sequence[str] | None = None,
    match_any_prompt_schema: bool = False,
) -> bool:
    """Return True when the same model (+ optional prompt/schema) checksum succeeded."""

    return (
        find_matching_enrichment_attempt(
            client,
            listing_id=listing_id,
            model=model,
            input_checksum=input_checksum,
            prompt_version=prompt_version,
            schema_version=schema_version,
            alternate_checksums=alternate_checksums,
            match_any_prompt_schema=match_any_prompt_schema,
        )
        is not None
    )


def has_successful_terra_attempt(
    client: Any,
    *,
    listing_id: str,
    model: str,
    prompt_version: str = PROMPT_VERSION,
    schema_version: str = SCHEMA_VERSION,
) -> bool:
    """True when any successful Terra proposal exists for this listing/version."""

    rows = (
        client.table("ai_enrichment_proposals")
        .select("id")
        .eq("property_listing_id", listing_id)
        .eq("model", model)
        .eq("prompt_version", prompt_version)
        .eq("schema_version", schema_version)
        .in_("status", ["succeeded", "needs_review", "skipped_unchanged"])
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _coords_cleared_row(row: dict[str, Any]) -> dict[str, Any]:
    """Twin row with coordinates / map assignment cleared (operational delta)."""

    twin = dict(row)
    twin["latitude"] = None
    twin["longitude"] = None
    twin["coordinates_source"] = None
    twin["neighbourhood_assignment_status"] = "missing_coords"
    twin["neighbourhood_assignment_method"] = None
    twin["neighbourhood_assignment_confidence"] = None
    twin["inferred_neighbourhood_id"] = None
    twin["inferred_neighbourhood_name"] = None
    twin["map_neighbourhood_name"] = None
    return twin


def hydrate_map_neighbourhood_names(
    client: Any, rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Attach inferred neighbourhood display names for effective-neighbourhood resolution."""

    ids = sorted(
        {
            str(row.get("inferred_neighbourhood_id"))
            for row in rows
            if row.get("inferred_neighbourhood_id")
        }
    )
    if not ids:
        return rows
    nb_map: dict[str, str] = {}
    for start in range(0, len(ids), 100):
        chunk = ids[start : start + 100]
        for nb in (
            client.table("neighbourhoods")
            .select("id,name")
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            nb_map[str(nb["id"])] = str(nb.get("name") or "")
    for row in rows:
        nb_id = row.get("inferred_neighbourhood_id")
        if not nb_id:
            continue
        name = nb_map.get(str(nb_id))
        if name:
            row["inferred_neighbourhood_name"] = name
            row.setdefault("map_neighbourhood_name", name)
    return rows


def is_operational_only_enrichment_delta(row: dict[str, Any]) -> bool:
    """True when semantic AI input matches the no-coordinates twin of this row."""

    current = listing_to_enrichment_input(row)
    twin = listing_to_enrichment_input(_coords_cleared_row(row))
    return compute_input_checksum(current) == compute_input_checksum(twin)


def should_skip_unchanged_enrichment(
    client: Any,
    *,
    row: dict[str, Any],
    model: str,
    prompt_version: str = PROMPT_VERSION,
    schema_version: str = SCHEMA_VERSION,
) -> bool:
    """Skip paid AI when checksum matches a complete English presentation.

    Same checksum + complete current English contract (display_title,
    display_summary, display overview/description auto-applied) → skip.
    Same checksum but missing those fields → repair required (billable once).
    Older prompt/schema without the English contract → one-time migration
    (``match_any_prompt_schema`` alone is not enough unless presentation is
    already complete). Currency/coordinate/operational-only deltas remain
    zero-cost.

    The listing's stored ``enrichment_last_input_checksum`` is intentionally NOT
    an alternate match on its own — a stale last-checksum would incorrectly skip
    genuine semantic changes (e.g. map effective-neighbourhood gap-fill).
    """

    listing_id = str(row["id"])
    enrichment_input = listing_to_enrichment_input(row)
    checksum = compute_input_checksum(enrichment_input)
    legacy = compute_legacy_input_checksum(enrichment_input)

    # Coordinate/currency/operational-only deltas are zero-cost only when a
    # complete English presentation already exists. Incomplete / pre-v5
    # presentation still requires a one-time billable migration.
    if is_operational_only_enrichment_delta(row):
        ops_match = find_matching_enrichment_attempt(
            client,
            listing_id=listing_id,
            model=model,
            input_checksum=checksum,
            prompt_version=prompt_version,
            schema_version=schema_version,
            alternate_checksums=[legacy],
            match_any_prompt_schema=True,
        )
        if ops_match is None:
            # No checksum match — fall through. Successful Terra alone is not
            # enough when presentation is incomplete.
            pass
        else:
            proposal = ops_match.get("proposal")
            if isinstance(proposal, dict) and has_complete_english_presentation(
                proposal
            ):
                return True

    current_match = find_matching_enrichment_attempt(
        client,
        listing_id=listing_id,
        model=model,
        input_checksum=checksum,
        prompt_version=prompt_version,
        schema_version=schema_version,
        alternate_checksums=[legacy],
    )
    if current_match is not None:
        proposal = current_match.get("proposal")
        if isinstance(proposal, dict) and has_complete_english_presentation(proposal):
            return True
        # Incomplete current-contract proposal → do not skip (repair).
        return False

    # Cross-version match only skips when English presentation is already complete.
    any_match = find_matching_enrichment_attempt(
        client,
        listing_id=listing_id,
        model=model,
        input_checksum=checksum,
        prompt_version=prompt_version,
        schema_version=schema_version,
        alternate_checksums=[legacy],
        match_any_prompt_schema=True,
    )
    if any_match is not None:
        proposal = any_match.get("proposal")
        if isinstance(proposal, dict) and not requires_english_presentation_migration(
            prompt_version=any_match.get("prompt_version"),
            schema_version=any_match.get("schema_version"),
            proposal=proposal if isinstance(proposal, dict) else None,
            current_prompt_version=prompt_version,
            current_schema_version=schema_version,
        ):
            return True
        # Old/incomplete contract → one-time billable English migration.
        return False

    return False


def listing_to_enrichment_input(row: dict[str, Any]) -> EnrichmentInput:
    amenities = row.get("amenities") or []
    if not isinstance(amenities, list):
        amenities = []

    effective_attrs = row.get("effective_attributes") or row.get(
        "enrichment_effective_attributes"
    )
    if not isinstance(effective_attrs, list):
        # Derive lightweight effective attrs from amenities when present.
        effective_attrs = []
        for item in amenities:
            if isinstance(item, dict) and item.get("key"):
                effective_attrs.append(
                    {
                        "key": item.get("key"),
                        "effective_value": item.get("value", item.get("label")),
                        "provenance": item.get("provenance") or "source",
                    }
                )

    lat = row.get("latitude")
    lon = row.get("longitude")
    coordinates_available = lat is not None and lon is not None

    location_explicit = bool(
        row.get("source_neighbourhood_text") or row.get("location_text")
    )
    assignment_status = row.get("neighbourhood_assignment_status")
    location_explicit_vs_inferred = (
        "explicit"
        if location_explicit
        else ("inferred" if assignment_status else "unknown")
    )

    structured_features = row.get("structured_evidence") or {}
    if not isinstance(structured_features, dict):
        structured_features = {}

    from merkado_labs.enrichment.neighbourhood import resolve_effective_neighbourhood

    map_name = row.get("inferred_neighbourhood_name") or row.get("map_neighbourhood_name")
    ai_name = row.get("ai_neighbourhood_name") or row.get("neighbourhood_candidate")
    ai_confidence = row.get("ai_neighbourhood_confidence") or row.get(
        "neighbourhood_candidate_confidence"
    )
    ai_grounded = row.get("ai_neighbourhood_evidence_grounded")
    if ai_grounded is None and row.get("neighbourhood_evidence"):
        ai_grounded = True
    effective = resolve_effective_neighbourhood(
        source_name=row.get("source_neighbourhood_text"),
        map_name=map_name,
        ai_candidate_name=ai_name,
        ai_candidate_confidence=(
            float(ai_confidence) if ai_confidence is not None else None
        ),
        ai_evidence_grounded=(
            bool(ai_grounded) if ai_grounded is not None else None
        ),
    )

    return EnrichmentInput(
        listing_id=str(row["id"]),
        external_id=str(row["external_id"]),
        source_key=str(
            row.get("source_key")
            or (row.get("property_sources") or {}).get("source_key")
            or ""
        ),
        source_url=str(row.get("source_url") or ""),
        title=row.get("title"),
        source_description=row.get("description"),
        cleaned_listing_text=row.get("cleaned_listing_text") or row.get("description"),
        deterministic_fields={
            "listing_type": row.get("listing_type"),
            "property_type": row.get("property_type"),
            "source_listing_status": row.get("source_listing_status"),
            "status": row.get("status"),
            "bedrooms": row.get("bedrooms"),
            "bathrooms": row.get("bathrooms"),
            "floor_area_m2": row.get("floor_area_m2"),
            "lot_area_value": row.get("lot_area_value"),
            "lot_area_unit": row.get("lot_area_unit"),
            "source_neighbourhood_text": row.get("source_neighbourhood_text"),
            "location_text": row.get("location_text")
            or row.get("source_neighbourhood_text"),
            "dedicated_source_location": row.get("location_text")
            or row.get("source_neighbourhood_text"),
            "coordinates_available": coordinates_available,
            "geospatial_assignment": {
                "status": assignment_status,
                "method": row.get("neighbourhood_assignment_method"),
                "confidence": row.get("neighbourhood_assignment_confidence"),
                "inferred_neighbourhood_id": row.get("inferred_neighbourhood_id"),
            },
            "effective_neighbourhood": effective.as_dict(),
            "inferred_neighbourhood_name": map_name,
            "map_neighbourhood_name": map_name,
            "location_evidence": row.get("location_evidence"),
            "matched_alias": row.get("matched_alias")
            or row.get("neighbourhood_matched_alias"),
            "location_match_source": row.get("location_match_source")
            or row.get("neighbourhood_assignment_method"),
            "location_explicit_vs_inferred": location_explicit_vs_inferred,
            "location_explicit": location_explicit,
            "existing_structured_features": structured_features.get("features")
            or amenities,
            "parser_warnings": row.get("parser_warnings") or row.get("warnings") or [],
            # Identity/money kept out of model payload via build_enrichment_input_payload
            # but available to policy as source_values.
            "original_price": row.get("original_price"),
            "original_currency": row.get("original_currency"),
        },
        amenities=amenities,
        existing_effective_attributes=effective_attrs,
        prompt_version=PROMPT_VERSION,
        schema_version=SCHEMA_VERSION,
    )


def create_enrichment_job(
    client: Any,
    *,
    scope_type: str,
    scope_filter: dict[str, Any],
    listing_ids: Sequence[str],
    model: str,
    requested_by: str | None = None,
    property_source_id: str | None = None,
) -> str:
    row = (
        client.table("ai_enrichment_jobs")
        .insert(
            {
                "scope_type": scope_type,
                "scope_filter": scope_filter,
                "property_source_id": property_source_id,
                "requested_by": requested_by,
                "status": "queued",
                "model": model,
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "total_listings": len(listing_ids),
                "summary": {"listing_ids": list(listing_ids)},
            }
        )
        .execute()
        .data
        or []
    )
    return str(row[0]["id"])


def _build_run_audit(
    *,
    listing_id: str,
    result: EnrichmentResult,
    previous_effective: dict[str, Any],
) -> dict[str, Any]:
    policy = result.policy_evaluation or {}
    decisions = policy.get("decisions") or []
    auto_keys = [
        d["key"]
        for d in decisions
        if d.get("final_status") == AutoApplyStatus.AUTO_APPLIED.value
    ]
    attention_keys = [
        d["key"]
        for d in decisions
        if d.get("final_status") == AutoApplyStatus.NEEDS_ATTENTION.value
    ]
    rejected_keys = [
        d["key"]
        for d in decisions
        if d.get("final_status") == AutoApplyStatus.REJECTED.value
    ]
    resulting = {
        d["key"]: d.get("resulting_effective")
        for d in decisions
        if d.get("final_status") == AutoApplyStatus.AUTO_APPLIED.value
    }
    cost_note = None
    estimated_cost = None
    if result.token_usage:
        from merkado_labs.enrichment.pricing import cost_from_token_usage

        estimated_cost, cost_note = cost_from_token_usage(
            result.model, result.token_usage
        )

    return {
        "listing_id": listing_id,
        "model": result.model,
        "prompt_version": result.prompt_version,
        "schema_version": result.schema_version,
        "policy_version": POLICY_VERSION,
        "input_checksum": result.input_checksum,
        "started_at": result.generated_at.isoformat(),
        "completed_at": result.generated_at.isoformat(),
        "result_status": result.status,
        "token_usage": result.token_usage,
        "estimated_cost_usd": estimated_cost,
        "cost_note": cost_note,
        "fields_proposed": len(decisions),
        "fields_auto_applied": auto_keys,
        "fields_needing_attention": attention_keys,
        "fields_rejected": rejected_keys,
        "error_information": result.error_message,
        "previous_effective_values": previous_effective,
        "resulting_effective_values": {**previous_effective, **resulting},
        "policy": policy,
    }


def _timeline_drafts_for_result(
    *,
    result: EnrichmentResult,
    job_id: str,
    audit: dict[str, Any],
) -> list[dict[str, Any]]:
    drafts = []
    if result.status == "skipped_unchanged":
        drafts.append(
            build_enrichment_skipped_event(
                model=result.model,
                input_checksum=result.input_checksum,
                job_id=job_id,
                event_at=result.generated_at,
            )
        )
    elif result.status in {"failed", "invalid_output"}:
        drafts.append(
            build_enrichment_started_event(
                model=result.model,
                input_checksum=result.input_checksum,
                job_id=job_id,
                event_at=result.generated_at,
            )
        )
        drafts.append(
            build_enrichment_failed_event(
                model=result.model,
                error_message=result.error_message,
                input_checksum=result.input_checksum,
                job_id=job_id,
                event_at=result.generated_at,
            )
        )
    else:
        drafts.append(
            build_enrichment_started_event(
                model=result.model,
                input_checksum=result.input_checksum,
                job_id=job_id,
                event_at=result.generated_at,
            )
        )
        drafts.append(
            build_enrichment_completed_event(
                model=result.model,
                fields_proposed=int(audit.get("fields_proposed") or 0),
                fields_auto_applied=len(audit.get("fields_auto_applied") or []),
                fields_needs_attention=len(audit.get("fields_needing_attention") or []),
                fields_rejected=len(audit.get("fields_rejected") or []),
                input_checksum=result.input_checksum,
                job_id=job_id,
                event_at=result.generated_at,
            )
        )
        auto_event = build_auto_applied_event(
            model=result.model,
            applied_keys=list(audit.get("fields_auto_applied") or []),
            job_id=job_id,
            event_at=result.generated_at,
        )
        if auto_event:
            drafts.append(auto_event)
        attention_event = build_needs_attention_event(
            model=result.model,
            attention_keys=list(audit.get("fields_needing_attention") or []),
            job_id=job_id,
            event_at=result.generated_at,
        )
        if attention_event:
            drafts.append(attention_event)

    unique = dedupe_event_drafts(drafts)
    return [
        {
            "event_type": d.event_type,
            "summary": d.summary,
            "details": d.details,
            "event_at": d.event_at.isoformat(),
            # AI types are allowed after 20260717180000_ai_enrichment_timeline_events.
            "requires_migration": False,
        }
        for d in unique
    ]


def _persist_result(
    client: Any,
    *,
    job_id: str,
    listing_id: str,
    result: EnrichmentResult,
    previous_effective: dict[str, Any] | None = None,
    persist_timeline: bool = False,
) -> dict[str, Any]:
    previous_effective = previous_effective or {}
    proposal_payload = (
        result.proposal.model_dump() if result.proposal is not None else {}
    )
    audit = _build_run_audit(
        listing_id=listing_id,
        result=result,
        previous_effective=previous_effective,
    )
    timeline_drafts = _timeline_drafts_for_result(
        result=result, job_id=job_id, audit=audit
    )

    applied_attributes = [
        {
            "key": key,
            "effective_value": audit["resulting_effective_values"].get(key),
            "provenance": "ai_extracted",
            "confidence": next(
                (
                    d.get("confidence")
                    for d in (audit.get("policy") or {}).get("decisions") or []
                    if d.get("key") == key
                ),
                None,
            ),
        }
        for key in audit.get("fields_auto_applied") or []
    ]

    # Never clobber a prior proposal with an empty skip payload.
    if result.status == "skipped_unchanged":
        existing_proposal = (
            client.table("ai_enrichment_proposals")
            .select("id,status")
            .eq("property_listing_id", listing_id)
            .eq("model", result.model)
            .eq("prompt_version", result.prompt_version)
            .eq("schema_version", result.schema_version)
            .eq("input_checksum", result.input_checksum)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing_proposal:
            client.table("property_listings").update(
                {
                    "enrichment_last_input_checksum": result.input_checksum,
                    "enrichment_last_run_at": result.generated_at.isoformat(),
                }
            ).eq("id", listing_id).execute()
            return audit

    client.table("ai_enrichment_proposals").upsert(
        {
            "property_listing_id": listing_id,
            "enrichment_job_id": job_id,
            "model": result.model,
            "prompt_version": result.prompt_version,
            "schema_version": result.schema_version,
            "input_checksum": result.input_checksum,
            "status": result.status,
            "proposal": {
                **proposal_payload,
                "field_decisions": (audit.get("policy") or {}).get("decisions") or [],
                "applied_attributes": applied_attributes,
            },
            "confidence": (
                result.proposal.overall_confidence if result.proposal else None
            ),
            "supporting_evidence": {
                "warnings": list(result.warnings),
                "run_audit": audit,
                "timeline_drafts": timeline_drafts,
            },
            "warnings": list(result.warnings),
            "token_usage": result.token_usage,
            "api_request_id": result.api_request_id,
            "error_message": result.error_message,
            "generated_at": result.generated_at.isoformat(),
        },
        on_conflict=(
            "property_listing_id,model,prompt_version,schema_version,input_checksum"
        ),
    ).execute()

    enrichment_status = {
        "succeeded": "succeeded",
        "needs_review": "needs_review",
        "skipped_unchanged": "skipped_unchanged",
        "failed": "failed",
        "invalid_output": "failed",
    }.get(result.status, "failed")
    client.table("property_listings").update(
        {
            "enrichment_status": enrichment_status,
            "enrichment_last_input_checksum": result.input_checksum,
            "enrichment_last_run_at": result.generated_at.isoformat(),
        }
    ).eq("id", listing_id).execute()

    # Persist immutable AI timeline rows into the existing activity schema.
    if persist_timeline:
        for draft in timeline_drafts:
            if draft.get("requires_migration"):
                continue
            client.table("listing_activity_events").insert(
                {
                    "property_listing_id": listing_id,
                    "event_type": draft["event_type"],
                    "event_at": draft["event_at"],
                    "previous_value": None,
                    "new_value": draft.get("details") or {},
                    "derivation_type": "system_calculated",
                    "confidence": 1.0,
                    "notes": draft.get("summary"),
                }
            ).execute()

    return audit


def process_enrichment_job(
    job_id: str,
    *,
    listing_ids: Sequence[str],
    batch_size: int | None = None,
    force: bool = False,
    model: str | None = None,
    client: Any | None = None,
    persist_timeline: bool = True,
    max_estimated_cost_usd: float | None = None,
    resume: bool = False,
    progress_path: str | Path | None = None,
) -> dict[str, Any]:
    """Process a queued job one listing at a time. Shared by CLI and dashboard."""

    _require_labs()
    settings = get_settings()
    if settings.openai_api_key is None:
        raise RuntimeError("OPENAI_API_KEY is required for enrichment")
    api_key = settings.openai_api_key.get_secret_value()
    env_model = (settings.openai_enrichment_model or "").strip()
    if not env_model:
        raise RuntimeError(
            "OPENAI_ENRICHMENT_MODEL is required; no silent model default is allowed"
        )
    if model and model.strip() and model.strip() != env_model:
        raise RuntimeError(
            f"Model argument {model!r} does not match OPENAI_ENRICHMENT_MODEL={env_model!r}"
        )
    model_name = env_model
    batch_size = int(batch_size or settings.openai_enrichment_batch_size or 1)
    # Always process one listing at a time so each result persists before the next call.
    batch_size = 1
    owns_client = client is None
    client = client or create_labs_client()
    progress_file = Path(progress_path) if progress_path else None
    # --force always wins for paid retries of failed listings.
    # --resume only skips listing IDs already completed in the progress file
    # for this run (not "disable force").
    resume_done_ids: set[str] = set()
    if resume and progress_file and progress_file.exists():
        try:
            prior = json.loads(progress_file.read_text(encoding="utf-8"))
            for item in prior.get("listing_results") or []:
                if not isinstance(item, dict):
                    continue
                status = str(item.get("status") or "")
                lid = str(item.get("listing_id") or "")
                if lid and status in {
                    "succeeded",
                    "needs_review",
                    "skipped_unchanged",
                    "invalid_output",
                    "failed",
                }:
                    # On resume without force, skip any prior result.
                    # With force, only skip successful/skipped prior results so
                    # a mid-run restart does not re-bill successes, but failed
                    # rows from a previous interrupted force-run may retry.
                    if force and status in {"failed", "invalid_output"}:
                        continue
                    resume_done_ids.add(lid)
        except (OSError, json.JSONDecodeError):
            resume_done_ids = set()

    client.table("ai_enrichment_jobs").update(
        {
            "status": "running",
            "started_at": datetime.now(UTC).isoformat(),
            "model": model_name,
            "summary": {
                "model_requested": model_name,
                "reasoning_effort": settings.openai_enrichment_reasoning_effort,
                "max_output_tokens": settings.openai_enrichment_max_output_tokens,
                "batch_size": batch_size,
                "auto_apply_policy": True,
                "resume": bool(resume),
                "force": bool(force),
            },
        }
    ).eq("id", job_id).execute()

    succeeded = 0
    skipped = 0
    failed = 0
    processed = 0
    auto_applied_fields = 0
    needs_attention_listings = 0
    errors: list[dict[str, Any]] = []
    listing_results: list[dict[str, Any]] = []
    consecutive_infra_failures = 0
    stopped_early: str | None = None
    token_totals = {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "total_tokens": 0,
    }
    max_output = int(settings.openai_enrichment_max_output_tokens or 3500)
    if max_estimated_cost_usd is not None:
        billable_count = len(
            [lid for lid in listing_ids if str(lid) not in resume_done_ids]
        )
        if not force:
            # Estimate only listings that would make a paid call.
            preview_rows = (
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
                .in_("id", list(listing_ids))
                .execute()
                .data
                or []
            )
            hydrate_map_neighbourhood_names(client, preview_rows)
            billable_count = 0
            for row in preview_rows:
                if isinstance(row.get("property_sources"), dict):
                    row["source_key"] = row["property_sources"].get("source_key")
                if should_skip_unchanged_enrichment(
                    client, row=row, model=model_name
                ):
                    continue
                billable_count += 1
        preflight = estimate_enrichment_cost(
            model=model_name, listing_count=billable_count
        )
        worst_input = preflight.input_tokens
        worst_output = billable_count * max_output
        worst_cost, worst_note = calculate_usage_cost_usd(
            model=model_name,
            input_tokens=worst_input,
            cached_input_tokens=0,
            output_tokens=worst_output,
        )
        if worst_note or worst_cost is None:
            raise RuntimeError(
                worst_note
                or f"Unable to estimate worst-case cost for model {model_name!r}"
            )
        # Absolute max-output * N can exceed an approved large-batch / canary
        # ceiling even when the expected run is under budget. Mid-run
        # enforcement below still stops before any call that would exceed the
        # remaining ceiling.
        job_meta = (
            client.table("ai_enrichment_jobs")
            .select("scope_filter,requested_by")
            .eq("id", job_id)
            .limit(1)
            .execute()
            .data
            or [{}]
        )[0]
        scope_filter = job_meta.get("scope_filter") or {}
        approved_canary = bool(scope_filter.get("canary"))
        source_key = str(scope_filter.get("source_key") or "")
        if billable_count > 20 and source_key == "moret_real_estate":
            # Observed Moret Terra canary average (5/5 @ USD 0.1165).
            observed_avg = 0.0233
        elif billable_count > 20 and source_key == "remax_curacao":
            observed_avg = 0.035
        elif billable_count > 20:
            observed_avg = 0.035
        elif approved_canary and source_key == "moret_real_estate":
            observed_avg = 0.0233
        elif approved_canary and source_key == "remax_curacao":
            observed_avg = 0.035
        elif approved_canary:
            observed_avg = 0.03956
        else:
            observed_avg = None
        if observed_avg is not None:
            gate_cost = round(observed_avg * billable_count * 1.25, 4)
        else:
            gate_cost = float(worst_cost)
        if gate_cost > float(max_estimated_cost_usd):
            raise RuntimeError(
                f"Conservative/preflight estimated cost USD {gate_cost} exceeds "
                f"ceiling {max_estimated_cost_usd} "
                f"(absolute max-output worst case USD {worst_cost})"
            )

    from merkado_labs.enrichment.pricing import (
        PRICING_AS_OF,
        PRICING_SOURCE,
        cost_from_token_usage,
    )

    def _write_progress(*, running_cost: Any = None) -> None:
        if progress_file is None:
            return
        progress_file.parent.mkdir(parents=True, exist_ok=True)
        progress_file.write_text(
            json.dumps(
                {
                    "job_id": job_id,
                    "updated_at": datetime.now(UTC).isoformat(),
                    "processed": processed,
                    "succeeded": succeeded,
                    "skipped": skipped,
                    "failed": failed,
                    "token_usage": token_totals,
                    "exact_cost_usd": float(running_cost)
                    if running_cost is not None
                    else None,
                    "errors": errors,
                    "listing_results": listing_results,
                    "stopped_early": stopped_early,
                },
                indent=2,
                default=str,
            )
            + "\n",
            encoding="utf-8",
        )

    try:
        ids = list(listing_ids)
        for batch_index in range(0, len(ids), batch_size):
            if stopped_early:
                break
            batch = ids[batch_index : batch_index + batch_size]
            client.table("ai_enrichment_jobs").update(
                {
                    "current_batch": batch_index // batch_size + 1,
                    "current_listing_id": batch[0] if batch else None,
                }
            ).eq("id", job_id).execute()

            rows = (
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
                .in_("id", batch)
                .execute()
                .data
                or []
            )
            hydrate_map_neighbourhood_names(client, rows)
            by_id = {str(row["id"]): row for row in rows}
            for listing_id in batch:
                if str(listing_id) in resume_done_ids:
                    skipped += 1
                    processed += 1
                    listing_results.append(
                        {
                            "listing_id": listing_id,
                            "external_id": None,
                            "status": "skipped_unchanged",
                            "input_checksum": None,
                            "token_usage": {},
                            "fields_auto_applied": [],
                            "fields_needing_attention": [],
                            "fields_rejected": [],
                            "error": None,
                            "note": "resume_progress_already_completed",
                        }
                    )
                    _write_progress()
                    continue
                row = by_id.get(listing_id)
                if row is None:
                    failed += 1
                    processed += 1
                    errors.append(
                        {
                            "listing_id": listing_id,
                            "error": "listing_not_found",
                            "failure_class": "persistence",
                        }
                    )
                    consecutive_infra_failures += 1
                    _write_progress()
                    if consecutive_infra_failures >= 3:
                        stopped_early = "repeated_infrastructure_failures"
                        break
                    continue
                if isinstance(row.get("property_sources"), dict):
                    row["source_key"] = row["property_sources"].get("source_key")
                enrichment_input = listing_to_enrichment_input(row)
                existing_checksum = row.get("enrichment_last_input_checksum")
                checksum = compute_input_checksum(enrichment_input)
                # Skip when checksum matches (semantic/legacy) or when the only
                # delta vs prior Terra success is operational geo metadata.
                identical_attempt = should_skip_unchanged_enrichment(
                    client, row=row, model=model_name
                )
                previous_effective = {
                    str(item.get("key")): item.get("effective_value")
                    for item in enrichment_input.existing_effective_attributes
                    if isinstance(item, dict) and item.get("key")
                }
                will_skip = not force and identical_attempt

                running_cost, _running_note = cost_from_token_usage(
                    model_name, token_totals
                )
                if (
                    not will_skip
                    and max_estimated_cost_usd is not None
                    and running_cost is not None
                ):
                    next_est, _ = calculate_usage_cost_usd(
                        model=model_name,
                        input_tokens=DEFAULT_INPUT_TOKENS_PER_LISTING,
                        cached_input_tokens=0,
                        output_tokens=max_output,
                    )
                    if next_est is not None and float(running_cost) + float(
                        next_est
                    ) > float(max_estimated_cost_usd):
                        stopped_early = (
                            f"insufficient_budget_before_next_call:"
                            f"running={running_cost}+next_worst={next_est}"
                            f">ceiling={max_estimated_cost_usd}"
                        )
                        break

                # Pre-check skip without API call.
                if will_skip:
                    result = EnrichmentResult(
                        status="skipped_unchanged",
                        input_checksum=existing_checksum,
                        proposal=None,
                        model=model_name,
                        prompt_version=PROMPT_VERSION,
                        schema_version=SCHEMA_VERSION,
                        token_usage={},
                        api_request_id=None,
                        error_message=None,
                        warnings=("skipped_unchanged_input_checksum",),
                        generated_at=datetime.now(UTC),
                        policy_evaluation=None,
                    )
                else:
                    result = enrich_listing(
                        enrichment_input,
                        api_key=api_key,
                        model=model_name,
                        force=force,
                        existing_checksum=checksum if identical_attempt else None,
                        existing_success=identical_attempt,
                    )
                audit = _persist_result(
                    client,
                    job_id=job_id,
                    listing_id=listing_id,
                    result=result,
                    previous_effective=previous_effective,
                    persist_timeline=persist_timeline,
                )
                processed += 1
                auto_applied_fields += len(audit.get("fields_auto_applied") or [])
                if audit.get("fields_needing_attention"):
                    needs_attention_listings += 1
                listing_results.append(
                    {
                        "listing_id": listing_id,
                        "external_id": row.get("external_id"),
                        "status": result.status,
                        "input_checksum": result.input_checksum,
                        "token_usage": result.token_usage,
                        "fields_auto_applied": audit.get("fields_auto_applied"),
                        "fields_needing_attention": audit.get(
                            "fields_needing_attention"
                        ),
                        "fields_rejected": audit.get("fields_rejected"),
                        "error": result.error_message,
                    }
                )
                if result.status == "skipped_unchanged":
                    skipped += 1
                    consecutive_infra_failures = 0
                elif result.status in {"succeeded", "needs_review"}:
                    succeeded += 1
                    consecutive_infra_failures = 0
                    # Future path: after a new/changed English enrichment, also
                    # generate Dutch description. Failed Dutch must not fail the
                    # English result or remove English presentation.
                    try:
                        from merkado_labs.enrichment.nl_description import (
                            ensure_dutch_description_for_listing,
                        )

                        proposal_rows = (
                            client.table("ai_enrichment_proposals")
                            .select(
                                "id,proposal,prompt_version,schema_version,status"
                            )
                            .eq("property_listing_id", listing_id)
                            .eq("input_checksum", result.input_checksum)
                            .in_("status", ["succeeded", "needs_review"])
                            .order("generated_at", desc=True)
                            .limit(1)
                            .execute()
                            .data
                            or []
                        )
                        if proposal_rows and api_key:
                            nl_result = ensure_dutch_description_for_listing(
                                client,
                                listing_id=listing_id,
                                proposal_row=proposal_rows[0],
                                listing_row=row,
                                api_key=api_key,
                                model=model_name,
                                force=False,
                            )
                            listing_results[-1]["dutch_status"] = nl_result.status
                            listing_results[-1]["dutch_cost_usd"] = nl_result.cost_usd
                            for key in (
                                "input_tokens",
                                "cached_input_tokens",
                                "output_tokens",
                                "total_tokens",
                            ):
                                value = nl_result.token_usage.get(key)
                                if isinstance(value, int):
                                    token_totals[key] = (
                                        int(token_totals.get(key) or 0) + value
                                    )
                    except Exception as nl_error:  # noqa: BLE001
                        listing_results[-1]["dutch_status"] = "failed"
                        listing_results[-1]["dutch_error"] = type(nl_error).__name__
                else:
                    failed += 1
                    err = result.error_message or result.status
                    failure_class = "api"
                    if result.status == "invalid_output":
                        failure_class = "structured_output"
                    elif "auth" in str(err).lower() or "unauthorized" in str(err).lower():
                        failure_class = "authentication"
                        consecutive_infra_failures += 1
                    elif any(
                        token in str(err).lower()
                        for token in ("timeout", "connection", "503", "502", "504")
                    ):
                        failure_class = "transport"
                        consecutive_infra_failures += 1
                    else:
                        consecutive_infra_failures = 0
                    errors.append(
                        {
                            "listing_id": listing_id,
                            "external_id": row.get("external_id"),
                            "error": err,
                            "failure_class": failure_class,
                        }
                    )
                    if consecutive_infra_failures >= 3:
                        stopped_early = "repeated_infrastructure_failures"
                for key in (
                    "input_tokens",
                    "cached_input_tokens",
                    "output_tokens",
                    "reasoning_tokens",
                    "total_tokens",
                ):
                    value = result.token_usage.get(key)
                    if isinstance(value, int):
                        token_totals[key] += value

                running_cost, _running_note = cost_from_token_usage(
                    model_name, token_totals
                )
                if (
                    max_estimated_cost_usd is not None
                    and running_cost is not None
                    and running_cost > float(max_estimated_cost_usd)
                ):
                    stopped_early = (
                        f"running_cost_exceeded_ceiling:{running_cost}"
                        f">{max_estimated_cost_usd}"
                    )

                client.table("ai_enrichment_jobs").update(
                    {
                        "processed_count": processed,
                        "succeeded_count": succeeded,
                        "skipped_unchanged_count": skipped,
                        "failed_count": failed,
                        "token_usage": token_totals,
                        "errors": errors[-50:],
                        "current_listing_id": listing_id,
                        "summary": {
                            "model_requested": model_name,
                            "auto_applied_fields": auto_applied_fields,
                            "needs_attention_listings": needs_attention_listings,
                            "exact_cost_usd": running_cost,
                            "stopped_early": stopped_early,
                        },
                    }
                ).eq("id", job_id).execute()
                _write_progress(running_cost=running_cost)
                if stopped_early:
                    break

        if stopped_early and processed < len(ids):
            final_status = "completed_with_errors"
        else:
            final_status = (
                "completed"
                if failed == 0
                else ("completed_with_errors" if succeeded or skipped else "failed")
            )

        exact_cost, cost_note = cost_from_token_usage(model_name, token_totals)
        client.table("ai_enrichment_jobs").update(
            {
                "status": final_status,
                "completed_at": datetime.now(UTC).isoformat(),
                "processed_count": processed,
                "succeeded_count": succeeded,
                "skipped_unchanged_count": skipped,
                "failed_count": failed,
                "token_usage": token_totals,
                "errors": errors,
                "current_listing_id": None,
                "summary": {
                    "model_requested": model_name,
                    "auto_applied_fields": auto_applied_fields,
                    "needs_attention_listings": needs_attention_listings,
                    "exact_cost_usd": exact_cost,
                    "cost_note": cost_note,
                    "pricing_as_of": PRICING_AS_OF,
                    "pricing_source": PRICING_SOURCE,
                    "stopped_early": stopped_early,
                },
            }
        ).eq("id", job_id).execute()
        payload = {
            "job_id": job_id,
            "status": final_status,
            "processed": processed,
            "succeeded": succeeded,
            "skipped": skipped,
            "failed": failed,
            "token_usage": token_totals,
            "auto_applied_fields": auto_applied_fields,
            "needs_attention_listings": needs_attention_listings,
            "exact_cost_usd": exact_cost,
            "cost_note": cost_note,
            "errors": errors,
            "listing_results": listing_results,
            "stopped_early": stopped_early,
        }
        _write_progress(running_cost=exact_cost)
        return payload
    finally:
        if owns_client:
            pass
