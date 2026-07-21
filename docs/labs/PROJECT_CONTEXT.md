# Merkado Labs Project Context

Merkado production is a live Curaçao vehicle marketplace. Merkado Labs is a
completely separate experimental workspace.

## Current Labs focus

Active work is **direct-source property ingestion** for Curaçao:

- four Ready adapters: Keller Williams v0.3.1, RE/MAX v0.4.1, Moret v0.2.0,
  Monumentenzorg v0.2.0; Sotheby's BLOCKED (excluded from Ready pipelines);
  CHH retired/removed;
- property pipeline automation (orchestrator/worker/locks/anomaly/budgets/
  `change_hash`); daily cron still Off until activation gates pass;
  manual/dashboard dispatch available;
- AI enrichment **v5 / policy v5** (`listing_enrichment_v5` /
  `listing_enrichment_schema_v5` / `enrichment_policy_v5`); English-only
  public presentation (`display_title` / `display_summary` / English
  description); scrapers preserve raw source title/description; AI never
  overwrites protected facts; human review exceptional / genuine conflicts
  only; deterministic Dutch↔English search synonyms; stable URLs
  `/browse/{uuid}`;
- one-time English presentation migration **applied** (job `69dff671…` +
  retries; **289** listings; exact ~USD **7.83**; post-run
  `selected_count=0` / `already_complete_count=289`); public view **285**
  with English `display_*`; daily cron still Off pending supervised pipeline
  gates;
- source-official currency: RE/MAX NAF cookie session; KW inline alts;
  official XCG precedence (hr2066 EUR 664 / Cg 1350 via
  `source_official_conversion`; listing currently inactive/rented);
- prior v4.2 quality pass retained (zero-cost rematerialization fixed point,
  image dedup, presentation timeline, map vs neighbourhood-search gaps — see
  `PROPERTY_DATA_QUALITY_REPORT.md`);
- Labs public-effective view + image galleries; Browse public preview
  (English product language);
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
