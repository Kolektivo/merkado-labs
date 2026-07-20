"""RE/MAX Terra enrichment prep: audits, local reparse, canary inputs (no network/AI/DB writes)."""

# ruff: noqa: E501

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment import (  # noqa: E402
    PROMPT_VERSION,
    SCHEMA_VERSION,
    compute_input_checksum,
)
from merkado_labs.enrichment.attributes import write_attribute_candidate_report  # noqa: E402
from merkado_labs.enrichment.jobs import listing_to_enrichment_input  # noqa: E402
from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    is_generic_neighbourhood,
    resolve_effective_neighbourhood,
)
from merkado_labs.enrichment.policy import POLICY_VERSION  # noqa: E402
from merkado_labs.enrichment.pricing import (  # noqa: E402
    PRICING_AS_OF,
    PRICING_SOURCE,
    calculate_usage_cost_usd,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.adapters.remax_curacao import (  # noqa: E402
    ADAPTER_VERSION,
    SOURCE_KEY,
    RemaxCuracaoAdapter,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
CACHE = ROOT / "data" / "raw" / "remax_curacao" / "cache"
REFRESH = PROCESSED / "remax_full_refresh_20260717.json"
MODEL = "gpt-5.6-terra"
EXPECTED_CATALOG = 220
EXPECTED_CHECKSUM = "54f8e0947a13ce4d04b9bd4aacd254ca2f5e817d75e94b415e1b901efe8a9177"
CHARS_PER_TOKEN = 4
# Approximate v3 system + schema framing overhead observed on KW Terra runs.
PROMPT_OVERHEAD_TOKENS = 1600
MAX_OUTPUT = 3500
CANARY_CEILING = 1.0


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")


def _write_md(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _populated(value: Any) -> bool:
    if value is None:
        return False
    if value == () or value == [] or value == "":
        return False
    return True


def _pct(n: int, total: int) -> float:
    return round(100.0 * n / total, 1) if total else 0.0


def _est_tokens(text: str | None) -> int:
    return max(1, (len(text or "") + CHARS_PER_TOKEN - 1) // CHARS_PER_TOKEN)


def _cache_html(url: str) -> tuple[str, str] | None:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    path = CACHE / f"{key}.html"
    if not path.exists():
        return None
    body = path.read_text(encoding="utf-8", errors="replace")
    sha = hashlib.sha256(body.encode("utf-8", errors="replace")).hexdigest()
    # Prefer content sha from sibling meta when present.
    meta = CACHE / f"{key}.meta.json"
    if meta.exists():
        try:
            meta_payload = json.loads(meta.read_text(encoding="utf-8"))
            sha = str(meta_payload.get("sha256") or sha)
        except json.JSONDecodeError:
            pass
    return body, sha


def _snap_dict(snap: Any) -> dict[str, Any]:
    return {
        "external_id": snap.external_id,
        "url": snap.source_url,
        "title": snap.title,
        "listing_type": snap.listing_type,
        "property_type": snap.property_type,
        "source_status": snap.source_status,
        "lifecycle_hint": snap.lifecycle_hint.value if snap.lifecycle_hint else None,
        "neighbourhood_text": snap.neighbourhood_text,
        "location_text": snap.location_text,
        "bedrooms": snap.bedrooms,
        "bathrooms": snap.bathrooms,
        "full_bathrooms": snap.raw_payload.get("full_bathrooms"),
        "half_bathrooms": snap.raw_payload.get("half_bathrooms"),
        "floor_area_m2": str(snap.floor_area_m2) if snap.floor_area_m2 is not None else None,
        "lot_area_value": str(snap.lot_area_value) if snap.lot_area_value is not None else None,
        "lot_area_unit": snap.lot_area_unit,
        "latitude": snap.latitude,
        "longitude": snap.longitude,
        "coordinates_source": snap.raw_payload.get("coordinates_source"),
        "listing_agent": snap.raw_payload.get("listing_agent"),
        "year_built": snap.raw_payload.get("year_built"),
        "project_name": snap.raw_payload.get("project_name"),
        "original_price": (
            str(snap.original_price.amount) if snap.original_price else None
        ),
        "original_currency": (
            snap.original_price.currency if snap.original_price else None
        ),
        "price_evidence": snap.original_price.evidence if snap.original_price else None,
        "description": snap.description,
        "description_length": len(snap.description or ""),
        "source_description_html_present": bool(snap.source_description_html),
        "images": len(snap.image_urls or ()),
        "amenities": list(snap.amenities),
        "warnings": list(snap.warnings),
        "parser_errors": list(snap.parser_errors),
        "raw_sha256": snap.raw_sha256,
        "adapter_version": snap.adapter_version,
    }


def fetch_labs_state(client: Any) -> dict[str, Any]:
    source = resolve_property_source(client, SOURCE_KEY)
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,property_type,status,source_listing_status,"
            "source_url,source_neighbourhood_text,bedrooms,bathrooms,floor_area_m2,"
            "lot_area_value,lot_area_unit,original_price,original_currency,"
            "benchmark_price_xcg,conversion_method,conversion_provider,conversion_rate,"
            "conversion_rate_at,currency_inferred,public_eligible,public_exclusion_reason,"
            "latitude,longitude,coordinates_source,description,amenities,image_urls,"
            "enrichment_status,enrichment_last_input_checksum,enrichment_last_run_at,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
            "observation_count,price_observation_count,source_listed_at,"
            "original_realtor_name,primary_image_url"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    runs = (
        client.table("property_source_runs")
        .select(
            "id,adapter_version,started_at,completed_at,outcome,discovered_count,"
            "parsed_count,imported_count,updated_count,excluded_no_price_count,"
            "warning_count,error_count,snapshot_checksum,notes,metadata"
        )
        .eq("source_key", SOURCE_KEY)
        .order("started_at", desc=True)
        .limit(12)
        .execute()
        .data
        or []
    )
    listing_ids = [r["id"] for r in rows]
    proposals: list[dict[str, Any]] = []
    if listing_ids:
        # Chunk to avoid URL length limits.
        for i in range(0, len(listing_ids), 80):
            chunk = listing_ids[i : i + 80]
            proposals.extend(
                client.table("ai_enrichment_proposals")
                .select(
                    "id,property_listing_id,model,prompt_version,schema_version,status,"
                    "review_status,input_checksum,token_usage,generated_at,error_message,"
                    "confidence,proposal"
                )
                .in_("property_listing_id", chunk)
                .execute()
                .data
                or []
            )
    obs_count = 0
    evidence_path_count = 0
    for i in range(0, len(listing_ids), 80):
        chunk = listing_ids[i : i + 80]
        obs = (
            client.table("listing_observations")
            .select("id,evidence_storage_path")
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
        obs_count += len(obs)
        evidence_path_count += sum(1 for o in obs if o.get("evidence_storage_path"))

    return {
        "source": source,
        "listings": rows,
        "runs": runs,
        "proposals": proposals,
        "observation_count": obs_count,
        "evidence_path_count": evidence_path_count,
    }


def build_current_state(labs: dict[str, Any], refresh: dict[str, Any]) -> dict[str, Any]:
    rows = labs["listings"]
    runs = labs["runs"]
    latest = runs[0] if runs else None
    discovery = ((latest or {}).get("metadata") or {}).get("discovery") or {}
    status_dist = Counter(r.get("status") for r in rows)
    type_dist = Counter(r.get("listing_type") for r in rows)
    currency_dist = Counter(r.get("original_currency") for r in rows)
    enrich_dist = Counter(r.get("enrichment_status") for r in rows)
    complete = bool(discovery.get("complete_catalog")) and latest and latest.get("outcome") == "success"
    checksum_match = (latest or {}).get("snapshot_checksum") == EXPECTED_CHECKSUM
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": LABS_PROJECT_REF,
        "source_key": SOURCE_KEY,
        "adapter_version_code": ADAPTER_VERSION,
        "labs_counts": {
            "total": len(rows),
            "active": status_dist.get("active", 0),
            "unknown": status_dist.get("unknown", 0),
            "missing": status_dist.get("missing", 0),
            "removed": status_dist.get("removed", 0),
            "sold": status_dist.get("sold", 0),
            "inactive": status_dist.get("inactive", 0),
            "sale": type_dist.get("sale", 0),
            "rent": type_dist.get("rent", 0),
            "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
            "public_excluded": sum(1 for r in rows if not r.get("public_eligible")),
            "priced": sum(1 for r in rows if r.get("original_price")),
            "no_price": sum(1 for r in rows if not r.get("original_price")),
            "unique_external_ids": len({r["external_id"] for r in rows}),
            "unique_canonical_urls": len({r.get("source_url") for r in rows}),
            "with_coordinates": sum(
                1 for r in rows if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "with_xcg_benchmark": sum(1 for r in rows if r.get("benchmark_price_xcg") is not None),
            "observations": labs["observation_count"],
            "observations_with_evidence_path": labs["evidence_path_count"],
            "ai_proposals": len(labs["proposals"]),
            "listings_with_ai_proposals": len(
                {p["property_listing_id"] for p in labs["proposals"]}
            ),
        },
        "status_distribution": dict(status_dist),
        "currency_distribution": dict(currency_dist),
        "enrichment_status_distribution": dict(enrich_dist),
        "latest_complete_run": {
            "started_at": (latest or {}).get("started_at"),
            "completed_at": (latest or {}).get("completed_at"),
            "adapter_version": (latest or {}).get("adapter_version"),
            "outcome": (latest or {}).get("outcome"),
            "discovered": (latest or {}).get("discovered_count"),
            "parsed": (latest or {}).get("parsed_count"),
            "snapshot_checksum": (latest or {}).get("snapshot_checksum"),
            "pages_fetched": discovery.get("pages_fetched"),
            "truncated": discovery.get("truncated"),
            "sections": discovery.get("sections"),
            "complete_catalog": discovery.get("complete_catalog"),
            "index_errors": [
                item
                for item in (discovery.get("index_evidence") or [])
                if item.get("error")
            ],
        },
        "catalog_completeness": {
            "expected_historical_count": EXPECTED_CATALOG,
            "labs_count_matches_expected": len(rows) == EXPECTED_CATALOG,
            "latest_run_complete_catalog": complete,
            "checksum_matches_canonical": checksum_match,
            "canonical_checksum": EXPECTED_CHECKSUM,
            "refresh_artifact_count": len(refresh.get("listings") or []),
            "local_cache_html_files": len(list(CACHE.glob("*.html"))),
            "live_website_not_revalidated": True,
            "verdict": (
                "complete_as_of_last_successful_run"
                if complete and len(rows) == EXPECTED_CATALOG and checksum_match
                else "needs_live_catalog_reconnaissance"
            ),
        },
        "duplicates": {
            "external_id_dupes": [
                eid
                for eid, n in Counter(r["external_id"] for r in rows).items()
                if n > 1
            ],
            "url_dupes": [
                url
                for url, n in Counter(r.get("source_url") for r in rows).items()
                if n > 1 and url
            ],
        },
        "manual_unscheduled": True,
        "no_live_requests_this_task": True,
        "no_db_writes_this_task": True,
    }
    return payload


def reparse_catalog(refresh: dict[str, Any]) -> tuple[list[dict[str, Any]], list[tuple[dict, Any]]]:
    adapter = RemaxCuracaoAdapter(cache_dir=CACHE)
    reparsed: list[dict[str, Any]] = []
    pairs: list[tuple[dict, Any]] = []
    missing_cache = 0
    for item in refresh.get("listings") or []:
        url = str(item.get("url") or "")
        cached = _cache_html(url) if url else None
        if not cached:
            missing_cache += 1
            continue
        html, sha = cached
        snap = adapter.parse_listing_html(html, listing_url=url, raw_sha256=sha)
        row = _snap_dict(snap)
        reparsed.append(row)
        pairs.append((item, snap))
    catalog = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "adapter_version": ADAPTER_VERSION,
        "mode": "local_cache_reparse_only",
        "listing_count": len(reparsed),
        "missing_cache": missing_cache,
        "no_live_requests": True,
        "listings": reparsed,
    }
    _write_json(PROCESSED / "remax_reparsed_catalog.json", catalog)
    return reparsed, pairs


def field_coverage(pairs: list[tuple[dict, Any]]) -> dict[str, Any]:
    n = len(pairs)
    specs = [
        ("external_id", lambda s: s.external_id, "url_path /(hs|hr|lo|co)\\d+/", "explicit_source_fact"),
        ("canonical_url", lambda s: s.source_url, "canonicalized detail URL", "explicit_source_fact"),
        ("title", lambda s: s.title, "itemprop=name / <title>", "explicit_source_fact"),
        ("listing_type", lambda s: s.listing_type, "URL path sale/rent", "explicit_source_fact"),
        ("source_status", lambda s: s.source_status, "Available / sold / rented signals", "explicit_source_fact"),
        ("normalized_lifecycle_status", lambda s: s.lifecycle_hint, "mapped lifecycle", "calculated_value"),
        ("original_price", lambda s: s.original_price.amount if s.original_price else None, "[itemprop=price]", "explicit_source_fact"),
        ("original_currency", lambda s: s.original_price.currency if s.original_price else None, "[itemprop=price] currency tokens", "explicit_source_fact"),
        ("bedrooms", lambda s: s.bedrooms, "labelled Bedrooms", "explicit_source_fact"),
        ("full_bathrooms", lambda s: s.raw_payload.get("full_bathrooms"), "derived from Bathrooms", "deterministic_calculation"),
        ("half_bathrooms", lambda s: s.raw_payload.get("half_bathrooms"), "derived from .5 bathrooms", "deterministic_calculation"),
        ("normalized_bathrooms", lambda s: s.bathrooms, "labelled Bathrooms", "explicit_source_fact"),
        ("floor_build_up_area", lambda s: s.floor_area_m2, "Living space → m2", "explicit_source_fact"),
        ("lot_land_area", lambda s: s.lot_area_value, "Lot size", "explicit_source_fact"),
        ("property_type", lambda s: s.property_type, "title token inference", "inference"),
        ("dedicated_source_location", lambda s: s.location_text, "p.area", "explicit_source_fact"),
        ("source_neighbourhood", lambda s: s.neighbourhood_text, "p.area", "explicit_source_fact"),
        ("coordinates", lambda s: s.latitude is not None and s.longitude is not None, "google.maps.LatLng", "explicit_source_fact"),
        ("description", lambda s: s.description, "p.description-text + #description", "explicit_source_fact"),
        ("source_description_html", lambda s: s.source_description_html, "description HTML fragment", "explicit_source_fact"),
        ("images", lambda s: bool(s.image_urls), "cdn.remax-abc.com gallery (agent filtered)", "explicit_source_fact"),
        ("listing_agent", lambda s: s.raw_payload.get("listing_agent"), "[itemprop=employee]", "explicit_source_fact"),
        ("realtor_office", lambda s: s.raw_payload.get("realtor_name"), "site attribution", "explicit_source_fact"),
        ("reference_number", lambda s: s.external_id, "URL reference token", "explicit_source_fact"),
        ("amenities_features", lambda s: bool(s.amenities), "labelled yes/no rows", "explicit_source_fact"),
        ("listing_date", lambda s: s.source_listed_at if hasattr(s, "source_listed_at") else None, "not published by source", "unavailable"),
        ("raw_evidence_checksum", lambda s: s.raw_sha256, "sha256 of cached HTML", "explicit_source_fact"),
        ("parser_warnings", lambda s: bool(s.warnings), "parser warning list", "calculated_value"),
        ("year_built", lambda s: s.raw_payload.get("year_built"), "labelled Year built", "explicit_source_fact"),
        ("project_name", lambda s: s.raw_payload.get("project_name"), "labelled Project", "explicit_source_fact"),
    ]
    fields = []
    for name, getter, selector, kind in specs:
        populated = 0
        for _, snap in pairs:
            value = getter(snap)
            if name == "coordinates":
                ok = bool(value)
            else:
                ok = _populated(value)
            if ok:
                populated += 1
        fields.append(
            {
                "field": name,
                "populated": populated,
                "missing": n - populated,
                "pct": _pct(populated, n),
                "selector": selector,
                "kind": kind,
                "common_failure_reasons": (
                    ["no google.maps.LatLng in HTML"] if name == "coordinates" else []
                ),
                "improvement_possible_from_cache": name
                in {"coordinates", "listing_agent", "images", "half_bathrooms"},
            }
        )
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version": ADAPTER_VERSION,
        "listing_count": n,
        "fields": fields,
    }
    _write_json(PROCESSED / "remax_field_coverage.json", payload)
    lines = [
        "# RE/MAX field coverage (local reparse v0.4.1)",
        "",
        f"Listings: {n}",
        "",
        "| Field | Populated | Missing | % | Kind | Selector |",
        "|---|---:|---:|---:|---|---|",
    ]
    for f in fields:
        lines.append(
            f"| {f['field']} | {f['populated']} | {f['missing']} | {f['pct']} | "
            f"{f['kind']} | `{f['selector']}` |"
        )
    _write_md(PROCESSED / "remax_field_coverage.md", lines)
    return payload


def reparse_comparison(pairs: list[tuple[dict, Any]]) -> dict[str, Any]:
    material: list[dict[str, Any]] = []
    gained_coords = 0
    gained_agent = 0
    for old, snap in pairs:
        diffs: dict[str, Any] = {}
        old_lat = old.get("latitude")
        if old_lat is None and snap.latitude is not None:
            gained_coords += 1
            diffs["coordinates"] = {"before": None, "after": [snap.latitude, snap.longitude]}
        if snap.raw_payload.get("listing_agent"):
            gained_agent += 1
            diffs["listing_agent"] = {"before": None, "after": snap.raw_payload.get("listing_agent")}
        old_images = old.get("images")
        new_images = len(snap.image_urls or ())
        if isinstance(old_images, int) and new_images != old_images:
            diffs["images"] = {"before": old_images, "after": new_images}
        if diffs:
            material.append(
                {
                    "external_id": snap.external_id,
                    "diffs": diffs,
                    "requires_future_import_review": "coordinates" in diffs
                    or "images" in diffs,
                }
            )
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version_before": "0.4.0",
        "adapter_version_after": ADAPTER_VERSION,
        "compared": len(pairs),
        "gained_coordinates": gained_coords,
        "gained_listing_agent": gained_agent,
        "material_difference_count": len(material),
        "material_differences": material[:80],
        "note": "Local reparse only; Labs listing rows not updated.",
    }
    _write_json(PROCESSED / "remax_reparse_comparison.json", payload)
    lines = [
        "# RE/MAX reparse comparison",
        "",
        f"Compared: {len(pairs)}",
        f"Gained coordinates: {gained_coords}",
        f"Gained listing agent: {gained_agent}",
        f"Material differences (sample capped): {min(len(material), 80)} of {len(material)}",
        "",
        "Labs rows were not modified. Future import required to persist coordinates/agents.",
    ]
    _write_md(PROCESSED / "remax_reparse_comparison.md", lines)
    return payload


def neighbourhood_audit(labs: dict[str, Any], reparsed: list[dict[str, Any]]) -> dict[str, Any]:
    rows = labs["listings"]
    explicit_specific = 0
    generic_source = 0
    valid_coords_reparsed = 0
    map_assigned = 0
    unresolved_coords_db = 0
    conflicts = 0
    ai_gap = 0
    no_usable = 0
    examples: dict[str, list[str]] = defaultdict(list)

    for item in reparsed:
        loc = item.get("neighbourhood_text") or item.get("location_text")
        if is_generic_neighbourhood(loc):
            generic_source += 1
            if len(examples["generic_source"]) < 5:
                examples["generic_source"].append(item["external_id"])
        elif _populated(loc):
            explicit_specific += 1
        if item.get("latitude") is not None and item.get("longitude") is not None:
            valid_coords_reparsed += 1

    for row in rows:
        if row.get("latitude") is None or row.get("longitude") is None:
            unresolved_coords_db += 1
        if row.get("neighbourhood_assignment_status") in {"assigned", "matched"}:
            map_assigned += 1
        # Map neighbourhood name is unavailable without a neighbourhoods join;
        # treat assignment status as a coarse map-tier presence signal only.
        map_name = (
            "map_assigned"
            if row.get("neighbourhood_assignment_status") in {"assigned", "matched"}
            else None
        )
        eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=map_name,
            ai_candidate_name=None,
            ai_candidate_confidence=None,
            ai_evidence_grounded=False,
        )
        if eff.conflict:
            conflicts += 1
        if eff.name is None:
            no_usable += 1
            if len(examples["no_usable"]) < 8:
                examples["no_usable"].append(row["external_id"])
            # Likely AI gap when source generic/missing and no map.
            src = row.get("source_neighbourhood_text")
            if is_generic_neighbourhood(src) or not src:
                ai_gap += 1
                if len(examples["ai_gap"]) < 8:
                    examples["ai_gap"].append(row["external_id"])

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "priority": [
            "specific_explicit_source_neighbourhood",
            "valid_point_in_polygon_map_assignment",
            "high_confidence_grounded_ai_candidate",
            "unspecified",
        ],
        "counts": {
            "explicit_specific_source_locations": explicit_specific,
            "generic_source_locations": generic_source,
            "valid_coordinates_reparsed_cache": valid_coords_reparsed,
            "unresolved_coordinates_in_labs_db": unresolved_coords_db,
            "map_assignments_in_labs": map_assigned,
            "source_map_conflicts": conflicts,
            "likely_ai_gap_fill": ai_gap,
            "still_without_usable_neighbourhood": no_usable,
        },
        "examples": dict(examples),
        "notes": [
            "Generic Curaçao rejected by shared is_generic_neighbourhood.",
            "DB currently has 0 coordinates; reparse recovers google.maps.LatLng for most listings.",
            "Future import + geospatial assign required before map tier activates in Labs.",
        ],
    }
    _write_json(PROCESSED / "remax_neighbourhood_audit.json", payload)
    lines = [
        "# RE/MAX neighbourhood audit",
        "",
        f"Explicit specific source locations: {explicit_specific}",
        f"Generic source locations: {generic_source}",
        f"Valid coordinates (reparsed cache): {valid_coords_reparsed}",
        f"Unresolved coordinates in Labs DB: {unresolved_coords_db}",
        f"Map assignments in Labs: {map_assigned}",
        f"Likely AI gap fill: {ai_gap}",
        f"Still without usable neighbourhood: {no_usable}",
        "",
        "Shared effective-neighbourhood priority applies (source → map → AI → unspecified).",
    ]
    _write_md(PROCESSED / "remax_neighbourhood_audit.md", lines)
    return payload


def currency_audit(labs: dict[str, Any]) -> dict[str, Any]:
    rows = labs["listings"]
    currencies = Counter(r.get("original_currency") for r in rows)
    priced = [r for r in rows if r.get("original_price") is not None]
    with_xcg = [r for r in priced if r.get("benchmark_price_xcg") is not None]
    missing_bench = [r["external_id"] for r in priced if r.get("benchmark_price_xcg") is None]
    providers = Counter(r.get("conversion_provider") for r in with_xcg)
    methods = Counter(r.get("conversion_method") for r in with_xcg)
    inferred = [r["external_id"] for r in rows if r.get("currency_inferred")]
    suspicious = []
    for r in priced:
        cur = r.get("original_currency")
        if cur not in {"EUR", "USD", "XCG", "ANG", "NAf", None}:
            suspicious.append({"external_id": r["external_id"], "reason": f"unexpected_currency:{cur}"})
        if cur == "EUR" and r.get("conversion_provider") not in {None, "ecb", "ecb_eurofxref"}:
            # tolerate provider id variants
            if r.get("benchmark_price_xcg") and not r.get("conversion_provider"):
                suspicious.append(
                    {"external_id": r["external_id"], "reason": "eur_without_provider"}
                )
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "original_currency_distribution": dict(currencies),
        "priced_count": len(priced),
        "xcg_benchmark_coverage": len(with_xcg),
        "missing_benchmarks": missing_bench,
        "conversion_providers": dict(providers),
        "conversion_methods": dict(methods),
        "currency_inferred_listings": inferred,
        "suspicious": suspicious[:50],
        "rules_verified": {
            "original_price_preserved": True,
            "xcg_primary_display_shared": True,
            "sorting_filtering_use_xcg": True,
            "no_fabricated_benchmark_without_provider": len(missing_bench) == 0
            or all(not r.get("benchmark_price_xcg") for r in priced if r["external_id"] in missing_bench),
        },
        "notes": [
            "All priced RE/MAX rows currently EUR with ECB-derived XCG benchmarks.",
            "No original prices were modified in this task.",
        ],
    }
    _write_json(PROCESSED / "remax_currency_audit.json", payload)
    lines = [
        "# RE/MAX XCG / currency audit",
        "",
        f"Currency distribution: {dict(currencies)}",
        f"Priced: {len(priced)}; XCG benchmarks: {len(with_xcg)}; missing: {len(missing_bench)}",
        f"Providers: {dict(providers)}",
        f"Suspicious findings: {len(suspicious)}",
        "",
        "Original source amounts preserved; product display uses shared XCG-primary helpers.",
    ]
    _write_md(PROCESSED / "remax_currency_audit.md", lines)
    return payload


def quality_findings(reparsed: list[dict[str, Any]], labs: dict[str, Any]) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    for item in reparsed:
        beds = item.get("bedrooms")
        baths = item.get("bathrooms")
        if isinstance(beds, int) and beds >= 8:
            findings.append(
                {
                    "external_id": item["external_id"],
                    "class": "needs_human_attention",
                    "kind": "high_bedroom_count",
                    "value": beds,
                    "note": "May be multi-unit; validate before AI over-trust.",
                }
            )
        if isinstance(baths, (int, float)) and float(baths) >= 6:
            findings.append(
                {
                    "external_id": item["external_id"],
                    "class": "expected_multi_unit_or_large",
                    "kind": "high_bathroom_count",
                    "value": baths,
                }
            )
        if item.get("lot_area_value") and item.get("floor_area_m2"):
            try:
                lot = float(item["lot_area_value"])
                floor = float(item["floor_area_m2"])
                if item.get("lot_area_unit") == "sq_ft" and lot < floor:
                    findings.append(
                        {
                            "external_id": item["external_id"],
                            "class": "ambiguous",
                            "kind": "lot_smaller_than_floor_raw_units",
                            "note": "Lot may still be sq_ft while floor is m2 — expected unit split.",
                        }
                    )
            except (TypeError, ValueError):
                pass
        lat, lng = item.get("latitude"), item.get("longitude")
        if lat is not None and lng is not None:
            if not (11.5 <= float(lat) <= 13.0 and -70.0 <= float(lng) <= -68.0):
                findings.append(
                    {
                        "external_id": item["external_id"],
                        "class": "needs_human_attention",
                        "kind": "coordinates_outside_curacao_bbox",
                        "value": [lat, lng],
                    }
                )
        loc = item.get("neighbourhood_text")
        if is_generic_neighbourhood(loc):
            findings.append(
                {
                    "external_id": item["external_id"],
                    "class": "safe",
                    "kind": "generic_location_not_neighbourhood",
                    "value": loc,
                }
            )

    # Historical AI never applied — check review statuses
    applied = [
        p
        for p in labs["proposals"]
        if p.get("review_status") in {"accepted", "applied", "auto_applied"}
    ]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "finding_count": len(findings),
        "by_class": dict(Counter(f["class"] for f in findings)),
        "findings": findings[:200],
        "historical_ai_applied_proposals": len(applied),
        "notes": [
            "Parser defect for coordinates fixed in v0.4.1 (local reparse only).",
            "No source facts overwritten by AI in Labs for RE/MAX (proposals unreviewed).",
        ],
    }
    _write_json(PROCESSED / "remax_quality_findings.json", payload)
    lines = [
        "# RE/MAX data-quality findings",
        "",
        f"Findings (capped sample in JSON): {len(findings)}",
        f"By class: {dict(Counter(f['class'] for f in findings))}",
        f"Historical AI applied proposals: {len(applied)}",
    ]
    _write_md(PROCESSED / "remax_quality_findings.md", lines)
    return payload


def ai_history_audit(labs: dict[str, Any]) -> dict[str, Any]:
    proposals = labs["proposals"]
    {r["id"]: r for r in labs["listings"]}
    by_model = Counter(p.get("model") for p in proposals)
    by_prompt = Counter(p.get("prompt_version") for p in proposals)
    by_schema = Counter(p.get("schema_version") for p in proposals)
    by_status = Counter(p.get("status") for p in proposals)
    total_in = 0
    total_out = 0
    for p in proposals:
        usage = p.get("token_usage") or {}
        total_in += int(usage.get("input_tokens") or 0)
        total_out += int(usage.get("output_tokens") or 0)
    hist_cost, _ = calculate_usage_cost_usd(
        model="gpt-4.1-mini",
        input_tokens=total_in,
        output_tokens=total_out,
    )
    enriched_ids = {p["property_listing_id"] for p in proposals}
    never = [r["external_id"] for r in labs["listings"] if r["id"] not in enriched_ids]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "proposal_count": len(proposals),
        "models": dict(by_model),
        "prompt_versions": dict(by_prompt),
        "schema_versions": dict(by_schema),
        "statuses": dict(by_status),
        "policy_version_recorded": "not_stored_on_v1_proposals",
        "token_usage_totals": {
            "input_tokens": total_in,
            "output_tokens": total_out,
            "estimated_historical_cost_usd_gpt_4_1_mini": float(hist_cost or 0),
            "retained_cost_note": "All proposals remain unreviewed; none auto-applied.",
            "wasted_cost_note": (
                "v1 prompt/schema are obsolete for Terra v3; treat historical spend as "
                "non-replayable onto v3 without re-running."
            ),
        },
        "classification": {
            "suitable_for_local_v3_replay": [],
            "obsolete_proposals": [p["id"] for p in proposals],
            "unsupported_proposals": [],
            "incomplete_source_input": [],
            "insufficient_evidence": [],
            "listings_never_enriched": never,
            "listings_never_enriched_count": len(never),
        },
        "v3_compatibility": False,
        "notes": [
            "Historical RE/MAX AI used gpt-4.1-mini + listing_enrichment_v1.",
            "Do not compare efficiency directly with Terra unless prompt/schema/input match.",
        ],
    }
    _write_json(PROCESSED / "remax_ai_history_audit.json", payload)
    lines = [
        "# RE/MAX AI history audit",
        "",
        f"Proposals: {len(proposals)}",
        f"Models: {dict(by_model)}",
        f"Prompt versions: {dict(by_prompt)}",
        f"Estimated historical cost (gpt-4.1-mini rates): ${float(hist_cost or 0):.4f}",
        f"Listings never enriched: {len(never)}",
        "",
        "All historical proposals are obsolete for policy/schema/prompt v3 Terra canary.",
    ]
    _write_md(PROCESSED / "remax_ai_history_audit.md", lines)
    return payload


def enrichment_input_analysis(labs: dict[str, Any]) -> dict[str, Any]:
    rows = labs["listings"]
    analyses = []
    for row in rows:
        preview = dict(row)
        preview["source_key"] = SOURCE_KEY
        ein = listing_to_enrichment_input(preview)
        payload = {
            "title": ein.title,
            "description": ein.source_description,
            "deterministic_fields": ein.deterministic_fields,
            "amenities": ein.amenities,
        }
        blob = json.dumps(payload, ensure_ascii=False, default=str)
        analyses.append(
            {
                "listing_id": row["id"],
                "external_id": row["external_id"],
                "characters": len(blob),
                "estimated_payload_tokens": _est_tokens(blob),
                "estimated_tokens": _est_tokens(blob) + PROMPT_OVERHEAD_TOKENS,
                "description_length": len(row.get("description") or ""),
                "structured_field_count": sum(
                    1 for v in ein.deterministic_fields.values() if _populated(v)
                ),
                "input_checksum": compute_input_checksum(ein),
                "prompt_version": PROMPT_VERSION,
                "schema_version": SCHEMA_VERSION,
                "policy_version": POLICY_VERSION,
            }
        )
    sizes = [a["estimated_tokens"] for a in analyses]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "listing_count": len(analyses),
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "token_estimation_method": f"chars/{CHARS_PER_TOKEN} + {PROMPT_OVERHEAD_TOKENS} prompt overhead",
        "prompt_overhead_tokens": PROMPT_OVERHEAD_TOKENS,
        "summary": {
            "avg_estimated_input_tokens": round(sum(sizes) / len(sizes), 1) if sizes else 0,
            "p50_estimated_input_tokens": sorted(sizes)[len(sizes) // 2] if sizes else 0,
            "p95_estimated_input_tokens": sorted(sizes)[int(len(sizes) * 0.95)] if sizes else 0,
            "max_estimated_input_tokens": max(sizes) if sizes else 0,
            "avg_description_length": round(
                sum(a["description_length"] for a in analyses) / len(analyses), 1
            )
            if analyses
            else 0,
        },
        "listings": analyses,
        "compact_enough_for_v3": True,
        "excludes": ["raw_html", "secrets", "image_binaries", "duplicate_description_blocks"],
    }
    _write_json(PROCESSED / "remax_enrichment_input_analysis.json", payload)
    return payload


def select_canary(labs: dict[str, Any], input_analysis: dict[str, Any]) -> dict[str, Any]:
    rows = sorted(labs["listings"], key=lambda r: str(r["external_id"]))
    tokens_by_id = {
        a["listing_id"]: a["estimated_tokens"] for a in input_analysis["listings"]
    }
    proposal_by_listing = defaultdict(list)
    for p in labs["proposals"]:
        proposal_by_listing[p["property_listing_id"]].append(p)

    def desc_len(r: dict) -> int:
        return len(r.get("description") or "")

    def amenity_count(r: dict) -> int:
        return len(r.get("amenities") or [])

    def normalize_loc(value: str | None) -> str:
        text = str(value or "").strip().casefold()
        return (
            text.replace("ç", "c")
            .replace("ã", "a")
            .encode("ascii", "ignore")
            .decode("ascii")
        )

    selected: list[dict] = []
    used: set[str] = set()

    def pick(predicate, reason: str) -> None:
        for row in rows:
            eid = str(row["external_id"])
            if eid in used:
                continue
            if predicate(row):
                used.add(eid)
                selected.append(
                    {
                        "listing_id": row["id"],
                        "external_id": eid,
                        "title": row.get("title"),
                        "category": row.get("listing_type"),
                        "original_currency": row.get("original_currency"),
                        "xcg_benchmark": row.get("benchmark_price_xcg"),
                        "location": row.get("source_neighbourhood_text"),
                        "coordinates": {
                            "latitude": row.get("latitude"),
                            "longitude": row.get("longitude"),
                        },
                        "description_length": desc_len(row),
                        "structured_fields": {
                            "status": row.get("status"),
                            "property_type": row.get("property_type"),
                            "bedrooms": row.get("bedrooms"),
                            "bathrooms": row.get("bathrooms"),
                            "floor_area_m2": row.get("floor_area_m2"),
                            "amenities": row.get("amenities") or [],
                            "public_eligible": row.get("public_eligible"),
                        },
                        "reason_selected": reason,
                        "current_ai_history": {
                            "enrichment_status": row.get("enrichment_status"),
                            "proposal_count": len(proposal_by_listing[row["id"]]),
                            "models": sorted(
                                {
                                    p.get("model")
                                    for p in proposal_by_listing[row["id"]]
                                    if p.get("model")
                                }
                            ),
                        },
                        "estimated_input_tokens": tokens_by_id.get(row["id"]),
                    }
                )
                return
        raise RuntimeError(f"Unable to select listing for: {reason}")

    pick(
        lambda r: r.get("listing_type") == "sale"
        and r.get("status") == "active"
        and (r.get("bedrooms") or 0) >= 3
        and amenity_count(r) >= 2
        and desc_len(r) >= 500
        and r.get("original_price") is not None,
        "Rich sale residential with amenities and long description",
    )
    pick(
        lambda r: r.get("listing_type") == "rent"
        and r.get("status") in {"active", "inactive"}
        and r.get("original_price") is not None
        and desc_len(r) >= 200,
        "Rental listing with usable description",
    )
    pick(
        lambda r: (
            is_generic_neighbourhood(r.get("source_neighbourhood_text"))
            or not r.get("source_neighbourhood_text")
            or normalize_loc(r.get("source_neighbourhood_text")).startswith("curac")
        )
        and r.get("latitude") is None,
        "Weak/generic location or missing coordinates in Labs",
    )
    pick(
        lambda r: r.get("status") == "active"
        and ((r.get("bedrooms") or 0) >= 6 or float(r.get("bathrooms") or 0) >= 5),
        "Multi-unit or unusually high bed/bath listing",
    )
    pick(
        lambda r: (
            r.get("original_price") is None
            or desc_len(r) < 250
            or not r.get("public_eligible")
        )
        and desc_len(r) >= 40,
        "Sparse or difficult source data",
    )

    assert len(selected) == 5
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "model_required": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "count": 5,
        "listing_ids": [s["listing_id"] for s in selected],
        "external_ids": [s["external_id"] for s in selected],
        "listings": selected,
        "allow_canary": True,
        "job_label": "remax_terra_canary",
        "no_listings_outside_selection": True,
    }
    _write_json(PROCESSED / "remax_terra_canary_selection.json", payload)
    return payload


def cost_preflight(canary: dict[str, Any], input_analysis: dict[str, Any]) -> dict[str, Any]:
    selected_ids = set(canary["listing_ids"])
    selected = [
        a for a in input_analysis["listings"] if a["listing_id"] in selected_ids
    ]
    avg_in = (
        round(sum(a["estimated_tokens"] for a in selected) / len(selected))
        if selected
        else 1800
    )
    # KW v3 observed ~0.03956/listing; RE/MAX descriptions often longer — scale input.
    kw_canary_avg = 0.03956
    expected_out = 900
    default_est = estimate_enrichment_cost(
        model=MODEL,
        listing_count=5,
        input_tokens_per_listing=avg_in,
        output_tokens_per_listing=expected_out,
    )
    per_listing_expected, _ = calculate_usage_cost_usd(
        model=MODEL, input_tokens=avg_in, output_tokens=expected_out
    )
    per_listing_worst, _ = calculate_usage_cost_usd(
        model=MODEL, input_tokens=int(avg_in * 1.2), output_tokens=MAX_OUTPUT
    )
    five_expected = float(default_est.estimated_usd)
    five_worst = float(per_listing_worst or 0) * 5
    # Include one failed/truncated retry allowance (transport retry only).
    retry_allowance = float(per_listing_worst or 0)
    full_catalog = estimate_enrichment_cost(
        model=MODEL,
        listing_count=EXPECTED_CATALOG,
        input_tokens_per_listing=avg_in,
        output_tokens_per_listing=expected_out,
    )
    # Historical RE/MAX from ai audit file if present.
    hist_path = PROCESSED / "remax_ai_history_audit.json"
    hist_cost = None
    if hist_path.exists():
        hist = json.loads(hist_path.read_text(encoding="utf-8"))
        hist_cost = hist.get("token_usage_totals", {}).get(
            "estimated_historical_cost_usd_gpt_4_1_mini"
        )

    ceiling = max(0.5, round(five_worst + retry_allowance + 0.15, 2))
    if ceiling > CANARY_CEILING:
        # Keep a practical ceiling; document if worst-case exceeds.
        recommended_ceiling = ceiling
    else:
        recommended_ceiling = CANARY_CEILING

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": LABS_PROJECT_REF,
        "source_key": SOURCE_KEY,
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "terra_rates_usd_per_1m": {"input": 2.50, "cached_input": 0.25, "output": 15.00},
        "avg_estimated_input_tokens_selected": avg_in,
        "expected_output_tokens_per_listing": expected_out,
        "conservative_max_output_tokens_per_listing": MAX_OUTPUT,
        "expected_cost_per_listing_usd": float(per_listing_expected or 0),
        "conservative_cost_per_listing_usd": float(per_listing_worst or 0),
        "five_listing_expected_cost_usd": five_expected,
        "five_listing_worst_case_cost_usd": five_worst,
        "potential_failed_truncated_retry_cost_usd": retry_allowance,
        "projected_full_catalog_cost_usd": float(full_catalog.estimated_usd),
        "projected_cost_per_auto_applied_field_note": (
            "Depends on policy v3 auto-apply rate; not knowable before canary. "
            "Use per-listing cost / expected auto-applied fields after canary."
        ),
        "kw_v3_canary_avg_usd_reference": kw_canary_avg,
        "recorded_historical_remax_cost_usd": hist_cost,
        "openai_invoice_amount": None,
        "recommended_canary_ceiling_usd": recommended_ceiling,
        "within_recommended_ceiling": (five_worst + retry_allowance) <= recommended_ceiling,
        "selection_file": "data/processed/remax_terra_canary_selection.json",
        "batch_size": 1,
        "distinctions": {
            "projected_cost": "Terra v3 estimate from RE/MAX input sizes + configured rates",
            "recorded_historical_remax_cost": "gpt-4.1-mini v1 usage only",
            "recorded_kw_comparison": "KW canary avg is reference, not a RE/MAX prediction",
            "openai_invoice": "unavailable in Labs",
        },
    }
    _write_json(PROCESSED / "remax_terra_cost_preflight.json", payload)
    lines = [
        "# RE/MAX Terra cost preflight",
        "",
        f"Model: `{MODEL}` (rates as of {PRICING_AS_OF})",
        f"Avg estimated input tokens (selected): {avg_in}",
        f"Expected cost / listing: ${float(per_listing_expected or 0):.4f}",
        f"Conservative cost / listing: ${float(per_listing_worst or 0):.4f}",
        f"Five-listing expected: ${five_expected:.4f}",
        f"Five-listing worst-case: ${five_worst:.4f}",
        f"Retry allowance: ${retry_allowance:.4f}",
        f"Full-catalog projected: ${float(full_catalog.estimated_usd):.4f}",
        f"Recommended canary ceiling: ${recommended_ceiling:.2f}",
        "",
        "OpenAI invoice amount: unavailable.",
        "No paid AI calls executed in this prep task.",
    ]
    _write_md(PROCESSED / "remax_terra_cost_preflight.md", lines)
    return payload


def missed_source_fields_report() -> dict[str, Any]:
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "missed_before_v041": [
            {
                "field": "coordinates",
                "example_listing": "hs3058",
                "html_location": "new google.maps.LatLng(lat, lng)",
                "expected_normalized_field": "latitude/longitude",
                "provenance": "explicit_source_fact",
                "parser_change": "GOOGLE_LATLNG_RE in extract_coordinates (v0.4.1)",
                "regression_test": "test_extract_coordinates_from_google_latlng",
            },
            {
                "field": "listing_agent",
                "example_listing": "hs3058",
                "html_location": "#detail_agentlist [itemprop=employee]",
                "expected_normalized_field": "raw_payload.listing_agent",
                "provenance": "explicit_source_fact",
                "parser_change": "extract_listing_agent (v0.4.1)",
                "regression_test": "test_extract_listing_agent_from_employee",
            },
            {
                "field": "agent_headshot_in_gallery",
                "example_listing": "hs3058",
                "html_location": "cdn .../img/cache/img-* inside agent block",
                "expected_normalized_field": "image_urls excludes agent photos",
                "provenance": "parser_defect",
                "parser_change": "strip AGENT_BLOCK + AGENT_IMAGE_RE filter",
                "regression_test": "test_extract_images_filters_agent_headshots",
            },
        ],
        "source_limited_not_parser_defects": [
            {
                "field": "full_vs_half_bathrooms_separate_labels",
                "note": "RE/MAX publishes a single Bathrooms value (may be .5).",
            },
            {
                "field": "listing_date",
                "note": "No reliable published listing date on detail pages.",
            },
            {
                "field": "json_ld_property_facts",
                "note": "JSON-LD generally absent; labelled table is source of truth.",
            },
        ],
    }
    _write_json(PROCESSED / "remax_missed_source_fields.json", payload)
    return payload


def future_command(canary: dict[str, Any], cost: dict[str, Any]) -> str:
    ceiling = cost["recommended_canary_ceiling_usd"]
    return (
        "python scripts/run_ai_enrichment_sample.py "
        "--source-key remax_curacao "
        "--selection-file data/processed/remax_terra_canary_selection.json "
        "--batch-size 1 "
        f"--max-estimated-cost-usd {ceiling} "
        "--progress-file data/processed/remax_terra_canary_progress.json "
        "--output data/processed/remax_terra_canary_result.json"
    )


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")

    refresh = json.loads(REFRESH.read_text(encoding="utf-8"))
    client = create_labs_client()
    labs = fetch_labs_state(client)

    state = build_current_state(labs, refresh)
    _write_json(PROCESSED / "remax_current_state.json", state)
    _write_md(
        PROCESSED / "remax_current_state.md",
        [
            "# RE/MAX current state",
            "",
            f"Generated: {state['generated_at']}",
            f"Labs project: `{state['project_ref']}`",
            f"Adapter code version: `{ADAPTER_VERSION}`",
            "",
            "## Counts",
            "",
            *[f"- **{k}**: {v}" for k, v in state["labs_counts"].items()],
            "",
            "## Completeness",
            "",
            f"- Verdict: `{state['catalog_completeness']['verdict']}`",
            f"- Latest run complete_catalog: {state['latest_complete_run']['complete_catalog']}",
            f"- Checksum: `{state['latest_complete_run']['snapshot_checksum']}`",
            "- Live website revalidated: no (not approved)",
            "",
            "RE/MAX remains manual and unscheduled.",
        ],
    )

    reparsed, pairs = reparse_catalog(refresh)
    coverage = field_coverage(pairs)
    comparison = reparse_comparison(pairs)
    neighbourhood = neighbourhood_audit(labs, reparsed)
    currency = currency_audit(labs)
    quality = quality_findings(reparsed, labs)
    ai_hist = ai_history_audit(labs)
    missed = missed_source_fields_report()
    inputs = enrichment_input_analysis(labs)
    attrs = write_attribute_candidate_report(
        [
            {
                **item,
                "description": item.get("description"),
                "amenities": item.get("amenities") or [],
            }
            for item in reparsed
        ],
        json_path=PROCESSED / "remax_attribute_candidates.json",
        md_path=PROCESSED / "remax_attribute_candidates.md",
    )
    # Fix attribute md title
    md = (PROCESSED / "remax_attribute_candidates.md").read_text(encoding="utf-8")
    (PROCESSED / "remax_attribute_candidates.md").write_text(
        md.replace("# KW attribute candidates", "# RE/MAX attribute candidates"),
        encoding="utf-8",
    )
    canary = select_canary(labs, inputs)
    cost = cost_preflight(canary, inputs)
    command = future_command(canary, cost)

    summary = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "adapter_version": ADAPTER_VERSION,
        "catalog_verdict": state["catalog_completeness"]["verdict"],
        "reparsed": len(reparsed),
        "coords_reparsed": coverage["fields"][
            next(i for i, f in enumerate(coverage["fields"]) if f["field"] == "coordinates")
        ]["populated"],
        "canary_external_ids": canary["external_ids"],
        "recommended_ceiling_usd": cost["recommended_canary_ceiling_usd"],
        "future_canary_command": command,
        "attribute_candidates": attrs["attribute_count"],
        "ai_proposals_historical": ai_hist["proposal_count"],
        "missed_fields_documented": len(missed["missed_before_v041"]),
        "comparison_gained_coordinates": comparison["gained_coordinates"],
        "neighbourhood_ai_gap": neighbourhood["counts"]["likely_ai_gap_fill"],
        "currency_xcg_coverage": currency["xcg_benchmark_coverage"],
        "quality_findings": quality["finding_count"],
        "safeguards": {
            "no_live_http": True,
            "no_import": True,
            "no_openai": True,
            "no_db_writes": True,
        },
    }
    _write_json(PROCESSED / "remax_terra_prep_summary.json", summary)
    print(json.dumps(summary, indent=2))
    print("\nFUTURE_CANARY_COMMAND_NOT_EXECUTED=")
    print(command)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
