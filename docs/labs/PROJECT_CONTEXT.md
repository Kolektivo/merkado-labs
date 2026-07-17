# Merkado Labs Project Context

Merkado production is a live Curaçao vehicle marketplace. Merkado Labs is a
completely separate experimental workspace.

## Current Labs focus

Active work is **direct-source property ingestion** for Curaçao:

- approved sources: Keller Williams, Sotheby's, RE/MAX, Moret, Monumentenzorg;
- source-neutral adapters under `src/merkado_labs/scrapers/`;
- Labs Supabase property foundation, source-run health, and activity events;
- geospatial neighbourhood boundaries and assignment;
- a read-only Next.js Labs dashboard for inspection.

The CaribbeanHouseHunt aggregator workflow is retired and removed from the active
repository. CHH-derived Labs rows were deleted on 2026-07-16. The verified local
rollback export remains under `data/processed/chh_cleanup_export/`. RE/MAX Curaçao
is the first direct-source adapter; the first complete manual Labs catalog import
completed on 2026-07-16 and remains unscheduled.

## What is built in this repository `[LABS]`

| Piece | Location |
|---|---|
| Property schema + RLS migrations | `supabase/migrations/` |
| Direct-source adapters | `src/merkado_labs/scrapers/` |
| Currency + eligibility helpers | `src/merkado_labs/normalization/` |
| Cleanup verification tooling (historical) | `scripts/cleanup/` |
| Geospatial import/assignment scripts | `scripts/geo/` |
| Read-only Labs dashboard | `apps/labs-dashboard/` |

Canonical docs: `docs/01`–`09`.

## Labs Supabase project

- Project name: `merkado-labs`
- Project reference: `csaefdkpwukshtouyixg`
- Region: `eu-west-3`
- Type: standalone project, separate from production

Production Supabase must never be accessed from this workspace.
