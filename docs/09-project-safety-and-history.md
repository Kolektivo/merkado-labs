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

### July 17, 2026 - KW retry batch, Terra completion, and AI cost observability

- Retried the 24 KW listings that had truncated under
  `max_output_tokens=2500` using the compact prompt/schema/policy **v3**
  (`listing_enrichment_v3` / `listing_enrichment_schema_v3` /
  `enrichment_policy_v3`): **24/24 succeeded**, 0 failed, cost **USD 0.7054**.
- KW now has **84/84** successful latest-proposal Terra runs across the
  84-listing catalog (81 public eligible; 0 failed; 0 never enriched).
  Policy outcomes on the latest successful proposals: 235 auto-applied
  fields, 77 needs-attention fields, 1039 rejected fields.
- Cost (`data/processed/kw_activation_final_report.md`): latest-proposal
  total **USD 3.1266**; gross (all DB Terra proposals) **USD 4.1463**;
  retained-result **USD 3.1266**; wasted/deferred **USD 1.0197**; avg per
  successful listing **USD 0.037221**; per auto-applied field **USD 0.013305**.
  Protected-source checksum unchanged; 0 duplicate proposal keys.
- `data/processed/ai_usage_reconciliation.md` documents where AI usage is
  stored (proposal/job token_usage, run_audit, local progress JSON) and why
  different reconstruction methods produce different totals; exact OpenAI
  invoice totals cannot be reconstructed from Labs data alone (reconstructed
  gross from recorded attempts ~USD 9.15 vs. a user-observed ~USD 5 OpenAI
  usage figure — the gap may include non-Terra models, unmatched transport
  retries, or account-wide usage outside this activation's scope).
- Added `/enrichment` cost & usage panel (gross vs. retained-result vs.
  wasted AI spend, token totals, structured-output failure rate, true
  attention rate) and a model-efficiency table grouped by model + prompt +
  schema version, labelling historical combinations as not directly
  comparable to the current one.
- Published `data/processed/property_source_readiness.md` (read-only audit;
  no scrapes, imports, or AI calls). Recommended next track: **RE/MAX
  enrichment preparation** (cost preflight, selection, compact v3 schema) —
  RE/MAX already has a complete 220-listing manual catalog with strong
  field coverage; Moret v0.2.0 complete catalog verified 2026-07-20 before any
  larger import or AI.
- KW remains **manual and unscheduled**. No production access, deploy,
  commit, or push.

### July 20, 2026 - RE/MAX Terra enrichment preparation

- Verified Labs RE/MAX state on `csaefdkpwukshtouyixg`: 220 listings, stable IDs/URLs, 119 public eligible, 208 XCG benchmarks, 29 historical gpt-4.1-mini v1 proposals (obsolete for v3).
- Catalog completeness proven from last successful complete run (2026-07-17) + checksum `54f8e094…9177` + local cache; live website not revalidated.
- Parser v0.4.1: coordinates from `google.maps.LatLng`, listing agent, agent-image gallery filter; local cache reparse only (no import/DB listing writes).
- Produced field/neighbourhood/currency/quality/AI-history/attribute/canary/cost reports under `data/processed/remax_*`.
- Selected five Terra canary IDs; recommended ceiling USD 1.00. No OpenAI calls, no live scrapes, no imports, no commit/push.
- RE/MAX remains **manual and unscheduled**.

### July 20, 2026 - RE/MAX five-listing Terra canary

- Ran approved canary on `hs2467`, `hr1013`, `hr2165`, `hs2941`, `hr1393` with `gpt-5.6-terra` + prompt/schema/policy v3; ceiling USD 1.00.
- Outcome: **4/5** `needs_review` successes; **1/5** `hs2467` `invalid_output` (hit configured `max_output_tokens=2500` with 1552 reasoning tokens).
- Exact recorded cost **USD 0.1644** (12,724 in / 8,839 out / 2,712 reasoning). Auto-applied 8 fields; 9 needs-attention; 56 rejected (mostly duplicates of source amenities / protected fields).
- Hardened skip logic so historical v1 proposals never block Terra v3; only identical model+prompt+schema+checksum terminal attempts skip.
- Protected source price/currency/type/beds/baths/coords/public eligibility unchanged. Timeline: 5 started / 4 completed / 1 failed.
- Verdict: **needs prompt/config repair first** (raise max output to 3500) before remaining-215; v0.4.1 coordinate import still optional/pending. No full batch, no import, no commit/push.
- RE/MAX remains **manual and unscheduled**.

### July 20, 2026 - RE/MAX remaining Terra-v3 initial backfill

- One-time GPT-5.6 Terra backfill for remaining RE/MAX listings without a matching
  successful Terra-v3 proposal for the current semantic checksum
  (`csaefdkpwukshtouyixg` only). Selection **211** (excluded **9** identical
  checksums). Job `remax_remaining_terra_backfill`: **211/211** processed,
  **0** failed; gross ≈ **USD 6.67** under USD 10 ceiling; max output tokens 3500.
- Coverage: **220/220** RE/MAX listings now have current Terra-v3
  (`listing_enrichment_v3` / `listing_enrichment_schema_v3` /
  `enrichment_policy_v3`). Protected source facts unchanged. Idempotency dry-run
  on all 220: **0** billable, USD 0. No retry batch executed.
- Normal Refresh & enrich remains new/changed only; initial backfill stays a
  separate approved action. No live RE/MAX scrape/import/refresh, schedules,
  migrations, deploy, commit, or push. RE/MAX remains **manual and unscheduled**.
  Next source-development track: **Moret** (completed catalog proof below).

### July 20, 2026 - Moret Real Estate complete-catalog verification

- Adapter **v0.2.0**: Dutch `/properties/` pagination (8 pages, `rel=next` /
  `/page/{n}/`), termination `no_next_page`, **71/71** detail dry-run success.
- Robots allow properties; delay policy 2s; sequential; repository HTTP cache.
- Identity: WordPress post ID; WPML English mirrors are aliases (distinct post
  IDs) and must not double-import; sitemap ~190 paths vs 71 Dutch archive URLs.
- Price: nested `price_area` including amount-then-`euro`; no global fallback
  for import eligibility. Currencies observed: XCG/USD/EUR; 5 from-price.
- Sale/rent from category evidence (34 sale / 37 rent). All archive rows active.
- Catalog proof artifacts under `data/processed/moret_*` (checksum `386cbe65…`).

### July 20, 2026 - Moret Real Estate v0.2.0 activation + Terra canary

- Offline-imported verified `moret_complete_catalog.json` into Labs only
  (`csaefdkpwukshtouyixg`): **66** inserts / **5** updates; first complete
  baseline; **0** missing/removed events; coords **71/71**; public eligible **71**.
- Private evidence uploads to `listing-raw-evidence` (66 new + 5 already present);
  zero website requests; geospatial neighbourhood assignment applied.
- Terra-v3 canary exactly five IDs (`post-75682`, `post-75725`, `post-74976`,
  `post-75799`, `post-74710`): **5/5** processed; exact cost **USD 0.1165** under
  USD 0.25; protected fields intact; 1 listing exception-based attention.
- Remaining 66-listing Terra backfill prepared (recommended ceiling ~USD 2.40),
  then executed the same day (see below). Idempotency after canary: re-import
  preview 0 inserts / 71 no-change; canaries skip unchanged.
- Monumentenzorg wording → **Reconnaissance required** (not Ready).
  Sotheby's wording → **Access route under investigation** (not Ready).
- Moret remains **manual/unscheduled**.

### July 20, 2026 - Monumentenzorg adapter v0.2.0

- Built `monumentenzorg_curacao` adapter **v0.2.0** for the proven 5-listing
  `estate_property` catalog on `https://monumentenzorg.cw/` (`/properties/` +
  `estate_property-sitemap.xml`; heritage `/our_property/` out of scope).
- Certifi-backed TLS verification (historical 2026-07-17 SSL/DNS blocker was a
  local trust-store / alt-domain DNS issue; leaf cert valid; never `verify=False`).
- Stable IDs `property-{wordpress_post_id}`; ANG price preservation; 2/5 numeric
  priced; sold-under-reservation scoped to primary listing; coordinates 0/5.
- Merged via PR #4 (`1268f65`).

### July 20, 2026 - Monumentenzorg Labs activation (Ready)

- Offline complete import into Labs only (`csaefdkpwukshtouyixg`): **5** inserts;
  source run `8b78353b-ec47-4126-b251-db247fcdcb1a`; checksum `b4dd8d05…`;
  public eligible **2**; sold/inactive **1**; no-price exclusions **3**;
  coordinates **0/5**; ANG original + `legacy_1_to_1` XCG for priced rows;
  evidence uploaded privately; no geocoding; no other-source writes.
- Amenity nav-contamination repair reparse (update path); amenities cleared.
- Terra-v3 canary (Bargestraat + Villa Maria): **2/2**, exact **USD 0.0269**
  under USD 0.10. Remaining **3/3**, exact **USD 0.0308**. Total ≈ **USD 0.0577**
  under USD 0.30. Policy rejected unsupported claims; **0** needs_attention;
  protected source fields unchanged. Public Browse smoke: exactly two titles.
- Data Ops **Ready**; Refresh & enrich = new/changed only; scheduling remains
  off. Next active source task: **Sotheby's** access-route investigation.

### July 20, 2026 - Moret remaining Terra-v3 initial backfill

- One-time GPT-5.6 Terra backfill for the **66** Moret listings without a matching
  successful Terra-v3 proposal (`csaefdkpwukshtouyixg` only). Excluded the five
  successful canaries. Job `moret_remaining_terra_backfill`: **66/66** processed,
  **0** failed; exact cost **USD 1.8259** under USD 2.40; max output tokens 3500.
- Coverage: **71/71** Moret listings now have current Terra-v3
  (`listing_enrichment_v3` / `listing_enrichment_schema_v3` /
  `enrichment_policy_v3`). Cumulative canary+backfill ≈ **USD 1.94**. Auto-applied
  **126** fields in the remaining batch; **32** listings with exception-based
  attention. Protected source facts unchanged. Public Browse/Passport consumes
  effective attributes (71 public; allowlisted only).
- Idempotency dry-run on all 71: **0** billable, USD 0, no OpenAI calls. No retry
  batch. Normal Refresh & enrich remains new/changed only. No live Moret
  scrape/import/refresh, other-source network, pipeline enqueue, schedule,
  migration, deploy, commit, or push. Moret remains **manual and unscheduled**.
  Next active source task: **Monumentenzorg reconnaissance**.

### July 20, 2026 - RE/MAX v0.4.1 activation + five-listing semantic refresh

- Offline-imported verified `remax_v041_reparsed_catalog.json` into Labs only
  (`csaefdkpwukshtouyixg`): **220** updates / **0** inserts; **199** coordinates;
  **193** PIP / **6** outside polygons / **21** still missing; public eligible **119**;
  **0** missing/removed lifecycle events; no evidence upload; no live scrape.
- Re-enriched exactly five semantic-change IDs (`hr2165`, `hr2185`, `hs3061`,
  `hs3103`, `hs3104`) with `gpt-5.6-terra` v3; gross AI ≈ **USD 0.27** under
  USD 0.75 ceiling (includes one repair rerun after map-hydration / skip fix).
- Idempotency: five skipped unchanged, zero OpenAI calls, USD 0.
- Initial Terra backfill completed later the same day (see above). RE/MAX remains
  **manual and unscheduled**.

### July 20, 2026 - RE/MAX v0.4.1 Data Operations preflight

- Read-only Labs + local cache reparse: 220 IDs, checksum match, **199** recoverable coordinates; Labs still 0/220 coords (imported adapter still v0.4.0).
- Geospatial preview (no writes): 193 map-inferred, 6 outside polygons, 21 still missing; effective neighbourhood changes 5 (generic source → map).
- Lifecycle/public eligibility stable; 0 missing/removed from local reparse.
- Semantic AI checksum: **5** billable after import (legacy would flip 220); initial ~215 Terra backfill separate from Refresh & enrich.
- Added RE/MAX `--preview-import` / `--import-from-file`; ran preview only. Verdict: **Import v0.4.1 first**. No DB writes, live HTTP, OpenAI, enqueue, worker, commit, or push.
- RE/MAX remains **manual and unscheduled**.

### July 17, 2026 - Keller Williams complete catalog + Terra activation

- Offline-imported the verified KW Stage-3 catalog into Labs only
  (`csaefdkpwukshtouyixg`): **84** listings; 81 public eligible / 3 excluded.
- Activated GPT-5.6 Terra enrichment with automatic evidence-backed application:
  5-listing canary, then remaining batch; total Terra spend about **USD 3.44**
  (under the USD 5 remaining-batch ceiling).
- Hardened evidence grounding (Unicode/HTML/whitespace normalization; reject
  terra/terrain false friends; non-canonical `terrasses` → needs attention).
- Batch runner: selection-file only for >5 listings, batch-size 1, cost ceiling,
  resume skips unchanged checksums (including prior failures unless forced).
- 24 listings remain retry candidates after structured-output truncation at
  `max_output_tokens=2500` (retry file written; not executed).
- KW remains **manual and unscheduled**. No production access, deploy, commit,
  or push. No RE/MAX or Moret enrichment in this activation.

### July 17, 2026 - Property Labs dashboard cleanup

- Fixed local data loading: Next.js app-local env loading did not include the
  repository-root server credentials. Required Labs values now live in the
  dashboard's ignored `.env.local`, which is Next.js's supported app boundary.
- Verified real Labs state: 265 listings (RE/MAX 220, Keller Williams 40,
  Moret 5), 162 public-safe rows, and 29 AI proposals.
- Protected all internal pages with one signed-cookie login; public
  Browse/Passport now queries only `public_property_listings`.
- Consolidated navigation to Overview, Listings, Sources, Enrichment, Quality,
  Settings, and Prototypes. Legacy duplicate routes redirect to their owner area.
- Removed the AI execution UI and disabled the job-start endpoint unless a
  separate server-only execution flag is explicitly enabled.
- Added desktop/mobile Edge route tests covering auth, real data, public
  privacy, redirects, prototype labels, and browser errors.

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
- Monumentenzorg: Reconnaissance required (public pages reachable again;
  completeness must be reverified). Not Ready.
- Sotheby's: Access route under investigation (approved public route/feed
  still required). Not Ready.
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
