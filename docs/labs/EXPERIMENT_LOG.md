# Experiment log

Living log of Labs experiments. Newest first.

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
