# Merkado Docs — Index

This folder holds the working context for Merkado Labs property work.

**Last updated:** July 23, 2026  
**Active set:** `01`–`09` below. Older numbered docs were replaced by this set.

## Terminology (canonical)

- **Properties** = umbrella for all Merkado listed assets.
- Top-level marketplace discriminator (production boundary): `property_type` ∈
  {`car`, `real_estate`}.
- Real-estate subtypes use `real_estate_type` (house, apartment, land, …).
- Labs `property_listings.property_type` today still means the **real-estate
  subtype / source label** for scraped rows — map explicitly; never silently
  reinterpret as `car|real_estate`.

## Labs build status (this repository)

| Area | Status |
|---|---|
| Direct-source foundation (adapters, currency, lifecycle, eligibility) | [LABS] Built; four Ready sources + Sotheby's BLOCKED |
| Labs admin native listing prototype | [LABS] Implemented: admin Add property wizard, draft/publish/unpublish/sold/rented/republish, Storage images, origin-aware Browse/Passport; **not** production Auth seller accounts |
| Raw evidence + AI enrichment foundation | [LABS] Private Storage; proposals/jobs service-role only; review UX |
| Approved source registry (5 MVP sources) | [LABS] Seeded; CHH removed |
| CHH harvest / importer / workflow | Removed from active repo |
| CHH Labs rows | Deleted 2026-07-16; verified local export retained |
| Labs property schema + RLS | [LABS] Built; AI tables locked from anon; public-effective view applied |
| Geospatial boundaries + neighbourhood assignment | [LABS] Built (RE/MAX 199/220 coords; Monumentenzorg 0/5) |
| Labs dashboard | [LABS] Ops + Data Operations + Browse (public preview) + Enrichment review + prototypes — not read-only |
| Property pipeline automation | [LABS] Orchestrator/worker/locks/anomaly/budgets/change_hash; GHA schedule `0 4 * * *` UTC (00:00 Curaçao; 06:00 Amsterdam CEST / 05:00 CET) + `workflow_dispatch`; **daily cron On** (`AUTOMATIC_REFRESH_ENABLED = true`) after 2026-07-21 gates; first normal daily cron observed on default branch 2026-07-22 (run `29984863341`) |
| Public browse on merkado.cw | [PLANNED] Labs `/browse` only (snapshot 2026-07-21 / `d2abb557`: ~**286** `public_property_listings`, EN/NL ~**283**); English-canonical + Dutch About-this-property toggle; stable URLs `/browse/{uuid}` |
| English presentation contract | [LABS] v5 applied: **289** migrated (~USD **7.83**); Dutch backfill **285** (~USD **2.42**); unchanged bilingual hashes skip at zero cost — see `labs/PROPERTY_DATA_QUALITY_REPORT.md` |
| Keller Williams adapter | [LABS] v0.3.1 Ready; Labs inventory **104**; offline import preview still gates at 84 |
| RE/MAX adapter | [LABS] v0.4.1 Ready; catalog contract **220** (DB may show 222 — operational drift); NAF cookie-session for official XCG alts |
| Moret adapter | [LABS] v0.2.0 Ready; 71 catalog |
| Monumentenzorg | [LABS] v0.2.0 Ready; 5 catalog |
| Sotheby's | [RISK] Access route BLOCKED 2026-07-20 (excluded from Ready pipelines; feed/API needed) |
| AI enrichment (v5 / policy v5) | [LABS] Current: `listing_enrichment_v5` / `listing_enrichment_schema_v5` / `enrichment_policy_v5`; English public presentation fields; dashboard AI execution disabled; pipeline AI under budgets when worker runs; prior v4.2 quality pass retained — see `labs/PROPERTY_DATA_QUALITY_REPORT.md` |
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
| `06-property-passport-and-intelligence.md` | Off-chain Passport and intelligence framing. | Product framing. |
| `07-labs-architecture-and-geospatial.md` | Labs architecture and geospatial assignment. | Neighbourhood / geo work. |
| `08-execution-plan-and-cursor-prompt.md` | Historical execution kickoff (Phases 1–5). Current status is in `01` / `09`. | Context only — not the live backlog. |
| `09-project-safety-and-history.md` | Safety rules, decision history, CHH lessons. | Before writes, cleanup, or deploy talk. |
| `LABS_DASHBOARD_GUIDE.md` | Labs dashboard ops, routes, env, troubleshooting. | Running or operating the dashboard. |
| `labs/PROJECT_CONTEXT.md` | What Merkado Labs is and current state. | Orienting a new session. |
| `labs/SAFETY_RULES.md` | Hard Labs-only rules. | Before any write, deploy, or credential use. |
| `labs/EXPERIMENT_LOG.md` | Dated experiment notes (historical). | Reviewing what was tried. |
| `labs/PROPERTY_DATA_QUALITY_REPORT.md` | 2026-07-21 property quality + English/Dutch presentation + automation validation (v5 contract, budgets, image dedupe). | After enrichment/policy rematerialization, bilingual work, or price/geo quality work. |

Production reference copies (**historical** — not Labs property build docs):

| File | What it covers |
|---|---|
| `supabase-architecture.md` | **Historical** production v1 **car** marketplace Supabase reference — not Labs property schema |
| `merkado_n8n_complete_guide_v3.md` | **Historical** production v1 **car** n8n scraping/enrichment guide — not Labs property pipeline |

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
