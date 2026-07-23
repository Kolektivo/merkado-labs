# Task: Standardize documentation to AI Product Development OS (00–12)

Status: Completed (Phase 8) — awaiting Product Lead review; not committed
Created: 2026-07-23
Approved by: Product Lead (A1–A9 refinements)
Branch or PR: `docs/standardize-documentation` from `05a1ba7`

## Goal

Reorganize Merkado Labs documentation into the standard `docs/00`–`12` structure
with research/historical evidence preserved, without losing unique information,
and without product executable-code, database, deploy, or environment changes.

## User or business problem

Agents and humans could confuse historical `08`, dual `06` files, and Labs
evidence folders with current product state. A single OS structure reduces
mistakes and makes future repos bootstrap consistently.

## Source of truth

- Approved plan + A1–A9 clarifications (chat)
- `docs/decisions/ADR-0001-standard-documentation-structure.md`

## Included scope

- Docs restructure, path reference updates, ADR + this ledger task
- Comment-only path updates in two TypeScript files
- Restore CHH richer-harvest audit from Git history into `docs/research/`

## Excluded scope

- Commits, push, merge, deploy
- Supabase / Vercel / external API / secrets / env file edits
- Executable product code changes
- Inventing missing product facts

## Acceptance criteria

- [x] Branch from baseline `05a1ba7`
- [x] Exact `00`–`12` canonical set present
- [x] Historical evidence under `research/` with HISTORICAL banners (not template)
- [x] Coverage ledger complete before source removal
- [x] Bootstrap prompt requires exact `00`–`12`
- [x] No DB/deploy/env/production access

## Local implementation verification (read-only)

Performed against filesystem/code only (no Supabase/Vercel/API):

| Target | Result |
|---|---|
| 03 routes | Verified App Router pages; flows documented |
| 04 design | Tokens/fonts/shadcn/a11y patterns documented; formal brand `[OPEN]` |
| 05 architecture | Repo map + pipeline/geo paths verified |
| 06 data model | Migrations/types/currency code paths align with merged policy |
| 07 integrations | Four Ready adapters + blocked Sotheby's + GHA workflow verified |
| 08 security | Admin cookie auth + RLS migration presence + safety refs verified |
| 09 current state | Feature presence verified; **inventory counts not re-queried** |
| 12 runbook | Scripts/workflow/env.example names verified; no vercel.json in repo |

### Doc/code mismatches

1. `/quality?tab=…` redirects exist but Quality page ignores `tab` — recorded in `03`/`09`.
2. `/agent` page still live, not primary nav — recorded in `03`/`09`.
3. Inventory metrics in `09` not re-validated against DB during this task — noted in `09`.

## SHA256 inventory (baseline, pre-migration working tree)

Captured at Phase 0 from in-scope `.md`/`.mdc` excluding `.venv`, `node_modules`,
`.pytest_cache`, `tmp-screenshots`.

```text
﻿f8f9e7bfd9f0f65f45407d69365efed378c19669371dfdadf86a9d03cd861d57  .cursor/rules/merkado-labs-safety.mdc
28b8ec89ef548d5a8b8d8d1e9d25a63cdf1f6e7fcf12a51134d2218ab36fb98b  .github/PULL_REQUEST_TEMPLATE.md
3fea4ca3efb63f1e1527d7db168e83bad7b13ede40cf76fa1f3a5448e5d30cd2  AGENTS.md
e3447d84251880fb34cfae09131cb4c57471529bbfe60976a3245793cf621627  apps/labs-dashboard/AGENTS.md
336cc4fbf19beaada7ccf9986414fa91851a8d7a07dfb3ccbe800a69eed0ab49  apps/labs-dashboard/CLAUDE.md
b94e84c2653880aa256d9e43e69d85069af300b65b106e1876e2f198211c05f4  apps/labs-dashboard/README.md
91eb02c14699435adabec182a04479ffee7b757670645c4cff9f0b38b52f13a4  CLAUDE.md
b914f8552945e46c2c5fa8125305250fc8ce8fef69b0038f0f2908a88ace721e  data/geo/cache/05_foundation/05_foundation/README.md
d911a4957566803566d9ed13d46de97f4a292826234d31d31d842922c73a38d5  data/processed/chh_cleanup_export/README.md
832dc9a9d6eaf16ef5836ef1bd369fe0a5bf665af4e837788e273c67a2a5f11e  docs/01-live-product-state.md
b8682380a79c069e11bcc5847f82b3efbb7b9d14305fa4ef91cefb3d086ed19a  docs/02-v2-vision.md
fa902b2fac5218914333de6eb44d0d54bcbb006d8592fa39d7ab65ff52a7d579  docs/03-mvp-scope-and-decisions.md
beafd794406a68170c755daa949d15cdb4fb7eb2836f45bf2dd7bd980899a9b2  docs/04-data-sources-and-scraping.md
bef3d65abbec538dfaca7fe8239eb49c7189ab05b6c163ef78190faa4cdd7df8  docs/05-data-model-and-listing-lifecycle.md
17a104e9d385e17fc968de4f5d67348345446f0fcecae9eabe3f869b19803a2e  docs/06-currency-and-pricing-rules.md
2b913dda44417e4250e10020c935e8a1d3b9ac42d3c3ef9d4674300065bb5460  docs/06-property-passport-and-intelligence.md
6ae351ab861077206df3a62c73b4294ef95da5ca81b2eac5d4bbb431c44f6b34  docs/07-labs-architecture-and-geospatial.md
445dcbc22ebb3e9e5de0715f00ff02098c6efed12087272c6803ea476804bd01  docs/08-execution-plan-and-cursor-prompt.md
525b17d41606e62dbe1e425d185ec2dae41f30ba11e8248a686d1877fba241c2  docs/09-project-safety-and-history.md
0d3c1636d6d6d1d9d20fcfc0635e3925d9f7e37c7857aa48da4240aa03310c1a  docs/ai/context-integration-prompt.md
82a2fe64ad48df756ad8b088ef207dbabd0cd6526773e96471203a36aa0a74ec  docs/ai/independent-review-prompt.md
55de0cf0d642fabfd4107026239a35e7a63d147bd2bc3d2c97c16807ec4a311b  docs/ai/meeting-notes-integration-prompt.md
ba3b32ca6c21150c00205dcb4acbfad21a23c8fa988faf9ac8ee190f0de1cc5c  docs/ai/project-bootstrap-prompt.md
7591716deadf9459f7effd367d43b51860604b03f465746650d15fa7b278e1ad  docs/ai/project-brief-template.md
d8f87d5b1f440aa08b09c598b2af39649bc034954e4c6de847a8c4396f1b737f  docs/decisions/ADR-template.md
0b885fbaddda1fdfd1317a5c02a5a5b9d4d6dae52c43ad79b3714c33be318dc0  docs/labs/EXPERIMENT_LOG.md
4bf57456e988f76d3253fe88907e42002c141a63943c542c81c8a12569f90ed7  docs/labs/PRICE_CURRENCY_AUDIT_2026-07-23.md
a1bb052259cdef34d0186837df70322f1a95c10e2796077e4e72da1bb1822692  docs/labs/PROJECT_CONTEXT.md
d7de7b3819ae76336e94b864e0bb3b4648c7f16b7c80fa5ab7f5caf6469cf5ce  docs/labs/PROPERTY_DATA_QUALITY_REPORT.md
be4461f7c88b3d734fa5b3a9ff8c3ee141ba6fc22d1f36873ddda1268777c359  docs/labs/SAFETY_RULES.md
e4de1e808f122d55b6b463927fe2f9a291008fadf40b19e740d754e374489155  docs/LABS_DASHBOARD_GUIDE.md
f2ba9c93a8f7b48ff23fa5ff5b79e2df9098eb4fc01685cc1b073af72b3cb0ac  docs/meetings/meeting-template.md
fa6def4524083d5fdeb155a25e70295fc51811d02dc66ea4f5fbb78bc5e80594  docs/merkado_n8n_complete_guide_v3.md
d97a2c08f0504c60d95a08f85def0a4f21a2289857ddbf77845eab6f24ef8a3e  docs/README.md
7542805cbf53be1e3f74d6c66862821dab1e3f8534a08f1bfb111541eebce3c1  docs/research/research-template.md
d7dc617c7aef53642059ebf602a6743fe92c51f203eb5e3018401775832a2a99  docs/supabase-architecture.md
72ab3f9a4f7abee2f1de4395c22c82c89cbec10a61804339b0476a07732e3d65  docs/tasks/TASK-template.md
0e57bc8ffe20f3ad8ef812dfcc3252ef06a31101828ac2d059cc96e1f278e1ba  docs/testing-and-uat.md
3128a8c03f462da9bd14b0f01da08c3f0ad5008886d74ca2e41c92f3a8b0c1a8  README.md
e46b475b28e11a150642de0bfc27aa0edd1a78c5d4263c736b4142ae59f0fe4d  scripts/cleanup/README.md
```

## Content-coverage ledger

Every source heading from the Phase 0 extract is mapped below. Status `Present`
means the unique unit exists in the destination (possibly consolidated wording).

| Source | Unique unit (heading/fact) | Destination | Status |
|---|---|---|---|
| `docs/README.md` | # Merkado Docs — Index | see migration matrix | Present |
| `docs/README.md` | ## Terminology (canonical) | see migration matrix | Present |
| `docs/README.md` | ## Canonical source map | see migration matrix | Present |
| `docs/README.md` | ## Labs build status (this repository) | see migration matrix | Present |
| `docs/README.md` | ## The files | see migration matrix | Present |
| `docs/README.md` | ### Continuous documentation workflows | see migration matrix | Present |
| `docs/README.md` | ### Outside `docs/` | see migration matrix | Present |
| `docs/README.md` | ## Tag legend | see migration matrix | Present |
| `docs/README.md` | ## Reading order for someone new | see migration matrix | Present |
| `docs/01-live-product-state.md` | # 01 - Merkado Live Product State | docs/09-current-state.md (git mv + verification notes) | Present |
| `docs/01-live-product-state.md` | ## 1. Production today `[LIVE]` | docs/09-current-state.md (git mv + verification notes) | Present |
| `docs/01-live-product-state.md` | ## 2. Property work in Labs `[LABS]` | docs/09-current-state.md (git mv + verification notes) | Present |
| `docs/01-live-product-state.md` | ## 3. Current property MVP direction `[WIP]` | docs/09-current-state.md (git mv + verification notes) | Present |
| `docs/01-live-product-state.md` | ## 4. Not built yet | docs/09-current-state.md (git mv + verification notes) | Present |
| `docs/01-live-product-state.md` | ## 5. Required accuracy language | docs/09-current-state.md (git mv + verification notes) | Present |
| `docs/02-v2-vision.md` | # 02 - Merkado V2 Vision | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ## 1. Core direction | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ## 2. Product layers | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ### Public marketplace | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ### Guided discovery | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ### Property Search matching (future paid alerts) | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ### Intelligence layer | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ### Future asset products | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ## 3. Property Passport vision | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ## 4. Future user journey | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ## 5. Data-source strategy | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/02-v2-vision.md` | ## 6. Long-term moat | docs/01-product-vision.md (git mv + Passport cross-links) | Present |
| `docs/03-mvp-scope-and-decisions.md` | # 03 - MVP Scope, Decisions & Open Questions | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 1. MVP goal | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 2. MVP deliverables | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 3. Resolved decisions | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 4. Reality check | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 5. Out of scope for the current direct-source MVP | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ### Labs What Fits Me readiness (updated 2026-07-23) | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 6. Intelligence activation gate `[DEFERRED]` | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 7. Future What Fits Me? and Agent boundaries | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ### What Fits Me? | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ### Merkado Agent | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ### Match Report | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/03-mvp-scope-and-decisions.md` | ## 8. Remaining open questions | docs/02-scope-and-decisions.md (git mv + Passport intelligence framing) | Present |
| `docs/04-data-sources-and-scraping.md` | # 04 - Direct Data Sources & Scraping | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## Automation foundation (Labs only) | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 1. Approved sources | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ### RE/MAX Curaçao (`remax_curacao`) — verified 2026-07-20 (v0.4.1 Data Ops preflight) | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ### Keller Williams Curaçao (`keller_williams_curacao`) — [LABS] 2026-07-17 | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ### Moret Real Estate (`moret_real_estate`) — [LABS] 2026-07-20 | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ### Monumentenzorg Curaçao (`monumentenzorg_curacao`) — [LABS] Ready 2026-07-20 (adapter v0.2.0) | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ### Adapter status — July 2026 | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ### Source readiness matrix and next track | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 2. CHH removal rule (historical — completed 2026-07-16) | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 3. Adapter contract | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 4. Scraping rules | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 5. Source-run health | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 6. Recommended build order | docs/07-integrations.md (git mv) | Present |
| `docs/04-data-sources-and-scraping.md` | ## 7. Per-source QA checklist | docs/07-integrations.md (git mv) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | # 05 - Data Model, Currency & Listing Lifecycle | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## Naming contract | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 1. Current foundation `[LABS]` | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Listing origins | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Complete vs partial source runs | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 2. Public eligibility | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 3. Price provenance | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Conversion rules | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Anchor-currency inference | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### UI copy | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 4. Date model | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 5. Lifecycle states (canonical) | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 6. Immutable activity events | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Source vs presentation layers | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### AI enrichment tables | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Source / effective / enriched precedence | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Price events vs benchmark (do not conflate) | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Presentation timeline (Passport contract) | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 7. Sold and removed handling | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Sold | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Removed | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 8. CHH Labs data cleanup | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Final Labs synthetic cleanup (2026-07-23) | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ## 9. RLS and public/admin access | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/05-data-model-and-listing-lifecycle.md` | ### Labs admin auth limitations `[RISK]` | docs/06-data-model.md (git mv + currency section + Passport identity) | Present |
| `docs/06-currency-and-pricing-rules.md` | # 06 - Currency and Pricing Rules | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 1. Principles | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 2. Fixed conversions | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 3. Approved EUR → XCG policy | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ### Stored provenance | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ### Failure behaviour | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ### Manual / test rates | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 4. Public eligibility | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 5. Confirmed RE/MAX ECB application (2026-07-16) | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 6. XCG-primary display (Labs dashboard) | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 7. Source-official alternate currencies (Phase 4) | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ### Confirmed example — RE/MAX `hr2066` (2026-07-21) | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ### Event semantics | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ### XCG price-over-time chart | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-currency-and-pricing-rules.md` | ## 8. Listing-level price audit (2026-07-23) | docs/06-data-model.md § Currency, pricing, and normalization rules | Present |
| `docs/06-property-passport-and-intelligence.md` | # 06 - Property Passport & Intelligence Layer | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 1. Passport definition | docs/01-product-vision.md § Passport framing | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 2. MVP identity model | docs/06-data-model.md § Property Passport identity | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 3. MVP Passport sections | docs/03-user-flows.md §4 + docs/06-data-model.md manual rules | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Labs public Passport preview (`/browse/[id]`) | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Labs admin manual Passport rules | docs/06-data-model.md | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Current listing | docs/03-user-flows.md / docs/06-data-model.md | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Price | docs/06-data-model.md currency + Passport sections | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Activity timeline | docs/03-user-flows.md §4.2 + docs/06-data-model.md | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Provenance labels | docs/06-data-model.md + docs/04-design-system.md | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 4. Required public copy | docs/03-user-flows.md §4.3 + docs/04-design-system.md | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 5. Intelligence foundation in MVP | docs/02-scope-and-decisions.md § Preserved Passport intelligence framing | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 6. Future guided-search journey `[PLANNED AFTER ACTIVATION]` | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Step 1A: Direct Property Search Request | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Step 1B: What Fits Me | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### Step 2: Future paid matching / alerts | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 7. Personalized Match Report | docs/02-scope-and-decisions.md preserved framing | Present |
| `docs/06-property-passport-and-intelligence.md` | ### A. Listing evidence | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### B. User-specific perspective | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### C. Future evidence-backed signals | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ### D. Actions | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 8. Matching and evidence rules | docs/02-scope-and-decisions.md preserved framing | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 9. User data and privacy principles | docs/08-security-and-privacy.md §7 | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 10. Suggested future product entities | docs/06-data-model.md | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 11. Activation gate for What Fits Me? and Merkado Agent | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 12. Recommended delivery order after activation | Split across 01/02/03/06/08/10 — see Passport coverage notes | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 13. Other deferred intelligence products | docs/02-scope-and-decisions.md preserved framing | Present |
| `docs/06-property-passport-and-intelligence.md` | ## 14. Future evolution | docs/02-scope-and-decisions.md preserved framing | Present |
| `docs/07-labs-architecture-and-geospatial.md` | # 07 - Labs Architecture & Geospatial Layer | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 1. Environment boundary | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 2. High-level model | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 3. Source-neutral import flow | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Labs admin native listing path (prototype) | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Evidence layers | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### OpenAI enrichment (Labs only) | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Public-effective data contract (Browse / Passport) | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Security model (Labs read access) | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Labs product surfaces | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### RE/MAX refresh (2026-07-17) and Terra prep (2026-07-20) | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 4. Geospatial principles | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Map gaps vs neighbourhood-search gaps | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Effective neighbourhood (dashboard) | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ### Canonical neighbourhood display aliases | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 5. Assignment operations | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 6. Dashboard requirements | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/07-labs-architecture-and-geospatial.md` | ## 7. Migration and rollback rules | docs/05-architecture.md (git mv + repo map) | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | # 08 - Execution Plan & Cursor Prompt | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ## 1. Working approach | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ## 2. Execution phases | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ### Phase 1 - Inspect and remove CHH | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ### Phase 2 - Make the foundation source-neutral | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ### Phase 3 - Build direct adapters | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ### Phase 4 - Update dashboard/read models | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ### Phase 5 - Schedule carefully | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/08-execution-plan-and-cursor-prompt.md` | ## 3. Ready-to-paste Cursor prompt | docs/research/historical-chh-direct-source-execution-plan-2026.md | Present |
| `docs/09-project-safety-and-history.md` | # 09 - Project Safety, Reading Order & Decision History | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 1. Reading order | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 2. Environment safety | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 3. Required workflow | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 4. CHH retirement safety | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 5. Deployment safety | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 6. Decision history | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 23, 2026 - Labs admin native listing prototype | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 21, 2026 - Quality pass, bilingual presentation, automation armed On | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 17, 2026 - KW retry batch, Terra completion, and AI cost observability | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Property Labs final readiness audit | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - RE/MAX Terra enrichment preparation | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - RE/MAX five-listing Terra canary | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - RE/MAX remaining Terra-v3 initial backfill | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Moret Real Estate complete-catalog verification | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Moret Real Estate v0.2.0 activation + Terra canary | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Sotheby's access-route recon (BLOCKED) | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Monumentenzorg adapter v0.2.0 | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Monumentenzorg Labs activation (Ready) | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - Moret remaining Terra-v3 initial backfill | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - RE/MAX v0.4.1 activation + five-listing semantic refresh | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 20, 2026 - RE/MAX v0.4.1 Data Operations preflight | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 17, 2026 - Keller Williams complete catalog + Terra activation | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 17, 2026 - Property Labs dashboard cleanup | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 17, 2026 - Property V2 stabilization and recovery | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 17, 2026 - Property V2 continuation (imports + AI + matching) | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 17, 2026 - Property V2 security, KW adapter, Labs product previews | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 16, 2026 - Direct-source property MVP | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 16, 2026 - Phase 1.1 cleanup preparation | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 16, 2026 - CHH Labs data deletion completed | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 16, 2026 - ECB EUR benchmark policy + full catalog dry run | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 16, 2026 - First complete RE/MAX manual Labs import | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### July 16, 2026 - RE/MAX bounded proof (earlier) | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ### Earlier Labs foundation | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 7. Compact historical lessons from CHH | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/09-project-safety-and-history.md` | ## 8. Tag legend | 08 safety + 12 deploy + 00 reading order + research/decision-history-and-chh-lessons.md | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | # Merkado Property Labs Dashboard Guide | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | ## Start Labs locally | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | ## Log in | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | ## Main pages | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | ## Understand source runs | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | ## Troubleshoot database loading | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | ## Do not run without approval | 03 flows + 05 surfaces + 12 runbook | Present |
| `docs/testing-and-uat.md` | # Testing and Product Lead UAT | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ## Automated checks | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ### Python (repository root) | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ### Labs dashboard (`apps/labs-dashboard`) | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ### What CI runs today | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ## Critical Labs flows (manual) | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ## Product Lead UAT format | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ## Roles | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/testing-and-uat.md` | ## Approval | docs/11-testing-and-uat.md (git mv) | Present |
| `docs/labs/PROJECT_CONTEXT.md` | # Merkado Labs Project Context | 00/05/08 (region, repo map, pointers) | Present |
| `docs/labs/PROJECT_CONTEXT.md` | ## Where to read next | 00/05/08 (region, repo map, pointers) | Present |
| `docs/labs/PROJECT_CONTEXT.md` | ## Labs identity and safety | 00/05/08 (region, repo map, pointers) | Present |
| `docs/labs/PROJECT_CONTEXT.md` | ## What this repository contains `[LABS]` | 00/05/08 (region, repo map, pointers) | Present |
| `docs/labs/SAFETY_RULES.md` | # Merkado Labs Safety Rules | docs/08-security-and-privacy.md | Present |
| `docs/labs/SAFETY_RULES.md` | ## Vercel | docs/08-security-and-privacy.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | # Experiment log | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## 2026-07-16 — RE/MAX BonBini controlled enrichment adapter `[LABS]` | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Next step | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## 2026-07-16 — CHH richer harvest + realtor attribution `[LABS]` | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Next step | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## 2026-07 — CaribbeanHouseHunt full snapshot harvest `[LABS]` | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Next step | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## 2026-07 — Labs property foundation + market signals `[LABS]` | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## 2026-07 — Geospatial neighbourhood layer `[LABS]` | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## 2026-07 — Read-only Labs dashboard `[LABS]` | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ## Template (copy for new experiments) | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Date | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Experiment name | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Source website | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Goal | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Hypothesis | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Method | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Data collected | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Data-quality findings | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Errors and limitations | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Result | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Decision | docs/research/experiment-log.md | Present |
| `docs/labs/EXPERIMENT_LOG.md` | ### Next step | docs/research/experiment-log.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | # Property data quality pass — Labs report | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Scope confirmations | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Dataset snapshot | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Phase 1 — Root cause & corrective apply | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Residual churn after first apply | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Fix | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Corrective apply — fixed point | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Phase 2 — Decision statuses & review UX | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Phase 3 — Image identity / gallery dedup | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Phase 4 / 5 — Source-official currency & presentation timeline | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Currency | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Timeline / events | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Phase 6 — Map gaps vs neighbourhood-search gaps | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Earlier policy gains (still in force) | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## English presentation migration — status (2026-07-21) | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Dutch About-this-property backfill (same day) | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Currency follow-on (same day) | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ### Automation validation follow-on (same day / tip `d2abb557`) | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Artifacts / tooling | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md` | ## Recommended monitoring | docs/research/property-data-quality-report-2026-07-21.md | Present |
| `docs/labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` | # Labs Price & Currency Audit — 2026-07-23 | docs/research/price-currency-audit-2026-07-23.md | Present |
| `docs/labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` | ## Verdict | docs/research/price-currency-audit-2026-07-23.md | Present |
| `docs/labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` | ## Reviewed false positive: 50 USD rows | docs/research/price-currency-audit-2026-07-23.md | Present |
| `docs/labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` | ## Listing-level no-price anomalies | docs/research/price-currency-audit-2026-07-23.md | Present |
| `docs/labs/PRICE_CURRENCY_AUDIT_2026-07-23.md` | ## Presentation and provenance handling | docs/research/price-currency-audit-2026-07-23.md | Present |
| `docs/supabase-architecture.md` | # Merkado V1 — Supabase Architecture Reference | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 1. High-Level Architecture | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 2. Core Tables | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listings (main entity) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ### Value Formats | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listing_images | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listing_details (1-to-1) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ### Value Formats | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listing_features (many-to-1) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listing_favorites | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listing_reports | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## contact_events | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 3. User System | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## auth.users | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## profiles (private) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## public_profiles (view) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 4. Scraping System | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## sources | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | ## listing_sources | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 5. Storage | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 6. RLS Model (Simplified) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 7. AI Integration Model | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 8. Image Rendering Rule (Frontend) | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 9. Deletion Rules | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 10. Freshness Model | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/supabase-architecture.md` | # 11. Mental Model Summary | docs/research/legacy-v1-cars-supabase-architecture.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # Merkado V1 — n8n Scraping & Supabase Complete Guide | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 1. Architecture Overview | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 2. Supabase Tables — What n8n Can and Cannot Touch | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ## Tables n8n writes to: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ## Tables n8n NEVER writes to: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 3. Merkado UI Categories (The Target) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### body_type (stored in `listings.body_type`) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### fuel_type (stored in `listings.fuel_type`) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### condition (stored in `listings.condition`) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### transmission (stored in `listings.transmission`) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### drive_type (stored in `listing_details.drive_type`) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 4. Realistic Data Expectations from Curaçao Sources | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### What each source typically has: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 5. listings Table — Field Rules for Scraped Data | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Fields that MUST be set: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Fields the scraper should always TRY to extract: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Fields to extract when available (NULL if not found): | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Minimum to import a listing: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 6. listing_details Table — Extra Specs | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 7. listing_features Table — Feature Tags | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 8. listing_images — Multiple Images Per Listing | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 9. sources Table | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 10. listing_sources — Deduplication Core | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 11. Deduplication System | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ## Same-Source Dedup (Active) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ## Fingerprint Generation (Stored, not actively queried) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 12. Update Strategy for Scraped Listings | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 13. Frontend Display Rule | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 14. Source Reference (Already in Supabase) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 15. Complete Workflow List | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 16. Scraper Workflow Structure | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Key nodes in detail: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 17. Parsing Make / Model / Trim from Combined Title Strings | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Parsing Strategy: Known Makes + Model Lookup | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Known Makes List (Common in Curaçao) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Known Multi-Word Models (Must Match as a Unit) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Edge Cases | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Fallback: What If Parsing Fails? | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 18. Normalization Rules (Apply During Extraction) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Currency | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Transmission → must map to Merkado values | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Fuel Type → must map to Merkado values | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Body Type → must map to Merkado values | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Condition → must map to Merkado values | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Drive Type → stored in `listing_details.drive_type` | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Mileage | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Year | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Description | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Text Patterns Common in Curaçao Listings | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Regex Patterns for Extraction (Helpers) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 19. Slug Generation | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 20. AI Enrichment Workflow (Workflow #6) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Architecture | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 1: Fetch data (Nodes 01–04) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 2: Build candidates (Node 05) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 3: Batch and send to AI (Nodes 06–08) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### AI Prompt — What It Does | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 4: Parse and write (Nodes 09–13) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### What the AI NEVER fills: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 21. Freshness Check Workflow (Workflow #7) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### How it works: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 1: Get all scraped listings (Node 02) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 2: Find stale listings (Node 03) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 3: Safety check (Node 04) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Step 4: Mark expired (Node 04) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | ### Key differences from original design: | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 22. Safety Rules (Must ALWAYS Be Followed) | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 23. Error Handling | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `docs/merkado_n8n_complete_guide_v3.md` | # 24. Mental Model Summary | docs/research/legacy-v1-cars-n8n-guide-v3.md | Present |
| `AGENTS.md` | # Project instructions | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Product Lead | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Start here | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Source priority | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Working rules | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ### Merkado Labs safety (mandatory) | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Documentation | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ### Documentation Synchronization Protocol | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ### Meeting Notes Workflow | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Verification | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `AGENTS.md` | ## Definition of done | AGENTS.md (updated in place for 00–12 sync protocol) | Present |
| `README.md` | # Merkado Labs | README.md (paths) + 12 for full ops | Present |
| `README.md` | ## What exists today | README.md (paths) + 12 for full ops | Present |
| `README.md` | ## Local setup (Python) | README.md (paths) + 12 for full ops | Present |
| `README.md` | ## Labs dashboard (Next.js) | README.md (paths) + 12 for full ops | Present |
| `README.md` | ## Validation | README.md (paths) + 12 for full ops | Present |
| `README.md` | ## Docs | README.md (paths) + 12 for full ops | Present |
| `CLAUDE.md` | ## Claude Code | CLAUDE.md (unchanged thin wrapper) | Present |
| `docs/labs/CHH_RICHER_HARVEST_AUDIT.md (git history)` | Full audit body 2026-07-16 | docs/research/historical-chh-richer-harvest-audit-2026-07-16.md (restored from 17102ee) | Present |
| `docs/09-project-safety-and-history.md` | ## 2–5 Environment/workflow/CHH/deploy safety | docs/08-security-and-privacy.md + docs/12-deployment-runbook.md | Present |
| `docs/09-project-safety-and-history.md` | ## 6–7 Decision history + CHH lessons | docs/research/decision-history-and-chh-lessons.md | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | Start Labs locally / env / login | docs/12-deployment-runbook.md | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | Main pages / journeys | docs/03-user-flows.md | Present |
| `docs/LABS_DASHBOARD_GUIDE.md` | Source maturity / troubleshoot / do-not-run | docs/12-deployment-runbook.md | Present |
| `Local verification` | Quality ?tab= redirects inert | docs/09-current-state.md verification notes + docs/03-user-flows.md | Mismatch recorded |
| `Local verification` | /agent page exists off primary nav | docs/09-current-state.md + docs/03-user-flows.md | Mismatch recorded |
| `Local verification` | Live DB inventory counts not re-queried | docs/09-current-state.md note | Verification limit |

## Technical plan

| Step | Work | Status |
| --- | --- | --- |
| 0 | Branch, ADR, task, SHA256 | Done |
| 1 | Local verification | Done |
| 2 | Ledger | Done (this file) |
| 3 | Historical moves + restore audit | Done |
| 4 | Direct renames | Done |
| 5 | Merges/splits/creates | Done |
| 6 | Coverage gate + remove sources | Done (`docs/labs/` removed) |
| 7 | Reference sweep | Done |
| 8 | Archive + validate | Done (this archive path) |

## Completion

- Implemented: docs standardization Phases 0–8
- Canonical docs: `00`–`12` + research + ADR-0001
- Current state: `docs/09-current-state.md` (verification notes added; counts not re-queried)
- Archived to: `docs/tasks/archive/2026-07-23-docs-standardization.md`
