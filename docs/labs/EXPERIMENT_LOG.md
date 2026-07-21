# Experiment log

> **Archive:** This file is historical. Current Labs ops and inventory live in
> `docs/01-live-product-state.md` and `docs/09-project-safety-and-history.md`.

Living log of Labs experiments. Newest first.

> **Note (2026-07-16):** CaribbeanHouseHunt is retired. Experiment trees,
> harvest workflow, and active importer code were removed from the repository.
> Entries below that reference CHH paths are historical only. Current work is
> the direct-source foundation (see `docs/01`–`09` and `scripts/cleanup/`).

---

## 2026-07-16 — RE/MAX BonBini controlled enrichment adapter `[LABS]`

### Goal

Prove whether visiting an original realtor listing can safely add useful fields
that CaribbeanHouseHunt does not provide.

### Method

- Selected `www.realestate-curacao.com` after robots + labelled-HTML probe.
- Built deterministic `remax_bonbini` adapter (max 5 listings, cache, rate limit).
- Added `listing_enrichment_observations` migration; reuse `listing_field_conflicts`.
- Dashboard comparison at `/enrichment`.

### Result

5/5 fetches succeeded. Bathrooms, gated resort, furnished, listing references,
and lot/living areas with units were extracted. 17 enrichments, 12 matches,
4 conflicts (mainly CHH lot_area unit-unknown vs realtor sq ft). No CHH listing
values overwritten.

### Decision

**Continue only for this domain** — expand the RE/MAX sample carefully before
adding a second adapter. Lot-area conflicts confirm CHH units must stay unverified.

### Next step

Grow the RE/MAX sample (still capped) and review conflict UX; only then consider
At Home or Moret as a second adapter.

---

## 2026-07-16 — CHH richer harvest + realtor attribution `[LABS]`

### Goal

Capture original realtor attribution and richer CHH fields, prepare a safe
per-domain enrichment PoC, and surface source-chain quality in the Labs dashboard.

### Method

- Audited bulk payload vs normalized index (`docs/labs/CHH_RICHER_HARVEST_AUDIT.md`).
- Snapshot extractor bumped to `0.3.0` with provenance-aware normalized fields.
- Forward-only migration `20260716120000_enrich_chh_listing_attribution.sql`.
- Importer backfills from raw evidence so older 0.2 snapshots remain importable.
- Robots-only realtor enrichment PoC (`experiments/.../realtor_enrichment/`).
- Dashboard realtor filter/column, `/realtors`, source chain, amenities, completeness.

### Result

Realtor name/domain/URL attribution is available for 100% of the current CHH
snapshot (1,449/1,449). Original listing-page HTML enrichment is intentionally
not implemented yet; robots audit marks several domains eligible for a future
reviewed adapter.

### Decision

Keep CaribbeanHouseHunt as aggregator source only. Do not auto-merge multi-realtor
listings into assets. Do not invent labels for unlabeled amenity codes. Do not
claim `lot_area` units.

### Next step

Implement one reviewed domain adapter for a robots-allowed realtor and compare
fields against CHH via `listing_field_conflicts` before wider enrichment.

---

## 2026-07 — CaribbeanHouseHunt full snapshot harvest `[LABS]`

### Goal

Move from a controlled 12-listing sample to a reproducible full CHH snapshot that can be
imported into Labs Supabase and refreshed on a schedule.

### Method

- Reconnaissance of the public CHH map surface (`experiments/caribbeanhousehunt_recon/`).
- Immutable snapshot writer (`create_snapshot.py`) producing dated snapshot folders.
- Snapshot comparison (`compare_snapshots.py`) for identity/stability checks.
- Labs importer (`import_supabase.py`) gated to project `csaefdkpwukshtouyixg` and accepting
  full-catalog snapshots whose size may change day to day (minimum floor enforced).
- Daily GitHub Action `.github/workflows/chh-daily-harvest.yml` (Labs secrets only).

### Result

Full-snapshot harvest and Labs import path are in place. Source identifiers remain
`provisional` until longer-run reuse evidence is reviewed. Catalog size has already
moved (e.g. 1,449 → 1,419), so the importer no longer pins an exact count.

### Decision

Treat each complete full-catalog snapshot as the import contract, with internal
consistency checks and a minimum size floor. Keep the early 12-listing sample as
historical evidence only; do not use it for the importer.

### Next step

Keep daily harvest healthy; review quarantine and external-id stability over successive runs.

---

## 2026-07 — Labs property foundation + market signals `[LABS]`

### Goal

Stand up an isolated property schema that can hold harvested listings, observations, market
signals, and a pilot rental-contract assessment without touching production.

### Method

Reviewed migrations under `supabase/migrations/` for foundation tables, RLS, monthly rent
signals, neighbourhood aliases, and rental contract assessments. Supporting scripts under
`experiments/caribbeanhousehunt_sample/` calculate signals and assess a pilot contract.

### Result

Labs schema and scripts support the intelligence-layer MVP entities in Supabase. Canonical
`property_assets` linking is still a separate reviewed process (import does not auto-merge).

### Decision

Keep Labs as the implementation ground for the intelligence-layer foundation before any
production Merkado property UI work.

---

## 2026-07 — Geospatial neighbourhood layer `[LABS]`

### Goal

Add trustworthy geography without silently overwriting source neighbourhood labels.

### Method

- Import MDC CLIMAAXKorsou Phase 2 neighbourhood GeoPackage (CC-BY-4.0) via
  `scripts/geo/import_neighbourhood_boundaries.py`.
- PostGIS location + assignment columns/functions (migrations `20260715194000` /
  `20260715194500`).
- Assignment via `scripts/geo/assign_neighbourhoods.py` (`--dry-run` / `--apply`).

### Result

Source `neighbourhood_id` is preserved; inferred matches live on
`inferred_neighbourhood_id` with status/method/timestamp metadata. Dashboard `/map` and
`/data-quality` surfaces consume this layer.

### Decision

Polygon assignment is authoritative for geography; source labels remain evidence.

---

## 2026-07 — Read-only Labs dashboard `[LABS]`

### Goal

Give partners and builders a shareable analytics surface over Labs listings without exposing
raw observations, quarantine, or service-role credentials.

### Method

Next.js app in `apps/labs-dashboard` using the Labs publishable key only, hard-gated to
`csaefdkpwukshtouyixg.supabase.co`.

### Result

Routes: `/`, `/listings`, `/listings/[id]`, `/map`, `/neighbourhoods`, `/sources`,
`/data-quality`, `/how-it-works`. Local Streamlit inspector remains available for the same
dataset.

### Decision

Deploy only as a separate Vercel project after explicit approval. Never attach to the
production Merkado Vercel project.

---

## Template (copy for new experiments)

### Date

### Experiment name

### Source website

### Goal

### Hypothesis

### Method

### Data collected

### Data-quality findings

### Errors and limitations

### Result

### Decision

### Next step
