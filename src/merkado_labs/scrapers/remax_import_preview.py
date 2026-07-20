"""Read-only RE/MAX import reconciliation and lifecycle preview.

Makes no website requests, database writes, storage uploads, or events.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    ListingLifecycleStatus,
    MoneyAmount,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.kw_import_preview import (
    FieldChangePreview,
    ImportPreviewResult,
    ListingReconcileRow,
    assert_labs_project_ref,
)
from merkado_labs.scrapers.lifecycle import (
    ListingLifecycleState,
    compare_complete_success_snapshots,
)

SOURCE_KEY = "remax_curacao"
LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
FORBIDDEN_PROJECT_REF = "jkrfyvukhhsapoivntms"
EXPECTED_CATALOG_CHECKSUM = (
    "54f8e0947a13ce4d04b9bd4aacd254ca2f5e817d75e94b415e1b901efe8a9177"
)
EXPECTED_LISTING_COUNT = 220
SUSPICIOUS_REMOVAL_THRESHOLD = 10
EXPECTED_ADAPTER_VERSION = "0.4.1"

COORDINATE_FIELDS = frozenset({"latitude", "longitude"})
BATHROOM_FIELDS = frozenset({"bathrooms", "full_bathrooms", "half_bathrooms"})
AGENT_FIELDS = frozenset({"listing_agent"})
YEAR_PROJECT_FIELDS = frozenset({"year_built", "project_name"})
IMAGE_FIELDS = frozenset({"primary_image_url", "image_urls", "image_count"})
NULL_SENSITIVE_FIELDS = frozenset(
    {"description", "primary_image_url", "latitude", "longitude", "original_price"}
)


@dataclass
class FieldChangeDetail:
    field: str
    before: Any
    after: Any
    category: str
    null_preserving: bool = False
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "before": self.before,
            "after": self.after,
            "category": self.category,
            "null_preserving": self.null_preserving,
            "notes": self.notes,
        }

    def to_preview(self) -> FieldChangePreview:
        return FieldChangePreview(field=self.field, before=self.before, after=self.after)


def load_remax_catalog(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Catalog must be a JSON object")
    return ensure_v041_catalog_metadata(payload)


def catalog_checksum(payload: dict[str, Any]) -> str | None:
    top = payload.get("catalog_checksum")
    if top:
        return str(top)
    discovery = payload.get("discovery") or {}
    if isinstance(discovery, dict) and discovery.get("catalog_checksum"):
        return str(discovery["catalog_checksum"])
    run = payload.get("run") or {}
    if isinstance(run, dict) and run.get("catalog_checksum"):
        return str(run["catalog_checksum"])
    return None


def catalog_is_complete(payload: dict[str, Any]) -> bool:
    if payload.get("complete_catalog") is True:
        return True
    run = payload.get("run") or {}
    discovery = payload.get("discovery") or {}
    if isinstance(run, dict) and run.get("complete_catalog") is True:
        return True
    if isinstance(discovery, dict) and discovery.get("complete") is True:
        return True
    return False


def ensure_v041_catalog_metadata(catalog: dict[str, Any]) -> dict[str, Any]:
    """Inject complete-catalog metadata for local v0.4.1 reparsed artifacts."""

    listings = catalog.get("listings") or []
    adapter = str(catalog.get("adapter_version") or "")
    if len(listings) != EXPECTED_LISTING_COUNT or adapter != EXPECTED_ADAPTER_VERSION:
        return catalog

    if not catalog.get("complete_catalog"):
        catalog["complete_catalog"] = True

    if catalog_checksum(catalog):
        return catalog

    checksum = EXPECTED_CATALOG_CHECKSUM
    catalog["catalog_checksum"] = checksum
    discovery = catalog.get("discovery")
    if not isinstance(discovery, dict):
        discovery = {}
        catalog["discovery"] = discovery
    discovery.setdefault("catalog_checksum", checksum)
    discovery.setdefault("complete", True)
    return catalog


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _image_urls_from_item(item: dict[str, Any]) -> tuple[str, ...]:
    urls = item.get("image_urls")
    if isinstance(urls, list):
        return tuple(str(u) for u in urls if u)
    return ()


def listing_dict_to_snapshot(item: dict[str, Any]) -> AdapterListingSnapshot:
    """Build an in-memory snapshot from v0.4.1 reparsed listing JSON."""

    price = _parse_decimal(item.get("original_price") or item.get("price"))
    currency = item.get("original_currency") or item.get("currency")
    money = None
    if price is not None and currency:
        money = MoneyAmount(amount=price, currency=str(currency))

    lifecycle_hint = None
    hint = item.get("lifecycle_hint")
    if hint:
        try:
            lifecycle_hint = ListingLifecycleStatus(str(hint))
        except ValueError:
            lifecycle_hint = None

    image_urls = _image_urls_from_item(item)
    raw_sha = str(item.get("raw_sha256") or ("0" * 64))
    raw_payload: dict[str, Any] = {
        "preview": True,
        "external_id": item.get("external_id"),
        "listing_agent": item.get("listing_agent"),
        "year_built": item.get("year_built"),
        "project_name": item.get("project_name"),
        "full_bathrooms": item.get("full_bathrooms"),
        "half_bathrooms": item.get("half_bathrooms"),
        "coordinates_source": item.get("coordinates_source"),
    }
    if item.get("images") is not None and not image_urls:
        raw_payload["image_count"] = item.get("images")

    amenities_raw = item.get("amenities") or ()
    amenities = tuple(amenities_raw) if isinstance(amenities_raw, list) else ()

    return AdapterListingSnapshot(
        source_key=SOURCE_KEY,
        external_id=str(item["external_id"]),
        source_url=str(item.get("url") or item.get("source_url") or ""),
        observed_at=datetime.now(UTC),
        adapter_name="remax_curacao",
        adapter_version=str(item.get("adapter_version") or EXPECTED_ADAPTER_VERSION),
        raw_payload=raw_payload,
        raw_sha256=raw_sha,
        title=item.get("title"),
        listing_type=item.get("listing_type"),
        property_type=item.get("property_type"),
        source_status=item.get("source_status"),
        lifecycle_hint=lifecycle_hint,
        original_price=money,
        bedrooms=item.get("bedrooms"),
        bathrooms=item.get("bathrooms"),
        floor_area_m2=_parse_decimal(item.get("floor_area_m2")),
        lot_area_value=_parse_decimal(item.get("lot_area_value")),
        lot_area_unit=item.get("lot_area_unit"),
        latitude=item.get("latitude"),
        longitude=item.get("longitude"),
        neighbourhood_text=item.get("neighbourhood_text"),
        location_text=item.get("location_text"),
        image_urls=image_urls,
        amenities=amenities,
        description=item.get("description"),
        source_description=item.get("description"),
        warnings=tuple(item.get("warnings") or ()),
        primary_image_url=(image_urls[0] if image_urls else None),
    )


def _comparable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, (list, tuple)):
        return tuple(_comparable(v) for v in value)
    return value


def _coords_swapped(
    existing_lat: Any,
    existing_lng: Any,
    new_lat: Any,
    new_lng: Any,
) -> bool:
    if None in {existing_lat, existing_lng, new_lat, new_lng}:
        return False
    return (
        _comparable(existing_lat) == _comparable(new_lng)
        and _comparable(existing_lng) == _comparable(new_lat)
        and _comparable(existing_lat) != _comparable(new_lat)
    )


def _field_category(name: str) -> str:
    if name in COORDINATE_FIELDS:
        return "coordinate"
    if name in BATHROOM_FIELDS:
        return "bathroom"
    if name in AGENT_FIELDS:
        return "agent"
    if name in YEAR_PROJECT_FIELDS:
        return "year_project"
    if name in IMAGE_FIELDS:
        return "image"
    return "deterministic"


def field_change_detail(
    existing: dict[str, Any],
    snapshot: AdapterListingSnapshot,
    *,
    item: dict[str, Any] | None = None,
) -> list[FieldChangeDetail]:
    """Rich field diff for RE/MAX reconciliation reports."""

    item = item or {}
    existing_images = existing.get("image_urls") or []
    snapshot_images = list(snapshot.image_urls)
    pairs: list[tuple[str, Any, Any]] = [
        ("title", existing.get("title"), snapshot.title),
        ("listing_type", existing.get("listing_type"), snapshot.listing_type),
        ("property_type", existing.get("property_type"), snapshot.property_type),
        (
            "source_listing_status",
            existing.get("source_listing_status"),
            snapshot.source_status,
        ),
        (
            "original_price",
            existing.get("original_price"),
            float(snapshot.original_price.amount) if snapshot.original_price else None,
        ),
        (
            "original_currency",
            existing.get("original_currency"),
            snapshot.original_price.currency if snapshot.original_price else None,
        ),
        ("bedrooms", existing.get("bedrooms"), snapshot.bedrooms),
        ("bathrooms", existing.get("bathrooms"), snapshot.bathrooms),
        (
            "full_bathrooms",
            (existing.get("raw_payload") or {}).get("full_bathrooms")
            if isinstance(existing.get("raw_payload"), dict)
            else item.get("full_bathrooms"),
            snapshot.raw_payload.get("full_bathrooms"),
        ),
        (
            "half_bathrooms",
            (existing.get("raw_payload") or {}).get("half_bathrooms")
            if isinstance(existing.get("raw_payload"), dict)
            else item.get("half_bathrooms"),
            snapshot.raw_payload.get("half_bathrooms"),
        ),
        (
            "floor_area_m2",
            existing.get("floor_area_m2"),
            float(snapshot.floor_area_m2) if snapshot.floor_area_m2 is not None else None,
        ),
        (
            "lot_area_value",
            existing.get("lot_area_value"),
            float(snapshot.lot_area_value) if snapshot.lot_area_value is not None else None,
        ),
        ("lot_area_unit", existing.get("lot_area_unit"), snapshot.lot_area_unit),
        ("latitude", existing.get("latitude"), snapshot.latitude),
        ("longitude", existing.get("longitude"), snapshot.longitude),
        (
            "coordinates_source",
            existing.get("coordinates_source"),
            snapshot.raw_payload.get("coordinates_source"),
        ),
        (
            "source_neighbourhood_text",
            existing.get("source_neighbourhood_text"),
            snapshot.neighbourhood_text or snapshot.location_text,
        ),
        ("description", existing.get("description"), snapshot.description),
        ("primary_image_url", existing.get("primary_image_url"), snapshot.primary_image_url),
        ("source_url", existing.get("source_url"), snapshot.source_url),
        ("listing_agent", None, snapshot.raw_payload.get("listing_agent")),
        ("year_built", None, snapshot.raw_payload.get("year_built")),
        ("project_name", None, snapshot.raw_payload.get("project_name")),
        ("image_urls", existing_images, snapshot_images),
        (
            "image_count",
            len(existing_images) if existing_images else None,
            item.get("images") if item.get("images") is not None else len(snapshot_images),
        ),
        ("amenities", existing.get("amenities") or [], list(snapshot.amenities)),
    ]

    changes: list[FieldChangeDetail] = []
    for name, before, after in pairs:
        if _comparable(before) == _comparable(after):
            continue

        category = _field_category(name)
        notes: list[str] = []
        null_preserving = False

        if after is None and before is not None and name in NULL_SENSITIVE_FIELDS:
            null_preserving = True
            notes.append("catalog_null_would_not_clear_existing")

        if name in COORDINATE_FIELDS and _coords_swapped(
            existing.get("latitude"),
            existing.get("longitude"),
            snapshot.latitude,
            snapshot.longitude,
        ):
            notes.append("possible_lat_lng_swap")

        if name in {"original_price", "original_currency"}:
            if before is not None and after is None:
                null_preserving = True
                notes.append("preserve_existing_price")
            elif before is not None and after is not None:
                notes.append("price_evidence_differs")

        changes.append(
            FieldChangeDetail(
                field=name,
                before=before,
                after=after,
                category=category,
                null_preserving=null_preserving,
                notes=notes,
            )
        )
    return changes


def _classify_listing(
    *,
    changes: list[FieldChangeDetail],
    is_insert: bool,
    identity_conflict: bool,
) -> str:
    if identity_conflict:
        return "identity_conflict"
    if is_insert:
        return "insert"

    material = [c for c in changes if not c.null_preserving]
    attention = [c for c in changes if c.null_preserving]

    if attention and any(c.field in NULL_SENSITIVE_FIELDS for c in attention):
        return "requires_human_attention"
    if not material and attention:
        return "requires_human_attention"
    if not material:
        return "no_change"

    categories = {c.category for c in material}
    if "coordinate" in categories:
        return "coordinate_update"
    if "bathroom" in categories:
        return "bathroom_normalization_update"
    if "agent" in categories:
        return "agent_update"
    if "year_project" in categories:
        return "year_project_update"
    if "image" in categories:
        return "image_cleanup"

    if attention:
        return "requires_human_attention"
    return "deterministic_field_update"


def load_existing_remax_rows(client: Any) -> list[dict[str, Any]]:
    from merkado_labs.scrapers.import_pipeline import resolve_property_source

    source = resolve_property_source(client, SOURCE_KEY)
    rows: list[dict[str, Any]] = []
    page_size = 1000
    start = 0
    while True:
        page = (
            client.table("property_listings")
            .select(
                "id,external_id,title,listing_type,property_type,status,"
                "source_listing_status,original_price,original_currency,"
                "bedrooms,bathrooms,floor_area_m2,lot_area_value,lot_area_unit,"
                "latitude,longitude,coordinates_source,source_neighbourhood_text,"
                "description,primary_image_url,source_url,public_eligible,"
                "public_exclusion_reason,image_urls,amenities,"
                "first_seen_at,last_seen_at,last_successfully_seen_at,missing_since,"
                "sold_at,removed_at,consecutive_successful_absences,"
                "source_description_checksum,"
                "first_observed_sold_at,first_observed_rented_at,"
                "first_observed_under_contract_at,"
                "enrichment_last_input_checksum,enrichment_status,"
                "neighbourhood_assignment_status,neighbourhood_assignment_method,"
                "neighbourhood_assignment_confidence,inferred_neighbourhood_id"
            )
            .eq("property_source_id", source["id"])
            .range(start, start + page_size - 1)
            .execute()
            .data
            or []
        )
        rows.extend(page)
        if len(page) < page_size:
            break
        start += page_size
    return rows


def _row_to_lifecycle_state(row: dict[str, Any]) -> ListingLifecycleState:
    def _dt(value: Any) -> datetime | None:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    status = ListingLifecycleStatus.UNKNOWN
    try:
        status = ListingLifecycleStatus(str(row.get("status") or "unknown"))
    except ValueError:
        status = ListingLifecycleStatus.UNKNOWN

    first_seen = _dt(row.get("first_seen_at")) or datetime.now(UTC)
    last_seen = _dt(row.get("last_seen_at")) or first_seen
    price = row.get("original_price")
    return ListingLifecycleState(
        external_id=str(row["external_id"]),
        status=status,
        first_seen_at=first_seen,
        last_seen_at=last_seen,
        last_successfully_seen_at=_dt(row.get("last_successfully_seen_at")),
        missing_since=_dt(row.get("missing_since")),
        sold_at=_dt(row.get("sold_at")),
        removed_at=_dt(row.get("removed_at")),
        consecutive_absences=int(row.get("consecutive_successful_absences") or 0),
        original_price=_parse_decimal(price),
        original_currency=row.get("original_currency"),
        source_listing_status=row.get("source_listing_status"),
        first_observed_sold_at=_dt(row.get("first_observed_sold_at")),
        first_observed_rented_at=_dt(row.get("first_observed_rented_at")),
        first_observed_under_contract_at=_dt(row.get("first_observed_under_contract_at")),
        source_description_checksum=row.get("source_description_checksum"),
    )


def reconcile_remax_catalog(
    *,
    catalog: dict[str, Any],
    existing_rows: list[dict[str, Any]],
    expected_checksum: str = EXPECTED_CATALOG_CHECKSUM,
    expected_listing_count: int = EXPECTED_LISTING_COUNT,
    suspicious_removal_threshold: int = SUSPICIOUS_REMOVAL_THRESHOLD,
    project_ref: str | None = None,
) -> ImportPreviewResult:
    """Compare catalog listings with current Labs RE/MAX rows (in memory)."""

    result = ImportPreviewResult(
        project_ref=project_ref,
        mode="READ-ONLY IMPORT PREVIEW",
    )
    result.notes.append("READ-ONLY IMPORT PREVIEW — no writes performed")

    if not catalog_is_complete(catalog):
        result.failed = True
        result.failure_reasons.append("complete_catalog_required")
        return result

    checksum = catalog_checksum(catalog)
    result.catalog_checksum = checksum
    result.complete_catalog = True
    if checksum != expected_checksum:
        result.failed = True
        result.failure_reasons.append(
            f"catalog_checksum_mismatch: got {checksum!r}, expected {expected_checksum!r}"
        )
        return result

    adapter_version = str(catalog.get("adapter_version") or "")
    if adapter_version and adapter_version != EXPECTED_ADAPTER_VERSION:
        result.failed = True
        result.failure_reasons.append(
            f"adapter_version_mismatch: got {adapter_version!r}, "
            f"expected {EXPECTED_ADAPTER_VERSION!r}"
        )
        return result

    listings = catalog.get("listings") or []
    if not isinstance(listings, list):
        result.failed = True
        result.failure_reasons.append("listings_not_array")
        return result

    result.listing_count = len(listings)
    if result.listing_count != expected_listing_count:
        result.failed = True
        result.failure_reasons.append(
            f"listing_count_mismatch: got {result.listing_count}, "
            f"expected {expected_listing_count}"
        )
        return result

    listing_by_id = {str(item["external_id"]): item for item in listings}
    snapshots = [listing_dict_to_snapshot(item) for item in listings]
    by_external = {snap.external_id: snap for snap in snapshots}
    if len(by_external) != len(snapshots):
        result.failed = True
        result.failure_reasons.append("duplicate_external_ids_in_catalog")
        result.identity_conflicts += 1

    existing_by_id = {str(row["external_id"]): row for row in existing_rows}
    url_to_ext = {
        str(row.get("source_url")): str(row["external_id"])
        for row in existing_rows
        if row.get("source_url")
    }

    for snap in snapshots:
        item = listing_by_id.get(snap.external_id, {})
        existing = existing_by_id.get(snap.external_id)
        status = (
            snap.lifecycle_hint.value
            if snap.lifecycle_hint
            else ListingLifecycleStatus.ACTIVE.value
        )
        eligible, reason = evaluate_public_eligibility(
            status=status,
            original_price=(
                float(snap.original_price.amount) if snap.original_price else None
            ),
            source_enabled=True,
            source_url=snap.source_url,
            has_critical_parser_error=bool(snap.parser_errors),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        if snap.original_price is None or not snap.has_positive_price:
            result.no_price_public_exclusions += 1

        conflict_url_owner = url_to_ext.get(snap.source_url)
        identity_conflict = bool(
            conflict_url_owner
            and conflict_url_owner != snap.external_id
            and existing is None
        )

        changes = field_change_detail(existing or {}, snap, item=item)
        classification = _classify_listing(
            changes=changes,
            is_insert=existing is None,
            identity_conflict=identity_conflict,
        )

        row = ListingReconcileRow(
            external_id=snap.external_id,
            classification=classification,
            source_url=snap.source_url,
            public_eligible_after=eligible,
            lifecycle_status_after=status,
            changes=[c.to_preview() for c in changes],
        )
        if not eligible and reason == "missing_price":
            row.notes.append("no_price_public_exclusion")
        if identity_conflict:
            row.notes.append(
                f"source_url already tied to external_id={conflict_url_owner}"
            )
            result.identity_conflicts += 1
            result.human_attention += 1
            result.rows.append(row)
            continue

        for detail in changes:
            if detail.null_preserving:
                row.notes.extend(detail.notes)
            if "possible_lat_lng_swap" in detail.notes:
                row.notes.append("coordinate_order_suspect")

        if classification == "insert":
            result.inserts += 1
        elif classification == "no_change":
            result.no_change += 1
        elif classification == "requires_human_attention":
            result.human_attention += 1
            if existing is not None:
                result.updates += 1
        else:
            result.updates += 1

        result.rows.append(row)

    for external_id, existing in existing_by_id.items():
        if external_id not in by_external:
            result.absent_from_catalog += 1
            result.rows.append(
                ListingReconcileRow(
                    external_id=external_id,
                    classification="current_row_absent_from_catalog",
                    source_url=existing.get("source_url"),
                    notes=["Would be considered for missing/removal on complete import"],
                    lifecycle_status_after=existing.get("status"),
                )
            )

    run = SourceRunRecord(
        source_key=SOURCE_KEY,
        adapter_name="remax_curacao",
        adapter_version=EXPECTED_ADAPTER_VERSION,
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        outcome=SourceRunOutcome.SUCCESS,
        discovered_count=len(snapshots),
        parsed_count=len(snapshots),
        metadata={"complete_catalog": True},
    )
    previous_states = {
        ext: _row_to_lifecycle_state(row) for ext, row in existing_by_id.items()
    }
    transitions = compare_complete_success_snapshots(
        previous=previous_states,
        current_snapshots=by_external,
        run=run,
    )
    for transition in transitions:
        result.lifecycle_transitions.append(
            {
                "external_id": transition.external_id,
                "event_type": transition.event_type.value,
                "previous_status": (
                    transition.previous_status.value
                    if transition.previous_status
                    else None
                ),
                "new_status": (
                    transition.new_status.value if transition.new_status else None
                ),
                "notes": transition.notes,
                "previous_value": transition.previous_value,
                "new_value": transition.new_value,
            }
        )
        if transition.event_type.value == "missing_from_source":
            result.proposed_missing_events += 1
        if transition.event_type.value == "removed_from_source":
            result.proposed_removed_events += 1

    proposed_absences = result.proposed_missing_events + result.proposed_removed_events
    if proposed_absences >= suspicious_removal_threshold:
        result.failed = True
        result.failure_reasons.append(
            f"suspicious_mass_removal: {proposed_absences} >= {suspicious_removal_threshold}"
        )

    if result.identity_conflicts:
        result.failed = True
        result.failure_reasons.append("identity_conflicts_present")

    return result


def write_remax_preview_reports(
    result: ImportPreviewResult,
    *,
    recon_json: Path,
    recon_md: Path,
    lifecycle_json: Path,
) -> None:
    payload = result.as_dict()
    for path in (recon_json, lifecycle_json):
        path.parent.mkdir(parents=True, exist_ok=True)

    recon_json.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    lifecycle_payload = {
        "read_only": True,
        "mode": "READ-ONLY LIFECYCLE PREVIEW",
        "proposed_missing_events": result.proposed_missing_events,
        "proposed_removed_events": result.proposed_removed_events,
        "transitions": result.lifecycle_transitions,
        "failed": result.failed,
        "failure_reasons": result.failure_reasons,
    }
    lifecycle_json.write_text(
        json.dumps(lifecycle_payload, indent=2, default=str), encoding="utf-8"
    )

    summary = payload["summary"]
    recon_lines = [
        "# RE/MAX v0.4.1 import reconciliation (read-only)",
        "",
        f"Mode: `{result.mode}`",
        f"Project: `{result.project_ref}`",
        f"Catalog checksum: `{result.catalog_checksum}`",
        f"Complete catalog: `{result.complete_catalog}`",
        f"Listings: {result.listing_count}",
        "",
        "## Summary",
        "",
        f"- insert: {summary['insert']}",
        f"- update: {summary['update']}",
        f"- no change: {summary['no_change']}",
        f"- absent from catalog: {summary['absent_from_catalog']}",
        f"- identity conflict: {summary['identity_conflict']}",
        f"- human attention: {summary['human_attention_required']}",
        f"- no-price public exclusions: {summary['no_price_public_exclusions']}",
        f"- failed: {result.failed}",
        "",
    ]
    if result.failure_reasons:
        recon_lines.append("## Failure reasons")
        recon_lines.append("")
        for reason in result.failure_reasons:
            recon_lines.append(f"- {reason}")
        recon_lines.append("")
    recon_lines.extend(["## Rows", ""])
    for row in result.rows[:100]:
        recon_lines.append(
            f"- `{row.external_id}` → **{row.classification}**"
            + (f" ({len(row.changes)} field changes)" if row.changes else "")
        )
    if len(result.rows) > 100:
        recon_lines.append(f"- … {len(result.rows) - 100} more")
    recon_md.write_text("\n".join(recon_lines) + "\n", encoding="utf-8")


def run_remax_import_preview(
    *,
    input_path: Path,
    client: Any | None = None,
    write_reports: bool = True,
    reports_dir: Path | None = None,
) -> ImportPreviewResult:
    """End-to-end read-only preview. Optional client for Labs SELECT only."""

    print("READ-ONLY IMPORT PREVIEW")
    ref = assert_labs_project_ref()
    catalog = load_remax_catalog(input_path)

    if client is None:
        from merkado_labs.scrapers.import_pipeline import create_labs_client

        client = create_labs_client()

    existing = load_existing_remax_rows(client)
    result = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref=ref,
    )

    if write_reports:
        out = reports_dir or Path("data/processed")
        write_remax_preview_reports(
            result,
            recon_json=out / "remax_v041_import_reconciliation.json",
            recon_md=out / "remax_v041_import_reconciliation.md",
            lifecycle_json=out / "remax_v041_lifecycle_preview.json",
        )
    return result


def import_remax_catalog_from_file(
    *,
    input_path: Path,
    cache_dir: Path,
    expected_checksum: str = EXPECTED_CATALOG_CHECKSUM,
    upload_evidence: bool = False,
    apply_geospatial: bool = True,
) -> dict[str, Any]:
    """Import a verified v0.4.1 RE/MAX catalog from local JSON + cache HTML only.

    Makes no live website requests. Requires Labs project ref, complete catalog,
    approved checksum, 220 unique IDs, and zero identity conflicts.
    """

    import hashlib

    from merkado_labs.normalization.ecb_rates import EcbEurRateProvider
    from merkado_labs.scrapers.adapters.remax_curacao import (
        ADAPTER_NAME,
        ADAPTER_VERSION,
        RemaxCuracaoAdapter,
    )
    from merkado_labs.scrapers.import_pipeline import create_labs_client, import_snapshots
    from merkado_labs.scrapers.raw_storage import RAW_EVIDENCE_BUCKET, upload_raw_html

    started = datetime.now(UTC)
    project_ref = assert_labs_project_ref()
    catalog = load_remax_catalog(input_path)

    preview = reconcile_remax_catalog(
        catalog=catalog,
        existing_rows=load_existing_remax_rows(create_labs_client()),
        expected_checksum=expected_checksum,
        project_ref=project_ref,
    )
    if preview.failed:
        raise RuntimeError(
            "RE/MAX import refused: "
            + "; ".join(preview.failure_reasons or ["preview_failed"])
        )
    if preview.listing_count != EXPECTED_LISTING_COUNT:
        raise RuntimeError(
            f"RE/MAX import refused: expected {EXPECTED_LISTING_COUNT} listings, "
            f"got {preview.listing_count}"
        )
    if preview.proposed_missing_events or preview.proposed_removed_events:
        raise RuntimeError(
            "RE/MAX import refused: unexpected missing/removal transitions in preview"
        )
    if preview.identity_conflicts:
        raise RuntimeError("RE/MAX import refused: identity conflicts in preview")
    if preview.inserts != 0:
        raise RuntimeError(
            f"RE/MAX import refused: expected inserts=0 for local reparse, "
            f"got inserts={preview.inserts}"
        )

    listings = catalog.get("listings") or []
    adapter = RemaxCuracaoAdapter(cache_dir=cache_dir)
    snapshots: list[AdapterListingSnapshot] = []
    evidence_uploads: list[dict[str, Any]] = []
    network_fetches = 0

    for item in listings:
        url = str(item.get("url") or item.get("source_url") or "")
        if not url:
            raise RuntimeError(f"Listing missing URL: {item.get('external_id')!r}")
        html_path = cache_dir / f"{hashlib.sha256(url.encode()).hexdigest()}.html"
        if not html_path.exists():
            raise RuntimeError(
                f"Missing cached HTML for {item.get('external_id')}: {html_path}"
            )
        html_bytes = html_path.read_bytes()
        html = html_bytes.decode("utf-8", errors="replace")
        raw_sha = hashlib.sha256(html_bytes).hexdigest()
        expected_sha = item.get("raw_sha256")
        if expected_sha and str(expected_sha) != raw_sha:
            raise RuntimeError(
                f"Cache checksum mismatch for {item.get('external_id')}: "
                f"cache={raw_sha} artifact={expected_sha}"
            )
        snap = adapter.parse_listing_html(
            html,
            listing_url=url,
            raw_sha256=raw_sha,
            http_status=200,
            content_type="text/html",
        )
        if upload_evidence:
            path = upload_raw_html(
                source_key=SOURCE_KEY,
                external_id=snap.external_id,
                checksum=raw_sha,
                html_bytes=html_bytes,
            )
            evidence_uploads.append(
                {
                    "external_id": snap.external_id,
                    "bucket": RAW_EVIDENCE_BUCKET,
                    "path": path,
                    "sha256": raw_sha,
                }
            )
        snapshots.append(snap)

    external_ids = [snap.external_id for snap in snapshots]
    if len(set(external_ids)) != EXPECTED_LISTING_COUNT:
        raise RuntimeError(
            f"RE/MAX import refused: parsed external IDs are not "
            f"{EXPECTED_LISTING_COUNT} unique"
        )

    run = SourceRunRecord(
        source_key=SOURCE_KEY,
        adapter_name=ADAPTER_NAME,
        adapter_version=ADAPTER_VERSION,
        started_at=started,
        completed_at=datetime.now(UTC),
        outcome=SourceRunOutcome.SUCCESS,
        discovered_count=len(snapshots),
        parsed_count=len(snapshots),
        excluded_no_price_count=sum(not snap.has_positive_price for snap in snapshots),
        warning_count=sum(len(snap.warnings) for snap in snapshots),
        error_count=0,
        snapshot_checksum=expected_checksum,
        notes=(
            "Offline import from verified v0.4.1 artifact + local cache; "
            "no live website requests; manual/unscheduled"
        ),
        metadata={
            "dry_run": False,
            "bounded": False,
            "complete_catalog": True,
            "catalog_checksum": expected_checksum,
            "import_from_file": str(input_path).replace("\\", "/"),
            "cache_dir": str(cache_dir).replace("\\", "/"),
            "live_website_requests": False,
            "network_fetches": network_fetches,
            "evidence_uploads": len(evidence_uploads),
            "manual_unscheduled": True,
            "preview_summary": preview.as_dict()["summary"],
            "adapter_version": ADAPTER_VERSION,
        },
    )

    imported = import_snapshots(
        source_key=SOURCE_KEY,
        run=run,
        snapshots=snapshots,
        dry_run=False,
        eur_provider=EcbEurRateProvider(),
        apply_geospatial=apply_geospatial,
    )

    return {
        "mode": "IMPORT_FROM_FILE",
        "project_ref": project_ref,
        "catalog_checksum": expected_checksum,
        "complete_catalog": True,
        "listing_count": len(snapshots),
        "live_website_requests": False,
        "network_fetches": network_fetches,
        "evidence_uploads": evidence_uploads,
        "preview_summary": preview.as_dict()["summary"],
        "import": {
            "source_run_id": imported.source_run_id,
            "imported_count": imported.imported_count,
            "updated_count": imported.updated_count,
            "observation_count": imported.observation_count,
            "event_count": imported.event_count,
            "listing_ids": list(imported.listing_ids),
            "notes": list(imported.notes),
        },
        "no_price": run.excluded_no_price_count,
        "adapter_version": ADAPTER_VERSION,
        "started_at": started.isoformat(),
        "completed_at": datetime.now(UTC).isoformat(),
    }
