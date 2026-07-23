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
  idempotent gates; GHA schedule `0 4 * * *` UTC = 00:00 America/Curacao
  (06:00 Amsterdam during CEST / 05:00 Amsterdam during CET); first normal
  daily cron on default branch observed 2026-07-22 (run `29984863341`);
  manual/dashboard dispatch available;
- Labs admin native listing prototype (`/listings/new`, `listing_origin=manual`)
  with draft/publish lifecycle, Storage images, and User-provided Passport
  provenance — not production Auth seller accounts;
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
- **Current audit (2026-07-23):** 405 retained source listings / 283 public;
  385 priced with valid XCG provenance and 20 source no-price/public-excluded;
  public + internal Passport uses the filtered activity contract; 51 historical
  test-rate price observations remain stored but hidden;
- final synthetic cleanup exported full rollback payloads + SHA-256 manifest,
  then removed only the approved demo contract/asset, six dry-run pipeline
  parents, and one empty queued AI job. Search/Agent/15 Match Report fixtures
  remain for the guided-discovery demonstration;
- source-official currency: RE/MAX NAF cookie session; KW inline alts;
  official XCG precedence (hr2066 EUR 664 / Cg 1350 via
  `source_official_conversion`; listing currently inactive/rented);
- prior v4.2 quality pass retained (zero-cost rematerialization fixed point,
  image dedup at ingestion + frontend `listing-gallery-urls.ts`, presentation
  timeline, map vs neighbourhood-search gaps — see
  `PROPERTY_DATA_QUALITY_REPORT.md`);
- Labs public view `public_property_listings` + image galleries; Browse public
  preview (English-canonical product language + Dutch About toggle + filtered
  Passport history);
- Labs dashboard: ops + Data Operations + Enrichment review + native listing +
  What Fits Me/draft-review-edit-confirm/Agent prototypes (not read-only; no
  production billing/email/paywall);
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
