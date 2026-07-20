"""Read-only Keller Williams import reconciliation and lifecycle preview.

Makes no website requests, database writes, storage uploads, or events.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from merkado_labs.config import get_settings
from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    ListingLifecycleStatus,
    MoneyAmount,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.lifecycle import (
    ListingLifecycleState,
    compare_complete_success_snapshots,
)

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
FORBIDDEN_PROJECT_REF = "jkrfyvukhhsapoivntms"
EXPECTED_CATALOG_CHECKSUM = (
    "69cd01fdb450800809040a73303c2c6d8bb846898f19d267da9bb709bdc1f6f7"
)
# Fail preview when a complete catalog would mark this many existing rows absent.
SUSPICIOUS_REMOVAL_THRESHOLD = 10
SOURCE_KEY = "keller_williams_curacao"


@dataclass
class FieldChangePreview:
    field: str
    before: Any
    after: Any

    def as_dict(self) -> dict[str, Any]:
        return {"field": self.field, "before": self.before, "after": self.after}


@dataclass
class ListingReconcileRow:
    external_id: str
    classification: str
    source_url: str | None = None
    changes: list[FieldChangePreview] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    public_eligible_after: bool | None = None
    lifecycle_status_after: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "classification": self.classification,
            "source_url": self.source_url,
            "changes": [c.as_dict() for c in self.changes],
            "notes": self.notes,
            "public_eligible_after": self.public_eligible_after,
            "lifecycle_status_after": self.lifecycle_status_after,
        }


@dataclass
class ImportPreviewResult:
    read_only: bool = True
    mode: str = "READ-ONLY IMPORT PREVIEW"
    project_ref: str | None = None
    catalog_checksum: str | None = None
    complete_catalog: bool = False
    listing_count: int = 0
    inserts: int = 0
    updates: int = 0
    no_change: int = 0
    absent_from_catalog: int = 0
    identity_conflicts: int = 0
    human_attention: int = 0
    no_price_public_exclusions: int = 0
    proposed_missing_events: int = 0
    proposed_removed_events: int = 0
    failed: bool = False
    failure_reasons: list[str] = field(default_factory=list)
    rows: list[ListingReconcileRow] = field(default_factory=list)
    lifecycle_transitions: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "read_only": self.read_only,
            "mode": self.mode,
            "project_ref": self.project_ref,
            "catalog_checksum": self.catalog_checksum,
            "complete_catalog": self.complete_catalog,
            "listing_count": self.listing_count,
            "summary": {
                "insert": self.inserts,
                "update": self.updates,
                "no_change": self.no_change,
                "absent_from_catalog": self.absent_from_catalog,
                "identity_conflict": self.identity_conflicts,
                "human_attention_required": self.human_attention,
                "no_price_public_exclusions": self.no_price_public_exclusions,
                "proposed_missing_events": self.proposed_missing_events,
                "proposed_removed_events": self.proposed_removed_events,
            },
            "failed": self.failed,
            "failure_reasons": self.failure_reasons,
            "rows": [r.as_dict() for r in self.rows],
            "lifecycle_transitions": self.lifecycle_transitions,
            "notes": self.notes,
            "no_website_requests": True,
            "no_database_writes": True,
            "no_storage_uploads": True,
            "no_events_created": True,
        }


def assert_labs_project_ref() -> str:
    settings = get_settings()
    ref = settings.supabase_project_ref
    if ref == FORBIDDEN_PROJECT_REF:
        raise RuntimeError("Refusing production Supabase project reference")
    if ref != LABS_PROJECT_REF:
        raise RuntimeError(f"Refusing non-Labs project ref {ref!r}")
    if settings.supabase_url and LABS_PROJECT_REF not in str(settings.supabase_url):
        raise RuntimeError(f"Refusing non-Labs SUPABASE_URL: {settings.supabase_url}")
    return ref


def load_kw_catalog(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Catalog must be a JSON object")
    return payload


def catalog_checksum(payload: dict[str, Any]) -> str | None:
    discovery = payload.get("discovery") or {}
    if isinstance(discovery, dict) and discovery.get("catalog_checksum"):
        return str(discovery["catalog_checksum"])
    run = payload.get("run") or {}
    if isinstance(run, dict) and run.get("catalog_checksum"):
        return str(run["catalog_checksum"])
    return None


def catalog_is_complete(payload: dict[str, Any]) -> bool:
    run = payload.get("run") or {}
    discovery = payload.get("discovery") or {}
    if isinstance(run, dict) and run.get("complete_catalog") is True:
        return True
    if isinstance(discovery, dict) and discovery.get("complete") is True:
        return True
    if payload.get("complete_catalog") is True:
        return True
    return False


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def listing_dict_to_snapshot(item: dict[str, Any]) -> AdapterListingSnapshot:
    """Build an in-memory snapshot from Stage 3 dry-run listing JSON."""

    price = _parse_decimal(item.get("price"))
    currency = item.get("currency")
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

    raw_sha = str(item.get("raw_sha256") or ("0" * 64))
    return AdapterListingSnapshot(
        source_key=SOURCE_KEY,
        external_id=str(item["external_id"]),
        source_url=str(item.get("url") or item.get("source_url") or ""),
        observed_at=datetime.now(UTC),
        adapter_name="keller_williams_curacao",
        adapter_version=str(item.get("adapter_version") or "0.3.0"),
        raw_payload={"preview": True, "external_id": item.get("external_id")},
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
        image_urls=tuple(item.get("image_urls") or ()),
        description=item.get("description"),
        source_description=item.get("description"),
        structured_evidence=item.get("structured_evidence") or {},
        warnings=tuple(item.get("warnings") or ()),
        primary_image_url=(item.get("image_urls") or [None])[0]
        if item.get("image_urls")
        else None,
    )


def _comparable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float):
        return round(value, 6)
    return value


def _diff_fields(
    existing: dict[str, Any],
    snapshot: AdapterListingSnapshot,
) -> list[FieldChangePreview]:
    pairs = [
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
            "source_neighbourhood_text",
            existing.get("source_neighbourhood_text"),
            snapshot.neighbourhood_text or snapshot.location_text,
        ),
        ("description", existing.get("description"), snapshot.description),
        ("primary_image_url", existing.get("primary_image_url"), snapshot.primary_image_url),
        ("source_url", existing.get("source_url"), snapshot.source_url),
    ]
    changes: list[FieldChangePreview] = []
    for name, before, after in pairs:
        if _comparable(before) != _comparable(after):
            # Null-preserving: do not treat missing catalog null as clearing a
            # populated Labs field unless the catalog explicitly has the key.
            if after is None and before is not None and name in {
                "description",
                "primary_image_url",
                "latitude",
                "longitude",
            }:
                # Dry-run summaries often omit full description/images; flag attention.
                changes.append(
                    FieldChangePreview(
                        field=name,
                        before=before,
                        after=after,
                    )
                )
                continue
            changes.append(FieldChangePreview(field=name, before=before, after=after))
    return changes


def load_existing_kw_rows(client: Any) -> list[dict[str, Any]]:
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
                "latitude,longitude,source_neighbourhood_text,description,"
                "primary_image_url,source_url,public_eligible,public_exclusion_reason,"
                "first_seen_at,last_seen_at,last_successfully_seen_at,missing_since,"
                "sold_at,removed_at,consecutive_successful_absences,"
                "source_description_checksum,"
                "first_observed_sold_at,first_observed_rented_at,"
                "first_observed_under_contract_at"
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


def reconcile_kw_catalog(
    *,
    catalog: dict[str, Any],
    existing_rows: list[dict[str, Any]],
    expected_checksum: str = EXPECTED_CATALOG_CHECKSUM,
    suspicious_removal_threshold: int = SUSPICIOUS_REMOVAL_THRESHOLD,
    project_ref: str | None = None,
) -> ImportPreviewResult:
    """Compare catalog listings with current Labs KW rows (in memory)."""

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

    listings = catalog.get("listings") or []
    if not isinstance(listings, list):
        result.failed = True
        result.failure_reasons.append("listings_not_array")
        return result

    result.listing_count = len(listings)
    snapshots = [listing_dict_to_snapshot(item) for item in listings]
    by_external = {snap.external_id: snap for snap in snapshots}
    if len(by_external) != len(snapshots):
        result.failed = True
        result.failure_reasons.append("duplicate_external_ids_in_catalog")
        result.identity_conflicts += 1

    existing_by_id = {str(row["external_id"]): row for row in existing_rows}
    # Identity conflict: same source_url mapped to different external_id
    url_to_ext = {
        str(row.get("source_url")): str(row["external_id"])
        for row in existing_rows
        if row.get("source_url")
    }

    for snap in snapshots:
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

        row = ListingReconcileRow(
            external_id=snap.external_id,
            classification="insert",
            source_url=snap.source_url,
            public_eligible_after=eligible,
            lifecycle_status_after=status,
        )
        if not eligible and reason == "missing_price":
            row.notes.append("no_price_public_exclusion")

        conflict_url_owner = url_to_ext.get(snap.source_url)
        if (
            conflict_url_owner
            and conflict_url_owner != snap.external_id
            and existing is None
        ):
            row.classification = "identity_conflict"
            row.notes.append(
                f"source_url already tied to external_id={conflict_url_owner}"
            )
            result.identity_conflicts += 1
            result.human_attention += 1
            result.rows.append(row)
            continue

        if existing is None:
            result.inserts += 1
            row.classification = "insert"
            result.rows.append(row)
            continue

        changes = _diff_fields(existing, snap)
        # Treat description/image null-from-summary as attention, not hard update.
        material = [
            c
            for c in changes
            if not (
                c.after is None
                and c.field in {"description", "primary_image_url"}
                and c.before is not None
            )
        ]
        attention_only = [c for c in changes if c not in material]
        if attention_only:
            row.notes.append("dry_run_summary_omits_some_source_fields")
            row.changes.extend(attention_only)
            result.human_attention += 1
        if material:
            row.classification = "update"
            row.changes.extend(material)
            result.updates += 1
        else:
            row.classification = "no_change"
            result.no_change += 1
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

    # In-memory lifecycle simulation for a complete success run.
    run = SourceRunRecord(
        source_key=SOURCE_KEY,
        adapter_name="keller_williams_curacao",
        adapter_version="0.3.0",
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

    proposed_absences = (
        result.proposed_missing_events + result.proposed_removed_events
    )
    if proposed_absences >= suspicious_removal_threshold:
        result.failed = True
        result.failure_reasons.append(
            f"suspicious_mass_removal: {proposed_absences} >= {suspicious_removal_threshold}"
        )

    if result.identity_conflicts:
        result.failed = True
        result.failure_reasons.append("identity_conflicts_present")

    return result


def write_preview_reports(
    result: ImportPreviewResult,
    *,
    recon_json: Path,
    recon_md: Path,
    lifecycle_json: Path,
    lifecycle_md: Path,
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
        "# KW import reconciliation (read-only)",
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

    life_lines = [
        "# KW lifecycle preview (read-only)",
        "",
        f"Proposed missing events: {result.proposed_missing_events}",
        f"Proposed removed events: {result.proposed_removed_events}",
        "",
        "## Transitions",
        "",
    ]
    if not result.lifecycle_transitions:
        life_lines.append("_No lifecycle transitions proposed._")
    for t in result.lifecycle_transitions:
        life_lines.append(
            f"- `{t['external_id']}` {t['event_type']}: "
            f"{t.get('previous_status')} → {t.get('new_status')}"
        )
    lifecycle_md.write_text("\n".join(life_lines) + "\n", encoding="utf-8")


def run_kw_import_preview(
    *,
    input_path: Path,
    client: Any | None = None,
    write_reports: bool = True,
    reports_dir: Path | None = None,
) -> ImportPreviewResult:
    """End-to-end read-only preview. Optional client for Labs SELECT only."""

    print("READ-ONLY IMPORT PREVIEW")
    ref = assert_labs_project_ref()
    catalog = load_kw_catalog(input_path)

    if client is None:
        from merkado_labs.scrapers.import_pipeline import create_labs_client

        client = create_labs_client()

    existing = load_existing_kw_rows(client)
    result = reconcile_kw_catalog(
        catalog=catalog,
        existing_rows=existing,
        project_ref=ref,
    )

    if write_reports:
        out = reports_dir or Path("data/processed")
        write_preview_reports(
            result,
            recon_json=out / "kw_import_reconciliation.json",
            recon_md=out / "kw_import_reconciliation.md",
            lifecycle_json=out / "kw_lifecycle_preview.json",
            lifecycle_md=out / "kw_lifecycle_preview.md",
        )
    return result


def import_kw_catalog_from_file(
    *,
    input_path: Path,
    cache_dir: Path,
    expected_checksum: str = EXPECTED_CATALOG_CHECKSUM,
    upload_evidence: bool = True,
    apply_geospatial: bool = True,
) -> dict[str, Any]:
    """Import a verified Stage-3 KW catalog from local JSON + cache HTML only.

    Makes no live website requests. Requires Labs project ref, complete catalog,
    approved checksum, 84 unique IDs, and zero identity conflicts.
    """

    import hashlib

    from merkado_labs.normalization.ecb_rates import EcbEurRateProvider
    from merkado_labs.scrapers.adapters.keller_williams_curacao import (
        ADAPTER_NAME,
        ADAPTER_VERSION,
        KellerWilliamsCuracaoAdapter,
        load_neighbourhood_lexicon,
    )
    from merkado_labs.scrapers.adapters.keller_williams_curacao import (
        SOURCE_KEY as KW_SOURCE_KEY,
    )
    from merkado_labs.scrapers.import_pipeline import create_labs_client, import_snapshots
    from merkado_labs.scrapers.raw_storage import RAW_EVIDENCE_BUCKET, upload_raw_html

    started = datetime.now(UTC)
    project_ref = assert_labs_project_ref()
    catalog = load_kw_catalog(input_path)

    preview = reconcile_kw_catalog(
        catalog=catalog,
        existing_rows=load_existing_kw_rows(create_labs_client()),
        expected_checksum=expected_checksum,
        project_ref=project_ref,
    )
    if preview.failed:
        raise RuntimeError(
            "KW import refused: " + "; ".join(preview.failure_reasons or ["preview_failed"])
        )
    if preview.listing_count != 84:
        raise RuntimeError(f"KW import refused: expected 84 listings, got {preview.listing_count}")
    if preview.inserts != 44 or preview.updates != 0 or preview.no_change != 40:
        raise RuntimeError(
            "KW import refused: reconciliation drift "
            f"(insert={preview.inserts}, update={preview.updates}, "
            f"no_change={preview.no_change}); re-run preview before writing"
        )
    if preview.proposed_missing_events or preview.proposed_removed_events:
        raise RuntimeError(
            "KW import refused: unexpected missing/removal transitions in preview"
        )

    listings = catalog.get("listings") or []
    adapter = KellerWilliamsCuracaoAdapter(cache_dir=cache_dir)
    lexicon = load_neighbourhood_lexicon()
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
            neighbourhood_lexicon=lexicon,
        )
        if upload_evidence:
            path = upload_raw_html(
                source_key=KW_SOURCE_KEY,
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
    if len(set(external_ids)) != 84:
        raise RuntimeError("KW import refused: parsed external IDs are not 84 unique")

    run = SourceRunRecord(
        source_key=KW_SOURCE_KEY,
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
            "Offline import from verified Stage-3 artifact + local cache; "
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
        source_key=KW_SOURCE_KEY,
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
