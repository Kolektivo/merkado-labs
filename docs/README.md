# Merkado Docs — Index

This folder holds the working context for Merkado Labs property work.

**Last updated:** July 23, 2026
**Active set:** `01`–`07` + `09` (current). `08` is historical only.
**Agent entrypoints:** repository root `AGENTS.md` and `CLAUDE.md`.
**Continuous docs:** Documentation Synchronization Protocol and Meeting Notes
Workflow live in root `AGENTS.md`.

## Terminology (canonical)

- **Properties** = umbrella for all Merkado listed assets.
- Top-level marketplace discriminator (production boundary): `property_type` ∈
  {`car`, `real_estate`}.
- Real-estate subtypes use `real_estate_type` (house, apartment, land, …).
- Labs `property_listings.property_type` today still means the **real-estate
  subtype / source label** for scraped rows — map explicitly; never silently
  reinterpret as `car|real_estate`.

## Canonical source map

One subject → one primary home. Link here; do not duplicate content.

| Subject | Canonical home |
|---|---|
| Product vision | `02-v2-vision.md` |
| Scope and approved decisions | `03-mvp-scope-and-decisions.md` |
| User flows and UX states | **Gap** — use `LABS_DASHBOARD_GUIDE.md`, `06-property-passport-and-intelligence.md`, and dashboard routes until a dedicated flow doc is approved |
| Brand and design system | **Gap** — dashboard UI in `apps/labs-dashboard` (no formal brand doc yet) |
| Architecture | `07-labs-architecture-and-geospatial.md` |
| Data model and lifecycle | `05-data-model-and-listing-lifecycle.md` |
| Pricing and currency | `06-currency-and-pricing-rules.md` |
| Passport and intelligence framing | `06-property-passport-and-intelligence.md` |
| Integrations (sources / pipeline) | `04-data-sources-and-scraping.md` (+ `07` for env boundary) |
| Security and privacy | `labs/SAFETY_RULES.md` + `.cursor/rules/merkado-labs-safety.mdc` + `07` security section + `09` |
| Current implementation state | **`01-live-product-state.md`** |
| Execution roadmap | `03` deliverables and gates; living history in `09`. **`08` is historical only — not the live backlog** |
| Testing and Product Lead UAT | `testing-and-uat.md` |
| Deployment and rollback | `09` deployment section + `labs/SAFETY_RULES.md` (Vercel) + `LABS_DASHBOARD_GUIDE.md` |
| Active multi-step work | `tasks/active/` |
| Decision records (ADRs) | `decisions/` |
| Meeting evidence | `meetings/` (not auto-approved scope; process via Meeting Notes Workflow) |
| Research evidence | `research/` (not auto-approved scope) |
| Project bootstrap (new repos) | `ai/project-bootstrap-prompt.md` + `ai/project-brief-template.md` |
| Meeting notes processing | `ai/meeting-notes-integration-prompt.md` |
| Context integration | `ai/context-integration-prompt.md` |
| Independent review | `ai/independent-review-prompt.md` |

**Note:** Two active files share the number `06` (currency vs Passport). Keep both;
do not renumber without Product Lead approval.

## Labs build status (this repository)

Qualitative maturity only. **Live inventory counts, public-eligible totals,
priced-row figures, and other changing metrics live only in
[`01-live-product-state.md`](01-live-product-state.md).** Dated evidence stays in
the linked audit reports — do not treat those figures as the live snapshot.

| Area | Status |
|---|---|
| Direct-source foundation (adapters, currency, lifecycle, eligibility) | [LABS] Built; four Ready sources + Sotheby's BLOCKED |
| Labs admin native listing prototype | [LABS] Implemented (admin wizard + lifecycle); **not** production Auth seller accounts |
| Raw evidence + AI enrichment foundation | [LABS] Private Storage; proposals/jobs service-role only; review UX |
| Approved source registry (5 MVP sources) | [LABS] Seeded; CHH removed |
| CHH harvest / importer / workflow | Removed from active repo |
| CHH Labs rows | Deleted 2026-07-16; verified local export retained |
| Final Labs data cleanup | [LABS] Completed 2026-07-23 (see `01` for retained inventory) |
| Labs property schema + RLS | [LABS] Built; AI tables locked from anon; public-effective view applied |
| Geospatial boundaries + neighbourhood assignment | [LABS] Built (coverage detail in `01`) |
| Labs dashboard | [LABS] Ops + Data Operations + Browse + Enrichment review + prototypes — not read-only |
| Property pipeline automation | [LABS] Orchestrator/worker/locks/anomaly/budgets/`change_hash`; daily cron On + `workflow_dispatch` (schedule detail in `01`) |
| Public browse on merkado.cw | [PLANNED] Labs `/browse` only today; English-canonical + Dutch About toggle; stable `/browse/{uuid}` — counts in `01` |
| Passport activity presentation | [LABS] Filtered public + internal timeline (noise retained but hidden) |
| Price/currency readiness | [LABS] Policy + presentation applied — live figures in `01`; dated listing audit in `labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` |
| English / Dutch presentation contract | [LABS] v5 applied — live state in `01`; migration evidence in `labs/PROPERTY_DATA_QUALITY_REPORT.md` |
| Keller Williams / RE/MAX / Moret / Monumentenzorg | [LABS] Ready adapters — identity/public counts in `01` |
| Sotheby's | [RISK] Access route BLOCKED 2026-07-20 (feed/API needed) |
| AI enrichment (v5 / policy v5) | [LABS] Current contract under pipeline budgets; dashboard AI execution disabled — see `01` and quality report |
| What Fits Me + Property Search | [LABS] Working Labs matching flow; no Agent/paywall/billing/email UI; production Auth deferred |

## The files

| File | What it covers | Use it when |
|---|---|---|
| `01-live-product-state.md` | What is live on merkado.cw vs Labs-only. | Ground truth / **current state**; never over-promise past this file. |
| `02-v2-vision.md` | Partner direction: Passport, asset arc, marketplace. | “Where this is going.” |
| `03-mvp-scope-and-decisions.md` | P0 priorities, approved sources, explicit deferrals. | Day-to-day scope decisions. |
| `04-data-sources-and-scraping.md` | Direct-source rules, CHH removal, adapter expectations. | Building or reviewing scrapers. |
| `05-data-model-and-listing-lifecycle.md` | Schema, lifecycle, currency, eligibility, cleanup. | Schema or listing-state work. |
| `06-currency-and-pricing-rules.md` | Original currency + XCG benchmark rules. | Price display or conversion. |
| `06-property-passport-and-intelligence.md` | Off-chain Passport and intelligence framing. | Product framing. |
| `07-labs-architecture-and-geospatial.md` | Labs architecture and geospatial assignment. | Neighbourhood / geo work. |
| `08-execution-plan-and-cursor-prompt.md` | **Historical** CHH→direct-source kickoff (Phases 1–5). | Context only — **not** the live backlog or current roadmap. Use `01` / `03` / `09` instead. |
| `09-project-safety-and-history.md` | Safety rules, decision history, CHH lessons. | Before writes, cleanup, or deploy talk. Not the live status snapshot (`01` is). |
| `LABS_DASHBOARD_GUIDE.md` | Labs dashboard ops, routes, env, troubleshooting. | Running or operating the dashboard. |
| `testing-and-uat.md` | Real verify commands and Product Lead UAT. | Before claiming done; Product Lead acceptance. |
| `labs/PROJECT_CONTEXT.md` | What Merkado Labs is and current state. | Orienting a new session. |
| `labs/SAFETY_RULES.md` | Hard Labs-only rules. | Before any write, deploy, or credential use. |
| `labs/EXPERIMENT_LOG.md` | Dated experiment notes (historical). | Reviewing what was tried. |
| `labs/PROPERTY_DATA_QUALITY_REPORT.md` | 2026-07-21 property quality + English/Dutch presentation + automation validation (v5 contract, budgets, image dedupe). | After enrichment/policy rematerialization, bilingual work, or price/geo quality work. |
| `labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` | Listing-level final price anomalies and reviewed false positives. | Checking XCG readiness or no-price exclusions. |
| `tasks/` | Multi-step approved work plans (`TASK-template.md`, `active/`). | Meaningful multi-step implementation. |
| `ai/context-integration-prompt.md` | Absorb new research / external docs safely. | After ChatGPT/Claude docs land. |
| `ai/independent-review-prompt.md` | Second-opinion PR / branch review. | Before merge when needed. |
| `ai/meeting-notes-integration-prompt.md` | Process meeting notes into canonical docs. | After meetings. |
| `ai/project-bootstrap-prompt.md` | Bootstrap OS for a **new** repo (docs + tasks only). | Starting a new product repository. |
| `ai/project-brief-template.md` | Free-form brief → copy to root `PROJECT_BRIEF.md`. | Before bootstrap. |
| `decisions/ADR-template.md` | Architecture Decision Record template. | Recording significant choices. |
| `meetings/meeting-template.md` | Meeting evidence template (`YYYY-MM-DD-topic.md`). | Capturing meetings. |
| `research/research-template.md` | Research evidence template. | Capturing research. |

### Continuous documentation workflows

| Workflow | Where defined | When to use |
|---|---|---|
| Documentation Synchronization Protocol | Root `AGENTS.md` | Every non-trivial change; keeps docs aligned with Product Lead intent |
| Meeting Notes Workflow | Root `AGENTS.md` + `ai/meeting-notes-integration-prompt.md` | After meetings; confirmed decisions only |
| Project bootstrap | `ai/project-bootstrap-prompt.md` + brief template | New repository setup (docs/tasks only; no product build) |
| Context integration | `ai/context-integration-prompt.md` | Integrating external research/docs |
| Independent review | `ai/independent-review-prompt.md` | PR / branch second opinion |

### Outside `docs/`

| File | What it covers | Notes |
|---|---|---|
| `../AGENTS.md` | Repository agent operating contract | Canonical agent entry for Merkado Labs |
| `../CLAUDE.md` | Thin Claude wrapper (`@AGENTS.md`) | Not a second product SoT |
| `../README.md` | Repo entry, setup, high-level inventory | Points into this index |
| `../.github/PULL_REQUEST_TEMPLATE.md` | PR checklist including documentation-sync | Delivery gate |
| `../apps/labs-dashboard/README.md` | Dashboard run / routes / verify | App ops complement to `LABS_DASHBOARD_GUIDE.md` |
| `../apps/labs-dashboard/AGENTS.md` | Next.js framework rules for that app | **Scoped**, not a duplicate of root `AGENTS.md` |
| `../apps/labs-dashboard/CLAUDE.md` | Points at app `AGENTS.md` | Scoped |
| `../scripts/cleanup/README.md` | Historical CHH cleanup tooling | Supporting / historical |
| `../data/processed/chh_cleanup_export/README.md` | Cleanup export verification | Supporting / historical |
| `../data/geo/cache/**/README.md` | Third-party spatial dataset notes | **Not** Merkado product documentation |

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

1. Repository root `AGENTS.md` (includes Documentation Synchronization Protocol)
2. `01-live-product-state.md`
3. `03-mvp-scope-and-decisions.md`
4. `04-data-sources-and-scraping.md` and `05-data-model-and-listing-lifecycle.md`
5. `09-project-safety-and-history.md`
6. `labs/PROJECT_CONTEXT.md` and `labs/SAFETY_RULES.md`
7. `testing-and-uat.md` when verifying or accepting work

Skip `08` unless you need historical CHH→direct-source migration context.
