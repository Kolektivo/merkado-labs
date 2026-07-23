# Merkado Labs Project Context

Session orientation for Merkado Labs. This is **not** the live status snapshot.

Merkado production is a live Curaçao vehicle marketplace. Merkado Labs is a
completely separate experimental workspace for property market research.

## Where to read next

| Need | Document |
|---|---|
| Current implementation status and inventory counts | [`docs/01-live-product-state.md`](../01-live-product-state.md) |
| Docs index and canonical source map | [`docs/README.md`](../README.md) |
| Agent operating rules | Repository root `AGENTS.md` / `CLAUDE.md` |
| Hard Labs-only safety rules | [`docs/labs/SAFETY_RULES.md`](SAFETY_RULES.md) |
| Dashboard ops | [`docs/LABS_DASHBOARD_GUIDE.md`](../LABS_DASHBOARD_GUIDE.md) |
| Dated quality evidence (2026-07-21) | [`PROPERTY_DATA_QUALITY_REPORT.md`](PROPERTY_DATA_QUALITY_REPORT.md) |
| Dated price/currency audit (2026-07-23) | [`PRICE_CURRENCY_AUDIT_2026-07-23.md`](PRICE_CURRENCY_AUDIT_2026-07-23.md) |

Do not copy live listing counts into this file. They change; `01` is authoritative.

## Labs identity and safety

- Project name: `merkado-labs`
- Project reference: `csaefdkpwukshtouyixg` (Labs only)
- Region: `eu-west-3`
- Production Supabase `jkrfyvukhhsapoivntms` must never be accessed from this
  workspace

## What this repository contains `[LABS]`

| Piece | Location |
|---|---|
| Property schema + RLS migrations | `supabase/migrations/` |
| Direct-source adapters | `src/merkado_labs/scrapers/` |
| Property pipeline | `src/merkado_labs/pipeline/`, `scripts/run_property_pipeline*.py` |
| Currency + eligibility helpers | `src/merkado_labs/normalization/` |
| Cleanup verification tooling (historical) | `scripts/cleanup/` |
| Geospatial import/assignment scripts | `scripts/geo/` |
| Labs dashboard (ops + browse + Data Ops) | `apps/labs-dashboard/` |

Active focus (qualitative only): direct-source property ingestion, Labs
dashboard Browse / Passport / native listing / What Fits Me prototypes, AI
enrichment under pipeline budgets, and geospatial neighbourhood assignment.
CHH is retired. For what is live vs Labs-only and for numbers, open `01`.
