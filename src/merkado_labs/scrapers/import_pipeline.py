"""Source-neutral Labs import for direct-source listing snapshots."""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from merkado_labs.config import get_settings
from merkado_labs.geo import apply_listing_neighbourhood_assignments
from merkado_labs.normalization.currency import resolve_public_benchmark_xcg
from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.contracts import (
    SOURCE_DISPLAY_NAMES,
    ActivityEventType,
    AdapterListingSnapshot,
    DerivationType,
    EurRateProvider,
    ListingLifecycleStatus,
    OfficialAlternatePrice,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.images import build_gallery
from merkado_labs.scrapers.lifecycle import (
    ListingLifecycleState,
    compare_complete_success_snapshots,
)
from merkado_labs.scrapers.presentation import classify_activity_event


@dataclass(frozen=True)
class ImportResult:
    """Outcome of persisting one adapter run."""

    source_run_id: str | None
    imported_count: int
    updated_count: int
    observation_count: int
    event_count: int
    dry_run: bool
    listing_ids: tuple[str, ...]
    notes: tuple[str, ...] = ()


def should_append_price_observation(
    *,
    is_new: bool,
    previous_amount: Any,
    previous_currency: str | None,
    new_amount: float,
    new_currency: str,
) -> tuple[bool, bool, bool]:
    """Decide whether an unchanged re-import should skip price observation rows.

    Returns ``(should_append, price_changed, currency_changed)``.
    """
    price_changed = False
    currency_changed = False
    if is_new:
        return True, True, False
    if previous_amount is None or float(previous_amount) != new_amount:
        price_changed = True
    if previous_currency != new_currency:
        currency_changed = True
    return price_changed or currency_changed, price_changed, currency_changed


def _require_labs() -> None:
    settings = get_settings()
    if settings.supabase_project_ref != "csaefdkpwukshtouyixg":
        raise RuntimeError(f"Refusing non-Labs project ref {settings.supabase_project_ref!r}")
    if settings.supabase_url and "csaefdkpwukshtouyixg" not in str(settings.supabase_url):
        raise RuntimeError(f"Refusing non-Labs SUPABASE_URL: {settings.supabase_url}")


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _snapshot_normalized_payload(snapshot: AdapterListingSnapshot) -> dict[str, Any]:
    return _jsonable(
        {
            "external_id": snapshot.external_id,
            "source_url": snapshot.source_url,
            "title": snapshot.title,
            "listing_type": snapshot.listing_type,
            "property_type": snapshot.property_type,
            "source_status": snapshot.source_status,
            "lifecycle_hint": snapshot.lifecycle_hint,
            "original_price": (
                {
                    "amount": str(snapshot.original_price.amount),
                    "currency": snapshot.original_price.currency,
                    "evidence": snapshot.original_price.evidence,
                    "inferred": snapshot.original_price.inferred,
                }
                if snapshot.original_price
                else None
            ),
            "official_alternate_prices": [
                alt.as_dict() for alt in snapshot.official_alternate_prices
            ],
            "bedrooms": snapshot.bedrooms,
            "bathrooms": snapshot.bathrooms,
            "floor_area_m2": snapshot.floor_area_m2,
            "lot_area_value": snapshot.lot_area_value,
            "lot_area_unit": snapshot.lot_area_unit,
            "neighbourhood_text": snapshot.neighbourhood_text,
            "location_text": snapshot.location_text,
            "latitude": snapshot.latitude,
            "longitude": snapshot.longitude,
            "primary_image_url": snapshot.primary_image_url,
            "image_urls": list(snapshot.image_urls),
            "description": snapshot.effective_source_description(),
            "source_description": snapshot.effective_source_description(),
            "source_description_checksum": snapshot.source_description_checksum,
            "cleaned_listing_text": snapshot.cleaned_listing_text,
            "amenities": list(snapshot.amenities),
            "fields": [asdict(field) for field in snapshot.fields],
            "warnings": list(snapshot.warnings),
            "parser_errors": list(snapshot.parser_errors),
            "adapter_version": snapshot.adapter_version,
            "raw_sha256": snapshot.raw_sha256,
            "structured_evidence": snapshot.structured_evidence,
            "evidence_storage_path": snapshot.evidence_storage_path,
            "evidence_storage_bucket": snapshot.evidence_storage_bucket,
        }
    )


def _official_alts_payload(
    alts: tuple[OfficialAlternatePrice, ...] | list[OfficialAlternatePrice],
) -> list[dict[str, Any]]:
    return [_jsonable(alt.as_dict()) for alt in alts]


def _with_presentation(event: dict[str, Any]) -> dict[str, Any]:
    """Stamp additive presentation classification at insert time."""

    decision = classify_activity_event(event)
    event["presentation_class"] = decision.presentation_class
    if decision.suppressed_reason:
        event["suppressed_reason"] = decision.suppressed_reason
    if decision.presentation_metadata:
        event["presentation_metadata"] = decision.presentation_metadata
    return event


def create_labs_client() -> Any:
    _require_labs()
    settings = get_settings()
    if settings.supabase_url is None or settings.supabase_secret_key is None:
        raise RuntimeError("Labs Supabase credentials are required for import")
    from supabase import create_client

    return create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )


def resolve_property_source(client: Any, source_key: str) -> dict[str, Any]:
    rows = (
        client.table("property_sources")
        .select("id,source_key,enabled,adapter_status,removal_threshold,display_name,name")
        .eq("source_key", source_key)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"property_sources row missing for {source_key}")
    return rows[0]


def _load_lifecycle_states(client: Any, source_id: str) -> dict[str, ListingLifecycleState]:
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,status,first_seen_at,last_seen_at,last_successfully_seen_at,"
            "missing_since,sold_at,removed_at,consecutive_successful_absences,"
            "original_price,original_currency,source_listing_status,"
            "first_observed_sold_at,first_observed_rented_at,"
            "first_observed_under_contract_at,source_description_checksum"
        )
        .eq("property_source_id", source_id)
        .execute()
        .data
        or []
    )
    states: dict[str, ListingLifecycleState] = {}
    for row in rows:
        status = ListingLifecycleStatus(str(row["status"]))
        states[str(row["external_id"])] = ListingLifecycleState(
            external_id=str(row["external_id"]),
            status=status,
            first_seen_at=datetime.fromisoformat(str(row["first_seen_at"]).replace("Z", "+00:00")),
            last_seen_at=datetime.fromisoformat(str(row["last_seen_at"]).replace("Z", "+00:00")),
            last_successfully_seen_at=(
                datetime.fromisoformat(str(row["last_successfully_seen_at"]).replace("Z", "+00:00"))
                if row.get("last_successfully_seen_at")
                else None
            ),
            missing_since=(
                datetime.fromisoformat(str(row["missing_since"]).replace("Z", "+00:00"))
                if row.get("missing_since")
                else None
            ),
            sold_at=(
                datetime.fromisoformat(str(row["sold_at"]).replace("Z", "+00:00"))
                if row.get("sold_at")
                else None
            ),
            removed_at=(
                datetime.fromisoformat(str(row["removed_at"]).replace("Z", "+00:00"))
                if row.get("removed_at")
                else None
            ),
            consecutive_absences=int(row.get("consecutive_successful_absences") or 0),
            original_price=(
                Decimal(str(row["original_price"]))
                if row.get("original_price") is not None
                else None
            ),
            original_currency=row.get("original_currency"),
            source_listing_status=row.get("source_listing_status"),
            first_observed_sold_at=(
                datetime.fromisoformat(
                    str(row["first_observed_sold_at"]).replace("Z", "+00:00")
                )
                if row.get("first_observed_sold_at")
                else None
            ),
            first_observed_rented_at=(
                datetime.fromisoformat(
                    str(row["first_observed_rented_at"]).replace("Z", "+00:00")
                )
                if row.get("first_observed_rented_at")
                else None
            ),
            first_observed_under_contract_at=(
                datetime.fromisoformat(
                    str(row["first_observed_under_contract_at"]).replace("Z", "+00:00")
                )
                if row.get("first_observed_under_contract_at")
                else None
            ),
            source_description_checksum=row.get("source_description_checksum"),
        )
    return states


def import_snapshots(
    *,
    client: Any | None = None,
    source_key: str,
    run: SourceRunRecord,
    snapshots: list[AdapterListingSnapshot],
    dry_run: bool = True,
    eur_provider: EurRateProvider | None = None,
    apply_geospatial: bool = True,
) -> ImportResult:
    """Persist snapshots into Labs. Never auto-links property_assets.

    Partial/failed runs still upsert observed listings but never apply absence
    lifecycle transitions.
    """

    _require_labs()
    owns_client = client is None
    client = client or create_labs_client()
    source = resolve_property_source(client, source_key)
    source_id = str(source["id"])
    enabled = bool(source.get("enabled"))
    adapter_status = source.get("adapter_status")
    removal_threshold = int(source.get("removal_threshold") or 2)
    provider = eur_provider

    notes: list[str] = []
    if dry_run:
        notes.append("dry_run_no_writes")
        return ImportResult(
            source_run_id=None,
            imported_count=0,
            updated_count=0,
            observation_count=0,
            event_count=0,
            dry_run=True,
            listing_ids=tuple(),
            notes=tuple(notes),
        )
    if provider is None:
        notes.append("eur_provider_absent_benchmarks_may_pending")

    previous = _load_lifecycle_states(client, source_id)
    imported = 0
    updated = 0
    observation_count = 0
    event_count = 0
    listing_ids: list[str] = []
    coords_changed = False
    now = run.completed_at or datetime.now(UTC)

    # Insert source run first (completed fields filled at end).
    run_row = {
        "property_source_id": source_id,
        "source_key": run.source_key,
        "adapter_name": run.adapter_name,
        "adapter_version": run.adapter_version,
        "started_at": run.started_at.isoformat(),
        "completed_at": now.isoformat(),
        "outcome": run.outcome.value if isinstance(run.outcome, SourceRunOutcome) else run.outcome,
        "discovered_count": run.discovered_count,
        "parsed_count": run.parsed_count,
        "imported_count": 0,
        "updated_count": 0,
        "excluded_no_price_count": run.excluded_no_price_count,
        "warning_count": run.warning_count,
        "error_count": run.error_count,
        "snapshot_checksum": run.snapshot_checksum,
        "notes": run.notes,
        "metadata": run.metadata or {},
    }
    inserted_run = client.table("property_source_runs").insert(run_row).execute().data
    source_run_id = str(inserted_run[0]["id"]) if inserted_run else None

    for snapshot in snapshots:
        existing_rows = (
            client.table("property_listings")
            .select("*")
            .eq("property_source_id", source_id)
            .eq("external_id", snapshot.external_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        existing = existing_rows[0] if existing_rows else None

        benchmark = None
        if snapshot.original_price is not None:
            benchmark = resolve_public_benchmark_xcg(
                snapshot.original_price,
                eur_provider=provider,
                official_alternates=snapshot.official_alternate_prices,
            )

        status = (
            snapshot.lifecycle_hint.value
            if snapshot.lifecycle_hint
            else ListingLifecycleStatus.ACTIVE.value
        )
        # Parser failure must not wipe status to null/unknown with null overwrites.
        if existing and snapshot.parser_errors:
            status = existing.get("status") or status
            notes.append(f"parser_errors_preserved_status:{snapshot.external_id}")

        eligible, reason = evaluate_public_eligibility(
            status=status,
            original_price=(snapshot.original_price.amount if snapshot.original_price else None),
            source_enabled=enabled,
            source_url=snapshot.source_url,
            has_critical_parser_error=bool(snapshot.parser_errors),
            source_adapter_status=adapter_status,
            has_source_attribution=True,
        )

        raw_image_urls = list(snapshot.image_urls) or list(
            snapshot.raw_payload.get("image_urls") or []
        )
        gallery = build_gallery(
            raw_image_urls,
            primary_url=snapshot.primary_image_url,
        )
        image_urls = gallery.urls
        primary_image_url = gallery.primary_url

        realtor_name = (
            snapshot.raw_payload.get("realtor_name")
            or SOURCE_DISPLAY_NAMES.get(snapshot.source_key)
            or source.get("display_name")
            or source.get("name")
        )
        realtor_domain = snapshot.raw_payload.get("realtor_domain")
        if not realtor_domain and snapshot.source_url:
            from urllib.parse import urlparse

            realtor_domain = (urlparse(snapshot.source_url).hostname or "").removeprefix(
                "www."
            )
            if realtor_domain:
                realtor_domain = f"www.{realtor_domain}"

        realtor = {
            "original_realtor_name": realtor_name,
            "original_realtor_domain": realtor_domain,
            "original_realtor_url": snapshot.source_url,
            "original_realtor_external_id": snapshot.external_id,
            "attribution_method": "direct_source_site",
            "attribution_observed_at": snapshot.observed_at.isoformat(),
        }

        bathrooms = snapshot.bathrooms
        if bathrooms is not None and bathrooms <= 0:
            bathrooms = None
        floor_area = (
            float(snapshot.floor_area_m2) if snapshot.floor_area_m2 is not None else None
        )
        if floor_area is not None and floor_area <= 0:
            floor_area = None

        listing_payload: dict[str, Any] = {
            "property_source_id": source_id,
            "external_id": snapshot.external_id,
            "external_id_status": "verified",
            "source_url": snapshot.source_url,
            "listing_type": snapshot.listing_type,
            "source_listing_status": snapshot.source_status,
            "property_type": snapshot.property_type,
            "title": snapshot.title,
            "status": status,
            "bedrooms": snapshot.bedrooms,
            "bathrooms": bathrooms,
            "floor_area_m2": floor_area,
            "lot_area_value": float(snapshot.lot_area_value)
            if snapshot.lot_area_value is not None
            else None,
            "lot_area_unit": snapshot.lot_area_unit,
            "primary_image_url": primary_image_url,
            "description": snapshot.effective_source_description(),
            "source_description_checksum": snapshot.source_description_checksum,
            "amenities": list(snapshot.amenities),
            "image_urls": image_urls,
            "source_neighbourhood_text": snapshot.neighbourhood_text,
            "last_seen_at": snapshot.observed_at.isoformat(),
            "public_eligible": eligible,
            "public_exclusion_reason": None if eligible else reason,
            **realtor,
        }

        if snapshot.original_price is not None:
            listing_payload.update(
                {
                    "current_price": float(snapshot.original_price.amount),
                    "currency": snapshot.original_price.currency,
                    "original_price": float(snapshot.original_price.amount),
                    "original_currency": snapshot.original_price.currency,
                    "currency_inferred": snapshot.original_price.inferred,
                    "currency_inference_reason": snapshot.original_price.inference_reason,
                    "official_alternate_prices": _official_alts_payload(
                        snapshot.official_alternate_prices
                    ),
                }
            )
            if benchmark is not None and not benchmark.pending:
                listing_payload.update(
                    {
                        "benchmark_price_xcg": (
                            float(benchmark.amount_xcg)
                            if benchmark.amount_xcg is not None
                            else None
                        ),
                        "conversion_method": (
                            benchmark.conversion_method.value
                            if benchmark.conversion_method
                            else None
                        ),
                        "conversion_rate": (
                            float(benchmark.conversion_rate)
                            if benchmark.conversion_rate is not None
                            else None
                        ),
                        "conversion_provider": benchmark.conversion_provider,
                        "conversion_rate_at": (
                            benchmark.conversion_rate_at.isoformat()
                            if benchmark.conversion_rate_at
                            else None
                        ),
                    }
                )
            elif benchmark is not None and benchmark.pending:
                notes.append(f"benchmark_pending:{snapshot.external_id}")
                if existing and existing.get("benchmark_price_xcg") is not None:
                    # Preserve previously valid benchmark on temporary provider failure.
                    notes.append(f"benchmark_preserved:{snapshot.external_id}")
                else:
                    listing_payload.update(
                        {
                            "benchmark_price_xcg": None,
                            "conversion_method": None,
                            "conversion_rate": None,
                            "conversion_provider": None,
                            "conversion_rate_at": None,
                        }
                    )

        # Coordinates: never clear existing valid coords on parser failure.
        if snapshot.latitude is not None and snapshot.longitude is not None:
            prev_lat = existing.get("latitude") if existing else None
            prev_lng = existing.get("longitude") if existing else None
            listing_payload.update(
                {
                    "latitude": snapshot.latitude,
                    "longitude": snapshot.longitude,
                    "coordinates_source": "source_html",
                }
            )
            if prev_lat != snapshot.latitude or prev_lng != snapshot.longitude:
                coords_changed = True
        elif existing and snapshot.parser_errors:
            notes.append(f"kept_existing_coords:{snapshot.external_id}")

        if snapshot.source_listed_at is not None:
            listing_payload["source_listed_at"] = snapshot.source_listed_at.isoformat()

        # First-observed status dates: set once, never overwrite with later observations.
        # These are Merkado observation times, not transaction/closing dates.
        existing_first_sold = existing.get("first_observed_sold_at") if existing else None
        existing_first_rented = existing.get("first_observed_rented_at") if existing else None
        existing_first_uc = (
            existing.get("first_observed_under_contract_at") if existing else None
        )
        if snapshot.lifecycle_hint == ListingLifecycleStatus.SOLD:
            if not existing_first_sold:
                listing_payload["first_observed_sold_at"] = snapshot.observed_at.isoformat()
            if not (existing and existing.get("sold_at")):
                listing_payload["sold_at"] = snapshot.observed_at.isoformat()
        if snapshot.source_status == "rented" and not existing_first_rented:
            listing_payload["first_observed_rented_at"] = snapshot.observed_at.isoformat()
        if snapshot.source_status == "under_contract" and not existing_first_uc:
            listing_payload["first_observed_under_contract_at"] = (
                snapshot.observed_at.isoformat()
            )

        if run.is_complete_success:
            listing_payload["last_successfully_seen_at"] = snapshot.observed_at.isoformat()
            listing_payload["consecutive_successful_absences"] = 0
            listing_payload["missing_since"] = None

        if existing is None:
            listing_payload["first_seen_at"] = snapshot.observed_at.isoformat()
            inserted = (
                client.table("property_listings").insert(listing_payload).execute().data or []
            )
            listing_id = str(inserted[0]["id"])
            imported += 1
            is_new = True
        else:
            # Do not overwrite non-null DB fields with null from sparse parse.
            clean_payload = {
                key: value
                for key, value in listing_payload.items()
                if value is not None or key in {"amenities", "image_urls", "public_eligible"}
            }
            client.table("property_listings").update(clean_payload).eq(
                "id", existing["id"]
            ).execute()
            listing_id = str(existing["id"])
            updated += 1
            is_new = False

        listing_ids.append(listing_id)

        # Immutable listing observation
        try:
            observation = (
                client.table("listing_observations")
                .insert(
                    {
                        "property_listing_id": listing_id,
                        "observed_at": snapshot.observed_at.isoformat(),
                        "source_snapshot_id": (
                            f"{snapshot.adapter_name}:{snapshot.adapter_version}:"
                            f"{snapshot.raw_sha256}"
                        ),
                        "source_sha256": snapshot.raw_sha256,
                        "raw_payload": {
                            "url": snapshot.source_url,
                            "html_sha256": snapshot.raw_sha256,
                            "adapter_version": snapshot.adapter_version,
                            "http_status": snapshot.http_status,
                            "content_type": snapshot.content_type,
                            "evidence_storage_bucket": snapshot.evidence_storage_bucket,
                            "evidence_storage_path": snapshot.evidence_storage_path,
                            "source_description_checksum": (
                                snapshot.source_description_checksum
                            ),
                            "image_urls": list(snapshot.image_urls),
                        },
                        "normalized_payload": _snapshot_normalized_payload(snapshot),
                        "http_status": snapshot.http_status,
                        "content_type": snapshot.content_type,
                        "adapter_version": snapshot.adapter_version,
                        "evidence_storage_bucket": snapshot.evidence_storage_bucket,
                        "evidence_storage_path": snapshot.evidence_storage_path,
                        "cleaned_listing_text": snapshot.cleaned_listing_text,
                        "source_description": snapshot.effective_source_description(),
                        "source_description_checksum": (
                            snapshot.source_description_checksum
                        ),
                        "structured_evidence": snapshot.structured_evidence or {},
                        "fetch_warnings": list(snapshot.warnings),
                    }
                )
                .execute()
                .data
                or []
            )
            observation_id = str(observation[0]["id"]) if observation else None
            observation_count += 1
        except Exception as error:  # noqa: BLE001
            message = str(error).lower()
            if "duplicate" in message or "unique" in message or "23505" in message:
                notes.append(f"listing_observation_idempotent:{snapshot.external_id}")
                observation_id = None
            else:
                raise

        # Price observations are append-only on first sight or real price/currency change.
        # Unchanged re-imports must not insert a new row merely because observed_at moved
        # (unique key is listing_id + observed_at + price + currency).
        price_changed = False
        currency_changed = False
        if snapshot.original_price is not None:
            new_amount = float(snapshot.original_price.amount)
            new_currency = snapshot.original_price.currency
            should_append_price, price_changed, currency_changed = should_append_price_observation(
                is_new=is_new,
                previous_amount=existing.get("original_price") if existing else None,
                previous_currency=existing.get("original_currency") if existing else None,
                new_amount=new_amount,
                new_currency=new_currency,
            )
            if should_append_price:
                evidence = snapshot.original_price.evidence
                if benchmark is not None and benchmark.provenance:
                    import json as _json

                    evidence = _json.dumps(
                        {
                            "source_price_evidence": evidence,
                            "conversion_provenance": benchmark.provenance,
                        },
                        default=str,
                    )
                price_row: dict[str, Any] = {
                    "property_listing_id": listing_id,
                    "observed_at": snapshot.observed_at.isoformat(),
                    "price": new_amount,
                    "currency": new_currency,
                    "original_price": new_amount,
                    "original_currency": new_currency,
                    "price_evidence": evidence,
                    "currency_inferred": snapshot.original_price.inferred,
                    "currency_inference_reason": snapshot.original_price.inference_reason,
                    "official_alternate_prices": _official_alts_payload(
                        snapshot.official_alternate_prices
                    ),
                }
                if benchmark is not None and not benchmark.pending:
                    price_row.update(
                        {
                            "benchmark_price_xcg": (
                                float(benchmark.amount_xcg)
                                if benchmark.amount_xcg is not None
                                else None
                            ),
                            "conversion_method": (
                                benchmark.conversion_method.value
                                if benchmark.conversion_method
                                else None
                            ),
                            "conversion_rate": (
                                float(benchmark.conversion_rate)
                                if benchmark.conversion_rate is not None
                                else None
                            ),
                            "conversion_provider": benchmark.conversion_provider,
                            "conversion_rate_at": (
                                benchmark.conversion_rate_at.isoformat()
                                if benchmark.conversion_rate_at
                                else None
                            ),
                        }
                    )
                try:
                    client.table("price_observations").insert(price_row).execute()
                except Exception as error:  # noqa: BLE001 - natural key conflict = idempotent
                    if (
                        "duplicate" not in str(error).lower()
                        and "unique" not in str(error).lower()
                        and "23505" not in str(error)
                    ):
                        raise
                    notes.append(f"price_observation_idempotent:{snapshot.external_id}")
            else:
                notes.append(f"price_observation_unchanged:{snapshot.external_id}")

        # Activity events for new listings / price changes even on partial runs.
        events: list[dict[str, Any]] = []
        if is_new:
            events.append(
                {
                    "property_listing_id": listing_id,
                    "event_type": ActivityEventType.FIRST_SEEN.value,
                    "event_at": snapshot.observed_at.isoformat(),
                    "previous_value": None,
                    "new_value": {"source_url": snapshot.source_url},
                    "listing_observation_id": observation_id,
                    "source_run_id": source_run_id,
                    "derivation_type": DerivationType.SYSTEM_CALCULATED.value,
                    "confidence": 1.0,
                    "notes": "First Labs observation for this source listing",
                }
            )
        elif existing and snapshot.original_price is not None:
            prev_amount = existing.get("original_price")
            prev_currency = existing.get("original_currency")
            new_amount = float(snapshot.original_price.amount)
            new_currency = snapshot.original_price.currency
            if price_changed and prev_amount is not None:
                events.append(
                    {
                        "property_listing_id": listing_id,
                        "event_type": ActivityEventType.PRICE_CHANGED.value,
                        "event_at": snapshot.observed_at.isoformat(),
                        "previous_value": {
                            "amount": str(prev_amount),
                            "currency": prev_currency,
                        },
                        "new_value": {"amount": str(new_amount), "currency": new_currency},
                        "listing_observation_id": observation_id,
                        "source_run_id": source_run_id,
                        "derivation_type": DerivationType.SOURCE_FACT.value,
                        "confidence": 1.0,
                    }
                )
            if currency_changed and prev_currency and new_currency:
                events.append(
                    {
                        "property_listing_id": listing_id,
                        "event_type": ActivityEventType.CURRENCY_CHANGED.value,
                        "event_at": snapshot.observed_at.isoformat(),
                        "previous_value": {"currency": prev_currency},
                        "new_value": {"currency": new_currency},
                        "listing_observation_id": observation_id,
                        "source_run_id": source_run_id,
                        "derivation_type": DerivationType.SOURCE_FACT.value,
                        "confidence": 1.0,
                    }
                )
            # Benchmark-only change: same asking amount/currency, different conversion context.
            if (
                not price_changed
                and not currency_changed
                and benchmark is not None
                and not benchmark.pending
                and existing.get("benchmark_price_xcg") is not None
            ):
                prev_rate = existing.get("conversion_rate")
                prev_provider = existing.get("conversion_provider")
                prev_method = existing.get("conversion_method")
                new_rate = (
                    float(benchmark.conversion_rate)
                    if benchmark.conversion_rate is not None
                    else None
                )
                new_provider = benchmark.conversion_provider
                new_method = (
                    benchmark.conversion_method.value if benchmark.conversion_method else None
                )
                rate_changed = (
                    prev_rate is None
                    or new_rate is None
                    or abs(float(prev_rate) - float(new_rate)) > 1e-9
                )
                context_changed = (
                    rate_changed
                    or prev_provider != new_provider
                    or prev_method != new_method
                )
                if context_changed:
                    events.append(
                        {
                            "property_listing_id": listing_id,
                            "event_type": ActivityEventType.BENCHMARK_RECALCULATED.value,
                            "event_at": snapshot.observed_at.isoformat(),
                            "previous_value": {
                                "benchmark_price_xcg": str(
                                    existing.get("benchmark_price_xcg")
                                ),
                                "conversion_rate": (
                                    str(prev_rate) if prev_rate is not None else None
                                ),
                                "conversion_provider": prev_provider,
                                "conversion_method": prev_method,
                            },
                            "new_value": {
                                "benchmark_price_xcg": (
                                    str(benchmark.amount_xcg)
                                    if benchmark.amount_xcg is not None
                                    else None
                                ),
                                "conversion_rate": str(new_rate) if new_rate is not None else None,
                                "conversion_provider": new_provider,
                                "conversion_method": new_method,
                            },
                            "listing_observation_id": observation_id,
                            "source_run_id": source_run_id,
                            "derivation_type": DerivationType.SYSTEM_CALCULATED.value,
                            "confidence": 1.0,
                            "notes": "Asking amount unchanged; conversion context changed",
                        }
                    )
            if (
                snapshot.lifecycle_hint == ListingLifecycleStatus.SOLD
                and existing.get("status") != "sold"
            ):
                events.append(
                    {
                        "property_listing_id": listing_id,
                        "event_type": ActivityEventType.SOURCE_MARKED_SOLD.value,
                        "event_at": snapshot.observed_at.isoformat(),
                        "previous_value": {"status": existing.get("status")},
                        "new_value": {"status": "sold"},
                        "listing_observation_id": observation_id,
                        "source_run_id": source_run_id,
                        "derivation_type": DerivationType.SOURCE_FACT.value,
                        "confidence": 1.0,
                        "notes": "Explicit source sold signal",
                    }
                )

        if events:
            client.table("listing_activity_events").insert(
                [_with_presentation(event) for event in events]
            ).execute()
            event_count += len(events)

    # Absence transitions only for complete successful runs.
    if run.is_complete_success:
        current_map = {snap.external_id: snap for snap in snapshots}
        transitions = compare_complete_success_snapshots(
            previous=previous,
            current_snapshots=current_map,
            run=run,
            removal_threshold=removal_threshold,
        )
        # Import loop is the sole writer for asking/currency/benchmark events.
        _lifecycle_skip = {
            ActivityEventType.FIRST_SEEN,
            ActivityEventType.PRICE_CHANGED,
            ActivityEventType.CURRENCY_CHANGED,
        }
        for transition in transitions:
            # Import loop already writes first_seen / price_changed / currency_changed.
            # Re-applying those here duplicated events (and first_seen forced active).
            if transition.event_type in _lifecycle_skip:
                notes.append(
                    f"skipped_duplicate_{transition.event_type.value}:{transition.external_id}"
                )
                continue
            listing_rows = (
                client.table("property_listings")
                .select(
                    "id,status,consecutive_successful_absences,original_price,"
                    "source_url,original_realtor_name"
                )
                .eq("property_source_id", source_id)
                .eq("external_id", transition.external_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not listing_rows:
                continue
            listing_id = str(listing_rows[0]["id"])
            update: dict[str, Any] = {}
            if transition.new_status is not None:
                update["status"] = transition.new_status.value
            if transition.event_type == ActivityEventType.MISSING_FROM_SOURCE:
                update["missing_since"] = transition.event_at.isoformat()
                update["consecutive_successful_absences"] = 1
            if transition.event_type == ActivityEventType.REMOVED_FROM_SOURCE:
                update["removed_at"] = transition.event_at.isoformat()
                update["consecutive_successful_absences"] = removal_threshold
            if transition.event_type == ActivityEventType.RELISTED:
                update["missing_since"] = None
                update["removed_at"] = None
                update["consecutive_successful_absences"] = 0
            if transition.new_status is not None:
                price = listing_rows[0].get("original_price")
                eligible, reason = evaluate_public_eligibility(
                    status=transition.new_status.value,
                    original_price=Decimal(str(price)) if price is not None else None,
                    source_enabled=enabled,
                    source_url=listing_rows[0].get("source_url"),
                    source_adapter_status=adapter_status,
                    has_source_attribution=bool(
                        listing_rows[0].get("original_realtor_name")
                        or listing_rows[0].get("source_url")
                    ),
                )
                update["public_eligible"] = eligible
                update["public_exclusion_reason"] = None if eligible else reason
            if update:
                client.table("property_listings").update(update).eq("id", listing_id).execute()
            client.table("listing_activity_events").insert(
                _with_presentation(
                    {
                        "property_listing_id": listing_id,
                        "event_type": transition.event_type.value,
                        "event_at": transition.event_at.isoformat(),
                        "previous_value": transition.previous_value,
                        "new_value": transition.new_value,
                        "source_run_id": source_run_id,
                        "derivation_type": transition.derivation.value,
                        "confidence": 1.0,
                        "notes": transition.notes,
                    }
                )
            ).execute()
            event_count += 1
    else:
        notes.append("skipped_absence_transitions_non_complete_run")

    if source_run_id:
        client.table("property_source_runs").update(
            {
                "imported_count": imported,
                "updated_count": updated,
                "metadata": {
                    **(run.metadata or {}),
                    "import_notes": notes,
                },
            }
        ).eq("id", source_run_id).execute()

    # Geospatial: only when this run wrote coordinate changes and is not a failure.
    # Bounded partial imports may still assign for newly written coords so the map
    # works; they must never clear assignments for untouched listings (RPC is additive).
    if (
        apply_geospatial
        and coords_changed
        and run.outcome != SourceRunOutcome.FAILURE
        and listing_ids
    ):
        try:
            apply_listing_neighbourhood_assignments(client)
            notes.append("neighbourhood_assignment_applied")
        except Exception as error:  # noqa: BLE001
            notes.append(f"neighbourhood_assignment_failed:{error}")

    if owns_client:
        pass

    return ImportResult(
        source_run_id=source_run_id,
        imported_count=imported,
        updated_count=updated,
        observation_count=observation_count,
        event_count=event_count,
        dry_run=False,
        listing_ids=tuple(listing_ids),
        notes=tuple(notes),
    )


def run_checksum(external_ids: list[str]) -> str:
    return hashlib.sha256("|".join(sorted(external_ids)).encode("utf-8")).hexdigest()
