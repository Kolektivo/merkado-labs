# Merkado Docs — Index

This folder holds the working context for Merkado Labs property work.

**Last updated:** July 23, 2026
**Canonical set:** `00`–`12` (AI Product Development OS).
**Agent entrypoints:** repository root `AGENTS.md` and `CLAUDE.md`.
**Structure decision:** `docs/decisions/ADR-0001-standard-documentation-structure.md`.
**Continuous docs:** Documentation Synchronization Protocol in root `AGENTS.md`.

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
| Docs index (this file) | `00-docs-index.md` |
| Product vision | `01-product-vision.md` |
| Scope and approved decisions | `02-scope-and-decisions.md` |
| User flows and UX journeys | `03-user-flows.md` |
| Design system / UI rules | `04-design-system.md` |
| Architecture | `05-architecture.md` |
| Data model, lifecycle, currency | `06-data-model.md` |
| Integrations (sources / pipeline) | `07-integrations.md` |
| Security and privacy | `08-security-and-privacy.md` |
| Current implementation state | `09-current-state.md` |
| Execution roadmap (approved only) | `10-execution-roadmap.md` |
| Testing and Product Lead UAT | `11-testing-and-uat.md` |
| Deployment and local ops runbook | `12-deployment-runbook.md` |
| Active multi-step work | `tasks/active/` |
| Decision records (ADRs) | `decisions/` |
| Meeting evidence | `meetings/` |
| Research / historical evidence | `research/` (HISTORICAL banners on migrated evidence only) |
| AI prompts / bootstrap | `ai/` |

## Labs build status (qualitative)

Qualitative maturity only. **Live inventory counts and changing metrics live only
in [`09-current-state.md`](09-current-state.md).** Dated evidence stays under
`research/` — do not treat those figures as the live snapshot.

| Area | Status |
|---|---|
| Direct-source foundation | [LABS] Built; four Ready sources + Sotheby's BLOCKED |
| Labs admin native listing prototype | [LABS] Implemented; not production Auth seller accounts |
| Raw evidence + AI enrichment foundation | [LABS] Private Storage; proposals/jobs service-role only |
| Approved source registry (5 MVP sources) | [LABS] Seeded; CHH removed |
| CHH harvest / Labs rows | Retired; deleted 2026-07-16; research retained |
| Final Labs data cleanup | [LABS] Completed 2026-07-23 (see `09`) |
| Labs property schema + RLS | [LABS] Built; public-effective view applied |
| Geospatial neighbourhoods | [LABS] Built (detail in `09`) |
| Labs dashboard | [LABS] Ops + Browse + prototypes — not read-only |
| Property pipeline automation | [LABS] Cron On + dispatch (detail in `09`) |
| Public browse on merkado.cw | [PLANNED] Labs `/browse` only today |
| Price/currency readiness | [LABS] Policy in `06`; live figures in `09` |
| English / Dutch presentation | [LABS] v5 applied — see `09` |
| What Fits Me + Property Search | [LABS] Working Labs matching; production Auth deferred |

## Continuous documentation workflows

| Workflow | Where defined | When to use |
|---|---|---|
| Documentation Synchronization Protocol | Root `AGENTS.md` | Every non-trivial change |
| Meeting Notes Workflow | Root `AGENTS.md` + `ai/meeting-notes-integration-prompt.md` | After meetings |
| Project bootstrap | `ai/project-bootstrap-prompt.md` | New repository setup (exact `00`–`12`) |
| Context integration | `ai/context-integration-prompt.md` | External research/docs |
| Independent review | `ai/independent-review-prompt.md` | PR / branch second opinion |

### Sync targets

| Kind of change | Update |
|---|---|
| Approved product intent | `01` / `02` / `03` / `05` (+ ADRs) as relevant |
| Verified implementation | `09-current-state.md` only |
| Planned approved work | `10-execution-roadmap.md` + `tasks/active/` |
| Acceptance coverage | `11-testing-and-uat.md` |
| Operational / deploy / env | `12-deployment-runbook.md` |
| Safety narrative | `08-security-and-privacy.md` + Cursor rule |

## Reading order for someone new

1. Repository root `AGENTS.md`
2. `09-current-state.md`
3. `02-scope-and-decisions.md`
4. `07-integrations.md` and `06-data-model.md`
5. `08-security-and-privacy.md`
6. `12-deployment-runbook.md` and `apps/labs-dashboard/README.md`
7. `11-testing-and-uat.md` when verifying or accepting work

Historical CHH kickoff and legacy cars docs live under `research/` — not the
live backlog.

## Outside `docs/`

| File | What it covers | Notes |
|---|---|---|
| `../AGENTS.md` | Repository agent operating contract | Canonical agent entry |
| `../CLAUDE.md` | Thin Claude wrapper (`@AGENTS.md`) | Not a second product SoT |
| `../README.md` | Repo entry + beginner setup | Points here; full ops in `12` |
| `../.github/PULL_REQUEST_TEMPLATE.md` | PR checklist including docs-sync | Delivery gate |
| `../.cursor/rules/merkado-labs-safety.mdc` | Executable safety enforcement | Do not merge away |
| `../apps/labs-dashboard/README.md` | Dashboard quick-start | App-local |
| `../apps/labs-dashboard/AGENTS.md` | Next.js framework rules | Scoped; not root `AGENTS.md` |
| `../apps/labs-dashboard/CLAUDE.md` | Points at app `AGENTS.md` | Scoped |
| `../scripts/cleanup/README.md` | Historical CHH cleanup tooling | Supporting |
| `../data/processed/chh_cleanup_export/README.md` | Cleanup export verification | Supporting |
| `../data/geo/cache/**/README.md` | Third-party spatial dataset notes | Not product SoT |

## Historical research (not current state)

| File | Content |
|---|---|
| `research/historical-chh-direct-source-execution-plan-2026.md` | Former docs `08` kickoff |
| `research/historical-chh-richer-harvest-audit-2026-07-16.md` | Restored CHH richer-fields audit |
| `research/experiment-log.md` | Dated experiments |
| `research/decision-history-and-chh-lessons.md` | Dated decision log + CHH lessons |
| `research/property-data-quality-report-2026-07-21.md` | Dated quality pass |
| `research/price-currency-audit-2026-07-23.md` | Dated price audit |
| `research/legacy-v1-cars-supabase-architecture.md` | Production v1 **cars** |
| `research/legacy-v1-cars-n8n-guide-v3.md` | Production v1 **cars** n8n |

## Tag legend

- `[LIVE]` built and running in production today
- `[PLANNED]` agreed future work, not built
- `[WIP]` actively being built or scoped
- `[LABS]` built in Merkado Labs only (not live on merkado.cw)
- `[DEFERRED]` intentionally postponed
- `[OPEN]` unresolved question
- `[RISK]` flagged concern
