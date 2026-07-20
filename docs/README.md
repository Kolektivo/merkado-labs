# Merkado Docs — Index

This folder holds the working context for Merkado Labs property work.

**Last updated:** July 17, 2026  
**Active set:** `01`–`09` below. Older numbered docs were replaced by this set.

## Labs build status (this repository)

| Area | Status |
|---|---|
| Direct-source foundation (adapters, currency, lifecycle, eligibility) | [LABS] Built; RE/MAX refreshed 2026-07-17 with rich evidence |
| Raw evidence + AI enrichment foundation | [LABS] Private Storage; proposals/jobs service-role only; review UX |
| Approved source registry (5 MVP sources) | [LABS] Seeded; CHH removed |
| CHH harvest / importer / workflow | Removed from active repo |
| CHH Labs rows | Deleted 2026-07-16; verified local export retained |
| Labs property schema + RLS | [LABS] Built; AI tables locked from anon 2026-07-17 |
| Geospatial boundaries + neighbourhood assignment | [LABS] Built (RE/MAX has 0 coords) |
| Labs dashboard | [LABS][WIP] Ops + browse + Search Request / Agent previews |
| Public browse on merkado.cw | [PLANNED] Labs `/browse` only |
| Keller Williams adapter | [LABS] v0.1; 40 listings imported (manual) |
| Moret adapter | [LABS] v0.2.0; complete catalog activated (71); Terra-v3 initial backfill complete (71/71) |
| Monumentenzorg / Sotheby's | [RISK] Reconnaissance required / access route under investigation (not Ready) |
| AI enrichment (25 RE/MAX) | [LABS] Completed 2026-07-17; review pending |
| Search Request + Match Reports | [LABS] Demo request + 15 `rules_v1` matches |

## The files

| File | What it covers | Use it when |
|---|---|---|
| `01-live-product-state.md` | What is live on merkado.cw vs Labs-only. | Ground truth; never over-promise past this file. |
| `02-v2-vision.md` | Partner direction: Passport, asset arc, marketplace. | “Where this is going.” |
| `03-mvp-scope-and-decisions.md` | P0 priorities, approved sources, explicit deferrals. | Day-to-day scope decisions. |
| `04-data-sources-and-scraping.md` | Direct-source rules, CHH removal, adapter expectations. | Building or reviewing scrapers. |
| `05-data-model-and-listing-lifecycle.md` | Schema, lifecycle, currency, eligibility, cleanup. | Schema or listing-state work. |
| `06-currency-and-pricing-rules.md` | Original currency + XCG benchmark rules. | Price display or conversion. |
| `07-passport-and-product-boundaries.md` | Off-chain Passport and product boundaries. | Product framing. |
| `08-execution-plan-and-cursor-prompt.md` | Phased execution plan and agent prompt. | Starting a build pass. |
| `09-project-safety-and-history.md` | Safety rules, decision history, CHH lessons. | Before writes, cleanup, or deploy talk. |
| `labs/PROJECT_CONTEXT.md` | What Merkado Labs is and current state. | Orienting a new session. |
| `labs/SAFETY_RULES.md` | Hard Labs-only rules. | Before any write, deploy, or credential use. |
| `labs/EXPERIMENT_LOG.md` | Dated experiment notes (historical). | Reviewing what was tried. |

Production reference copies (not Labs build docs):

| File | What it covers |
|---|---|
| `supabase-architecture.md` | Production v1 car-marketplace Supabase reference |
| `merkado_n8n_complete_guide_v3.md` | Production v1 n8n scraping/enrichment guide |

## Tag legend

- `[LIVE]` built and running in production today
- `[PLANNED]` agreed future work, not built
- `[WIP]` actively being built or scoped
- `[LABS]` built in Merkado Labs only (not live on merkado.cw)
- `[DEFERRED]` intentionally postponed
- `[OPEN]` unresolved question
- `[RISK]` flagged concern

## Reading order for someone new

1. `01-live-product-state.md`
2. `03-mvp-scope-and-decisions.md`
3. `04-data-sources-and-scraping.md` and `05-data-model-and-listing-lifecycle.md`
4. `09-project-safety-and-history.md`
5. `labs/PROJECT_CONTEXT.md` and `labs/SAFETY_RULES.md`
