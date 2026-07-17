"""Batch enrichment job runner shared by scripts and dashboard server routes."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from merkado_labs.config import get_settings
from merkado_labs.enrichment import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    EnrichmentInput,
    EnrichmentResult,
    compute_input_checksum,
    enrich_listing,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client


def _require_labs() -> None:
    settings = get_settings()
    if settings.supabase_project_ref != "csaefdkpwukshtouyixg":
        raise RuntimeError(f"Refusing non-Labs project ref {settings.supabase_project_ref!r}")


def listing_to_enrichment_input(row: dict[str, Any]) -> EnrichmentInput:
    amenities = row.get("amenities") or []
    if not isinstance(amenities, list):
        amenities = []
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
            "original_price": row.get("original_price"),
            "original_currency": row.get("original_currency"),
        },
        amenities=amenities,
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


def _persist_result(
    client: Any,
    *,
    job_id: str,
    listing_id: str,
    result: EnrichmentResult,
) -> None:
    proposal_payload = (
        result.proposal.model_dump() if result.proposal is not None else {}
    )
    client.table("ai_enrichment_proposals").upsert(
        {
            "property_listing_id": listing_id,
            "enrichment_job_id": job_id,
            "model": result.model,
            "prompt_version": result.prompt_version,
            "schema_version": result.schema_version,
            "input_checksum": result.input_checksum,
            "status": result.status,
            "proposal": proposal_payload,
            "confidence": (
                result.proposal.overall_confidence if result.proposal else None
            ),
            "supporting_evidence": {
                "warnings": list(result.warnings),
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


def process_enrichment_job(
    job_id: str,
    *,
    listing_ids: Sequence[str],
    batch_size: int | None = None,
    force: bool = False,
    model: str | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Process a queued job in small batches. Shared by CLI and dashboard."""

    _require_labs()
    settings = get_settings()
    if settings.openai_api_key is None:
        raise RuntimeError("OPENAI_API_KEY is required for enrichment")
    api_key = settings.openai_api_key.get_secret_value()
    model_name = (model or settings.openai_enrichment_model or "").strip()
    if not model_name:
        raise RuntimeError(
            "OPENAI_ENRICHMENT_MODEL is required; no silent model default is allowed"
        )
    batch_size = batch_size or settings.openai_enrichment_batch_size
    owns_client = client is None
    client = client or create_labs_client()

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
            },
        }
    ).eq("id", job_id).execute()

    succeeded = 0
    skipped = 0
    failed = 0
    processed = 0
    errors: list[dict[str, Any]] = []
    token_totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    try:
        ids = list(listing_ids)
        for batch_index in range(0, len(ids), batch_size):
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
                    "amenities,enrichment_status,enrichment_last_input_checksum,"
                    "property_sources(source_key)"
                )
                .in_("id", batch)
                .execute()
                .data
                or []
            )
            by_id = {str(row["id"]): row for row in rows}
            for listing_id in batch:
                row = by_id.get(listing_id)
                if row is None:
                    failed += 1
                    processed += 1
                    errors.append({"listing_id": listing_id, "error": "listing_not_found"})
                    continue
                if isinstance(row.get("property_sources"), dict):
                    row["source_key"] = row["property_sources"].get("source_key")
                enrichment_input = listing_to_enrichment_input(row)
                existing_checksum = row.get("enrichment_last_input_checksum")
                existing_success = row.get("enrichment_status") in {
                    "succeeded",
                    "skipped_unchanged",
                    "needs_review",
                }
                # Pre-check skip without API call.
                if (
                    not force
                    and existing_success
                    and existing_checksum
                    and existing_checksum == compute_input_checksum(enrichment_input)
                ):
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
                    )
                else:
                    result = enrich_listing(
                        enrichment_input,
                        api_key=api_key,
                        model=model_name,
                        force=force,
                        existing_checksum=existing_checksum,
                        existing_success=existing_success,
                    )
                _persist_result(
                    client, job_id=job_id, listing_id=listing_id, result=result
                )
                processed += 1
                if result.status == "skipped_unchanged":
                    skipped += 1
                elif result.status in {"succeeded", "needs_review"}:
                    succeeded += 1
                else:
                    failed += 1
                    errors.append(
                        {
                            "listing_id": listing_id,
                            "error": result.error_message or result.status,
                        }
                    )
                for key in ("input_tokens", "output_tokens", "total_tokens"):
                    value = result.token_usage.get(key)
                    if isinstance(value, int):
                        token_totals[key] += value

                client.table("ai_enrichment_jobs").update(
                    {
                        "processed_count": processed,
                        "succeeded_count": succeeded,
                        "skipped_unchanged_count": skipped,
                        "failed_count": failed,
                        "token_usage": token_totals,
                        "errors": errors[-50:],
                        "current_listing_id": listing_id,
                    }
                ).eq("id", job_id).execute()

        final_status = (
            "completed"
            if failed == 0
            else ("completed_with_errors" if succeeded or skipped else "failed")
        )
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
            }
        ).eq("id", job_id).execute()
        return {
            "job_id": job_id,
            "status": final_status,
            "processed": processed,
            "succeeded": succeeded,
            "skipped": skipped,
            "failed": failed,
            "token_usage": token_totals,
        }
    finally:
        if owns_client:
            pass
