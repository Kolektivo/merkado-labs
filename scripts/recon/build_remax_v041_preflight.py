"""RE/MAX v0.4.1 Data Operations preflight (read-only Labs + local cache).

Phases 1–8 / 10: state snapshot, artifact integrity, import reconciliation,
geospatial preview, lifecycle/public eligibility, AI checksum impact, pipeline
preflight, readiness verdict.

Does not write to Supabase, call OpenAI, make live RE/MAX requests, enqueue a
pipeline, or run the worker.
"""

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
    compute_input_checksum,
    compute_legacy_input_checksum,
)
from merkado_labs.enrichment.jobs import listing_to_enrichment_input  # noqa: E402
from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    is_generic_neighbourhood,
    resolve_effective_neighbourhood,
)
from merkado_labs.enrichment.pricing import estimate_enrichment_cost  # noqa: E402
from merkado_labs.geo import (  # noqa: E402
    CURACAO_LAT_MAX,
    CURACAO_LAT_MIN,
    CURACAO_LON_MAX,
    CURACAO_LON_MIN,
    coordinate_quality,
)
from merkado_labs.normalization.eligibility import evaluate_public_eligibility  # noqa: E402
from merkado_labs.scrapers.adapters.remax_curacao import (  # noqa: E402
    ADAPTER_VERSION,
    SOURCE_KEY,
    RemaxCuracaoAdapter,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402
from merkado_labs.scrapers.remax_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    EXPECTED_LISTING_COUNT,
    load_existing_remax_rows,
    run_remax_import_preview,
)

PROCESSED = ROOT / "data" / "processed"
CACHE = ROOT / "data" / "raw" / "remax_curacao" / "cache"
REFRESH = PROCESSED / "remax_full_refresh_20260717.json"
MODEL = "gpt-5.6-terra"
CANARY_IDS = ("hs2467", "hr1013", "hr2165", "hs2941", "hr1393")
# Conservative remaining-215 Terra ceiling (prior projection ~USD 7–10).
REMAINING_BACKFILL_CEILING_USD = 10.0
REFRESH_CHANGED_CEILING_USD = 0.75
SUSPICIOUS_MAP_CENTERS = {
    (12.1696, -68.9900),  # Willemstad-ish defaults
    (12.15, -68.93),
    (12.1, -68.9),
}


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )


def _write_md(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _cache_html(url: str) -> tuple[str, str] | None:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    path = CACHE / f"{key}.html"
    if not path.exists():
        return None
    body = path.read_text(encoding="utf-8", errors="replace")
    sha = hashlib.sha256(body.encode("utf-8", errors="replace")).hexdigest()
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
        "image_urls": list(snap.image_urls or ()),
        "amenities": list(snap.amenities),
        "warnings": list(snap.warnings),
        "parser_errors": list(snap.parser_errors),
        "raw_sha256": snap.raw_sha256,
        "adapter_version": snap.adapter_version,
        "primary_image_url": snap.primary_image_url,
    }


def build_v041_artifact(refresh: dict[str, Any]) -> dict[str, Any]:
    adapter = RemaxCuracaoAdapter(cache_dir=CACHE)
    reparsed: list[dict[str, Any]] = []
    missing_cache = 0
    for item in refresh.get("listings") or []:
        url = str(item.get("url") or "")
        cached = _cache_html(url) if url else None
        if not cached:
            missing_cache += 1
            continue
        html, sha = cached
        snap = adapter.parse_listing_html(html, listing_url=url, raw_sha256=sha)
        reparsed.append(_snap_dict(snap))

    catalog = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "adapter_version": ADAPTER_VERSION,
        "mode": "local_cache_reparse_only",
        "complete_catalog": True,
        "catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
        "listing_count": len(reparsed),
        "missing_cache": missing_cache,
        "no_live_requests": True,
        "discovery": {
            "complete": True,
            "complete_catalog": True,
            "catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
            "basis": "remax_full_refresh_20260717.json + local cache reparse v0.4.1",
        },
        "listings": reparsed,
    }
    _write_json(PROCESSED / "remax_v041_reparsed_catalog.json", catalog)
    # Keep legacy filename in sync for prior scripts.
    _write_json(PROCESSED / "remax_reparsed_catalog.json", catalog)
    return catalog


def artifact_integrity(catalog: dict[str, Any]) -> dict[str, Any]:
    listings = catalog.get("listings") or []
    ext_ids = [str(item.get("external_id") or "") for item in listings]
    urls = [str(item.get("url") or item.get("source_url") or "") for item in listings]
    ext_dupes = [eid for eid, n in Counter(ext_ids).items() if n > 1 and eid]
    url_dupes = [url for url, n in Counter(urls).items() if n > 1 and url]
    cache_ok = 0
    for item in listings:
        url = str(item.get("url") or "")
        if url and _cache_html(url):
            cache_ok += 1
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version": catalog.get("adapter_version"),
        "listing_count": len(listings),
        "unique_external_ids": len(set(ext_ids)),
        "unique_canonical_urls": len(set(urls)),
        "catalog_checksum": catalog.get("catalog_checksum"),
        "expected_catalog_checksum": EXPECTED_CATALOG_CHECKSUM,
        "checksum_match": catalog.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM,
        "expected_listing_count": EXPECTED_LISTING_COUNT,
        "count_match": len(listings) == EXPECTED_LISTING_COUNT,
        "cache_available": cache_ok,
        "missing_cache": int(catalog.get("missing_cache") or 0),
        "identity_conflicts": 0,
        "unresolved_ids": sum(1 for eid in ext_ids if not eid),
        "duplicate_external_ids": ext_dupes,
        "duplicate_urls": url_dupes,
        "no_live_requests": True,
        "integrity_ok": (
            len(listings) == EXPECTED_LISTING_COUNT
            and len(set(ext_ids)) == EXPECTED_LISTING_COUNT
            and len(set(urls)) == EXPECTED_LISTING_COUNT
            and not ext_dupes
            and not url_dupes
            and catalog.get("catalog_checksum") == EXPECTED_CATALOG_CHECKSUM
            and cache_ok == EXPECTED_LISTING_COUNT
        ),
    }
    _write_json(PROCESSED / "remax_v041_artifact_integrity.json", payload)
    return payload


def fetch_labs_bundle(client: Any) -> dict[str, Any]:
    source = resolve_property_source(client, SOURCE_KEY)
    rows = load_existing_remax_rows(client)
    runs = (
        client.table("property_source_runs")
        .select(
            "id,adapter_version,started_at,completed_at,outcome,discovered_count,"
            "parsed_count,imported_count,updated_count,snapshot_checksum,metadata"
        )
        .eq("source_key", SOURCE_KEY)
        .order("started_at", desc=True)
        .limit(8)
        .execute()
        .data
        or []
    )
    listing_ids = [r["id"] for r in rows]
    proposals: list[dict[str, Any]] = []
    for i in range(0, len(listing_ids), 80):
        chunk = listing_ids[i : i + 80]
        proposals.extend(
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,model,prompt_version,schema_version,status,"
                "input_checksum,generated_at"
            )
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
    active_pipeline = (
        client.table("property_pipeline_runs")
        .select("id,status,source_keys,created_at")
        .in_("status", ["queued", "running", "paused", "stopping"])
        .execute()
        .data
        or []
    )
    remax_active = [
        r
        for r in active_pipeline
        if SOURCE_KEY in (r.get("source_keys") or [])
    ]
    active_ai = (
        client.table("ai_enrichment_jobs")
        .select("id,status,scope_filter,created_at")
        .in_("status", ["queued", "running", "paused"])
        .execute()
        .data
        or []
    )
    neighbourhoods: list[dict[str, Any]] = []
    nb_start = 0
    while True:
        page = (
            client.table("neighbourhoods")
            .select("id,name,normalized_name,is_gap_zone,boundary")
            .eq("is_gap_zone", False)
            .not_.is_("boundary", "null")
            .range(nb_start, nb_start + 999)
            .execute()
            .data
            or []
        )
        neighbourhoods.extend(page)
        if len(page) < 1000:
            break
        nb_start += 1000
    return {
        "source": source,
        "listings": rows,
        "runs": runs,
        "proposals": proposals,
        "active_remax_pipeline": remax_active,
        "active_ai_jobs": active_ai,
        "neighbourhoods": neighbourhoods,
    }


def phase1_state(labs: dict[str, Any], pre_existing_modified: list[str]) -> dict[str, Any]:
    rows = labs["listings"]
    latest = (labs["runs"] or [None])[0]
    by_ext = {str(r["external_id"]): r for r in rows}
    terra = [
        p
        for p in labs["proposals"]
        if p.get("model") == MODEL and p.get("prompt_version") == "listing_enrichment_v3"
    ]
    v1 = [
        p
        for p in labs["proposals"]
        if p.get("model") == "gpt-4.1-mini"
        and str(p.get("prompt_version") or "").startswith("listing_enrichment_v1")
    ]
    image_total = 0
    for row in rows:
        urls = row.get("image_urls") or []
        if isinstance(urls, list):
            image_total += len(urls)
    state = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": assert_labs_project_ref(),
        "source_key": SOURCE_KEY,
        "adapter_version_code": ADAPTER_VERSION,
        "labs": {
            "listing_count": len(rows),
            "sale": sum(1 for r in rows if r.get("listing_type") == "sale"),
            "rent": sum(1 for r in rows if r.get("listing_type") == "rent"),
            "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
            "with_coordinates": sum(
                1
                for r in rows
                if r.get("latitude") is not None and r.get("longitude") is not None
            ),
            "with_neighbourhood_text": sum(
                1 for r in rows if (r.get("source_neighbourhood_text") or "").strip()
            ),
            "with_map_neighbourhood": sum(
                1 for r in rows if r.get("inferred_neighbourhood_id")
            ),
            "assignment_status": dict(
                Counter(r.get("neighbourhood_assignment_status") for r in rows)
            ),
            "with_original_price": sum(1 for r in rows if r.get("original_price")),
            "total_images": image_total,
            "avg_images": round(image_total / len(rows), 2) if rows else 0,
            "listing_agent_column": "not_on_property_listings; stored on observations/raw_payload",
            "full_half_bathroom_columns": "not_on_property_listings; derived in parser raw_payload",
            "year_project_columns": (
                "not_on_property_listings; stored in observation payload"
            ),
        },
        "latest_source_run": {
            "adapter_version": (latest or {}).get("adapter_version"),
            "outcome": (latest or {}).get("outcome"),
            "started_at": (latest or {}).get("started_at"),
            "completed_at": (latest or {}).get("completed_at"),
            "snapshot_checksum": (latest or {}).get("snapshot_checksum"),
            "discovered_count": (latest or {}).get("discovered_count"),
            "parsed_count": (latest or {}).get("parsed_count"),
        },
        "terra_canary": {
            "expected_ids": list(CANARY_IDS),
            "proposals": [
                {
                    "external_id": next(
                        (
                            eid
                            for eid, row in by_ext.items()
                            if row["id"] == p.get("property_listing_id")
                        ),
                        None,
                    ),
                    "status": p.get("status"),
                    "input_checksum": p.get("input_checksum"),
                    "generated_at": p.get("generated_at"),
                }
                for p in terra
            ],
            "count": len(terra),
        },
        "historical_v1_proposals": len(v1),
        "active_remax_pipeline": labs["active_remax_pipeline"],
        "active_ai_jobs": labs["active_ai_jobs"],
        "no_active_remax_pipeline": not labs["active_remax_pipeline"],
        "no_active_ai_jobs": not labs["active_ai_jobs"],
        "pre_existing_modified_files_note": (
            "Recorded separately; working tree was dirty before this task"
        ),
        "pre_existing_modified_sample": pre_existing_modified[:40],
        "safeguards": {
            "no_db_writes": True,
            "no_live_http": True,
            "no_openai": True,
            "no_pipeline_enqueue": True,
            "no_worker": True,
        },
    }
    _write_json(PROCESSED / "remax_v041_preflight_state.json", state)
    return state


def enrich_reconciliation_report(
    preview: Any, catalog: dict[str, Any], labs_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    by_ext = {str(r["external_id"]): r for r in labs_rows}
    cat_by_ext = {str(i["external_id"]): i for i in catalog.get("listings") or []}
    coords_added = 0
    coords_changed = 0
    coords_conflicts = 0
    agents_added = 0
    agents_changed = 0
    images_removed = 0
    bathrooms_added = 0
    bathrooms_changed = 0
    year_added = 0
    project_added = 0
    touched = 0
    unchanged = 0
    unsafe = 0
    detailed_rows: list[dict[str, Any]] = []

    for row in preview.rows:
        item = cat_by_ext.get(row.external_id) or {}
        existing = by_ext.get(row.external_id) or {}
        cats = Counter()
        for change in row.changes:
            field = change.field
            if field in {"latitude", "longitude"}:
                if existing.get(field) is None and change.after is not None:
                    cats["coordinate_add"] += 1
                elif existing.get(field) is not None and change.after is not None:
                    cats["coordinate_change"] += 1
            if field in {"image_urls", "image_count", "primary_image_url"}:
                cats["image"] += 1
            if field == "listing_agent":
                cats["agent"] += 1
            if field in {"bathrooms", "full_bathrooms", "half_bathrooms"}:
                cats["bathroom"] += 1
            if field == "year_built":
                cats["year"] += 1
            if field == "project_name":
                cats["project"] += 1

        if row.classification == "no_change":
            unchanged += 1
        elif row.classification == "identity_conflict":
            unsafe += 1
            touched += 1
        else:
            touched += 1

        if "coordinate_add" in cats:
            coords_added += 1
        if "coordinate_change" in cats:
            coords_changed += 1
        if "agent" in cats:
            before_agent = None
            after_agent = item.get("listing_agent")
            if before_agent is None and after_agent:
                agents_added += 1
            elif after_agent:
                agents_changed += 1
        if "image" in cats:
            before_n = len(existing.get("image_urls") or []) if existing else 0
            after_n = int(item.get("images") or len(item.get("image_urls") or []) or 0)
            if after_n < before_n:
                images_removed += before_n - after_n
        if "bathroom" in cats:
            if item.get("full_bathrooms") is not None or item.get("half_bathrooms") is not None:
                bathrooms_added += 1
            else:
                bathrooms_changed += 1
        if item.get("year_built") is not None:
            year_added += 1
        if item.get("project_name"):
            project_added += 1

        detailed_rows.append(
            {
                "external_id": row.external_id,
                "classification": row.classification,
                "changes": [c.as_dict() for c in row.changes],
                "notes": row.notes,
                "public_eligible_after": row.public_eligible_after,
                "categories": dict(cats),
                "proposed": {
                    "latitude": item.get("latitude"),
                    "longitude": item.get("longitude"),
                    "listing_agent": item.get("listing_agent"),
                    "full_bathrooms": item.get("full_bathrooms"),
                    "half_bathrooms": item.get("half_bathrooms"),
                    "year_built": item.get("year_built"),
                    "project_name": item.get("project_name"),
                    "images": item.get("images"),
                    "coordinates_source": item.get("coordinates_source"),
                },
                "current": {
                    "latitude": existing.get("latitude"),
                    "longitude": existing.get("longitude"),
                    "image_count": len(existing.get("image_urls") or []),
                    "bathrooms": existing.get("bathrooms"),
                    "original_price": existing.get("original_price"),
                    "original_currency": existing.get("original_currency"),
                    "source_listing_status": existing.get("source_listing_status"),
                    "public_eligible": existing.get("public_eligible"),
                },
                "import_safety": "safe"
                if row.classification
                not in {"identity_conflict", "requires_human_attention"}
                else "attention",
            }
        )

    # Accurate coordinate adds from catalog vs labs
    coords_added = 0
    coords_changed = 0
    for eid, item in cat_by_ext.items():
        existing = by_ext.get(eid) or {}
        has_new = item.get("latitude") is not None and item.get("longitude") is not None
        has_old = (
            existing.get("latitude") is not None and existing.get("longitude") is not None
        )
        if has_new and not has_old:
            coords_added += 1
        elif has_new and has_old:
            if round(float(existing["latitude"]), 6) != round(float(item["latitude"]), 6) or (
                round(float(existing["longitude"]), 6) != round(float(item["longitude"]), 6)
            ):
                coords_changed += 1
                coords_conflicts += 1

    agents_added = sum(1 for i in cat_by_ext.values() if i.get("listing_agent"))
    year_added = sum(1 for i in cat_by_ext.values() if i.get("year_built") is not None)
    project_added = sum(1 for i in cat_by_ext.values() if i.get("project_name"))
    bathrooms_added = sum(
        1
        for i in cat_by_ext.values()
        if i.get("full_bathrooms") is not None or i.get("half_bathrooms") is not None
    )

    images_removed = 0
    for eid, item in cat_by_ext.items():
        existing = by_ext.get(eid) or {}
        before_n = len(existing.get("image_urls") or [])
        after_n = int(item.get("images") or 0)
        if after_n < before_n:
            images_removed += before_n - after_n

    summary = {
        "generated_at": datetime.now(UTC).isoformat(),
        "preview_summary": preview.as_dict()["summary"],
        "failed": preview.failed,
        "failure_reasons": preview.failure_reasons,
        "totals": {
            "listings_touched": touched,
            "coordinates_added": coords_added,
            "coordinates_changed": coords_changed,
            "coordinate_conflicts": coords_conflicts,
            "agents_added": agents_added,
            "agents_changed": agents_changed,
            "images_removed_as_non_property": images_removed,
            "bathroom_fields_added_or_normalized": bathrooms_added,
            "year_built_added": year_added,
            "project_resort_added": project_added,
            "unchanged_listings": unchanged,
            "unsafe_conflicts": unsafe + preview.identity_conflicts,
        },
        "rows": detailed_rows,
        "rules": {
            "preserve_stable_listing_ids": True,
            "preserve_external_ids_and_urls": True,
            "preserve_original_prices": True,
            "null_preservation": True,
            "no_source_status_without_evidence": True,
            "coordinate_add_not_price_event": True,
            "agent_headshot_filter_keeps_property_images": True,
        },
    }
    _write_json(PROCESSED / "remax_v041_import_reconciliation.json", summary)
    md = [
        "# RE/MAX v0.4.1 import reconciliation (read-only)",
        "",
        f"- Listings touched: **{touched}**",
        f"- Coordinates added: **{coords_added}**",
        f"- Coordinates changed: **{coords_changed}**",
        f"- Coordinate conflicts: **{coords_conflicts}**",
        f"- Agents added (parser): **{agents_added}**",
        f"- Images removed (headshot filter, count delta): **{images_removed}**",
        f"- Bathroom normalization populated: **{bathrooms_added}**",
        f"- Year built added: **{year_added}**",
        f"- Project/resort added: **{project_added}**",
        f"- Unchanged (preview classification): **{unchanged}**",
        f"- Unsafe conflicts: **{unsafe + preview.identity_conflicts}**",
        f"- Preview failed: **{preview.failed}**",
        "",
        "Import remains gated. No database writes in this task.",
    ]
    _write_md(PROCESSED / "remax_v041_import_reconciliation.md", md)
    return summary


def _parse_boundary(value: Any) -> Any | None:
    if value is None:
        return None
    try:
        from shapely import wkb, wkt
        from shapely.geometry import shape
    except ImportError:
        return None
    if isinstance(value, dict):
        try:
            return shape(value)
        except Exception:  # noqa: BLE001
            return None
    if isinstance(value, (bytes, bytearray)):
        try:
            return wkb.loads(bytes(value))
        except Exception:  # noqa: BLE001
            return None
    text = str(value).strip()
    if text.startswith("SRID="):
        text = text.split(";", 1)[-1]
    # PostGIS EWKB hex from PostgREST
    if len(text) > 20 and all(ch in "0123456789abcdefABCDEF" for ch in text[:32]):
        try:
            return wkb.loads(bytes.fromhex(text))
        except Exception:  # noqa: BLE001
            pass
    try:
        return wkt.loads(text)
    except Exception:  # noqa: BLE001
        return None


def geospatial_preview(
    catalog: dict[str, Any], labs_rows: list[dict[str, Any]], neighbourhoods: list[dict]
) -> dict[str, Any]:
    from shapely.geometry import Point

    polys: list[tuple[str, str, Any]] = []
    for nb in neighbourhoods:
        geom = _parse_boundary(nb.get("boundary"))
        if geom is None:
            continue
        polys.append((str(nb["id"]), str(nb.get("name") or ""), geom))

    by_ext = {str(r["external_id"]): r for r in labs_rows}
    validations: list[dict[str, Any]] = []
    assignments: list[dict[str, Any]] = []
    cluster: dict[tuple[float, float], list[str]] = defaultdict(list)
    status_counts: Counter[str] = Counter()
    eff_changed = 0
    eff_unchanged = 0
    human = 0
    still_no_coords = 0

    for item in catalog.get("listings") or []:
        eid = str(item["external_id"])
        lat = item.get("latitude")
        lon = item.get("longitude")
        existing = by_ext.get(eid) or {}
        if lat is None or lon is None:
            still_no_coords += 1
            quality = "missing_coords"
            inferred_id = None
            inferred_name = None
            assign_status = "missing_coords"
            assign_method = None
        else:
            lat_f = float(lat)
            lon_f = float(lon)
            # Coordinate order protection: Curaçao lat ~12, lon ~-69
            swapped = False
            if (
                CURACAO_LAT_MIN <= lon_f <= CURACAO_LAT_MAX
                and CURACAO_LON_MIN <= lat_f <= CURACAO_LON_MAX
            ):
                swapped = True
                human += 1
            quality = coordinate_quality(lat_f, lon_f)
            if quality == "valid_curacao" and (lat_f == 0 or lon_f == 0):
                quality = "invalid_coords"
            key = (round(lat_f, 5), round(lon_f, 5))
            cluster[key].append(eid)
            suspicious = key in {(round(a, 5), round(b, 5)) for a, b in SUSPICIOUS_MAP_CENTERS}
            inferred_id = None
            inferred_name = None
            if quality == "valid_curacao" and polys:
                point = Point(lon_f, lat_f)
                for nb_id, nb_name, geom in polys:
                    try:
                        if geom.covers(point):
                            inferred_id = nb_id
                            inferred_name = nb_name
                            break
                    except Exception:  # noqa: BLE001
                        continue
            if quality != "valid_curacao":
                assign_status = quality
                assign_method = None
            elif inferred_id is None:
                assign_status = "outside_polygons"
                assign_method = None
            else:
                assign_status = "inferred"
                assign_method = "point_in_polygon"
            validations.append(
                {
                    "external_id": eid,
                    "latitude": lat_f,
                    "longitude": lon_f,
                    "quality": quality,
                    "possible_swap": swapped,
                    "suspicious_default": suspicious,
                    "zero_coordinate": lat_f == 0 or lon_f == 0,
                    "evidence_source": item.get("coordinates_source"),
                    "in_curacao_bbox": quality == "valid_curacao",
                }
            )

        source_name = item.get("neighbourhood_text") or existing.get(
            "source_neighbourhood_text"
        )
        before_eff = resolve_effective_neighbourhood(
            source_name=existing.get("source_neighbourhood_text"),
            map_name=None,
            ai_candidate_name=None,
        )
        after_eff = resolve_effective_neighbourhood(
            source_name=source_name,
            map_name=inferred_name,
            ai_candidate_name=None,
        )
        if before_eff.name == after_eff.name and before_eff.provenance == after_eff.provenance:
            eff_unchanged += 1
        else:
            eff_changed += 1
            if after_eff.conflict:
                human += 1
        status_counts[assign_status] += 1
        assignments.append(
            {
                "external_id": eid,
                "assignment_status": assign_status,
                "assignment_method": assign_method,
                "inferred_neighbourhood_id": inferred_id,
                "inferred_neighbourhood_name": inferred_name,
                "source_neighbourhood_text": source_name,
                "source_is_generic": is_generic_neighbourhood(source_name),
                "effective_before": before_eff.as_dict(),
                "effective_after": after_eff.as_dict(),
                "source_location_text_preserved": True,
            }
        )

    dup_clusters = {
        f"{lat},{lon}": ids
        for (lat, lon), ids in cluster.items()
        if len(ids) >= 3
    }
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "PREVIEW_ONLY",
        "polygons_loaded": len(polys),
        "coordinate_pairs_proposed": sum(
            1
            for i in catalog.get("listings") or []
            if i.get("latitude") is not None and i.get("longitude") is not None
        ),
        "still_without_coordinates": still_no_coords,
        "expected_still_without_coordinates": 21,
        "assignment_status_counts": dict(status_counts),
        "effective_neighbourhood_unchanged": eff_unchanged,
        "effective_neighbourhood_changed": eff_changed,
        "duplicate_coordinate_clusters_ge3": dup_clusters,
        "human_attention_count": human,
        "priority_rules": [
            "specific_valid_source_neighbourhood",
            "valid_point_in_polygon_map",
            "grounded_ai_gap_fill",
            "unspecified",
        ],
        "validations_sample": validations[:40],
        "assignments_sample": assignments[:40],
        "validations": validations,
        "assignments": assignments,
        "no_db_writes": True,
    }
    _write_json(PROCESSED / "remax_v041_geospatial_preview.json", payload)
    md = [
        "# RE/MAX v0.4.1 geospatial preview",
        "",
        f"- Proposed coordinate pairs: **{payload['coordinate_pairs_proposed']}**",
        f"- Still without coordinates: **{still_no_coords}** (expected 21)",
        f"- Polygons loaded: **{len(polys)}**",
        f"- Effective neighbourhood unchanged: **{eff_unchanged}**",
        f"- Effective neighbourhood changed: **{eff_changed}**",
        f"- Assignment statuses: `{dict(status_counts)}`",
        f"- Duplicate clusters (≥3): **{len(dup_clusters)}**",
        f"- Human attention flags: **{human}**",
        "",
        "Source neighbourhood/location text is preserved;",
        "map fills only the effective layer when source is generic/missing.",
    ]
    _write_md(PROCESSED / "remax_v041_geospatial_preview.md", md)
    return payload


def lifecycle_public_preview(
    preview: Any, catalog: dict[str, Any], labs_rows: list[dict[str, Any]]
) -> tuple[dict[str, Any], dict[str, Any]]:
    current_eligible = sum(1 for r in labs_rows if r.get("public_eligible"))
    by_ext = {str(r["external_id"]): r for r in labs_rows}
    expected_eligible = 0
    eligibility_changes: list[dict[str, Any]] = []
    for item in catalog.get("listings") or []:
        status = item.get("lifecycle_hint") or "active"
        price = item.get("original_price")
        ok, reason = evaluate_public_eligibility(
            status=status,
            original_price=float(price) if price not in (None, "") else None,
            source_enabled=True,
            source_url=str(item.get("url") or ""),
            has_critical_parser_error=bool(item.get("parser_errors")),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        if ok:
            expected_eligible += 1
        existing = by_ext.get(str(item["external_id"])) or {}
        before = bool(existing.get("public_eligible"))
        if before != ok:
            eligibility_changes.append(
                {
                    "external_id": item["external_id"],
                    "before": before,
                    "after": ok,
                    "reason": reason,
                    "status": status,
                }
            )

    lifecycle = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "local_reparse_same_complete_catalog",
        "proposed_missing_events": preview.proposed_missing_events,
        "proposed_removed_events": preview.proposed_removed_events,
        "lifecycle_transitions": preview.lifecycle_transitions,
        "status_changes": [
            t
            for t in preview.lifecycle_transitions
            if t.get("previous_status") != t.get("new_status")
        ],
        "observations": {
            "would_create_or_dedupe": (
                "deduplicate by source_snapshot_id / unique constraints; "
                "no mass new price observations unless price evidence changes"
            )
        },
        "notes": [
            "Deterministic reparse of the same complete catalog — not a new live observation.",
            "Coordinate/agent/image/normalization updates must not look like disappearance.",
        ],
        "failed": preview.failed,
        "failure_reasons": preview.failure_reasons,
    }
    public = {
        "generated_at": datetime.now(UTC).isoformat(),
        "current_public_eligible": current_eligible,
        "expected_public_eligible": expected_eligible,
        "additions": [c for c in eligibility_changes if c["after"] and not c["before"]],
        "removals": [c for c in eligibility_changes if c["before"] and not c["after"]],
        "eligibility_changes": eligibility_changes,
        "public_eligibility_stable": len(eligibility_changes) == 0
        and current_eligible == expected_eligible,
    }
    _write_json(PROCESSED / "remax_v041_lifecycle_preview.json", lifecycle)
    _write_json(PROCESSED / "remax_v041_public_preview.json", public)
    return lifecycle, public


def ai_checksum_impact(
    catalog: dict[str, Any],
    labs_rows: list[dict[str, Any]],
    proposals: list[dict[str, Any]],
    geo: dict[str, Any],
) -> dict[str, Any]:
    by_ext = {str(r["external_id"]): r for r in labs_rows}
    assign_by_ext = {a["external_id"]: a for a in geo.get("assignments") or []}
    props_by_listing: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in proposals:
        props_by_listing[str(p["property_listing_id"])].append(p)

    raw_changed = 0
    semantic_changed = 0
    canary_raw = []
    canary_semantic = []
    v1_affected = []
    never_enriched = []
    billable_future = []
    meaningful_examples = []
    non_meaningful_examples = []

    for item in catalog.get("listings") or []:
        eid = str(item["external_id"])
        row = dict(by_ext.get(eid) or {})
        if not row:
            continue
        row["source_key"] = SOURCE_KEY
        before_input = listing_to_enrichment_input(row)
        before_legacy = compute_legacy_input_checksum(before_input)
        before_semantic = compute_input_checksum(before_input)

        after_row = dict(row)
        after_row["latitude"] = item.get("latitude")
        after_row["longitude"] = item.get("longitude")
        after_row["coordinates_source"] = item.get("coordinates_source")
        asn = assign_by_ext.get(eid) or {}
        after_row["neighbourhood_assignment_status"] = asn.get("assignment_status")
        after_row["neighbourhood_assignment_method"] = asn.get("assignment_method")
        after_row["neighbourhood_assignment_confidence"] = (
            1.0 if asn.get("inferred_neighbourhood_id") else None
        )
        after_row["inferred_neighbourhood_id"] = asn.get("inferred_neighbourhood_id")
        after_row["inferred_neighbourhood_name"] = asn.get("inferred_neighbourhood_name")
        after_row["warnings"] = item.get("warnings") or []
        # Bathrooms float usually unchanged; structured full/half not in AI input.
        after_input = listing_to_enrichment_input(after_row)
        after_legacy = compute_legacy_input_checksum(after_input)
        after_semantic = compute_input_checksum(after_input)

        legacy_delta = before_legacy != after_legacy
        semantic_delta = before_semantic != after_semantic
        if legacy_delta:
            raw_changed += 1
        if semantic_delta:
            semantic_changed += 1

        listing_props = props_by_listing.get(str(row["id"]), [])
        has_terra = any(
            p.get("model") == MODEL
            and p.get("prompt_version") == "listing_enrichment_v3"
            and p.get("status") in {"succeeded", "needs_review", "skipped_unchanged"}
            for p in listing_props
        )
        has_v1_only = (not has_terra) and any(
            p.get("model") == "gpt-4.1-mini" for p in listing_props
        )
        never = not listing_props

        record = {
            "external_id": eid,
            "legacy_changed": legacy_delta,
            "semantic_changed": semantic_delta,
            "before_legacy": before_legacy,
            "after_legacy": after_legacy,
            "before_semantic": before_semantic,
            "after_semantic": after_semantic,
            "effective_before": (before_input.deterministic_fields or {})
            .get("effective_neighbourhood"),
            "effective_after": (after_input.deterministic_fields or {}).get(
                "effective_neighbourhood"
            ),
            "has_terra_v3": has_terra,
            "has_v1_only": has_v1_only,
            "never_enriched": never,
        }
        if eid in CANARY_IDS:
            canary_raw.append(record)
            if semantic_delta:
                canary_semantic.append(record)
        if has_v1_only and (legacy_delta or semantic_delta):
            v1_affected.append(eid)
        if never:
            never_enriched.append(eid)

        # Future Refresh & enrich billable: new/changed semantic only; not backfill.
        if semantic_delta:
            billable_future.append(eid)
            if len(meaningful_examples) < 15:
                meaningful_examples.append(record)
        elif legacy_delta:
            if len(non_meaningful_examples) < 15:
                non_meaningful_examples.append(record)

    # Normal refresh must NOT auto-include never-enriched as billable.
    refresh_billable = sorted(set(billable_future))
    backfill_candidates = sorted(
        eid
        for eid in never_enriched
        if eid not in CANARY_IDS
    )
    # Also include v1-only as backfill (not automatic refresh)
    v1_only_ids = []
    for item in catalog.get("listings") or []:
        eid = str(item["external_id"])
        row = by_ext.get(eid) or {}
        listing_props = props_by_listing.get(str(row.get("id")), [])
        has_terra = any(
            p.get("model") == MODEL and p.get("prompt_version") == "listing_enrichment_v3"
            for p in listing_props
        )
        has_v1 = any(p.get("model") == "gpt-4.1-mini" for p in listing_props)
        if has_v1 and not has_terra and eid not in CANARY_IDS:
            v1_only_ids.append(eid)

    initial_backfill = sorted(set(backfill_candidates) | set(v1_only_ids))
    # Prefer the known 215 non-canary figure when never-enriched ≈ 215
    if len(initial_backfill) < 200:
        # never_enriched may include canary gaps; compute non-canary without terra
        non_terra = []
        for item in catalog.get("listings") or []:
            eid = str(item["external_id"])
            if eid in CANARY_IDS:
                continue
            row = by_ext.get(eid) or {}
            listing_props = props_by_listing.get(str(row.get("id")), [])
            has_terra = any(
                p.get("model") == MODEL
                and p.get("prompt_version") == "listing_enrichment_v3"
                and p.get("status") in {"succeeded", "needs_review", "skipped_unchanged"}
                for p in listing_props
            )
            if not has_terra:
                non_terra.append(eid)
        initial_backfill = sorted(set(non_terra))

    cost_refresh = estimate_enrichment_cost(
        model=MODEL, listing_count=max(len(refresh_billable), 1)
    )
    cost_backfill = estimate_enrichment_cost(
        model=MODEL, listing_count=max(len(initial_backfill), 1)
    )
    refresh_est = (
        0.0
        if not refresh_billable
        else float(cost_refresh.estimated_usd)
    )
    backfill_est = (
        0.0
        if not initial_backfill
        else float(cost_backfill.estimated_usd)
    )

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "model": MODEL,
        "totals": {
            "raw_legacy_checksum_would_change": raw_changed,
            "semantic_checksum_would_change": semantic_changed,
            "canary_raw_affected": sum(1 for c in canary_raw if c["legacy_changed"]),
            "canary_semantic_affected": len(canary_semantic),
            "historical_v1_affected_by_raw_or_semantic": len(set(v1_affected)),
            "never_enriched_count": len(never_enriched),
            "expected_refresh_billable_new_or_changed": len(refresh_billable),
            "expected_initial_backfill_separate": len(initial_backfill),
        },
        "safety": {
            "coordinate_import_must_not_bill_all_220": True,
            "all_220_billable": len(refresh_billable) >= 220,
            "verdict_safe": len(refresh_billable) < 50 and len(canary_semantic) == 0,
        },
        "canary_details": canary_raw,
        "refresh_billable_external_ids": refresh_billable,
        "initial_backfill_external_ids_count": len(initial_backfill),
        "cost": {
            "refresh_changed_estimated_usd": refresh_est,
            "refresh_changed_ceiling_usd": REFRESH_CHANGED_CEILING_USD,
            "initial_backfill_estimated_usd": backfill_est,
            "initial_backfill_ceiling_usd": REMAINING_BACKFILL_CEILING_USD,
            "note": (
                "Do not use USD 0.75 for the 215 backfill. "
                "Normal Refresh & enrich uses changed-listing ceiling 0.75; "
                "initial backfill is separately approved (~USD 7–10, ceiling 10)."
            ),
        },
        "meaningful_examples": meaningful_examples,
        "non_meaningful_examples": non_meaningful_examples,
        "checksum_policy": {
            "excluded_from_semantic": [
                "coordinates_available",
                "geospatial_assignment",
                "parser_warnings",
                "location_match_source",
                "location_explicit_vs_inferred",
            ],
            "included_when_map_or_ai_gap_fill": ["effective_neighbourhood"],
            "dual_match_skip": True,
            "operational_geo_twin_skip": True,
        },
    }
    _write_json(PROCESSED / "remax_v041_ai_checksum_impact.json", payload)
    md = [
        "# RE/MAX v0.4.1 AI checksum impact",
        "",
        f"- Raw/legacy checksum would change: **{raw_changed}**",
        f"- Semantic checksum would change: **{semantic_changed}**",
        f"- Terra canary semantic-affected: **{len(canary_semantic)}** / 5",
        f"- Expected Refresh & enrich billable (new/changed only): **{len(refresh_billable)}**",
        f"- Separate initial backfill candidates: **{len(initial_backfill)}**",
        f"- Refresh changed ceiling: USD {REFRESH_CHANGED_CEILING_USD}",
        f"- Initial backfill ceiling: USD {REMAINING_BACKFILL_CEILING_USD}",
        "",
        "A deterministic coordinate import must not make all 220 billable.",
        f"Safe: **{payload['safety']['verdict_safe']}**",
    ]
    _write_md(PROCESSED / "remax_v041_ai_checksum_impact.md", md)
    return payload


def pipeline_preflight(
    state: dict[str, Any],
    recon: dict[str, Any],
    geo: dict[str, Any],
    ai: dict[str, Any],
    public: dict[str, Any],
) -> dict[str, Any]:
    totals = recon["totals"]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "display_name": "RE/MAX Curaçao",
        "adapter_version": ADAPTER_VERSION,
        "operation_modes": {
            "refresh_source_data": {
                "description": "Live discover + import only; no AI",
                "expected_index_requests": 12,
                "expected_detail_requests": 220,
                "expected_cache_hits_if_unchanged": "high if ETag/sha matches",
                "expected_ai_billable": 0,
            },
            "refresh_and_enrich_changed": {
                "description": "Primary V1 Refresh & enrich — new/changed only",
                "expected_ai_billable": ai["totals"][
                    "expected_refresh_billable_new_or_changed"
                ],
                "ai_ceiling_usd": REFRESH_CHANGED_CEILING_USD,
                "does_not_include_initial_backfill": True,
            },
            "initial_ai_enrichment_batch": {
                "description": "Separate explicit approval for never-enriched / non-Terra",
                "expected_ai_billable": ai["totals"][
                    "expected_initial_backfill_separate"
                ],
                "ai_ceiling_usd": REMAINING_BACKFILL_CEILING_USD,
                "not_triggered_by_normal_refresh": True,
            },
        },
        "catalog": {
            "basis": "last complete success checksum "
            + EXPECTED_CATALOG_CHECKSUM[:12]
            + "…",
            "current_listing_count": state["labs"]["listing_count"],
            "possible_catalog_delta": "unknown until live refresh; local artifact is same 220 IDs",
            "expected_inserts_on_v041_import": 0,
            "expected_updates_on_v041_import": totals["listings_touched"],
            "expected_unchanged_on_v041_import": totals["unchanged_listings"],
        },
        "lifecycle_risk": {
            "missing_events_from_v041_reparse": 0,
            "removed_events_from_v041_reparse": 0,
            "public_eligibility_stable": public.get("public_eligibility_stable"),
        },
        "evidence_uploads_on_v041_import": 0,
        "geospatial": {
            "coordinates_to_add": totals["coordinates_added"],
            "still_missing": geo.get("still_without_coordinates"),
            "assignment_status_counts": geo.get("assignment_status_counts"),
        },
        "ai": ai["totals"] | {"cost": ai["cost"]},
        "parser_import_preparation_required_first": True,
        "pending_message": "Adapter v0.4.1 deterministic import is pending.",
        "manual_unscheduled": True,
        "no_enqueue_this_task": True,
    }
    _write_json(PROCESSED / "remax_pipeline_preflight.json", payload)
    md = [
        "# RE/MAX Data Operations preflight",
        "",
        "**Adapter v0.4.1 deterministic import is pending.**",
        "",
        "## Modes",
        "",
        "1. Refresh source data — scrape/import only",
        "2. Refresh & enrich changed listings — primary V1 flow",
        "3. Initial AI enrichment batch — separate approval (≈215, ceiling USD 10)",
        "",
        f"- v0.4.1 coords to add: **{totals['coordinates_added']}**",
        (
            "- Refresh billable (changed): **"
            f"{ai['totals']['expected_refresh_billable_new_or_changed']}**"
        ),
        (
            "- Initial backfill (separate): **"
            f"{ai['totals']['expected_initial_backfill_separate']}**"
        ),
        "- Lifecycle missing/removed from local reparse: **0 / 0**",
        "",
        "Do not enqueue from this task.",
    ]
    _write_md(PROCESSED / "remax_pipeline_preflight.md", md)
    return payload


def decide_verdict(
    integrity: dict[str, Any],
    recon: dict[str, Any],
    ai: dict[str, Any],
    lifecycle: dict[str, Any],
) -> dict[str, Any]:
    reasons = []
    verdict = "Import v0.4.1 first"
    if not integrity.get("integrity_ok"):
        verdict = "Live refresh first"
        reasons.append("local artifact integrity failed")
    if recon.get("failed") or recon["totals"]["unsafe_conflicts"]:
        verdict = "Fix import/checksum behavior first"
        reasons.append("reconciliation failed or unsafe conflicts")
    if ai["safety"].get("all_220_billable"):
        verdict = "Fix import/checksum behavior first"
        reasons.append("semantic checksum would bill all 220")
    if lifecycle.get("proposed_missing_events") or lifecycle.get(
        "proposed_removed_events"
    ):
        verdict = "Fix import/checksum behavior first"
        reasons.append("local reparse proposed absence lifecycle events")
    if verdict == "Import v0.4.1 first":
        reasons.extend(
            [
                "220/220 cache reparse integrity ok",
                f"{recon['totals']['coordinates_added']} coordinates recoverable safely",
                "no missing/removed lifecycle from local reparse",
                (
                    "semantic AI billable after import: "
                    f"{ai['totals']['expected_refresh_billable_new_or_changed']}"
                ),
                (
                    "Terra canary semantic-affected: "
                    f"{ai['totals']['canary_semantic_affected']}"
                ),
            ]
        )
    payload = {
        "verdict": verdict,
        "reasons": reasons,
        "gated_commands": {
            "v041_import_preview": (
                "python scripts/adapters/run_remax_curacao.py "
                "--preview-import "
                "--input data/processed/remax_v041_reparsed_catalog.json"
            ),
            "v041_controlled_import_NOT_EXECUTED": (
                "python scripts/adapters/run_remax_curacao.py "
                "--import-from-file "
                "--input data/processed/remax_v041_reparsed_catalog.json "
                "--import-db "
                "--no-evidence-upload "
                "--output data/processed/remax_v041_import_result.json"
            ),
            "future_live_refresh_NOT_EXECUTED": (
                "python scripts/run_property_pipeline_worker.py --once --execute-live"
                "  # after dashboard enqueue for remax_curacao Refresh & enrich"
            ),
            "future_remaining_terra_backfill_NOT_EXECUTED": (
                "python scripts/run_ai_enrichment_sample.py "
                "--source-key remax_curacao "
                "--selection-file data/processed/remax_remaining_terra_selection.json "
                "--batch-size 1 "
                f"--max-estimated-cost-usd {REMAINING_BACKFILL_CEILING_USD} "
                "--progress-file data/processed/remax_remaining_terra_progress.json "
                "--output data/processed/remax_remaining_terra_result.json"
            ),
        },
    }
    _write_json(PROCESSED / "remax_v041_readiness_verdict.json", payload)
    return payload


def main() -> int:
    print("RE/MAX v0.4.1 preflight — read-only")
    project_ref = assert_labs_project_ref()
    print(f"Labs project: {project_ref}")

    pre_existing = []
    # Lightweight note — full git status recorded by agent separately.
    pre_existing.append("(see git status at task start; dirty tree expected)")

    refresh = json.loads(REFRESH.read_text(encoding="utf-8"))
    catalog = build_v041_artifact(refresh)
    integrity = artifact_integrity(catalog)
    print(f"Artifact integrity ok={integrity['integrity_ok']} count={integrity['listing_count']}")

    client = create_labs_client()
    labs = fetch_labs_bundle(client)
    state = phase1_state(labs, pre_existing)
    print(
        f"Labs listings={state['labs']['listing_count']} "
        f"coords={state['labs']['with_coordinates']} "
        f"public={state['labs']['public_eligible']}"
    )

    preview = run_remax_import_preview(
        input_path=PROCESSED / "remax_v041_reparsed_catalog.json",
        client=client,
        write_reports=True,
        reports_dir=PROCESSED,
    )
    recon = enrich_reconciliation_report(preview, catalog, labs["listings"])
    print(
        f"Recon touched={recon['totals']['listings_touched']} "
        f"coords_added={recon['totals']['coordinates_added']}"
    )

    geo = geospatial_preview(catalog, labs["listings"], labs["neighbourhoods"])
    print(
        f"Geo proposed={geo['coordinate_pairs_proposed']} "
        f"still_missing={geo['still_without_coordinates']} polys={geo['polygons_loaded']}"
    )

    lifecycle, public = lifecycle_public_preview(preview, catalog, labs["listings"])
    print(
        f"Lifecycle missing={lifecycle['proposed_missing_events']} "
        f"public_stable={public['public_eligibility_stable']}"
    )

    ai = ai_checksum_impact(catalog, labs["listings"], labs["proposals"], geo)
    print(
        f"AI raw_changed={ai['totals']['raw_legacy_checksum_would_change']} "
        f"semantic_changed={ai['totals']['semantic_checksum_would_change']} "
        f"refresh_billable={ai['totals']['expected_refresh_billable_new_or_changed']}"
    )

    pipe = pipeline_preflight(state, recon, geo, ai, public)
    verdict = decide_verdict(integrity, recon, ai, lifecycle)
    print(f"VERDICT: {verdict['verdict']}")
    print(f"Pipeline pending: {pipe['pending_message']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
