"""Assess one manually reviewed pilot rental contract against July 2026 v2 signals."""

from __future__ import annotations

import argparse
import json
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from merkado_labs.config import Settings

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
CALCULATION_VERSION = "contract-v1"
SIGNAL_VERSION = "v2"
PERIOD_START = "2026-07-01"
PERIOD_END = "2026-07-31"
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT = BASE_DIR / "pilot_contract.json"
PILOT_NAMESPACE = uuid.UUID("8bdf7641-b66f-49e8-bf3f-52ab3ec83fd7")
SYNTHETIC_NOTICE = "Synthetic demonstration data. Not a real or legally binding rental contract."
ALLOWED_FIELDS = {
    "contract_reference",
    "neighbourhood",
    "monthly_rent_xcg",
    "floor_area_m2",
    "start_date",
    "end_date",
    "property_type",
    "latitude",
    "longitude",
    "notes",
}
REQUIRED_FIELDS = {
    "contract_reference",
    "neighbourhood",
    "monthly_rent_xcg",
    "floor_area_m2",
    "start_date",
    "notes",
}


class CannotAssessError(RuntimeError):
    """Raised when no reproducible market assessment can be produced."""


@dataclass(frozen=True)
class PilotContract:
    """Validated non-personal pilot input."""

    contract_reference: str
    neighbourhood: str
    monthly_rent_xcg: Decimal
    floor_area_m2: Decimal
    start_date: date
    end_date: date | None
    property_type: str | None
    latitude: float | None
    longitude: float | None
    notes: str


@dataclass(frozen=True)
class Assessment:
    """Pure scoring result ready for persistence."""

    contract_rent_per_m2: Decimal
    benchmark_value: Decimal
    benchmark_method: str
    difference_value: Decimal
    difference_percent: Decimal
    classification: str
    evidence_quality: str


def parse_args() -> argparse.Namespace:
    """Parse assessment options."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Assess without database writes.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Local pilot JSON path.")
    parser.add_argument(
        "--confirm-manual-review",
        action="store_true",
        help="Required for writes; confirms the non-personal terms were manually reviewed.",
    )
    return parser.parse_args()


def verify_labs_project(settings: Settings) -> str:
    """Return the Labs URL or stop before database access."""

    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError(f"Refusing database access outside Labs ref {LABS_PROJECT_REF!r}.")
    if settings.supabase_url is None:
        raise RuntimeError("SUPABASE_URL is required.")
    url = str(settings.supabase_url).rstrip("/")
    parsed = urlparse(url)
    expected_host = f"{LABS_PROJECT_REF}.supabase.co"
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise RuntimeError(f"Refusing database access outside Labs host {expected_host!r}.")
    return url


def verify_before_write(settings: Settings) -> None:
    """Re-check the Labs allowlist immediately before a write."""

    verify_labs_project(settings)


def parse_optional_date(value: Any, field: str) -> date | None:
    """Parse one optional ISO date."""

    if value is None:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ValueError(f"{field} must use YYYY-MM-DD.") from error


def load_contract(path: Path) -> PilotContract:
    """Load a local contract while rejecting sensitive or unknown fields."""

    if not path.is_file():
        raise FileNotFoundError(
            f"Pilot input not found at {path}. Copy pilot_contract.example.json to the "
            "ignored pilot_contract.json path and enter manually reviewed non-personal terms."
        )
    if "example" in path.name.casefold():
        # Examples are valid for dry runs only; main enforces this before writes.
        pass
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Pilot contract input must be a JSON object.")
    unknown = set(value) - ALLOWED_FIELDS
    missing = REQUIRED_FIELDS - set(value)
    if unknown:
        raise ValueError(
            "Pilot input contains forbidden or unknown fields: " + ", ".join(sorted(unknown))
        )
    if missing:
        raise ValueError("Pilot input is missing required fields: " + ", ".join(sorted(missing)))

    reference = str(value["contract_reference"]).strip()
    neighbourhood = str(value["neighbourhood"]).strip()
    property_type = (
        str(value["property_type"]).strip() if value.get("property_type") is not None else None
    )
    notes = str(value["notes"]).strip()
    if not reference or not neighbourhood:
        raise ValueError("Contract reference and neighbourhood must be non-empty.")
    if notes != SYNTHETIC_NOTICE:
        raise ValueError(f"notes must exactly state: {SYNTHETIC_NOTICE}")
    monthly_rent = Decimal(str(value["monthly_rent_xcg"]))
    floor_area = Decimal(str(value["floor_area_m2"]))
    if monthly_rent <= 0 or floor_area <= 0:
        raise ValueError("Monthly rent and floor area must be greater than zero.")
    start_date = parse_optional_date(value["start_date"], "start_date")
    if start_date is None:
        raise ValueError("start_date is required.")
    end_date = parse_optional_date(value.get("end_date"), "end_date")
    if end_date is not None and end_date < start_date:
        raise ValueError("end_date cannot precede start_date.")

    latitude = float(value["latitude"]) if value.get("latitude") is not None else None
    longitude = float(value["longitude"]) if value.get("longitude") is not None else None
    if latitude is not None and not -90 <= latitude <= 90:
        raise ValueError("latitude must be between -90 and 90.")
    if longitude is not None and not -180 <= longitude <= 180:
        raise ValueError("longitude must be between -180 and 180.")
    if (latitude is None) != (longitude is None):
        raise ValueError("latitude and longitude must be supplied together.")

    return PilotContract(
        contract_reference=reference,
        neighbourhood=neighbourhood,
        monthly_rent_xcg=monthly_rent,
        floor_area_m2=floor_area,
        start_date=start_date,
        end_date=end_date,
        property_type=property_type or None,
        latitude=latitude,
        longitude=longitude,
        notes=notes,
    )


def score_contract(contract: PilotContract, signal: dict[str, Any]) -> Assessment:
    """Calculate the contract comparison using median, then average fallback."""

    median = signal.get("median_value")
    average = signal.get("average_value")
    if median is not None:
        benchmark = Decimal(str(median))
        method = "median"
    elif average is not None:
        benchmark = Decimal(str(average))
        method = "average"
    else:
        raise CannotAssessError("The July v2 signal has no median or average benchmark.")
    if benchmark <= 0:
        raise CannotAssessError("The July v2 benchmark is not greater than zero.")

    contract_value = contract.monthly_rent_xcg / contract.floor_area_m2
    difference = contract_value - benchmark
    percentage = difference / benchmark * Decimal("100")
    quality = str(signal["quality_status"])
    if quality == "insufficient":
        classification = "insufficient_evidence"
    elif percentage < Decimal("-10"):
        classification = "below_market"
    elif percentage > Decimal("10"):
        classification = "above_market"
    else:
        classification = "near_market"
    return Assessment(
        contract_rent_per_m2=contract_value,
        benchmark_value=benchmark,
        benchmark_method=method,
        difference_value=difference,
        difference_percent=percentage,
        classification=classification,
        evidence_quality=quality,
    )


def resolve_approved_neighbourhood(
    neighbourhood_id: str, aliases: list[dict[str, Any]]
) -> str:
    """Resolve only approved alias mappings to a terminal neighbourhood."""

    direct = {
        str(row["source_neighbourhood_id"]): str(row["canonical_neighbourhood_id"])
        for row in aliases
        if row.get("status") == "approved"
    }
    current = neighbourhood_id
    visited: set[str] = set()
    while current in direct:
        if current in visited:
            raise RuntimeError("Approved neighbourhood aliases contain a cycle.")
        visited.add(current)
        current = direct[current]
    return current


def numeric(value: Decimal) -> float:
    """Return stable JSON-compatible numeric precision."""

    return float(value.quantize(Decimal("0.000001")))


def same_value(left: Any, right: Any) -> bool:
    """Compare persisted values without float or date formatting noise."""

    if left is None or right is None:
        return left is right
    if isinstance(left, dict | list) or isinstance(right, dict | list):
        return left == right
    try:
        return Decimal(str(left)) == Decimal(str(right))
    except Exception:
        return str(left) == str(right)


def ensure_row(
    client: Any,
    settings: Settings,
    table: str,
    identifier: str,
    payload: dict[str, Any],
    compare_fields: tuple[str, ...],
) -> tuple[dict[str, Any], bool]:
    """Insert a deterministic row once or verify the existing row is identical."""

    existing = client.table(table).select("*").eq("id", identifier).limit(1).execute().data or []
    if existing:
        row = existing[0]
        mismatches = [
            field
            for field in compare_fields
            if not same_value(row.get(field), payload.get(field))
        ]
        if mismatches:
            raise RuntimeError(
                f"Existing {table} row differs in: {', '.join(sorted(mismatches))}."
            )
        return row, False
    verify_before_write(settings)
    stored = client.table(table).insert(payload).execute().data or []
    if len(stored) != 1:
        raise RuntimeError(f"Expected one inserted {table} row.")
    return stored[0], True


def persist_assessment(
    client: Any,
    settings: Settings,
    contract: PilotContract,
    neighbourhood_id: str,
    signal: dict[str, Any],
    assessment: Assessment,
) -> dict[str, int]:
    """Persist the manually reviewed asset, contract, and assessment idempotently."""

    asset_id = str(uuid.uuid5(PILOT_NAMESPACE, f"asset:{contract.contract_reference}"))
    contract_id = str(uuid.uuid5(PILOT_NAMESPACE, f"contract:{contract.contract_reference}"))
    assessment_id = str(
        uuid.uuid5(
            PILOT_NAMESPACE,
            f"assessment:{contract_id}:{signal['id']}:{CALCULATION_VERSION}",
        )
    )
    asset_payload = {
        "id": asset_id,
        "neighbourhood_id": neighbourhood_id,
        "property_type": contract.property_type,
        "latitude": contract.latitude,
        "longitude": contract.longitude,
        "floor_area_m2": numeric(contract.floor_area_m2),
        "review_status": "reviewed",
    }
    _, asset_inserted = ensure_row(
        client,
        settings,
        "property_assets",
        asset_id,
        asset_payload,
        (
            "neighbourhood_id",
            "property_type",
            "latitude",
            "longitude",
            "floor_area_m2",
            "review_status",
        ),
    )
    contract_payload = {
        "id": contract_id,
        "property_asset_id": asset_id,
        "neighbourhood_id": neighbourhood_id,
        "contract_reference": contract.contract_reference,
        "monthly_rent_xcg": numeric(contract.monthly_rent_xcg),
        "floor_area_m2": numeric(contract.floor_area_m2),
        "start_date": contract.start_date.isoformat(),
        "end_date": contract.end_date.isoformat() if contract.end_date else None,
        "status": "active",
    }
    _, contract_inserted = ensure_row(
        client,
        settings,
        "rental_contracts",
        contract_id,
        contract_payload,
        (
            "property_asset_id",
            "neighbourhood_id",
            "contract_reference",
            "monthly_rent_xcg",
            "floor_area_m2",
            "start_date",
            "end_date",
            "status",
        ),
    )
    assessment_payload = {
        "id": assessment_id,
        "rental_contract_id": contract_id,
        "market_signal_id": str(signal["id"]),
        "contract_rent_per_m2": numeric(assessment.contract_rent_per_m2),
        "benchmark_value": numeric(assessment.benchmark_value),
        "benchmark_method": assessment.benchmark_method,
        "difference_value": numeric(assessment.difference_value),
        "difference_percent": numeric(assessment.difference_percent),
        "classification": assessment.classification,
        "evidence_quality": assessment.evidence_quality,
        "calculation_version": CALCULATION_VERSION,
        "metadata": {
            "signal_calculation_version": SIGNAL_VERSION,
            "signal_period_start": signal["period_start"],
            "signal_period_end": signal["period_end"],
            "signal_sample_size": signal["sample_size"],
            "synthetic_demo": True,
            "notice": contract.notes,
        },
    }
    _, assessment_inserted = ensure_row(
        client,
        settings,
        "contract_market_assessments",
        assessment_id,
        assessment_payload,
        (
            "rental_contract_id",
            "market_signal_id",
            "contract_rent_per_m2",
            "benchmark_value",
            "benchmark_method",
            "difference_value",
            "difference_percent",
            "classification",
            "evidence_quality",
            "calculation_version",
            "metadata",
        ),
    )
    return {
        "property_assets_inserted": int(asset_inserted),
        "rental_contracts_inserted": int(contract_inserted),
        "assessments_inserted": int(assessment_inserted),
    }


def main() -> None:
    """Load, score, and optionally persist the pilot assessment."""

    args = parse_args()
    if not args.dry_run and not args.confirm_manual_review:
        raise RuntimeError("--confirm-manual-review is required for database writes.")
    if not args.dry_run and "example" in args.input.name.casefold():
        raise RuntimeError("Example input files cannot be written to the database.")
    contract = load_contract(args.input)
    settings = Settings()
    url = verify_labs_project(settings)
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for private assessment data.")

    from supabase import create_client

    client = create_client(url, settings.supabase_secret_key.get_secret_value())
    neighbourhoods = client.table("neighbourhoods").select("id,name").execute().data or []
    matching = [
        row
        for row in neighbourhoods
        if " ".join(str(row["name"]).casefold().split())
        == " ".join(contract.neighbourhood.casefold().split())
    ]
    if len(matching) != 1:
        raise CannotAssessError(
            "Pilot neighbourhood must exactly match one stored neighbourhood name."
        )
    input_neighbourhood = matching[0]
    aliases = (
        client.table("neighbourhood_aliases")
        .select("source_neighbourhood_id,canonical_neighbourhood_id,status")
        .execute()
        .data
        or []
    )
    signal_neighbourhood_id = resolve_approved_neighbourhood(
        str(input_neighbourhood["id"]), aliases
    )
    signals = (
        client.table("market_signals")
        .select(
            "id,neighbourhood_id,period_start,period_end,median_value,average_value,"
            "sample_size,quality_status,calculation_version"
        )
        .eq("signal_type", "monthly_rent_per_m2")
        .eq("calculation_version", SIGNAL_VERSION)
        .eq("period_start", PERIOD_START)
        .eq("period_end", PERIOD_END)
        .eq("neighbourhood_id", signal_neighbourhood_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not signals:
        raise CannotAssessError(
            "The contract cannot yet be assessed: no July 2026 v2 signal exists "
            "for its approved neighbourhood group."
        )
    signal = signals[0]
    assessment = score_contract(contract, signal)
    result: dict[str, Any] = {
        "project_ref": LABS_PROJECT_REF,
        "dry_run": args.dry_run,
        "calculation_version": CALCULATION_VERSION,
        "pilot_neighbourhood": input_neighbourhood["name"],
        "signal_neighbourhood_id": signal_neighbourhood_id,
        "market_signal_id": signal["id"],
        "signal_period_start": signal["period_start"],
        "signal_period_end": signal["period_end"],
        "signal_sample_size": signal["sample_size"],
        "contract_rent_per_m2": numeric(assessment.contract_rent_per_m2),
        "benchmark_value": numeric(assessment.benchmark_value),
        "benchmark_method": assessment.benchmark_method,
        "difference_value": numeric(assessment.difference_value),
        "difference_percent": numeric(assessment.difference_percent),
        "classification": assessment.classification,
        "evidence_quality": assessment.evidence_quality,
    }
    if not args.dry_run:
        result["writes"] = persist_assessment(
            client,
            settings,
            contract,
            str(input_neighbourhood["id"]),
            signal,
            assessment,
        )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
