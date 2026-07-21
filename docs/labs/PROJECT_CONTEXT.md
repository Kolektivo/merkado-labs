# Merkado Labs Project Context

Merkado production is a live Curaçao vehicle marketplace. Merkado Labs is a
completely separate experimental workspace.

## Current Labs focus

Active work is **direct-source property ingestion** for Curaçao:

- four Ready adapters: Keller Williams v0.3.1, RE/MAX v0.4.1, Moret v0.2.0,
  Monumentenzorg v0.2.0; Sotheby's BLOCKED (excluded from Ready pipelines);
  CHH retired/removed;
- property pipeline automation (orchestrator/worker/locks/anomaly/budgets/
  `change_hash`); **daily cron armed On**
  (`AUTOMATIC_REFRESH_ENABLED = true`) after 2026-07-21 supervised +
  idempotent gates; GHA schedule `0 10 * * *` UTC begins only when
  `property-pipeline-labs.yml` reaches the default branch;
  manual/dashboard dispatch available;
- AI enrichment **v5 / policy v5** (`listing_enrichment_v5` /
  `listing_enrichment_schema_v5` / `enrichment_policy_v5`); English-default
  public UI (`display_title` / `display_summary` / English description) with
  optional Dutch `display_description_nl` for About this property; scrapers
  preserve raw source title/description; AI never overwrites protected facts;
  human review exceptional / genuine conflicts only; deterministic
  Dutch↔English search synonyms; stable URLs `/browse/{uuid}`;
- one-time English presentation migration **applied** (historical; **289**
  listings; ~USD **7.83**; not rerun for bilingual work); Dutch description
  backfill **applied** via `scripts/migrate_dutch_descriptions.py` (**285**;
  ~USD **2.42**); unchanged bilingual hashes skip at zero cost;
- **Snapshot (2026-07-21 / tip `d2abb557`, Labs read-only):** total inventory
  **402**; `public_property_listings` **286**; EN/NL About-this-property on
  **283**; Remax deferred enrichment remainder **71** under the 25/day AI cap
  (counts change — see `01-live-product-state.md`);
- source-official currency: RE/MAX NAF cookie session; KW inline alts;
  official XCG precedence (hr2066 EUR 664 / Cg 1350 via
  `source_official_conversion`; listing currently inactive/rented);
- prior v4.2 quality pass retained (zero-cost rematerialization fixed point,
  image dedup at ingestion + frontend `listing-gallery-urls.ts`, presentation
  timeline, map vs neighbourhood-search gaps — see
  `PROPERTY_DATA_QUALITY_REPORT.md`);
- Labs public view `public_property_listings` + image galleries; Browse public
  preview (English-canonical product language + Dutch About toggle);
- Labs dashboard: ops + Data Operations + Enrichment review + prototypes
  (not read-only);
- geospatial neighbourhood boundaries and assignment.

The CaribbeanHouseHunt aggregator workflow is retired and removed from the active
repository. CHH-derived Labs rows were deleted on 2026-07-16. The verified local
rollback export remains under `data/processed/chh_cleanup_export/`.

Canonical current-state doc: `docs/01-live-product-state.md`.

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

Production Supabase (`jkrfyvukhhsapoivntms`) must never be accessed from this workspace.
