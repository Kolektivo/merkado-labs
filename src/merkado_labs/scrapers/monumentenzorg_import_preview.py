"""Database-free Monumentenzorg import preview (no Supabase reads/writes)."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from merkado_labs.scrapers.adapters.monumentenzorg_curacao import ADAPTER_VERSION, SOURCE_KEY
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    ListingLifecycleStatus,
    SourceRunOutcome,
    SourceRunRecord,
)
from merkado_labs.scrapers.lifecycle import compare_complete_success_snapshots


@dataclass
class PreviewRow:
    external_id: str
    source_url: str
    listing_type: str | None
    source_status: str | None
    lifecycle_hint: str | None
    has_positive_price: bool
    public_eligible: bool
    exclusion_reason: str | None
    currency: str | None
    warnings: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "source_url": self.source_url,
            "listing_type": self.listing_type,
            "source_status": self.source_status,
            "lifecycle_hint": self.lifecycle_hint,
            "has_positive_price": self.has_positive_price,
            "public_eligible": self.public_eligible,
            "exclusion_reason": self.exclusion_reason,
            "currency": self.currency,
            "warnings": self.warnings,
        }


def catalog_is_complete(payload: dict[str, Any]) -> bool:
    return (
        payload.get("complete_catalog") is True
        and payload.get("adapter_version") == ADAPTER_VERSION
    )


def load_catalog_artifact(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_local_import_preview(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute import-oriented preview metrics without any database access."""

    listings = payload.get("listings") or []
    run = payload.get("run") or {}
    complete = catalog_is_complete(payload)
    ids = [item.get("external_id") for item in listings]
    id_counts = Counter(ids)
    duplicate_ids = sorted([k for k, n in id_counts.items() if k and n > 1])
    urls = [item.get("source_url") for item in listings]
    url_counts = Counter(urls)
    duplicate_urls = sorted([k for k, n in url_counts.items() if k and n > 1])

    rows: list[PreviewRow] = []
    currencies: Counter[str] = Counter()
    missing_fields: Counter[str] = Counter()
    for item in listings:
        amount = None
        currency = None
        price = item.get("original_price")
        if price:
            currency = price.get("currency")
            currencies[currency or "unknown"] += 1
            try:
                from decimal import Decimal

                amount = Decimal(str(price.get("amount")))
            except Exception:  # noqa: BLE001
                amount = None
        else:
            currencies["none"] += 1

        lifecycle = item.get("lifecycle_hint") or "unknown"
        status_for_elig = lifecycle
        eligible, reason = evaluate_public_eligibility(
            status=status_for_elig,
            original_price=amount,
            source_enabled=True,
            source_url=item.get("source_url"),
            has_critical_parser_error=bool(item.get("parser_errors")),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        exclusion = None if eligible else reason
        if not item.get("has_positive_price"):
            if exclusion is None:
                exclusion = "missing_price"
            eligible = False

        for field_name, present in (
            ("address", bool(item.get("public_address_text"))),
            ("coordinates", item.get("latitude") is not None and item.get("longitude") is not None),
            ("bedrooms", item.get("bedrooms") is not None),
            ("bathrooms", item.get("bathrooms") is not None),
            ("images", bool(item.get("image_urls"))),
            ("description", bool(item.get("title") and True)),
        ):
            if not present:
                missing_fields[field_name] += 1

        rows.append(
            PreviewRow(
                external_id=item.get("external_id") or "",
                source_url=item.get("source_url") or "",
                listing_type=item.get("listing_type"),
                source_status=item.get("source_status"),
                lifecycle_hint=lifecycle,
                has_positive_price=bool(item.get("has_positive_price")),
                public_eligible=eligible,
                exclusion_reason=exclusion,
                currency=currency,
                warnings=list(item.get("warnings") or []),
            )
        )

    # Lifecycle absence preview: only when complete — and against empty prior set
    # this is a first-baseline simulation (no DB), so unexpected removals = 0.
    lifecycle_preview = {
        "compared": False,
        "would_mark_missing": 0,
        "would_mark_removed": 0,
        "note": (
            "No Labs baseline loaded; first-import absence transitions "
            "not simulated against DB."
        ),
    }
    if complete:
        record = SourceRunRecord(
            source_key=SOURCE_KEY,
            adapter_name=SOURCE_KEY,
            adapter_version=ADAPTER_VERSION,
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
            outcome=SourceRunOutcome.SUCCESS,
            discovered_count=len(listings),
            parsed_count=len(listings),
            metadata={"complete_catalog": True},
        )
        assert record.is_complete_success
        # First-baseline: empty previous → first_seen only; no missing/removed.
        current_snaps = {
            row.external_id: AdapterListingSnapshot(
                source_key=SOURCE_KEY,
                external_id=row.external_id,
                source_url=row.source_url,
                observed_at=datetime.now(UTC),
                adapter_name=SOURCE_KEY,
                adapter_version=ADAPTER_VERSION,
                raw_payload={},
                raw_sha256="0" * 64,
                source_status=row.source_status,
                lifecycle_hint=(
                    ListingLifecycleStatus(row.lifecycle_hint)
                    if row.lifecycle_hint
                    in {s.value for s in ListingLifecycleStatus}
                    else ListingLifecycleStatus.UNKNOWN
                ),
            )
            for row in rows
            if row.external_id
        }
        transitions = compare_complete_success_snapshots(
            previous={},
            current_snapshots=current_snaps,
            run=record,
            removal_threshold=2,
        )
        missing = sum(1 for t in transitions if t.event_type.value == "missing_from_source")
        removed = sum(1 for t in transitions if t.event_type.value == "removed_from_source")
        lifecycle_preview = {
            "compared": True,
            "would_mark_missing": missing,
            "would_mark_removed": removed,
            "first_baseline": True,
            "is_complete_success": True,
            "transition_count": len(transitions),
        }

    rent = sum(1 for r in rows if r.listing_type == "rent")
    sale = sum(1 for r in rows if r.listing_type == "sale")
    numeric = sum(1 for r in rows if r.has_positive_price)
    no_price = sum(1 for r in rows if not r.has_positive_price)
    soldish = sum(
        1
        for r in rows
        if r.lifecycle_hint in {ListingLifecycleStatus.SOLD.value, "sold"}
        or r.source_status == "sold_under_reservation"
    )
    public_eligible = sum(1 for r in rows if r.public_eligible)

    blob = json.dumps(
        {"listings": [r.as_dict() for r in rows], "complete": complete},
        sort_keys=True,
        separators=(",", ":"),
    )
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "adapter_version": payload.get("adapter_version"),
        "database_access": False,
        "complete_catalog": complete,
        "run_outcome": run.get("outcome"),
        "discovered_count": run.get("discovered_count", len(listings)),
        "parsed_count": run.get("parsed_count", len(listings)),
        "rent_count": rent,
        "sale_count": sale,
        "numeric_priced_count": numeric,
        "excluded_no_price_count": no_price,
        "excluded_inactive_or_sold_count": soldish,
        "public_eligible_count": public_eligible,
        "currency_breakdown": dict(currencies),
        "missing_field_coverage": dict(missing_fields),
        "external_id_unique": not duplicate_ids,
        "duplicate_external_ids": duplicate_ids,
        "duplicate_urls": duplicate_urls,
        "snapshot_checksum": run.get("snapshot_checksum") or payload.get("catalog_checksum"),
        "catalog_checksum": payload.get("catalog_checksum"),
        "preview_checksum": hashlib.sha256(blob.encode("utf-8")).hexdigest(),
        "lifecycle_preview": lifecycle_preview,
        "listings": [r.as_dict() for r in rows],
        "readiness_implication": {
            "operational_ready": False,
            "import_pending": True,
            "ai_enrichment_pending": True,
            "scheduling": "disabled",
            "next_action": "reviewed Labs import and Terra enrichment under separate approval",
        },
    }


def run_monumentenzorg_import_preview(path: Path) -> dict[str, Any]:
    payload = load_catalog_artifact(path)
    if payload.get("source_key") != SOURCE_KEY:
        raise ValueError(f"Unexpected source_key {payload.get('source_key')!r}")
    return build_local_import_preview(payload)


def dump_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
