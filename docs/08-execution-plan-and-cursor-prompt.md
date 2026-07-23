# 08 - Execution Plan & Cursor Prompt

**Purpose:** Practical implementation order and the ready-to-paste first Cursor task.

**Status (as of 2026-07-23):** This file is the **historical execution kickoff**
for CHH removal → direct-source activation. Phases 1–4 are largely complete for
four Ready sources (KW, RE/MAX, Moret, Monumentenzorg); Sotheby's remains
BLOCKED. Phase 5 shared-pipeline automation is **armed On** and the first normal
daily cron on the default branch was observed 2026-07-22 (run `29984863341`).
Labs admin native listing prototype (2026-07-23) is a Labs spike precursor to
production Phase 6 Auth seller listing — it does not replace merkado.cw user
Auth/RLS. For current product, schema, sources, and ops state use
`01-live-product-state.md`, `04`, `05`, `09`, and `LABS_DASHBOARD_GUIDE.md` —
do not treat the imperative phase checklists below as the live backlog.

## 1. Working approach

Refactor the existing repository and Labs app in place.

Rollback / stabilization branches used:

- `backup/property-v2-multitask-before-stabilization` (WIP checkpoint)
- `feat/property-v2-stabilization` (bounded-run repair + RLS + admin hardening)

Do not create a second app, second repository, or permanent parallel architecture.

## 2. Execution phases

Current dashboard cleanup state (July 17, 2026): the existing Labs app has been
stabilized in place. Its operational navigation is Overview, Listings, Sources,
Enrichment, Quality, and Settings, with experimental buyer concepts grouped
under Prototypes. Duplicate legacy routes redirect to those owner areas. See
`LABS_DASHBOARD_GUIDE.md` for local operation and troubleshooting.

### Phase 1 - Inspect and remove CHH

1. Read all `01–09` project docs.
2. Inspect repository and Labs schema read-only.
3. Map every CHH workflow, script, config, source record, route, query, test, and data dependency.
4. Extract genuinely reusable logic into source-neutral modules.
5. Remove CHH workflows, runtime code, config, UI dependencies, active tests, and source registration.
6. Produce CHH Labs-data dry-run counts and rollback evidence.
7. Remove CHH-derived Labs data through a reviewed controlled process.

### Phase 2 - Make the foundation source-neutral

1. Add forward-only migrations for source-run health, currency provenance, lifecycle status, and activity events.
2. Add typed adapter and immutable snapshot contracts.
3. Update RLS and safe public/admin read models.
4. Add migration, import, currency, and lifecycle tests.

### Phase 3 - Build direct adapters

1. Promote the existing RE/MAX proof into the first complete adapter.
2. Implement public price eligibility and currency conversion.
3. Implement complete-run comparison and false-removal protection.
4. Add the other sources one at a time.
5. Keep all runs bounded and manual until QA passes.

### Phase 4 - Update dashboard/read models

1. Add source-run health and source filters.
2. Show original currency, XCG benchmark, and conversion provenance.
3. Add public eligibility/exclusion views.
4. Add listing activity timeline and Passport read model.
5. Connect only active priced records to future browse/detail queries.

### Phase 5 - Schedule carefully

Activate one source schedule at a time only after:

- pagination is complete;
- fixture tests pass;
- stable identity strategy is documented;
- no-price exclusion works;
- failed-run safety works;
- sold/missing/removed behavior works;
- repeated manual runs are reviewed.

## 3. Ready-to-paste Cursor prompt

```text
Goal
Refactor the existing Merkado Labs property system from the retired CHH workflow to a source-neutral direct-realtor pipeline, then build RE/MAX as the first complete adapter.

Read first
- docs/01-live-product-state.md
- docs/02-v2-vision.md
- docs/03-mvp-scope-and-decisions.md
- docs/04-data-sources-and-scraping.md
- docs/05-data-model-and-listing-lifecycle.md
- docs/06-property-passport-and-intelligence.md
- docs/07-labs-architecture-and-geospatial.md
- docs/08-execution-plan-and-cursor-prompt.md
- docs/09-project-safety-and-history.md

Project boundary
- Work in the existing repository and existing Labs app.
- A temporary branch is fine for rollback, but do not create a second app or repository.
- Allowed Supabase project only: csaefdkpwukshtouyixg.
- Production Supabase and production Vercel are forbidden.
- Begin read-only.

CHH removal
Remove CHH completely from the active architecture:
- workflows and manual runtime entry points
- harvest/import runtime code
- CHH-specific config and source registration
- CHH-specific fixtures and active tests
- CHH dashboard routes, labels, filters, and queries
- CHH-derived Labs listings and dependent records
- any runnable fallback

Before deleting CHH-specific code, extract only useful generic patterns into source-neutral modules, such as immutable snapshots, raw evidence capture, deterministic normalization, bounded requests, source-run health, idempotent imports, and lifecycle comparison.

Before CHH data cleanup:
- return table-by-table affected counts
- create export/checksum rollback evidence
- propose dependency-safe deletion order
- do not write until the target project is verified
- do not edit applied migrations

MVP sources
- Keller Williams Curaçao
- Sotheby's International Realty
- RE/MAX
- Moret Real Estate
- Monumentenzorg Curaçao

MVP data rules
- Publicly show only active listings with a valid positive price.
- Preserve original price amount and currency.
- Store/display a benchmark in XCG.
- USD: 1 USD = 1.79 XCG.
- EUR: injectable provider abstraction with stored rate, provider, and timestamp.
- Tests must not call a live exchange-rate API.
- Explicit source currency always wins.
- Amount ending in 000 or 500 is only a low-confidence EUR hint when currency is ambiguous.
- Converted copy: “Indicative equivalent based on known information.”
- Preserve source_listed_at separately from first_seen_at.
- Append immutable events for first_seen, source_listed, price_changed, currency_changed, benchmark_recalculated, source_marked_sold, missing_from_source, removed_from_source, relisted, and material changes.
- Sold requires explicit source evidence.
- Removed requires consecutive complete successful source snapshots where absent.
- Failed/partial runs must never create missing or removed transitions.
- Sold listings retain last known asking price with: “Last known listing price. The actual sale price may differ.”
- Property Passports are off-chain activity logs.

Tasks
1. Inspect the repository and Labs schema. Return a concise change map before editing.
2. Identify every CHH-specific file, job, config, route, query, test, table relationship, and affected dataset count.
3. Propose which CHH logic becomes generic and which files are deleted.
4. Extract source-neutral modules, then remove CHH runtime/config/UI/test dependencies.
5. Create a reviewed CHH Labs-data cleanup migration or server-only script with dry-run counts, rollback evidence, dependency-safe deletion, and integrity checks.
6. Add forward-only migrations for source-run health, currency provenance, lifecycle fields, and immutable activity events. Reuse current tables where clean.
7. Add/update Python and TypeScript types for a source-neutral adapter output and immutable snapshot contract.
8. Promote the existing RE/MAX proof into the first complete direct listing adapter. Keep it bounded, rate-limited, fixture-tested, and manual-run only.
9. Implement price eligibility, original/benchmark currency handling, fixed USD conversion, and injectable EUR conversion.
10. Implement lifecycle comparison using only complete successful snapshots. Default removal threshold: two, configurable per source.
11. Update RLS-safe queries and Labs dashboard for source health, price provenance, status, public eligibility, activity timeline, and geospatial status.
12. Add tests for CHH removal, cleanup integrity, no-price exclusion, explicit currency precedence, ambiguous EUR inference, sold vs removed, failed-run safety, relisting, and idempotent imports.
13. Update the relevant 01–09 docs and the history section in 09 with what changed.

Do not change
- Production car marketplace code or schema
- Production Supabase or production Vercel
- Existing applied migration files
- Secrets or .env files
- Geospatial logic except connecting it to source-neutral imports
- Reports, agents, alerts, AVM, sold-probability models, blockchain, wallet, payments, Kadaster, or KYC features

Return
- Change map
- CHH dependencies/files removed
- Generic modules extracted
- Cleanup dry-run counts and rollback method
- Files changed
- Migration summary
- Tests run and results
- Manual QA checklist
- Remaining blockers for the other four sources
```
