#!/usr/bin/env python3
"""Phase 8 general data-quality audit for Merkado Labs (read-only).

Audits current Labs listings for Ready sources only:
  - keller_williams_curacao
  - remax_curacao
  - moret_real_estate
  - monumentenzorg_curacao

Default is dry-run / read-only. No OpenAI, no scrape, no destructive writes.

Usage:
  PYTHONPATH=src python scripts/audit_property_data_quality_pass.py
  PYTHONPATH=src python scripts/audit_property_data_quality_pass.py --out data/processed/phase8_data_quality_audit.json
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment.neighbourhood_canonical import (  # noqa: E402
    canonicalize_neighbourhood,
)
from merkado_labs.enrichment.normalization import (  # noqa: E402
    CANONICAL_PROPERTY_TYPES,
    normalize_property_type,
)
from merkado_labs.geo import (  # noqa: E402
    CURACAO_LAT_MAX,
    CURACAO_LAT_MIN,
    CURACAO_LON_MAX,
    CURACAO_LON_MIN,
    coordinate_quality,
)
from merkado_labs.normalization.currency import (  # noqa: E402
    XCG_EQUIVALENT,
    normalize_currency_code,
)
from merkado_labs.normalization.eligibility import (  # noqa: E402
    evaluate_public_eligibility,
)
from merkado_labs.scrapers.images import (  # noqa: E402
    canonicalize_image_url,
    image_identity_key,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"
PROD_FORBIDDEN = "jkrfyvukhhsapoivntms"
READY = (
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)
SOURCE_HOSTS: dict[str, tuple[str, ...]] = {
    "keller_williams_curacao": ("kw-curacao.com", "www.kw-curacao.com"),
    # RE/MAX Curaçao public site + image CDN host variants.
    "remax_curacao": (
        "www.realestate-curacao.com",
        "realestate-curacao.com",
        "remax-abc.com",
        "www.remax-abc.com",
    ),
    "moret_real_estate": ("moretrealestate.com", "www.moretrealestate.com"),
    "monumentenzorg_curacao": (
        "monumentenzorg.cw",
        "www.monumentenzorg.cw",
        "monumentenzorgcuracao.com",
        "www.monumentenzorgcuracao.com",
    ),
}
HOST_TO_SOURCE = {
    host: source for source, hosts in SOURCE_HOSTS.items() for host in hosts
}

LIFECYCLE_STATUSES = frozenset(
    {"active", "sold", "missing", "removed", "inactive", "unknown"}
)
LISTING_TYPES = frozenset({"sale", "rent"})
ENRICHMENT_STATUSES = frozenset(
    {
        "not_run",
        "queued",
        "running",
        "succeeded",
        "failed",
        "needs_review",
        "skipped",
    }
)

SOLD_SOURCE_TOKENS = frozenset(
    {
        "sold",
        "sold_under_reservation",
    }
)
RENTED_SOURCE_TOKENS = frozenset(
    {
        "rented",
        "rented/leased",
        "leased",
    }
)
ACTIVE_SOURCE_TOKENS = frozenset(
    {
        "active",
        "immediately",
        "for_rent",
        "for_rent_price_tbd",
        "to be agreed upon",
        "price upon request",
        "on hold",
    }
)

HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
HTML_ENTITY_RE = re.compile(r"&(?:[a-zA-Z]{2,10}|#\d{2,6}|#x[0-9a-fA-F]{2,6});")
MOJIBAKE_RE = re.compile(r"(?:Ã.|Â.|â€™|â€œ|â€|ðŸ)")
REPLACEMENT_CHAR_RE = re.compile("\ufffd")
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

DEFAULT_OUT = ROOT / "data" / "processed" / "phase8_data_quality_audit.json"

# Cap example listing ids retained per finding code.
MAX_EXAMPLES = 12


def _load_env() -> None:
    for path in (ROOT / ".env", ROOT / "apps" / "labs-dashboard" / ".env.local"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    os.environ["SUPABASE_PROJECT_REF"] = LABS
    get_settings.cache_clear()


def _guard() -> None:
    if os.environ.get("SUPABASE_PROJECT_REF") != LABS:
        raise SystemExit("Refusing non-Labs project")
    blob = json.dumps(
        {k: v for k, v in os.environ.items() if "KEY" not in k.upper() and "SECRET" not in k.upper()}
    )
    if PROD_FORBIDDEN in blob or PROD_FORBIDDEN in json.dumps(
        {"url": os.environ.get("SUPABASE_URL", "")}
    ):
        raise SystemExit("Production reference present in environment")
    settings = get_settings()
    if settings.supabase_project_ref != LABS:
        raise SystemExit(f"Refusing non-Labs project ref: {settings.supabase_project_ref!r}")
    if settings.supabase_url and LABS not in str(settings.supabase_url):
        raise SystemExit(f"Refusing non-Labs SUPABASE_URL: {settings.supabase_url}")
    if settings.supabase_url and PROD_FORBIDDEN in str(settings.supabase_url):
        raise SystemExit("Production URL detected")


def _page(client: Any, table: str, select: str, **filters: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    page = 1000
    while True:
        q = client.table(table).select(select).range(start, start + page - 1)
        for key, value in filters.items():
            if key.endswith("__in"):
                q = q.in_(key[:-4], value)
            elif key.endswith("__eq"):
                q = q.eq(key[:-4], value)
            elif key.endswith("__neq"):
                q = q.neq(key[:-4], value)
            else:
                q = q.eq(key, value)
        batch = q.execute().data or []
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
    return rows


def _dec(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _host(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = (urlparse(url).hostname or "").casefold()
    except Exception:
        return None
    return host or None


def _norm_status_token(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().casefold())


def _amenity_items(amenities: Any) -> list[dict[str, Any]]:
    if not isinstance(amenities, list):
        return []
    return [item for item in amenities if isinstance(item, dict)]


def _amenity_value(amenities: Any, key: str) -> Any:
    for item in _amenity_items(amenities):
        if str(item.get("key") or "") == key:
            return item.get("value")
    return None


def _as_url_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(u) for u in value if isinstance(u, str) and u.strip()]


class FindingBucket:
    def __init__(self) -> None:
        self.codes: dict[str, dict[str, Any]] = {}

    def add(
        self,
        *,
        code: str,
        severity: str,
        category: str,
        message: str,
        source_key: str,
        listing_id: str | None = None,
        external_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        entry = self.codes.setdefault(
            code,
            {
                "code": code,
                "severity": severity,
                "category": category,
                "message": message,
                "count": 0,
                "by_source": Counter(),
                "examples": [],
            },
        )
        entry["count"] += 1
        entry["by_source"][source_key] += 1
        if listing_id and len(entry["examples"]) < MAX_EXAMPLES:
            example: dict[str, Any] = {
                "listing_id": listing_id,
                "source_key": source_key,
                "external_id": external_id,
            }
            if detail:
                example["detail"] = detail
            entry["examples"].append(example)

    def serialized(self) -> list[dict[str, Any]]:
        rows = []
        for entry in self.codes.values():
            rows.append(
                {
                    "code": entry["code"],
                    "severity": entry["severity"],
                    "category": entry["category"],
                    "message": entry["message"],
                    "count": entry["count"],
                    "by_source": dict(entry["by_source"]),
                    "examples": entry["examples"],
                }
            )
        severity_rank = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
        rows.sort(key=lambda r: (severity_rank.get(r["severity"], 9), -r["count"], r["code"]))
        return rows


def _classify_missing_coord_gap(row: dict[str, Any]) -> dict[str, Any]:
    """Split map-only gaps from neighbourhood-search gaps via source text."""

    source_text = row.get("source_neighbourhood_text")
    canon = canonicalize_neighbourhood(source_text)
    has_searchable = bool(
        canon.canonical_display
        and canon.reason not in {"generic"}
        and canon.safe
    )
    # Uncertain / multi-place / empty / generic → also a neighbourhood search gap.
    if not source_text or not str(source_text).strip():
        gap = "also_neighbourhood_search_gap"
        reason = "missing_source_neighbourhood_text"
    elif canon.reason == "generic" or not canon.canonical_display:
        gap = "also_neighbourhood_search_gap"
        reason = f"canonical_{canon.reason}"
    elif not canon.safe or canon.reason == "uncertain":
        gap = "also_neighbourhood_search_gap"
        reason = "uncertain_or_unsafe_canonical"
    else:
        gap = "map_gap_only"
        reason = f"searchable_via_{canon.reason}"
    return {
        "listing_id": row["id"],
        "source_key": row["source_key"],
        "external_id": row.get("external_id"),
        "source_neighbourhood_text": source_text,
        "canonical_display": canon.canonical_display,
        "canonical_reason": canon.reason,
        "canonical_safe": canon.safe,
        "gap_class": gap,
        "gap_reason": reason,
        "has_searchable_neighbourhood": has_searchable,
        "status": row.get("status"),
        "public_eligible": row.get("public_eligible"),
    }


def audit(client: Any) -> dict[str, Any]:
    findings = FindingBucket()
    sources = _page(
        client,
        "property_sources",
        "id,source_key,display_name,enabled,adapter_status",
    )
    source_by_id = {s["id"]: s for s in sources}
    ready_ids = [s["id"] for s in sources if s.get("source_key") in READY]
    ready_by_key = {s["source_key"]: s for s in sources if s.get("source_key") in READY}

    listings = _page(
        client,
        "property_listings",
        "id,property_source_id,external_id,external_id_status,source_url,"
        "original_realtor_url,original_realtor_name,original_realtor_domain,"
        "original_realtor_external_id,attribution_method,listing_type,property_type,"
        "title,description,status,source_listing_status,original_price,original_currency,"
        "benchmark_price_xcg,conversion_method,conversion_rate,conversion_provider,"
        "currency_inferred,currency,current_price,public_eligible,public_exclusion_reason,"
        "bedrooms,bathrooms,floor_area_m2,lot_area_value,lot_area_unit,amenities,"
        "latitude,longitude,coordinates_source,source_neighbourhood_text,neighbourhood_id,"
        "inferred_neighbourhood_id,neighbourhood_assignment_status,"
        "primary_image_url,image_urls,enrichment_status,enrichment_last_run_at,"
        "enrichment_last_input_checksum,missing_since,sold_at,removed_at,"
        "first_observed_sold_at,first_observed_rented_at,first_observed_under_contract_at,"
        "consecutive_successful_absences,chh_internal_id,field_provenance,"
        "official_alternate_prices",
        property_source_id__in=ready_ids,
    )

    public_rows = _page(
        client,
        "public_property_listings",
        "id,external_id,source_key,source_url,title,original_price,original_currency,"
        "benchmark_price_xcg,status,listing_type,property_type,latitude,longitude,"
        "effective_neighbourhood,primary_image_url",
    )
    public_by_id = {r["id"]: r for r in public_rows}

    # Attach source_key for convenience.
    for row in listings:
        src = source_by_id.get(row["property_source_id"], {})
        row["source_key"] = src.get("source_key") or "unknown"

    inventory: dict[str, Counter[str]] = {k: Counter() for k in READY}
    inventory["__all__"] = Counter()
    external_id_index: dict[tuple[str, str], list[str]] = defaultdict(list)

    for row in listings:
        sk = row["source_key"]
        if sk not in READY:
            continue
        inventory[sk]["listings"] += 1
        inventory["__all__"]["listings"] += 1
        status = str(row.get("status") or "")
        inventory[sk][f"status:{status}"] += 1
        if row.get("public_eligible"):
            inventory[sk]["public_eligible"] += 1
            inventory["__all__"]["public_eligible"] += 1
        if row.get("latitude") is None or row.get("longitude") is None:
            inventory[sk]["missing_coords"] += 1
            inventory["__all__"]["missing_coords"] += 1
        ext = str(row.get("external_id") or "").strip()
        if ext:
            external_id_index[(sk, ext)].append(str(row["id"]))

    # --- Source isolation (inventory-level) ---
    non_ready_in_public = [
        r for r in public_rows if r.get("source_key") not in READY and r.get("source_key")
    ]
    for r in non_ready_in_public:
        findings.add(
            code="public_view_non_ready_source",
            severity="P0",
            category="source_isolation",
            message="Public read-model contains a non-Ready source_key",
            source_key=str(r.get("source_key")),
            listing_id=str(r.get("id")),
            external_id=r.get("external_id"),
        )

    for row in listings:
        sk = str(row["source_key"])
        lid = str(row["id"])
        ext = row.get("external_id")
        src_meta = ready_by_key.get(sk) or source_by_id.get(row["property_source_id"], {})

        # --- Identity / attribution ---
        if not ext or not str(ext).strip():
            findings.add(
                code="missing_external_id",
                severity="P0",
                category="identity",
                message="Listing missing external_id",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        elif row.get("external_id_status") not in (None, "verified"):
            findings.add(
                code="external_id_not_verified",
                severity="P1",
                category="identity",
                message="external_id_status is not verified",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"external_id_status": row.get("external_id_status")},
            )

        source_url = row.get("source_url")
        if not source_url or not str(source_url).strip():
            findings.add(
                code="missing_source_url",
                severity="P0",
                category="identity",
                message="Listing missing canonical source_url",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        else:
            host = _host(str(source_url))
            expected = SOURCE_HOSTS.get(sk, ())
            if host and expected and host not in expected:
                findings.add(
                    code="source_url_host_mismatch",
                    severity="P0",
                    category="identity",
                    message="source_url host does not match Ready source expected hosts",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"host": host, "expected": list(expected)},
                )
            owner = HOST_TO_SOURCE.get(host or "")
            if owner and owner != sk:
                findings.add(
                    code="source_url_belongs_to_other_ready_source",
                    severity="P0",
                    category="source_isolation",
                    message="source_url host maps to a different Ready source",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"host": host, "mapped_source": owner},
                )

        if not row.get("original_realtor_name") and not row.get("original_realtor_domain"):
            findings.add(
                code="missing_attribution",
                severity="P1",
                category="identity",
                message="Missing original realtor name and domain attribution",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )

        if row.get("chh_internal_id"):
            findings.add(
                code="chh_internal_id_on_ready_listing",
                severity="P1",
                category="source_isolation",
                message="Ready listing still carries chh_internal_id",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"chh_internal_id": row.get("chh_internal_id")},
            )

        # --- Lifecycle / source status contradictions ---
        status = str(row.get("status") or "")
        src_status = _norm_status_token(row.get("source_listing_status"))
        if status not in LIFECYCLE_STATUSES:
            findings.add(
                code="invalid_lifecycle_status",
                severity="P0",
                category="lifecycle",
                message="status is outside canonical lifecycle enum",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"status": status},
            )

        if status == "active" and src_status in SOLD_SOURCE_TOKENS:
            findings.add(
                code="active_vs_source_sold",
                severity="P1",
                category="lifecycle",
                message="Canonical status active but source_listing_status indicates sold",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"source_listing_status": row.get("source_listing_status")},
            )
        if status == "active" and src_status in RENTED_SOURCE_TOKENS:
            findings.add(
                code="active_vs_source_rented",
                severity="P1",
                category="lifecycle",
                message="Canonical status active but source_listing_status indicates rented",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"source_listing_status": row.get("source_listing_status")},
            )
        if status == "sold" and src_status in ACTIVE_SOURCE_TOKENS:
            findings.add(
                code="sold_vs_source_active",
                severity="P1",
                category="lifecycle",
                message="Canonical status sold but source_listing_status looks active",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"source_listing_status": row.get("source_listing_status")},
            )
        if status == "sold" and row.get("listing_type") == "rent" and src_status in RENTED_SOURCE_TOKENS:
            findings.add(
                code="rent_marked_sold_instead_of_lifecycle",
                severity="P2",
                category="lifecycle",
                message="Rent listing uses sold lifecycle while source says rented",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"source_listing_status": row.get("source_listing_status")},
            )
        if status == "missing" and row.get("sold_at"):
            findings.add(
                code="missing_with_sold_at",
                severity="P1",
                category="lifecycle",
                message="status=missing but sold_at is set",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        if status == "removed" and not row.get("removed_at") and not row.get("missing_since"):
            findings.add(
                code="removed_without_timestamps",
                severity="P2",
                category="lifecycle",
                message="status=removed without removed_at or missing_since",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        if row.get("sold_at") and status not in {"sold", "removed", "inactive"}:
            findings.add(
                code="sold_at_without_sold_status",
                severity="P1",
                category="lifecycle",
                message="sold_at set while status is not sold/removed/inactive",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"status": status},
            )
        if row.get("public_eligible") and status != "active":
            findings.add(
                code="public_eligible_not_active",
                severity="P0",
                category="lifecycle",
                message="public_eligible=true but status is not active",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"status": status},
            )

        # Recompute eligibility basics vs stored flag.
        price = _dec(row.get("original_price"))
        eligible, reason = evaluate_public_eligibility(
            status=status or "unknown",
            original_price=price,
            source_enabled=bool(src_meta.get("enabled", True)),
            source_url=str(source_url) if source_url else None,
            source_adapter_status=src_meta.get("adapter_status"),
            has_source_attribution=bool(
                row.get("original_realtor_name")
                or row.get("original_realtor_domain")
                or source_url
            ),
        )
        stored = bool(row.get("public_eligible"))
        if stored != eligible:
            findings.add(
                code="public_eligibility_mismatch",
                severity="P1",
                category="public_read_model",
                message="Stored public_eligible disagrees with deterministic recompute",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={
                    "stored": stored,
                    "recomputed": eligible,
                    "recomputed_reason": reason,
                    "stored_exclusion": row.get("public_exclusion_reason"),
                },
            )

        # --- Price provenance ---
        oc = normalize_currency_code(row.get("original_currency"))
        if status == "active" and price is None:
            findings.add(
                code="active_missing_original_price",
                severity="P1",
                category="price",
                message="Active listing missing original_price",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        if price is not None and price <= 0:
            findings.add(
                code="non_positive_original_price",
                severity="P1",
                category="price",
                message="original_price is zero or negative",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"original_price": str(price)},
            )
        if price is not None and not oc:
            findings.add(
                code="price_without_currency",
                severity="P1",
                category="price",
                message="original_price present without original_currency",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        bench = _dec(row.get("benchmark_price_xcg"))
        method = row.get("conversion_method")
        if bench is not None and not method:
            findings.add(
                code="benchmark_without_conversion_method",
                severity="P1",
                category="price",
                message="benchmark_price_xcg present without conversion_method",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        if method == "identity" and oc and oc not in XCG_EQUIVALENT:
            findings.add(
                code="identity_conversion_non_xcg_currency",
                severity="P1",
                category="price",
                message="conversion_method=identity but original_currency is not XCG/ANG/NAF",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"original_currency": row.get("original_currency")},
            )
        if method == "usd_fixed_peg":
            rate = _dec(row.get("conversion_rate"))
            if rate is not None and abs(rate - Decimal("1.79")) > Decimal("0.001"):
                findings.add(
                    code="usd_peg_rate_unexpected",
                    severity="P2",
                    category="price",
                    message="USD fixed peg conversion_rate is not 1.79",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"conversion_rate": str(rate)},
                )
        if status == "active" and price is not None and bench is None and method is None:
            findings.add(
                code="active_missing_xcg_benchmark",
                severity="P2",
                category="price",
                message="Active priced listing missing XCG benchmark provenance",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"original_currency": row.get("original_currency")},
            )

        # --- Rent vs sale / price_period ---
        listing_type = row.get("listing_type")
        if listing_type not in LISTING_TYPES:
            findings.add(
                code="invalid_listing_type",
                severity="P0",
                category="property_fields",
                message="listing_type not in {sale, rent}",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"listing_type": listing_type},
            )
        period = _amenity_value(row.get("amenities"), "price_period")
        period_norm = str(period).strip().casefold() if period is not None else None
        if listing_type == "sale" and period_norm in {"month", "monthly", "week", "weekly", "day", "daily"}:
            findings.add(
                code="sale_with_rent_price_period",
                severity="P1",
                category="rent_sale_period",
                message="Sale listing has a rent-like price_period amenity",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"price_period": period},
            )
        if listing_type == "rent" and period_norm in {"total", "sale", "once"}:
            findings.add(
                code="rent_with_sale_price_period",
                severity="P1",
                category="rent_sale_period",
                message="Rent listing has a sale-like price_period amenity",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"price_period": period},
            )
        if listing_type == "rent" and period_norm is None and status == "active":
            findings.add(
                code="rent_missing_price_period",
                severity="P3",
                category="rent_sale_period",
                message="Active rent listing has no price_period amenity",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )

        # --- Property fields / enums ---
        ptype = row.get("property_type")
        if ptype is None or not str(ptype).strip():
            findings.add(
                code="missing_property_type",
                severity="P2",
                category="property_fields",
                message="property_type is null/empty",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        else:
            normalized = normalize_property_type(str(ptype))
            if normalized is None or normalized not in CANONICAL_PROPERTY_TYPES:
                findings.add(
                    code="non_canonical_property_type",
                    severity="P2",
                    category="property_fields",
                    message="property_type is outside canonical vocabulary",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"property_type": ptype, "normalized": normalized},
                )
            elif str(ptype) != normalized and str(ptype).casefold() == normalized:
                findings.add(
                    code="property_type_case_drift",
                    severity="P3",
                    category="property_fields",
                    message="property_type casing differs from canonical slug",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"property_type": ptype, "normalized": normalized},
                )
        beds = row.get("bedrooms")
        baths = row.get("bathrooms")
        if beds is not None and int(beds) < 0:
            findings.add(
                code="negative_bedrooms",
                severity="P1",
                category="property_fields",
                message="bedrooms is negative",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"bedrooms": beds},
            )
        if baths is not None and float(baths) < 0:
            findings.add(
                code="negative_bathrooms",
                severity="P1",
                category="property_fields",
                message="bathrooms is negative",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"bathrooms": baths},
            )

        # --- Duplicate amenities ---
        amen_keys = [str(i.get("key") or "") for i in _amenity_items(row.get("amenities"))]
        amen_keys = [k for k in amen_keys if k]
        dup_keys = [k for k, n in Counter(amen_keys).items() if n > 1]
        if dup_keys:
            findings.add(
                code="duplicate_amenity_keys",
                severity="P2",
                category="amenities",
                message="amenities JSON contains duplicate keys",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"duplicate_keys": dup_keys},
            )

        # --- Neighbourhood / coordinates ---
        lat, lon = row.get("latitude"), row.get("longitude")
        cq = coordinate_quality(
            float(lat) if lat is not None else None,
            float(lon) if lon is not None else None,
        )
        if cq == "missing_coords":
            findings.add(
                code="missing_coordinates",
                severity="P2",
                category="geo",
                message="Listing missing latitude/longitude",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"source_neighbourhood_text": row.get("source_neighbourhood_text")},
            )
        elif cq in {"invalid_coords", "outside_curacao"}:
            findings.add(
                code="invalid_or_out_of_bbox_coordinates",
                severity="P1",
                category="geo",
                message="Coordinates invalid or outside Curaçao bounding box",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"quality": cq, "latitude": lat, "longitude": lon},
            )
        if lat is not None and lon is not None:
            if not (CURACAO_LAT_MIN <= float(lat) <= CURACAO_LAT_MAX) or not (
                CURACAO_LON_MIN <= float(lon) <= CURACAO_LON_MAX
            ):
                # already covered; keep bbox explicit in quality helper
                pass
            if row.get("neighbourhood_assignment_status") == "missing_coords":
                findings.add(
                    code="coords_present_assignment_missing_coords",
                    severity="P1",
                    category="geo",
                    message="Coordinates present but neighbourhood_assignment_status=missing_coords",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )

        nbhd_canon = canonicalize_neighbourhood(row.get("source_neighbourhood_text"))
        if not row.get("source_neighbourhood_text"):
            findings.add(
                code="missing_source_neighbourhood_text",
                severity="P2",
                category="geo",
                message="source_neighbourhood_text is empty",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        elif nbhd_canon.reason == "generic":
            findings.add(
                code="generic_source_neighbourhood_text",
                severity="P3",
                category="geo",
                message="source_neighbourhood_text is island-generic",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"source_neighbourhood_text": row.get("source_neighbourhood_text")},
            )
        elif nbhd_canon.reason == "uncertain" or not nbhd_canon.safe:
            findings.add(
                code="uncertain_source_neighbourhood_text",
                severity="P3",
                category="geo",
                message="source_neighbourhood_text is uncertain/unsafe for merge",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={
                    "source_neighbourhood_text": row.get("source_neighbourhood_text"),
                    "reason": nbhd_canon.reason,
                },
            )

        # --- Duplicate images ---
        urls = _as_url_list(row.get("image_urls"))
        seen_keys: set[str] = set()
        identity_dupes = 0
        for raw in urls:
            key = image_identity_key(canonicalize_image_url(raw))
            if key in seen_keys:
                identity_dupes += 1
            else:
                seen_keys.add(key)
        if identity_dupes:
            findings.add(
                code="duplicate_image_identity_slots",
                severity="P2",
                category="images",
                message="image_urls contains identity-duplicate slots",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"duplicate_slots": identity_dupes, "raw_count": len(urls)},
            )
        primary = row.get("primary_image_url")
        if primary and urls and canonicalize_image_url(str(primary)) not in {
            canonicalize_image_url(u) for u in urls
        }:
            # primary may still share identity with a gallery url
            primary_key = image_identity_key(canonicalize_image_url(str(primary)))
            gallery_keys = {image_identity_key(canonicalize_image_url(u)) for u in urls}
            if primary_key not in gallery_keys:
                findings.add(
                    code="primary_image_not_in_gallery",
                    severity="P3",
                    category="images",
                    message="primary_image_url not represented in image_urls gallery",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )

        # --- Text / HTML / Unicode ---
        for field_name in ("title", "description"):
            text = row.get(field_name)
            if not isinstance(text, str) or not text:
                continue
            if HTML_TAG_RE.search(text):
                findings.add(
                    code=f"html_tags_in_{field_name}",
                    severity="P2" if field_name == "title" else "P3",
                    category="text_quality",
                    message=f"HTML tags present in {field_name}",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )
            if HTML_ENTITY_RE.search(text) and html.unescape(text) != text:
                findings.add(
                    code=f"html_entities_in_{field_name}",
                    severity="P3",
                    category="text_quality",
                    message=f"HTML entities present in {field_name}",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )
            if MOJIBAKE_RE.search(text) or REPLACEMENT_CHAR_RE.search(text):
                findings.add(
                    code=f"unicode_corruption_in_{field_name}",
                    severity="P2",
                    category="text_quality",
                    message=f"Likely mojibake/replacement chars in {field_name}",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )
            if CONTROL_CHAR_RE.search(text):
                findings.add(
                    code=f"control_chars_in_{field_name}",
                    severity="P3",
                    category="text_quality",
                    message=f"Control characters present in {field_name}",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )

        # --- Enrichment status consistency ---
        estatus = row.get("enrichment_status")
        if estatus is not None and estatus not in ENRICHMENT_STATUSES:
            findings.add(
                code="invalid_enrichment_status",
                severity="P2",
                category="enrichment",
                message="enrichment_status outside known set",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"enrichment_status": estatus},
            )
        if estatus in {"succeeded", "needs_review"} and not row.get("enrichment_last_run_at"):
            findings.add(
                code="enrichment_status_without_run_at",
                severity="P2",
                category="enrichment",
                message="enrichment_status implies a run but enrichment_last_run_at is null",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"enrichment_status": estatus},
            )
        if estatus == "not_run" and row.get("enrichment_last_input_checksum"):
            findings.add(
                code="enrichment_not_run_with_checksum",
                severity="P3",
                category="enrichment",
                message="enrichment_status=not_run but input checksum is present",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        if (
            row.get("public_eligible")
            and status == "active"
            and estatus in {None, "not_run", "failed"}
        ):
            findings.add(
                code="public_active_enrichment_incomplete",
                severity="P3",
                category="enrichment",
                message="Public-eligible active listing has incomplete enrichment",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
                detail={"enrichment_status": estatus},
            )

        # --- Public read-model consistency ---
        pub = public_by_id.get(lid)
        if stored and pub is None:
            findings.add(
                code="public_eligible_missing_from_view",
                severity="P0",
                category="public_read_model",
                message="public_eligible listing absent from public_property_listings",
                source_key=sk,
                listing_id=lid,
                external_id=ext,
            )
        if pub is not None:
            if pub.get("source_key") != sk:
                findings.add(
                    code="public_view_source_key_mismatch",
                    severity="P0",
                    category="source_isolation",
                    message="public_property_listings.source_key differs from Ready join",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"public_source_key": pub.get("source_key")},
                )
            if str(pub.get("external_id") or "") != str(ext or ""):
                findings.add(
                    code="public_view_external_id_mismatch",
                    severity="P0",
                    category="public_read_model",
                    message="public view external_id differs from base listing",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={"public_external_id": pub.get("external_id")},
                )
            if str(pub.get("source_url") or "") != str(source_url or ""):
                findings.add(
                    code="public_view_source_url_mismatch",
                    severity="P1",
                    category="public_read_model",
                    message="public view source_url differs from base listing",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )
            if _dec(pub.get("original_price")) != price:
                findings.add(
                    code="public_view_price_mismatch",
                    severity="P1",
                    category="public_read_model",
                    message="public view original_price differs from base listing",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                    detail={
                        "base": str(price) if price is not None else None,
                        "public": str(pub.get("original_price")),
                    },
                )
            if not stored:
                findings.add(
                    code="public_view_contains_ineligible",
                    severity="P0",
                    category="public_read_model",
                    message="Listing appears in public view while public_eligible=false",
                    source_key=sk,
                    listing_id=lid,
                    external_id=ext,
                )

    # Duplicate external ids within a source.
    for (sk, ext), ids in external_id_index.items():
        if len(ids) > 1:
            findings.add(
                code="duplicate_external_id_within_source",
                severity="P0",
                category="identity",
                message="Duplicate external_id within the same Ready source",
                source_key=sk,
                listing_id=ids[0],
                external_id=ext,
                detail={"listing_ids": ids[:MAX_EXAMPLES], "count": len(ids)},
            )

    # Missing-coord gap classification (known 28).
    missing_coord_rows = [
        r
        for r in listings
        if r.get("source_key") in READY
        and (r.get("latitude") is None or r.get("longitude") is None)
    ]
    missing_coord_classes = [_classify_missing_coord_gap(r) for r in missing_coord_rows]
    gap_counts = Counter(item["gap_class"] for item in missing_coord_classes)
    gap_by_source: dict[str, Counter[str]] = defaultdict(Counter)
    for item in missing_coord_classes:
        gap_by_source[item["source_key"]][item["gap_class"]] += 1

    finding_rows = findings.serialized()
    severity_counts = Counter(f["severity"] for f in finding_rows for _ in range(f["count"]))
    # Count findings occurrences by severity/source.
    by_severity_source: dict[str, Counter[str]] = defaultdict(Counter)
    for f in finding_rows:
        for source_key, n in f["by_source"].items():
            by_severity_source[f["severity"]][source_key] += n
            by_severity_source[f["severity"]]["__all__"] += n

    category_counts = Counter()
    for f in finding_rows:
        category_counts[f["category"]] += f["count"]

    top_p0 = [f for f in finding_rows if f["severity"] == "P0"][:15]
    top_p1 = [f for f in finding_rows if f["severity"] == "P1"][:15]

    return {
        "audit": "phase8_property_data_quality",
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "project_ref": LABS,
        "mode": "dry_run_read_only",
        "openai_calls": 0,
        "scrape_calls": 0,
        "writes": 0,
        "ready_sources": list(READY),
        "inventory": {
            "totals": dict(inventory["__all__"]),
            "by_source": {k: dict(inventory[k]) for k in READY},
            "public_view_rows": len(public_rows),
            "public_view_ready_rows": sum(
                1 for r in public_rows if r.get("source_key") in READY
            ),
        },
        "summary": {
            "finding_codes": len(finding_rows),
            "finding_occurrences": sum(f["count"] for f in finding_rows),
            "by_severity": dict(severity_counts),
            "by_severity_and_source": {
                sev: dict(counter) for sev, counter in sorted(by_severity_source.items())
            },
            "by_category": dict(category_counts),
        },
        "top_p0": top_p0,
        "top_p1": top_p1,
        "findings": finding_rows,
        "missing_coordinates_classification": {
            "total": len(missing_coord_classes),
            "by_gap_class": dict(gap_counts),
            "by_source": {k: dict(v) for k, v in gap_by_source.items()},
            "listings": missing_coord_classes,
            "note": (
                "map_gap_only = missing pin but source_neighbourhood_text "
                "canonicalizes to a searchable neighbourhood; "
                "also_neighbourhood_search_gap = missing/generic/uncertain text."
            ),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Summary JSON output path",
    )
    args = parser.parse_args(argv)

    _load_env()
    _guard()
    client = create_labs_client()
    report = audit(client)

    out_path: Path = args.out
    if not out_path.is_absolute():
        out_path = ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    summary = report["summary"]
    print(
        json.dumps(
            {
                "ok": True,
                "output": str(out_path),
                "listings": report["inventory"]["totals"].get("listings"),
                "finding_occurrences": summary["finding_occurrences"],
                "by_severity": summary["by_severity"],
                "by_severity_and_source": summary["by_severity_and_source"],
                "missing_coords": report["missing_coordinates_classification"]["by_gap_class"],
                "top_p0_codes": [f["code"] for f in report["top_p0"][:8]],
                "top_p1_codes": [f["code"] for f in report["top_p1"][:8]],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
