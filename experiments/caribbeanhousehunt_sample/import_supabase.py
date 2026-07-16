"""Import the latest stored full CHH snapshot into Labs Supabase."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from merkado_labs.config import Settings

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
# Full-catalog size fluctuates; reject empty/truncated fetches, not day-to-day churn.
MIN_SNAPSHOT_SIZE = 500
# Compatibility alias for older tests/docs that referred to a fixed sample size.
EXPECTED_SAMPLE_SIZE = MIN_SNAPSHOT_SIZE
SOURCE_NAME = "CaribbeanHouseHunt.com"
SOURCE_BASE_URL = "https://caribbeanhousehunt.com"
SOURCE_LISTING_URL = "https://caribbeanhousehunt.com/curacao/map/"
BASE_DIR = Path(__file__).resolve().parent
SNAPSHOTS_DIR = BASE_DIR / "snapshots"
BATCH_SIZE = 100

LISTING_COMPARE_FIELDS = (
    "property_asset_id",
    "external_id_status",
    "source_url",
    "original_realtor_url",
    "listing_type",
    "property_type",
    "title",
    "current_price",
    "currency",
    "bedrooms",
    "floor_area_m2",
    "neighbourhood_id",
    "latitude",
    "longitude",
    "primary_image_url",
    "status",
    "first_seen_at",
    "last_seen_at",
)
EXISTING_SELECT = "id,external_id," + ",".join(LISTING_COMPARE_FIELDS)


class SampleValidationError(ValueError):
    """Raised when the stored snapshot does not satisfy the import contract."""


@dataclass(frozen=True)
class SampleArtifacts:
    """Validated local evidence for one immutable CHH snapshot."""

    normalized: list[dict[str, Any]]
    raw_records: list[dict[str, Any]]
    raw_by_external_id: dict[str, dict[str, Any]]
    observed_at: str
    snapshot_id: str
    source_sha256: str
    snapshot_path: Path
    duplicate_input_ids: tuple[str, ...]


@dataclass(frozen=True)
class ImportPlan:
    """Read-only classification of the snapshot against current Labs rows."""

    source_id: str | None
    existing: dict[str, dict[str, Any]]
    reasons_by_index: dict[int, tuple[str, ...]]
    valid: int
    invalid: int
    duplicate_input_ids: int
    existing_records: int
    new_records: int
    requiring_quarantine: int
    inserted: int
    updated: int
    skipped: int
    change_fields: dict[str, int]

    def summary(self) -> dict[str, int]:
        """Return the user-facing dry-run counters."""

        return {
            "input": self.valid + self.invalid,
            "valid": self.valid,
            "invalid": self.invalid,
            "duplicate_input_ids": self.duplicate_input_ids,
            "existing": self.existing_records,
            "new": self.new_records,
            "requiring_quarantine": self.requiring_quarantine,
            "would_insert": self.inserted,
            "would_update": self.updated,
            "would_skip": self.skipped,
        }


def parse_args() -> argparse.Namespace:
    """Parse command-line options."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read and classify all 1,449 records without writing.",
    )
    return parser.parse_args()


def verify_labs_project(settings: Settings) -> str:
    """Return a validated Labs URL or stop before any database operation."""

    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError(
            f"Refusing Supabase access: expected Labs ref {LABS_PROJECT_REF!r}."
        )
    if settings.supabase_url is None:
        raise RuntimeError("SUPABASE_URL is required.")

    url = str(settings.supabase_url).rstrip("/")
    parsed = urlparse(url)
    expected_host = f"{LABS_PROJECT_REF}.supabase.co"
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise RuntimeError(
            f"Refusing Supabase access: SUPABASE_URL must use Labs host {expected_host!r}."
        )
    return url


def normalize_neighbourhood(value: str) -> str:
    """Normalize a neighbourhood for uniqueness without changing its display name."""

    return " ".join(value.casefold().split())


def neighbourhood_slug(value: str) -> str:
    """Create a stable ASCII slug from a neighbourhood display name."""

    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.casefold()).strip("-")


def neighbourhood_rows(names_by_normalized: dict[str, str]) -> list[dict[str, str]]:
    """Build unique slugs without merging distinct normalized neighbourhood names."""

    base_slugs = {
        normalized_name: neighbourhood_slug(name)
        for normalized_name, name in names_by_normalized.items()
    }
    slug_counts = Counter(base_slugs.values())
    rows = []
    for normalized_name, name in sorted(names_by_normalized.items()):
        base_slug = base_slugs[normalized_name] or "neighbourhood"
        slug = base_slug
        if slug_counts[base_slugs[normalized_name]] > 1 or not base_slugs[normalized_name]:
            suffix = hashlib.sha256(normalized_name.encode()).hexdigest()[:8]
            slug = f"{base_slug}-{suffix}"
        rows.append(
            {
                "name": name,
                "normalized_name": normalized_name,
                "slug": slug,
            }
        )
    return rows


def batches(values: list[Any], size: int = BATCH_SIZE) -> Iterable[list[Any]]:
    """Yield bounded API batches."""

    for start in range(0, len(values), size):
        yield values[start : start + size]


def latest_snapshot_path() -> Path:
    """Return the latest complete snapshot already stored locally."""

    candidates = sorted(
        path.parent
        for path in SNAPSHOTS_DIR.glob("*/normalized-index.json")
        if (path.parent / "metadata.json").is_file()
        and (path.parent / "source.json").is_file()
    )
    if not candidates:
        raise SampleValidationError("No complete local CHH snapshot exists.")
    return candidates[-1]


def _as_import_record(normalized: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    """Map a normalized snapshot row to the established listing vocabulary."""

    external_id = str(normalized.get("urlid") or "").strip()
    return {
        "source": SOURCE_NAME,
        "source_listing_id": external_id,
        "source_url": SOURCE_LISTING_URL,
        "original_realtor_url": normalized.get("original_realtor_url"),
        "listing_type": normalized.get("listing_type"),
        "property_type": normalized.get("property_type"),
        "title": raw.get("property_title"),
        "price": normalized.get("price"),
        "currency": normalized.get("currency"),
        "bedrooms": normalized.get("bedrooms"),
        "floor_area_m2": normalized.get("floor_area_m2"),
        "neighbourhood": normalized.get("neighbourhood"),
        "latitude": normalized.get("latitude"),
        "longitude": normalized.get("longitude"),
        "primary_image_url": normalized.get("primary_image_url"),
    }


def load_sample_artifacts() -> SampleArtifacts:
    """Load and validate the latest complete local full-catalog snapshot."""

    snapshot_path = latest_snapshot_path()
    normalized_path = snapshot_path / "normalized-index.json"
    source_path = snapshot_path / "source.json"
    metadata_path = snapshot_path / "metadata.json"
    normalized_value = json.loads(normalized_path.read_text(encoding="utf-8"))
    raw_value = json.loads(source_path.read_text(encoding="utf-8"))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not isinstance(normalized_value, list) or not isinstance(raw_value, list):
        raise SampleValidationError("Snapshot source and normalized files must be arrays.")
    if not isinstance(metadata, dict):
        raise SampleValidationError("Snapshot metadata must be an object.")
    record_count = len(normalized_value)
    if len(raw_value) != record_count:
        raise SampleValidationError(
            "Refusing import: raw and normalized snapshot lengths differ "
            f"({len(raw_value)} vs {record_count})."
        )
    if metadata.get("record_count") != record_count:
        raise SampleValidationError(
            "Refusing import: metadata record_count does not match snapshot arrays "
            f"({metadata.get('record_count')!r} vs {record_count})."
        )
    if record_count < MIN_SNAPSHOT_SIZE:
        raise SampleValidationError(
            f"Refusing import: snapshot has {record_count} records; "
            f"expected at least {MIN_SNAPSHOT_SIZE} for a full-catalog harvest."
        )
    if not all(isinstance(item, dict) for item in normalized_value + raw_value):
        raise SampleValidationError("Every snapshot record must be an object.")

    source_sha256 = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if metadata.get("source_sha256") != source_sha256:
        raise SampleValidationError("Stored source checksum does not match snapshot metadata.")
    snapshot_id = str(metadata.get("snapshot_id") or "")
    if snapshot_id != snapshot_path.name:
        raise SampleValidationError("Snapshot directory and metadata identifiers differ.")
    observed_at = str(metadata.get("observed_at") or "")
    try:
        parsed_observed_at = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise SampleValidationError("Snapshot observed_at is invalid.") from error
    if parsed_observed_at.tzinfo is None:
        raise SampleValidationError("Snapshot observed_at must include a timezone.")

    normalized_ids = [str(item.get("urlid") or "").strip() for item in normalized_value]
    raw_ids = [str(item.get("urlid") or "").strip() for item in raw_value]
    if normalized_ids != raw_ids:
        raise SampleValidationError(
            "Raw and normalized snapshot records are not positionally aligned by urlid."
        )
    duplicate_ids = tuple(
        sorted(external_id for external_id, count in Counter(normalized_ids).items() if count > 1)
    )
    normalized = [
        _as_import_record(item, raw)
        for item, raw in zip(normalized_value, raw_value, strict=True)
    ]
    raw_by_external_id = {
        external_id: raw
        for external_id, raw in zip(raw_ids, raw_value, strict=True)
        if external_id
    }
    return SampleArtifacts(
        normalized=normalized,
        raw_records=raw_value,
        raw_by_external_id=raw_by_external_id,
        observed_at=observed_at,
        snapshot_id=snapshot_id,
        source_sha256=source_sha256,
        snapshot_path=snapshot_path,
        duplicate_input_ids=duplicate_ids,
    )


def validate_listing(item: dict[str, Any], raw: dict[str, Any]) -> list[str]:
    """Return reasons that make a stored record unsafe to import."""

    reasons: list[str] = []
    external_id = str(item.get("source_listing_id") or "").strip()
    if not external_id:
        reasons.append("missing provisional external_id")
    if str(raw.get("urlid") or "").strip() != external_id:
        reasons.append("raw and normalized external IDs differ")
    if item.get("source") != SOURCE_NAME:
        reasons.append("unexpected source")
    if item.get("source_url") != SOURCE_LISTING_URL:
        reasons.append("missing or unexpected source_url")
    if item.get("currency") is not None and not re.fullmatch(
        r"[A-Z]{3}", str(item["currency"])
    ):
        reasons.append("invalid currency")
    price = item.get("price")
    if price is not None and (not isinstance(price, int | float) or price < 0):
        reasons.append("invalid price")
    bedrooms = item.get("bedrooms")
    if bedrooms is not None and (
        not isinstance(bedrooms, int | float) or bedrooms < 0 or bedrooms > 32767
    ):
        reasons.append("invalid bedrooms")
    floor_area = item.get("floor_area_m2")
    if floor_area is not None and (
        not isinstance(floor_area, int | float) or floor_area <= 0
    ):
        reasons.append("invalid floor_area_m2")
    for field, lower, upper in (("latitude", -90, 90), ("longitude", -180, 180)):
        value = item.get(field)
        if value is not None and (
            not isinstance(value, int | float) or not lower <= value <= upper
        ):
            reasons.append(f"invalid {field}")
    image_url = item.get("primary_image_url")
    if image_url is not None:
        parsed_image = urlparse(str(image_url))
        if parsed_image.scheme != "https" or not parsed_image.hostname:
            reasons.append("invalid primary_image_url")
    return reasons


def listing_payload(
    item: dict[str, Any],
    source_id: str,
    neighbourhood_id: str | None,
    observed_at: str,
    first_seen_at: str | None = None,
) -> dict[str, Any]:
    """Map a normalized record to the source-listing table."""

    return {
        "property_source_id": source_id,
        "property_asset_id": None,
        "external_id": str(item["source_listing_id"]),
        "external_id_status": "provisional",
        "source_url": item["source_url"],
        "original_realtor_url": item.get("original_realtor_url"),
        "listing_type": item.get("listing_type"),
        "property_type": item.get("property_type"),
        "title": item.get("title"),
        "current_price": item.get("price"),
        "currency": item.get("currency"),
        "bedrooms": item.get("bedrooms"),
        "floor_area_m2": item.get("floor_area_m2"),
        "neighbourhood_id": neighbourhood_id,
        "latitude": item.get("latitude"),
        "longitude": item.get("longitude"),
        "primary_image_url": item.get("primary_image_url"),
        "status": "active",
        "first_seen_at": first_seen_at or observed_at,
        "last_seen_at": observed_at,
    }


def one_row(response_data: Any, label: str) -> dict[str, Any]:
    """Extract one returned row from a Supabase response."""

    if not isinstance(response_data, list) or len(response_data) != 1:
        raise RuntimeError(f"Expected one {label} row from Supabase.")
    return response_data[0]


def _source_row(client: Any) -> dict[str, Any] | None:
    """Read the CHH source row without writing."""

    rows = (
        client.table("property_sources")
        .select("id,name,base_url")
        .eq("name", SOURCE_NAME)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    return one_row(rows, "property source")


def _existing_listings(
    client: Any, source_id: str | None, external_ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Read all matching listing rows in bounded queries."""

    if source_id is None:
        return {}
    rows: list[dict[str, Any]] = []
    for external_id_batch in batches(sorted(set(external_ids))):
        rows.extend(
            client.table("property_listings")
            .select(EXISTING_SELECT)
            .eq("property_source_id", source_id)
            .in_("external_id", external_id_batch)
            .execute()
            .data
            or []
        )
    return {str(row["external_id"]): row for row in rows}


def _same_value(left: Any, right: Any) -> bool:
    """Compare API numeric values without conflating text values."""

    numeric_types = (int, float, Decimal)
    if isinstance(left, numeric_types) or isinstance(right, numeric_types):
        try:
            if isinstance(left, float) or isinstance(right, float):
                return math.isclose(
                    float(left), float(right), rel_tol=1e-12, abs_tol=1e-12
                )
            return Decimal(str(left)) == Decimal(str(right))
        except (ValueError, ArithmeticError):
            return False
    if isinstance(left, str) and isinstance(right, str):
        try:
            left_datetime = datetime.fromisoformat(left.replace("Z", "+00:00"))
            right_datetime = datetime.fromisoformat(right.replace("Z", "+00:00"))
        except ValueError:
            pass
        else:
            if left_datetime.tzinfo is not None and right_datetime.tzinfo is not None:
                return left_datetime == right_datetime
    return left == right


def _listing_unchanged(previous: dict[str, Any], payload: dict[str, Any]) -> bool:
    """Return whether a listing upsert would be a no-op."""

    return not listing_change_fields(previous, payload)


def listing_change_fields(
    previous: dict[str, Any], payload: dict[str, Any]
) -> tuple[str, ...]:
    """Return fields whose stored and proposed values materially differ."""

    return tuple(
        field
        for field in LISTING_COMPARE_FIELDS
        if not _same_value(previous.get(field), payload.get(field))
    )


def _identity_conflict(previous: dict[str, Any], item: dict[str, Any]) -> bool:
    """Detect a provisional-ID collision without using fingerprints or coordinates."""

    return (
        previous.get("original_realtor_url") != item.get("original_realtor_url")
        or previous.get("property_type") != item.get("property_type")
    )


def build_import_plan(
    client: Any,
    artifacts: SampleArtifacts,
    neighbourhood_ids: dict[str, str] | None = None,
) -> ImportPlan:
    """Classify every input record using read-only Labs queries."""

    source = _source_row(client)
    source_id = str(source["id"]) if source else None
    external_ids = [str(item["source_listing_id"]) for item in artifacts.normalized]
    existing = _existing_listings(client, source_id, external_ids)
    duplicate_ids = set(artifacts.duplicate_input_ids)
    reasons_by_index: dict[int, tuple[str, ...]] = {}
    valid = inserted = updated = skipped = existing_records = 0
    change_fields: Counter[str] = Counter()

    for index, (item, raw) in enumerate(
        zip(artifacts.normalized, artifacts.raw_records, strict=True)
    ):
        external_id = str(item.get("source_listing_id") or "")
        reasons = validate_listing(item, raw)
        if external_id in duplicate_ids:
            reasons.append("duplicate provisional external_id in input snapshot")
        previous = existing.get(external_id)
        if previous:
            existing_records += 1
            if _identity_conflict(previous, item):
                reasons.append("provisional external_id collision with changed identity fields")
        if reasons:
            reasons_by_index[index] = tuple(sorted(set(reasons)))
            continue

        valid += 1
        if previous is None:
            inserted += 1
            continue
        if neighbourhood_ids is None:
            # A dry run can still classify known rows by all fields except the resolved FK.
            neighbourhood_id = previous.get("neighbourhood_id")
        else:
            neighbourhood = item.get("neighbourhood")
            neighbourhood_id = (
                neighbourhood_ids.get(normalize_neighbourhood(str(neighbourhood)))
                if neighbourhood
                else None
            )
        payload = listing_payload(
            item,
            source_id or "",
            neighbourhood_id,
            artifacts.observed_at,
            previous.get("first_seen_at"),
        )
        changed = listing_change_fields(previous, payload)
        if not changed:
            skipped += 1
        else:
            updated += 1
            change_fields.update(changed)

    invalid = len(artifacts.normalized) - valid
    return ImportPlan(
        source_id=source_id,
        existing=existing,
        reasons_by_index=reasons_by_index,
        valid=valid,
        invalid=invalid,
        duplicate_input_ids=sum(
            count - 1
            for count in Counter(external_ids).values()
            if count > 1
        ),
        existing_records=existing_records,
        new_records=len(artifacts.normalized) - existing_records,
        requiring_quarantine=invalid,
        inserted=inserted,
        updated=updated,
        skipped=skipped,
        change_fields=dict(sorted(change_fields.items())),
    )


def quarantine_once(
    client: Any,
    source_id: str,
    external_id: str | None,
    reason: str,
    raw_payload: dict[str, Any],
) -> bool:
    """Insert one unresolved quarantine row unless the same reason already exists."""

    query = (
        client.table("ingestion_quarantine")
        .select("id")
        .eq("property_source_id", source_id)
        .eq("reason", reason)
        .is_("resolved_at", "null")
    )
    query = query.eq("external_id", external_id) if external_id else query.is_(
        "external_id", "null"
    )
    if query.limit(1).execute().data:
        return False
    client.table("ingestion_quarantine").insert(
        {
            "property_source_id": source_id,
            "external_id": external_id,
            "reason": reason,
            "raw_payload": raw_payload,
        }
    ).execute()
    return True


def _upsert_neighbourhoods(client: Any, artifacts: SampleArtifacts) -> dict[str, str]:
    """Upsert normalized neighbourhoods and return their IDs."""

    names_by_normalized: dict[str, str] = {}
    for item in artifacts.normalized:
        if item.get("neighbourhood"):
            name = str(item["neighbourhood"]).strip()
            names_by_normalized.setdefault(normalize_neighbourhood(name), name)
    rows = neighbourhood_rows(names_by_normalized)
    for row_batch in batches(rows):
        client.table("neighbourhoods").upsert(
            row_batch, on_conflict="normalized_name"
        ).execute()
    stored: list[dict[str, Any]] = []
    for name_batch in batches(list(names_by_normalized)):
        stored.extend(
            client.table("neighbourhoods")
            .select("id,normalized_name")
            .in_("normalized_name", name_batch)
            .execute()
            .data
            or []
        )
    if len(stored) != len(names_by_normalized):
        raise RuntimeError("Not all normalized neighbourhoods were stored.")
    return {str(row["normalized_name"]): str(row["id"]) for row in stored}


def _insert_missing_observations(
    client: Any,
    artifacts: SampleArtifacts,
    listings: dict[str, dict[str, Any]],
    valid_indexes: list[int],
) -> tuple[int, int]:
    """Append only observations that do not already exist."""

    listing_ids = [
        str(listings[str(artifacts.normalized[index]["source_listing_id"])]["id"])
        for index in valid_indexes
    ]
    observed_listing_ids: set[str] = set()
    for listing_id_batch in batches(listing_ids):
        observed_listing_ids.update(
            str(row["property_listing_id"])
            for row in (
                client.table("listing_observations")
                .select("property_listing_id")
                .eq("source_snapshot_id", artifacts.snapshot_id)
                .in_("property_listing_id", listing_id_batch)
                .execute()
                .data
                or []
            )
        )
    listing_observations = []
    for index in valid_indexes:
        item = artifacts.normalized[index]
        listing_id = str(listings[str(item["source_listing_id"])]["id"])
        if listing_id not in observed_listing_ids:
            listing_observations.append(
                {
                    "property_listing_id": listing_id,
                    "observed_at": artifacts.observed_at,
                    "source_snapshot_id": artifacts.snapshot_id,
                    "source_sha256": artifacts.source_sha256,
                    "raw_payload": artifacts.raw_records[index],
                    "normalized_payload": item,
                }
            )
    for observation_batch in batches(listing_observations):
        client.table("listing_observations").insert(observation_batch).execute()

    existing_prices: set[tuple[str, Decimal, str]] = set()
    for listing_id_batch in batches(listing_ids):
        existing_prices.update(
            (
                str(row["property_listing_id"]),
                Decimal(str(row["price"])),
                str(row["currency"]),
            )
            for row in (
                client.table("price_observations")
                .select("property_listing_id,price,currency")
                .eq("observed_at", artifacts.observed_at)
                .in_("property_listing_id", listing_id_batch)
                .execute()
                .data
                or []
            )
        )
    price_observations = []
    for index in valid_indexes:
        item = artifacts.normalized[index]
        if item.get("price") is None or item.get("currency") is None:
            continue
        listing_id = str(listings[str(item["source_listing_id"])]["id"])
        key = (listing_id, Decimal(str(item["price"])), str(item["currency"]))
        if key not in existing_prices:
            price_observations.append(
                {
                    "property_listing_id": listing_id,
                    "observed_at": artifacts.observed_at,
                    "price": item["price"],
                    "currency": item["currency"],
                }
            )
    for observation_batch in batches(price_observations):
        client.table("price_observations").insert(observation_batch).execute()
    return len(listing_observations), len(price_observations)


def import_sample(
    client: Any, artifacts: SampleArtifacts, initial_plan: ImportPlan | None = None
) -> dict[str, int]:
    """Idempotently import the stored snapshot into the property foundation."""

    source = one_row(
        client.table("property_sources")
        .upsert(
            {"name": SOURCE_NAME, "base_url": SOURCE_BASE_URL},
            on_conflict="name",
        )
        .execute()
        .data,
        "property source",
    )
    source_id = str(source["id"])
    neighbourhood_ids = _upsert_neighbourhoods(client, artifacts)
    plan = initial_plan or build_import_plan(client, artifacts, neighbourhood_ids)
    if plan.source_id is None:
        plan = build_import_plan(client, artifacts, neighbourhood_ids)

    valid_indexes = [
        index for index in range(len(artifacts.normalized)) if index not in plan.reasons_by_index
    ]
    upsert_rows: list[dict[str, Any]] = []
    inserted = updated = skipped = quarantine_inserted = 0
    for index, (item, raw) in enumerate(
        zip(artifacts.normalized, artifacts.raw_records, strict=True)
    ):
        external_id = str(item.get("source_listing_id") or "")
        reasons = plan.reasons_by_index.get(index)
        if reasons:
            quarantine_inserted += int(
                quarantine_once(client, source_id, external_id or None, "; ".join(reasons), raw)
            )
            continue

        previous = plan.existing.get(external_id)
        neighbourhood = item.get("neighbourhood")
        neighbourhood_id = (
            neighbourhood_ids[normalize_neighbourhood(str(neighbourhood))]
            if neighbourhood
            else None
        )
        payload = listing_payload(
            item,
            source_id,
            neighbourhood_id,
            artifacts.observed_at,
            previous.get("first_seen_at") if previous else None,
        )
        if previous is None:
            inserted += 1
            upsert_rows.append(payload)
        elif _listing_unchanged(previous, payload):
            skipped += 1
        else:
            updated += 1
            upsert_rows.append(payload)
    for row_batch in batches(upsert_rows):
        client.table("property_listings").upsert(
            row_batch, on_conflict="property_source_id,external_id"
        ).execute()

    external_ids = [
        str(artifacts.normalized[index]["source_listing_id"]) for index in valid_indexes
    ]
    stored_listings = _existing_listings(client, source_id, external_ids)
    if len(stored_listings) != len(external_ids):
        raise RuntimeError("Not all valid snapshot listings were stored.")
    listing_observations, price_observations = _insert_missing_observations(
        client, artifacts, stored_listings, valid_indexes
    )
    return {
        "input": len(artifacts.normalized),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "quarantined": plan.requiring_quarantine,
        "quarantine_inserted": quarantine_inserted,
        "listing_observations_inserted": listing_observations,
        "price_observations_inserted": price_observations,
        "neighbourhoods_seen": len(neighbourhood_ids),
    }


def main() -> None:
    """Validate Labs and either preview or execute the full stored import."""

    args = parse_args()
    settings = Settings()
    url = verify_labs_project(settings)
    artifacts = load_sample_artifacts()
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for database checks and import.")

    from supabase import create_client

    # Do not log or otherwise expose the server-only key.
    client = create_client(url, settings.supabase_secret_key.get_secret_value())
    plan = build_import_plan(client, artifacts)
    if args.dry_run:
        print(
            "Dry run passed: "
            f"project_ref={LABS_PROJECT_REF}, snapshot={artifacts.snapshot_id}, "
            f"snapshot_path={artifacts.snapshot_path}, writes=0"
        )
        print(json.dumps(plan.summary(), sort_keys=True))
        if plan.change_fields:
            print(json.dumps({"change_fields": plan.change_fields}, sort_keys=True))
        return

    counts = import_sample(client, artifacts, plan)
    print(
        f"Import completed for project_ref={LABS_PROJECT_REF}, "
        f"snapshot={artifacts.snapshot_id}"
    )
    print(json.dumps(counts, sort_keys=True))


if __name__ == "__main__":
    main()
