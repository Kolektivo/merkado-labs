"""Import verified Curaçao neighbourhood boundaries into Labs Supabase.

Source: Meteorological Department Curaçao (MDC) CLIMAAXKorsou Phase 2 foundation
dataset on Zenodo, containing CBS Census 2023 neighbourhood polygons.

Licence: CC-BY-4.0
DOI: https://doi.org/10.5281/zenodo.19273186

The script downloads the official zip when needed, validates geometries, rejects
non-Curaçao extents, and upserts by boundary_external_id without inventing names.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

from shapely import wkb
from shapely.geometry import MultiPolygon
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid

from merkado_labs.config import get_settings
from merkado_labs.geo import (
    BOUNDARY_DATASET_RECORD,
    BOUNDARY_GPKG_RELATIVE,
    BOUNDARY_LICENCE,
    BOUNDARY_SOURCE_NAME,
    BOUNDARY_SOURCE_URL,
    BOUNDARY_ZIP_NAME,
    CURACAO_LAT_MAX,
    CURACAO_LAT_MIN,
    CURACAO_LON_MAX,
    CURACAO_LON_MIN,
    LABS_PROJECT_REF,
    gpkg_blob_to_wkb,
    normalize_neighbourhood_name,
    title_case_neighbourhood,
    unique_slug,
    verify_labs_project,
)

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "geo" / "cache"
ZENODO_CONTENT_URL = (
    f"https://zenodo.org/api/records/{BOUNDARY_DATASET_RECORD}/files/"
    f"{BOUNDARY_ZIP_NAME}/content"
)


@dataclass(frozen=True)
class BoundaryFeature:
    external_id: str
    name: str
    normalized_name: str
    is_gap_zone: bool
    wkt: str
    bounds: tuple[float, float, float, float]


@dataclass
class ImportPlan:
    features: list[BoundaryFeature]
    rejected: list[str]
    existing_by_external_id: dict[str, dict[str, Any]]
    would_insert: int
    would_update: int
    would_skip: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and classify features without writing.",
    )
    parser.add_argument(
        "--gpkg",
        type=Path,
        default=None,
        help="Optional local path to neighbourhoods.gpkg (skips download).",
    )
    return parser.parse_args()


def ensure_gpkg(local_path: Path | None) -> Path:
    if local_path is not None:
        if not local_path.is_file():
            raise FileNotFoundError(f"GeoPackage not found: {local_path}")
        return local_path

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = CACHE_DIR / BOUNDARY_ZIP_NAME
    extract_root = CACHE_DIR / "05_foundation"
    gpkg_path = extract_root.joinpath(*BOUNDARY_GPKG_RELATIVE)

    if not gpkg_path.is_file():
        if not zip_path.is_file():
            print(f"Downloading {BOUNDARY_ZIP_NAME} from Zenodo…")
            urlretrieve(ZENODO_CONTENT_URL, zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(CACHE_DIR)

    if not gpkg_path.is_file():
        raise FileNotFoundError(f"Expected GeoPackage at {gpkg_path}")
    return gpkg_path


def to_multipolygon(geom: BaseGeometry) -> MultiPolygon:
    if geom.geom_type == "MultiPolygon":
        return geom  # type: ignore[return-value]
    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])
    if geom.geom_type == "GeometryCollection":
        polygons = [part for part in geom.geoms if part.geom_type == "Polygon"]
        multipolygons = [
            part for part in geom.geoms if part.geom_type == "MultiPolygon"
        ]
        for multi in multipolygons:
            polygons.extend(list(multi.geoms))
        if polygons:
            return MultiPolygon(polygons)
    raise ValueError(f"Unsupported geometry type {geom.geom_type}")


def validate_curacao_bounds(geom: BaseGeometry) -> None:
    minx, miny, maxx, maxy = geom.bounds
    if (
        miny < CURACAO_LAT_MIN - 0.2
        or maxy > CURACAO_LAT_MAX + 0.2
        or minx < CURACAO_LON_MIN - 0.2
        or maxx > CURACAO_LON_MAX + 0.2
    ):
        raise ValueError(
            f"Geometry bounds {(minx, miny, maxx, maxy)} fall outside Curaçao guard box."
        )


def load_features(gpkg_path: Path) -> tuple[list[BoundaryFeature], list[str]]:
    features: list[BoundaryFeature] = []
    rejected: list[str] = []
    con = sqlite3.connect(gpkg_path)
    rows = con.execute(
        "SELECT fid, id, name, source, geom FROM neighbourhoods ORDER BY fid"
    ).fetchall()
    con.close()

    for fid, raw_id, raw_name, source, geom_blob in rows:
        label = f"{fid}:{raw_name}"
        try:
            if raw_name is None or not str(raw_name).strip():
                raise ValueError("Missing neighbourhood name.")
            if source not in {"neighbourhood", "geozone_gap"}:
                raise ValueError(f"Unexpected source value {source!r}.")
            if geom_blob is None:
                raise ValueError("Missing geometry.")

            geom = wkb.loads(gpkg_blob_to_wkb(geom_blob))
            if not geom.is_valid:
                geom = make_valid(geom)
            multipoly = to_multipolygon(geom)
            if multipoly.is_empty:
                raise ValueError("Empty geometry after validation.")
            if not multipoly.is_valid:
                raise ValueError("Geometry remains invalid after make_valid.")
            validate_curacao_bounds(multipoly)

            display_name = title_case_neighbourhood(str(raw_name))
            if raw_id is None:
                external_id = f"gap-{int(fid)}"
            elif float(raw_id).is_integer():
                external_id = str(int(raw_id))
            else:
                external_id = str(raw_id)
            is_gap_zone = source == "geozone_gap"
            normalized = normalize_neighbourhood_name(display_name)
            # normalized_name is unique. Gap zones can share CBS display names with
            # inhabited neighbourhoods, so keep the display name and disambiguate
            # the normalized key with the stable external id.
            if is_gap_zone:
                normalized = f"{normalized}::gap::{external_id}"
            features.append(
                BoundaryFeature(
                    external_id=external_id,
                    name=display_name,
                    normalized_name=normalized,
                    is_gap_zone=is_gap_zone,
                    wkt=multipoly.wkt,
                    bounds=multipoly.bounds,
                )
            )
        except Exception as exc:  # noqa: BLE001 - collect per-feature rejections
            rejected.append(f"{label}: {exc}")

    return features, rejected


def load_existing(client: Any) -> dict[str, dict[str, Any]]:
    response = (
        client.table("neighbourhoods")
        .select(
            "id,name,normalized_name,slug,boundary_external_id,"
            "is_gap_zone,boundary_source_name"
        )
        .not_.is_("boundary_external_id", "null")
        .execute()
    )
    return {
        row["boundary_external_id"]: row
        for row in (response.data or [])
        if row.get("boundary_external_id")
    }


def load_used_slugs(client: Any) -> set[str]:
    response = client.table("neighbourhoods").select("slug").execute()
    return {row["slug"] for row in (response.data or [])}


def plan_import(client: Any, features: list[BoundaryFeature], rejected: list[str]) -> ImportPlan:
    existing = load_existing(client)
    would_insert = 0
    would_update = 0
    would_skip = 0
    for feature in features:
        current = existing.get(feature.external_id)
        if current is None:
            would_insert += 1
        elif (
            current.get("name") == feature.name
            and current.get("normalized_name") == feature.normalized_name
            and bool(current.get("is_gap_zone")) == feature.is_gap_zone
            and current.get("boundary_source_name") == BOUNDARY_SOURCE_NAME
        ):
            would_skip += 1
        else:
            would_update += 1
    return ImportPlan(
        features=features,
        rejected=rejected,
        existing_by_external_id=existing,
        would_insert=would_insert,
        would_update=would_update,
        would_skip=would_skip,
    )


def apply_import(client: Any, plan: ImportPlan) -> dict[str, int]:
    used_slugs = load_used_slugs(client)
    # Preserve existing slugs for rows we will update.
    for row in plan.existing_by_external_id.values():
        used_slugs.add(row["slug"])

    imported_at = datetime.now(UTC).isoformat()
    inserted = 0
    updated = 0
    skipped = 0

    for feature in plan.features:
        existing = plan.existing_by_external_id.get(feature.external_id)
        payload = {
            "name": feature.name,
            "normalized_name": feature.normalized_name,
            "is_gap_zone": feature.is_gap_zone,
            "boundary": f"SRID=4326;{feature.wkt}",
            "boundary_source_name": BOUNDARY_SOURCE_NAME,
            "boundary_source_url": BOUNDARY_SOURCE_URL,
            "boundary_licence": BOUNDARY_LICENCE,
            "boundary_imported_at": imported_at,
            "boundary_external_id": feature.external_id,
        }

        if existing is None:
            matched = None
            # Attach non-gap CBS polygons onto an existing source neighbourhood
            # with the same normalized display name when it has no boundary yet.
            # Never attach gap-zone geometry onto source neighbourhood rows.
            if not feature.is_gap_zone:
                source_normalized = normalize_neighbourhood_name(feature.name)
                match = (
                    client.table("neighbourhoods")
                    .select("id,slug,boundary_external_id")
                    .eq("normalized_name", source_normalized)
                    .is_("boundary_external_id", "null")
                    .limit(1)
                    .execute()
                )
                matched = (match.data or [None])[0]
            if matched:
                response = (
                    client.table("neighbourhoods")
                    .update(payload)
                    .eq("id", matched["id"])
                    .execute()
                )
                if not response.data:
                    raise RuntimeError(
                        f"Failed to attach boundary to neighbourhood {matched['id']}."
                    )
                updated += 1
            else:
                insert_payload = {
                    **payload,
                    "slug": unique_slug(
                        feature.name, feature.normalized_name, used_slugs
                    ),
                }
                # Avoid colliding with an existing source neighbourhood slug/name
                # when CBS introduces a new official zone.
                if not feature.is_gap_zone:
                    clash = (
                        client.table("neighbourhoods")
                        .select("id")
                        .eq(
                            "normalized_name",
                            normalize_neighbourhood_name(feature.name),
                        )
                        .limit(1)
                        .execute()
                    )
                    if clash.data:
                        insert_payload["normalized_name"] = (
                            f"{normalize_neighbourhood_name(feature.name)}"
                            f"::cbs::{feature.external_id}"
                        )
                response = (
                    client.table("neighbourhoods").insert(insert_payload).execute()
                )
                if not response.data:
                    raise RuntimeError(
                        f"Failed to insert neighbourhood {feature.external_id}."
                    )
                inserted += 1
            continue

        if (
            existing.get("name") == feature.name
            and existing.get("normalized_name") == feature.normalized_name
            and bool(existing.get("is_gap_zone")) == feature.is_gap_zone
            and existing.get("boundary_source_name") == BOUNDARY_SOURCE_NAME
        ):
            # Still refresh geometry and provenance timestamps for idempotent reruns
            # that previously skipped after an interrupted import.
            response = (
                client.table("neighbourhoods")
                .update(payload)
                .eq("id", existing["id"])
                .execute()
            )
            if not response.data:
                raise RuntimeError(
                    f"Failed to refresh boundary for neighbourhood {existing['id']}."
                )
            skipped += 1
            continue

        response = (
            client.table("neighbourhoods")
            .update(payload)
            .eq("id", existing["id"])
            .execute()
        )
        if not response.data:
            raise RuntimeError(
                f"Failed to update neighbourhood {existing['id']}."
            )
        updated += 1

    return {"inserted": inserted, "updated": updated, "refreshed_unchanged": skipped}


def main() -> int:
    args = parse_args()
    settings = get_settings()
    url = verify_labs_project(settings)
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for boundary import.")

    gpkg_path = ensure_gpkg(args.gpkg)
    features, rejected = load_features(gpkg_path)
    if not features:
        raise RuntimeError("No valid boundary features were loaded.")

    from supabase import create_client

    client = create_client(url, settings.supabase_secret_key.get_secret_value())
    plan = plan_import(client, features, rejected)

    summary = {
        "project_ref": LABS_PROJECT_REF,
        "source_name": BOUNDARY_SOURCE_NAME,
        "source_url": BOUNDARY_SOURCE_URL,
        "licence": BOUNDARY_LICENCE,
        "gpkg": str(gpkg_path),
        "valid_features": len(features),
        "neighbourhood_polygons": sum(1 for f in features if not f.is_gap_zone),
        "gap_polygons": sum(1 for f in features if f.is_gap_zone),
        "rejected": len(rejected),
        "would_insert": plan.would_insert,
        "would_update": plan.would_update,
        "would_skip": plan.would_skip,
        "rejected_samples": rejected[:10],
    }

    if args.dry_run:
        print(json.dumps({"mode": "dry-run", **summary}, indent=2))
        return 0

    applied = apply_import(client, plan)
    print(json.dumps({"mode": "apply", **summary, **applied}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
