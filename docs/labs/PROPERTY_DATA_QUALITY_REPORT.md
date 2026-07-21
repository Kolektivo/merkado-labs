# Property data quality pass — Labs report

**Date:** 2026-07-21 (stabilization complete; English migration + currency follow-on)  
**Branch:** `fix/property-data-quality-pass`  
**Labs project only:** `csaefdkpwukshtouyixg`  
**Current policy version:** `enrichment_policy_v5`  
**Current prompt/schema:** `listing_enrichment_v5` / `listing_enrichment_schema_v5`  
(Earlier same-day stabilization used `enrichment_policy_v4_2` with
`listing_enrichment_v4` / `listing_enrichment_schema_v4` — retained below.)

No secrets, service-role keys, raw HTML, or private proposal payloads are included here.

## Scope confirmations

- Labs only (`csaefdkpwukshtouyixg`); production (`jkrfyvukhhsapoivntms`) untouched
- No scrape, cron, OpenAI calls, Sotheby's, or CHH work in this pass
- No asset merge; no Vercel deploy

## Dataset snapshot

| Signal | Value |
|---|---|
| Ready sources | **4** — Keller Williams, RE/MAX, Moret, Monumentenzorg |
| Latest proposals (reeval) | **390** |
| OpenAI calls | **0** |
| Billable input checksums | Unchanged |
| Public eligibility (unchanged) | KW **88** / Moret **71** / RE/MAX **118** / Monumentenzorg **2** |

Sotheby's remains excluded (access BLOCKED). CHH retired/absent.

---

## Phase 1 — Root cause & corrective apply

### Residual churn after first apply

After the first policy rematerialization, a dry-run still reported **68** transitions. Root cause:

1. `_attrs_from_proposal` fed **materialized** `field_decisions` / audit decisions back as proposal inputs.
2. Dedupe used **raw keys**, not canonical keys → synonym pairs (`pets_allowed`/`pet_suitability`, `has_pool`/`pool`) survived with disagreeing statuses.

### Fix

- Immutable proposal inputs only: `features` / `attributes` / `neighbourhood` / `resort_or_gated`
- Canonical-key dedupe
- Never backfill from field_decisions or audit into proposal inputs

### Corrective apply — fixed point

Immediate post-apply dry-run: `transitions={}`, `changed=0`.

| Metric | Value |
|---|---|
| Decision bag | **5611 → 3590** (duplicate synonym rows removed, not invented) |
| auto_applied | **1730** |
| rejected | **1605** |
| redundant | **222** |
| needs_attention | **7** |
| skipped | **26** |
| openai_calls | **0** |
| Checksums | Unchanged |
| Public eligibility | Unchanged (KW88 / Moret71 / RE/MAX118 / Monumentenzorg2) |

---

## Phase 2 — Decision statuses & review UX

| Status | Meaning |
|---|---|
| `auto_applied` | Evidence-grounded, above confidence bar, safe to project |
| `redundant` | Already represented by stronger source/map/same value — not an error |
| `needs_attention` | Genuine human conflict/ambiguity; current review queue only |
| `rejected` | Unsupported, noisy, forbidden, or ungounded — no ops attention |
| `skipped` | Out of policy / not evaluated for apply |

Policy notes applied this pass:

- Same proposed value as current → **redundant**
- Empty protected bedrooms/bathrooms may gap-fill when grounded
- `price_period` month normalization
- Pets `false` only with explicit negative evidence
- Conflict override when a curated/grounded rule wins (e.g. Blue Bay gated)

Dashboard:

- Retained **current review** first; History / Advanced for audit
- Humanized **reason + code**
- Copy: high confidence can still need review

---

## Phase 3 — Image identity / gallery dedup

- RE/MAX fixture gallery slots **82 → 42** (identity/dedup)
- `build_gallery` wired in the adapter path
- Labs cleanup removed **5705** duplicate image slots: RE/MAX **5526**, KW **110**, Monumentenzorg **69**, Moret **0**

No image binary copy or scrape required.

---

## Phase 4 / 5 — Source-official currency & presentation timeline

### Currency

- Model: `source_official_conversion` for source-published alternate currencies
- Prefer official ANG/XCG for the public XCG figure when present; else Merkado conversion
- Never invent `source_official_conversion` from a Merkado/ECB rate
- **RE/MAX NAF session (follow-on):** live EUR pages omit NAF/XCG selector amounts;
  capture via `/currency/NAF/` cookie session then detail re-fetch
- **Confirmed applied example — `hr2066`:** asking **EUR 664** retained; official
  alternate **XCG 1350**; public benchmark **Cg 1350**; no `price_changed`
  (`data/processed/source_official_currency_refresh.json`, `mode=apply`)
- **KW:** inline EUR/XCG lines after the asking currency are official alts

### Timeline / events

- Dual-writer `price_changed` duplication fixed (import pipeline sole writer for price/currency/benchmark events)
- Official alternate backfill ≠ `price_changed` when asking anchor unchanged
- Presentation timeline filters rate-only, enrichment-only, and policy rematerialization noise at read-time (events retained)
- Timeline dry-run sample: **1000** events → **557** visible default, **443** suppressed

See `05` (events + presentation) and `06` (currency rules).

---

## Phase 6 — Map gaps vs neighbourhood-search gaps

Keep these separate:

| Gap | Meaning |
|---|---|
| **Map gap** | Missing coordinates — **28** listings (cannot PIP-assign) |
| **Neighbourhood-search gap** | Filter/search coverage where source neighbourhood can still help |

Rules:

- Source neighbourhood remains a **fallback for filter/search**
- Point-in-polygon (PIP) is **authoritative when coordinates exist**
- Display aliases (Blue Bay, Sint Joris, island suffixes) are display-only; no asset merge

---

## Earlier policy gains (still in force)

These remain part of the public contract (carried into v5 policy):

- Dutch/English bilingual evidence (`uitzicht op zee`, `gemeubileerde`, waterfront provenance rules)
- Blue Bay curated gated-community rule
- Waterfront on public attribute allowlist / view projection
- Neighbourhood display aliases (code + dashboard)
- Indicative price tip/icon for true foreign→XCG; MapPin on location affordances

---

## English presentation migration — status (2026-07-21)

**Status: applied (Labs).** One-time v5 English presentation migration completed
under the USD 15 / 320-call caps. Daily cron remains **Off** pending supervised
pipeline dry-run + worker activation gates.

| Signal | Value |
|---|---|
| Prompt / schema / policy | `listing_enrichment_v5` / `listing_enrichment_schema_v5` / `enrichment_policy_v5` |
| Public product language | English only (Browse / Passport / SEO) |
| Display fields | `display_title`, `display_summary`, English overview / description |
| Title convention | `N-Bedroom Type [feature] in Neighbourhood` |
| Source layer | Scrapers preserve raw title/description; AI never overwrites protected facts |
| Fallbacks | Deterministic English titles — never blank public title |
| Search | Dutch↔English synonyms, deterministic (no AI per query) |
| Stable URLs | `/browse/{uuid}` |
| Human review | Exceptional — genuine conflicts only |
| Migration job | `69dff671-9e6e-46e3-b6a0-8293b1028df5` (+ hs3095 retry `2328b2b0…`) |
| Selected | **289** active Ready |
| Result | **288** succeeded + **1** invalid_output retried → succeeded; exact cost **USD 7.79** (+ retries ~USD 0.04) |
| Post-migration selection | `selected_count=0`, `already_complete_count=289` (zero-cost skip) |
| Public coverage | **285** public rows with non-null `display_title` / `display_summary` / `display_description` |
| Needs review (v5) | **9** genuine-conflict proposals (exception queue) |
| Hash repair | Applied then dry-run fixed point (`zero_cost_repairs=0`, `billable_public=0`) |
| Cron | Still **Off** — supervised Labs pipeline dry-run / worker gates not yet executed |

### Currency follow-on (same day)

- RE/MAX NAF session refresh: **206** applied, **0** `price_changed` events
- KW inline alts refresh: **89** applied, **0** `price_changed` events
- hr2066: anchor **EUR 664**, official XCG **1350**, `source_official_conversion`; listing is currently **inactive/rented** so not in public browse; English v5 presentation stored on proposal
- Missing-price recovery: 6 RE/MAX `Starting from` parser fixes recovered + public_eligible; KW/Monumentenzorg remain no-price by source
- Image residuals (3 removed RE/MAX galleries): proven identity duplicates cleaned via `build_gallery`

## Artifacts / tooling

- Zero-cost reeval: `scripts/reeval_stored_proposals_zero_cost.py`
- Dry-run artifact (pre-fixed-point history): `data/processed/zero_cost_policy_reeval_dry_run.json`
- Presentation counts: `merkado_labs.scrapers.presentation.dry_run_presentation_counts`
- English migration: `scripts/migrate_english_presentation.py` →
  `data/processed/english_presentation_migration_report.json`
- Source-official currency refresh:
  `data/processed/source_official_currency_refresh.json`

## Recommended monitoring

1. Spot-check Blue Bay `gated_community` and Dutch `furnished` / `sea_view` / `waterfront` on Browse.
2. Confirm `needs_attention` stays near **7** unless new proposals arrive.
3. Re-run zero-cost dry-run periodically; expect `changed=0` at fixed point when policy/inputs unchanged.
4. Map Quality: track the **28** missing-coord listings separately from neighbourhood filter gaps.
5. After English `--apply`, track `already_complete_count` / residual selected queue.
6. Spot-check RE/MAX official XCG via NAF session (hr2066 pattern) and KW inline alts.
7. No unexpected interaction with active `property_pipeline_runs` during apply.
8. Cron remains Off until explicit activation-gate approval.
