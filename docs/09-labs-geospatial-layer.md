# Labs geospatial architecture

This document describes the first geographic layer for Merkado Labs property
data. It applies only to Supabase project `csaefdkpwukshtouyixg`.

**Status:** `[LABS]` built — PostGIS columns, boundary import, assignment RPCs,
coordinate audit script, and dashboard `/map` + `/data-quality` consumers.

## Principles

- Latitude and longitude on `property_listings` remain the source fields.
- PostGIS stores derived geography for spatial queries.
- Source-provided `neighbourhood_id` is never silently overwritten.
- Polygon matches are stored on `inferred_neighbourhood_id` with an explicit
  assignment status and method.
- Bounding-box checks are a guard only. Point-in-polygon assignment is
  authoritative.

## Schema additions

### `neighbourhoods`

- `boundary` — `geography(MultiPolygon, 4326)`
- `boundary_source_name`, `boundary_source_url`, `boundary_licence`,
  `boundary_imported_at`, `boundary_external_id`
- `is_gap_zone` — uninhabited CBS gap polygons excluded from assignment

### `property_listings`

- `location` — generated geography point from latitude/longitude
- `inferred_neighbourhood_id`
- `neighbourhood_assignment_status`
- `neighbourhood_assignment_method`
- `neighbourhood_assigned_at`
- `neighbourhood_assignment_confidence`

## Boundary dataset

Source: Meteorological Department Curaçao (MDC), CLIMAAXKorsou Phase 2
foundation spatial data on Zenodo.

- DOI: https://doi.org/10.5281/zenodo.19273186
- Licence: CC-BY-4.0
- Contents: 315 CBS Census 2023 neighbourhood polygons + 51 gap zones

Import tooling downloads and validates the GeoPackage, then upserts by
`boundary_external_id`.

## Assignment model

Statuses:

| Status | Meaning |
| --- | --- |
| `inferred` | No source neighbourhood; polygon match stored |
| `matched` | Source and polygon neighbourhood ids agree |
| `conflict` | Source and polygon differ; both retained |
| `outside_polygons` | Valid Curaçao point outside inhabited polygons |
| `missing_coords` / `invalid_coords` / `outside_curacao` | Coordinate quality failures |

Functions (service role only):

- `preview_listing_neighbourhood_assignments()`
- `summarize_listing_neighbourhood_assignments()`
- `apply_listing_neighbourhood_assignments()`

## Operations

Neighbourhood assignment runs **automatically** after every CHH import
(`import_supabase.py`) and again as an explicit step in
`.github/workflows/chh-daily-harvest.yml`. New harvests should not leave
listings stuck on `unprocessed` / “Not checked yet”.

Manual dry-run or re-apply is still available when needed:

Install the optional geo extra from the repo root when needed:

```powershell
.\.venv\Scripts\pip.exe install -e ".[geo]"
$env:PYTHONPATH = "src"
```

Dry-run and apply (Labs secret key + project ref required for writes):

```powershell
.\.venv\Scripts\python.exe scripts/geo/audit_coordinates.py
.\.venv\Scripts\python.exe scripts/geo/import_neighbourhood_boundaries.py --dry-run
.\.venv\Scripts\python.exe scripts/geo/import_neighbourhood_boundaries.py
.\.venv\Scripts\python.exe scripts/geo/assign_neighbourhoods.py --dry-run
.\.venv\Scripts\python.exe scripts/geo/assign_neighbourhoods.py --apply
```

Package helpers live in `src/merkado_labs/geo/`. Downloaded GeoPackage cache
belongs under `data/geo/cache/` (gitignored).

## Dashboard map

Route `/map` loads a slim marker payload, clusters with MapLibre, and opens a
Sheet for listing details. Filters reuse shared listing filter parsing with
coordinate-quality and assignment-status dimensions. `/data-quality` summarizes
coordinate and assignment coverage. Leave `NEXT_PUBLIC_MAP_STYLE_URL` unset for
local OSM raster tiles; use a hosted MapLibre style for any shared/production
Labs deployment.

## Reverse geocoding

Optional server-only provider under
`apps/labs-dashboard/src/lib/geo/reverse-geocode.ts`. Disabled unless
configured. Cached, rate-limited, never called during normal rendering, and
never treated as the neighbourhood authority.

## Rollback

Do not edit applied migrations. Create a new forward migration that:

1. Drops assignment functions
2. Drops geospatial indexes
3. Drops added columns
4. Optionally drops the PostGIS extension only if nothing else depends on it

Clearing inferred assignment fields alone is a safer data-only rollback than
dropping PostGIS.
