# Merkado Labs Project Context

Merkado production is a live Curaçao vehicle marketplace. Merkado Labs is a
completely separate experimental workspace.

## Current Labs focus

Active work is **direct-source property ingestion** for Curaçao:

- four Ready adapters: Keller Williams v0.3.1, RE/MAX v0.4.1, Moret v0.2.0,
  Monumentenzorg v0.2.0; Sotheby's BLOCKED (excluded from Ready pipelines);
  CHH retired/removed;
- property pipeline automation (orchestrator/worker/locks/anomaly/budgets/
  `change_hash`); daily cron temporarily Off; manual/dashboard dispatch available;
- AI enrichment v4 / v4.1 (`listing_enrichment_v4` /
  `listing_enrichment_schema_v4` / `enrichment_policy_v4_1`);
- Labs public-effective view + image galleries; Browse public preview;
- Labs dashboard: ops + Data Operations + Enrichment review + prototypes
  (not read-only);
- geospatial neighbourhood boundaries and assignment.

The CaribbeanHouseHunt aggregator workflow is retired and removed from the active
repository. CHH-derived Labs rows were deleted on 2026-07-16. The verified local
rollback export remains under `data/processed/chh_cleanup_export/`.

## What is built in this repository `[LABS]`

| Piece | Location |
|---|---|
| Property schema + RLS migrations | `supabase/migrations/` |
| Direct-source adapters | `src/merkado_labs/scrapers/` |
| Property pipeline | `src/merkado_labs/pipeline/`, `scripts/run_property_pipeline*.py` |
| Currency + eligibility helpers | `src/merkado_labs/normalization/` |
| Cleanup verification tooling (historical) | `scripts/cleanup/` |
| Geospatial import/assignment scripts | `scripts/geo/` |
| Labs dashboard (ops + browse + Data Ops) | `apps/labs-dashboard/` |

Canonical docs: `docs/01`–`09` and `docs/LABS_DASHBOARD_GUIDE.md`.

## Labs Supabase project

- Project name: `merkado-labs`
- Project reference: `csaefdkpwukshtouyixg`
- Region: `eu-west-3`
- Type: standalone project, separate from production

Production Supabase must never be accessed from this workspace.
