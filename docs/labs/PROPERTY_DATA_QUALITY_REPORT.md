# Property data quality pass — Labs report

**Date:** 2026-07-21 (completed stabilization)  
**Branch:** `fix/property-data-quality-pass`  
**Labs project only:** `csaefdkpwukshtouyixg`  
**Policy version:** `enrichment_policy_v4_2`  
(Prompt/schema remain `listing_enrichment_v4` / `listing_enrichment_schema_v4`.)

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
- **RE/MAX listing ~1350 blocker:** official NAF/XCG amount not in stored EUR-page evidence without a NAF-view fetch (out of scope this pass)

### Timeline / events

- Dual-writer `price_changed` duplication fixed (import pipeline sole writer for price/currency/benchmark events)
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

These remain part of `enrichment_policy_v4_2` and the public contract:

- Dutch/English bilingual evidence (`uitzicht op zee`, `gemeubileerde`, waterfront provenance rules)
- Blue Bay curated gated-community rule
- Waterfront on public attribute allowlist / view projection
- Neighbourhood display aliases (code + dashboard)
- Indicative price tip/icon for true foreign→XCG; MapPin on location affordances

## Artifacts / tooling

- Zero-cost reeval: `scripts/reeval_stored_proposals_zero_cost.py`
- Dry-run artifact (pre-fixed-point history): `data/processed/zero_cost_policy_reeval_dry_run.json`
- Presentation counts: `merkado_labs.scrapers.presentation.dry_run_presentation_counts`

## Recommended monitoring

1. Spot-check Blue Bay `gated_community` and Dutch `furnished` / `sea_view` / `waterfront` on Browse.
2. Confirm `needs_attention` stays near **7** unless new proposals arrive.
3. Re-run zero-cost dry-run periodically; expect `changed=0` at fixed point when policy/inputs unchanged.
4. Map Quality: track the **28** missing-coord listings separately from neighbourhood filter gaps.
5. RE/MAX official NAF capture remains blocked without NAF-view fetch evidence.
6. No unexpected interaction with active `property_pipeline_runs` during apply.
