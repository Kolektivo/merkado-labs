# 09 - Project Safety, Reading Order & Decision History

**Purpose:** Mandatory operating rules, project orientation, and compact historical record.

## 1. Reading order

For every substantial Cursor task, read:

1. `01-live-product-state.md`
2. `03-mvp-scope-and-decisions.md`
3. The topic-specific document (`04–07`)
4. `09-project-safety-and-history.md`
5. `08-execution-plan-and-cursor-prompt.md` when implementing the direct-source migration

## 2. Environment safety

Allowed Supabase target only:

- `merkado-labs`
- project reference `csaefdkpwukshtouyixg`

Forbidden production target:

- `merkado-curaçao`
- project reference `jkrfyvukhhsapoivntms`

Never:

- access or modify production Supabase;
- run SQL against production;
- reset any database;
- copy production users, credentials, secrets, or private data;
- use production service-role credentials;
- expose service-role credentials to browser code or logs;
- modify or deploy the production Vercel project;
- edit applied migrations in place;
- push, deploy, or promote without explicit approval;
- run unreviewed destructive commands.

## 3. Required workflow

1. Begin with read-only repository and schema inspection.
2. Verify the exact Labs project before every write.
3. Use forward-only migrations or reviewed controlled server-side scripts.
4. Preserve raw evidence for every direct source before normalization.
5. Run adapters manually and bounded before scheduling.
6. Never create missing/removal events from failed or partial runs.
7. Never commit secrets. Keep `.env` files local and ignored.
8. Use a branch for rollback when useful, but keep one app and one architecture.

## 4. CHH retirement safety

CHH must be removed from active code, workflows, configuration, UI, tests, source records, and Labs data.

Before data cleanup:

- confirm project reference;
- produce affected counts per table;
- create export/checksum rollback evidence;
- delete in dependency-safe order;
- run integrity, RLS, test, and dashboard checks.

Do not keep a runnable CHH fallback. Keep only this compact decision history and source-neutral reusable patterns.

## 5. Deployment safety

The Labs dashboard may only use a separate Labs Vercel project and Labs publishable environment variables.

Do not connect the Labs directory to the production Merkado Vercel project.

Do not add browser automation, AI frameworks, vector databases, or new graph infrastructure without a concrete source need and explicit approval.

## 6. Decision history

### July 17, 2026 - Property V2 stabilization and recovery

- Backup branch `backup/property-v2-multitask-before-stabilization` (`bb8bf08`).
- Root cause: KW `run_bounded` labeled capped runs `success`; lifecycle treated them as
  complete and removed 35 listings absent from later `max_items=5` snapshots.
- Fix: `classify_run_outcome` + `is_complete_success` requires `complete_catalog=true`
  and no caps; KW/Moret/REMAX adapters emit `partial` when bounded.
- Repair: restored 35 KW listings (`kw_bounded_run_false_removal_v1`); now 39 active + 1 unknown.
- RLS: revoked anon SELECT on internal property tables; public view SELECT-only with
  `security_invoker=false`.
- Labs admin: httpOnly signed session cookie; secret no longer in ordinary forms/sessionStorage.
- AI: no hardcoded model default; env-required `OPENAI_ENRICHMENT_MODEL`; unknown pricing unavailable.
- Eligibility invariant: `public_eligible=true AND status!=active` → 0.

### July 17, 2026 - Property V2 continuation (imports + AI + matching)

- Fixed import-pipeline realtor attribution (was hard-coded RE/MAX for all sources).
- KW: dry-run 5 OK → import 40 (Crawl-Delay 20); evidence HTML uploaded for all 40.
  (Later corrected: those runs were partial/bounded, not complete catalog success.)
- Moret: WPEstate adapter v0.1; bounded import 5 + evidence; rent/sale heuristics.
- AI gated batch: job `f06f994b-…`, model `gpt-4.1-mini`, **25/25 succeeded**,
  0 failed; tokens in 66845 / out 24992 / total 91837; ~**$0.067** actual vs
  ~$0.046 planning estimate; proposals unreviewed; did **not** run all 220.
- Monumentenzorg recon: SSL expired / DNS fail; fixture parser only.
- Sotheby's recon: HTTP 202 on robots/search/sitemap (WAF); no bypass.
- Demo Search Request `4ec62242-…` + test Agent entitlement + **15** Match Reports.
- Tests: 95 passed; dashboard typecheck clean.

### July 17, 2026 - Property V2 security, KW adapter, Labs product previews

- Applied `v2_security_review_and_search_foundation`: revoked anon/authenticated
  SELECT on `ai_enrichment_proposals` / `ai_enrichment_jobs`; added AI review
  fields; added `public_property_listings` view; Search Request / Agent /
  Match Report tables; `listing_observations` non-public.
- Labs dashboard ops + browse + Search Request / What Fits Me / Agent previews.
- Deterministic matcher `rules_v1` + pricing estimator foundation.

### July 16, 2026 - Direct-source property MVP

Partner decision:

- retire CHH completely;
- build direct adapters for Keller Williams, Sotheby's, RE/MAX, Moret, and Monumentenzorg;
- show only priced listings;
- preserve original currency and benchmark in XCG;
- use fixed USD peg and timestamped EUR provider rate;
- track source date, detection dates, price/status changes, sold, missing, removed, and relisted;
- keep sold separate from removed;
- define Passport as off-chain;
- defer reports, agents, alerts, AVM, and sold-probability work.

### July 16, 2026 - Phase 1.1 cleanup preparation

- Deleted CHH experiment trees and workflow from the active repository.
- Added full payload export + checksum manifest tooling under `scripts/cleanup/`.
- Verified export under `data/processed/chh_cleanup_export/payloads_20260716T165840Z/`
  (row counts match dry-run; SHA-256 and JSONL parse checks passed).
- Dashboard default queries exclude disabled/retired sources.
- Confirmed all 102 `market_signals` rows are exclusively CHH-evidenced.

### July 16, 2026 - CHH Labs data deletion completed

- Cleanup timestamp: `2026-07-16T17:14:37Z` (delete report).
- Deleted CHH-derived rows from Labs `csaefdkpwukshtouyixg` after export verification.
- Actual deleted counts matched the verified export (1,549 listings; 2,873 listing
  observations; 2,683 price observations; 102 market signals; 1 CHH source; etc.).
- Post-delete: zero CHH sources/listings/dependents; five approved direct sources remain;
  `property_assets` unchanged (1); immutable observation triggers re-enabled; RLS intact.
- Cleanup tooling is no longer an active project dependency; retain local export + compact docs.

### July 16, 2026 - ECB EUR benchmark policy + full catalog dry run

- Approved production EUR policy: `EUR_TO_XCG = ECB_USD_PER_EUR × 1.79`
  (`ecb_eur_usd_xcg_peg`), fail-closed, cached once per run.
- Temporary `--eur-rate` / `fixed_test` retained only for controlled tests.
- Full RE/MAX sale+rent catalog dry run (no DB writes): 220 discovered/parsed;
  complete_catalog true (12 index pages); ECB rate USD/EUR 1.1467 → EUR→XCG 2.052593
  (obs 2026-07-16). Projected import: +170 new, 50 updated, 48 benchmark recalcs,
  119 public-eligible. Coordinates and source listing dates remain absent.

### July 16, 2026 - First complete RE/MAX manual Labs import

- Pre-import gates passed (Labs ref `csaefdkpwukshtouyixg`, five enabled sources,
  valid non-stale ECB quote, complete catalog dry run, baseline 50 RE/MAX / 0 CHH /
  0 assets / 0 missing-removed).
- Import command with `--import-db --fx-provider ecb --max-items 0`: outcome
  `success`, discovered/parsed 220, imported 170, updated 50, excluded no-price 12,
  errors 0, checksum present. Source run
  `3bf72218-914e-49f9-a577-cdf6ca76e500` (19:21:43–19:29:41 UTC).
- ECB: observation 2026-07-16, USD/EUR 1.1467, EUR→XCG 2.052593, cached once.
- Eligibility: 119 public-eligible; exclusions 95 not_active + 6 missing_price.
- 48 `benchmark_recalculated` for prior `fixed_test` rows; 0 `price_changed` from
  the ECB transition; current listing benchmarks use `ecb_eur_usd_xcg_peg`.
- First-complete baseline: missing/removed remain 0 (no false absence vs bounded
  samples). Immediate re-import confirmed idempotency (imported 0 / updated 220;
  observation and price appends skipped when unchanged).
- Post-import bugfix: complete-run `FIRST_SEEN` transitions briefly overwrote
  new sold/inactive statuses to `active` and duplicated `first_seen` events.
  Statuses repaired from `source_listing_status`; import pipeline now skips
  duplicate first_seen transitions; lifecycle preserves sold/inactive hints.
  Historical duplicate `first_seen` rows were retained (immutable).
- Geospatial: 0 coordinates / 0 inferred neighbourhoods; source neighbourhood
  text retained on all 220. No `property_asset` auto-links. No CHH. RLS +
  immutability triggers intact. Dashboard smoke routes OK. RE/MAX stays manual.
- Next recommended source recon: Keller Williams or Moret (local sites; likely
  lower complexity than Sotheby's franchise stack; Monumentenzorg scope still open).

### July 16, 2026 - RE/MAX bounded proof (earlier)

A controlled RE/MAX listing-page extraction proved that direct realtor pages can add richer fields. It became the first full direct-source adapter.

### Earlier Labs foundation

The isolated property schema, immutable observation pattern, geospatial assignment, experimental signals, contract assessment, and read-only dashboard were successfully built. Reuse only the source-neutral parts.

## 7. Compact historical lessons from CHH

The retired CHH experiment demonstrated:

- immutable snapshots and deterministic imports are useful;
- raw evidence and source attribution must be preserved;
- aggregators can omit or ambiguously represent important fields;
- field conflicts should be stored instead of silently overwritten;
- direct realtor pages can provide richer source truth;
- source listing identity and canonical property identity must remain separate.

These lessons justify the direct-source architecture. They do not justify retaining CHH runtime code or data.

## 8. Tag legend

- `[LIVE]` available on `merkado.cw`
- `[LABS]` built only in isolated Labs
- `[WIP]` actively being built or scoped
- `[PLANNED]` agreed future work
- `[DEFERRED]` intentionally postponed
- `[OPEN]` unresolved decision
- `[RISK]` accuracy, legal, or implementation concern
