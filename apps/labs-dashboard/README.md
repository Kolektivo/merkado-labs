# Merkado Labs Dashboard

A standalone, read-only Next.js application for exploring normalized property
listing data in the isolated Merkado Labs Supabase project. It is an internal
analytics surface, not the live Merkado product.

Direct-source adapters (RE/MAX first) are the active ingestion path.
Retired aggregator rows are excluded from default dashboard views until the
reviewed Labs cleanup runs.

## Requirements

- Node.js 20.9 or newer
- npm
- Read access to Labs Supabase project `csaefdkpwukshtouyixg`

## Install and run

From this directory:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Quality checks:

```powershell
npm run lint
npm run typecheck
npm run build
```

## Environment variables

Browser-safe variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_MAP_STYLE_URL
NEXT_PUBLIC_MAP_ATTRIBUTION
```

`NEXT_PUBLIC_SUPABASE_URL` must be exactly
`https://csaefdkpwukshtouyixg.supabase.co`. The application refuses any other
Supabase host.

Optional map style:

- Leave `NEXT_PUBLIC_MAP_STYLE_URL` unset for local development. The map then
  uses attributed OpenStreetMap raster tiles.
- For production, set `NEXT_PUBLIC_MAP_STYLE_URL` to a hosted provider such as
  MapTiler. Do not rely on public demo tile services in production.

Optional server-only reverse geocoding (disabled by default, never used during
normal page rendering):

```text
REVERSE_GEOCODE_ENABLED
REVERSE_GEOCODE_ENDPOINT
REVERSE_GEOCODE_API_KEY
REVERSE_GEOCODE_MIN_INTERVAL_MS
```

Never expose `SUPABASE_SECRET_KEY`, a service-role credential, or production
credentials to the browser (`NEXT_PUBLIC_*`). Do not commit `.env.local`.

Admin AI enrichment routes (`/api/enrichment/*`) require server-only
`LABS_ADMIN_SECRET` plus Labs `SUPABASE_SECRET_KEY` (project
`csaefdkpwukshtouyixg` only). OpenAI stays in Python via
`scripts/run_ai_enrichment.py`.

## Routes

- `/` — dataset metrics, neighbourhood distribution, XCG price distribution,
  and recently observed listings
- `/listings` — searchable, sortable, paginated listings with currency-safe
  price filters plus coordinate and assignment filters
- `/enrichment` — admin-gated AI enrichment control panel (preview + jobs)
- `/listings/[id]` — overview / source / AI enrichment / evidence / timeline tabs
- `/map` — MapLibre map of listings with valid Curaçao coordinates, clustering,
  filters, and marker detail sheet
- `/neighbourhoods` — listing coverage and currency-separated price summaries
  with data-quality warnings
- `/sources` — source registry and direct-source adapter catalog (manual/planned)
- `/data-quality` — geographic coordinate and neighbourhood assignment overview
- `/how-it-works` — static guide of harvest → snapshot → Labs DB → dashboard flow

## Geographic architecture

See `docs/09-labs-geospatial-layer.md` in the repository root.

Summary:

- Source lat/lng fields are preserved.
- PostGIS stores generated listing points and neighbourhood multipolygons.
- Source `neighbourhood_id` is never silently overwritten.
- Inferred polygon matches live on `inferred_neighbourhood_id` with explicit
  status/method/timestamp metadata.

### Boundary dataset and licence

- Source: Meteorological Department Curaçao (MDC) CLIMAAXKorsou Phase 2
- DOI: https://doi.org/10.5281/zenodo.19273186
- Licence: CC-BY-4.0
- Contents: 315 CBS Census 2023 neighbourhoods + 51 gap zones

### Dry-run and import commands

From the repository root, with Labs env vars loaded and `PYTHONPATH=src`:

```powershell
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe scripts/geo/audit_coordinates.py
.\.venv\Scripts\python.exe scripts/geo/import_neighbourhood_boundaries.py --dry-run
.\.venv\Scripts\python.exe scripts/geo/import_neighbourhood_boundaries.py
.\.venv\Scripts\python.exe scripts/geo/assign_neighbourhoods.py --dry-run
.\.venv\Scripts\python.exe scripts/geo/assign_neighbourhoods.py --apply
```

Install the optional geo extra when needed:

```powershell
.\.venv\Scripts\pip.exe install -e ".[geo]"
```

Remote writes require `SUPABASE_PROJECT_REF=csaefdkpwukshtouyixg` and a Labs
secret key. The scripts refuse any other project.

### Data-quality statuses

- Missing / invalid / outside-Curaçao coordinates
- Source neighbourhood present
- Geographically inferred neighbourhood
- Source matches geography
- Source / geography conflict
- Outside known neighbourhood polygons

## Read-only security model

The application creates a Supabase client with only the publishable key and
relies on the existing anonymous SELECT policies. Data access is isolated under
`src/lib/data`; components do not query Supabase directly.

The dashboard reads only:

- `property_listings`
- `property_sources` through the listing relationship
- `neighbourhoods` through the listing relationship
- `price_observations`

It does not expose `listing_observations`, `ingestion_quarantine`, rental
contracts, contract assessments, raw payloads, or private evidence. There are
no mutation routes, Server Actions, import controls, admin controls, or
database write methods. If Supabase is unavailable, the UI shows an error
state instead of fabricated or local fallback records.

Price calculations never mix currencies. Overview distribution uses positive
XCG values only. Neighbourhood summaries select one currency, disclose mixed
currency groups, require at least three prices for a median, and require at
least two valid positive price/area pairs for average price per square metre.

## Production tile-provider recommendation

Use a hosted MapLibre-compatible style (for example MapTiler) via
`NEXT_PUBLIC_MAP_STYLE_URL`. Public OSM raster tiles are acceptable for local
Labs development and attribution must remain visible, but they are not suitable
as a production tile dependency.

## Rollback approach

Do not edit or delete applied migrations. Create a new forward migration that
drops assignment functions, geospatial indexes, and added columns in dependency
order. Prefer clearing inferred assignment fields for a data-only rollback.

## Deploy as a separate Vercel project

Deployment is intentionally separate from the Python workspace:

1. Import this repository as a new Vercel project.
2. Set **Root Directory** to `apps/labs-dashboard`.
3. Keep the detected Next.js framework and npm build settings.
4. Add the two required `NEXT_PUBLIC_` Labs variables to the intended environments.
5. Optionally add map style variables for production tiles.
6. Confirm the URL points to project `csaefdkpwukshtouyixg`.
7. Deploy only after explicit repository-owner approval.

Do not link this directory to the production Merkado Vercel project and do not
deploy it from the repository without explicit approval.
