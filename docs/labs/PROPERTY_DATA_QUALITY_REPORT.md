# Property data quality pass — Labs report

**Date:** 2026-07-21  
**Branch:** `fix/property-data-quality-pass`  
**Labs project only:** `csaefdkpwukshtouyixg`  
**Policy version:** `enrichment_policy_v4_2`  
(Prompt/schema remain `listing_enrichment_v4` / `listing_enrichment_schema_v4`.)

No secrets, service-role keys, raw HTML, or private proposal payloads are included here.

## Dataset (contracts + dry-run)

| Signal | Value |
|---|---|
| Listings considered (zero-cost reeval dry-run) | **402** |
| Ready sources in scope | **4** — Keller Williams, RE/MAX, Moret, Monumentenzorg |
| Sotheby's | Excluded (access route BLOCKED; not Ready) |
| CHH | Retired / removed from active repo and Labs inventory |
| OpenAI calls / AI cost (reeval) | **0** / **USD 0.00** |

Live Labs snapshot (2026-07-21, read-only):

| Source | Listings | Public-eligible | Active | Missing coords | Missing/invalid price |
|---|---:|---:|---:|---:|---:|
| Keller Williams | 104 | 88 | 90 | 2 | 14 |
| Monumentenzorg | 5 | 2 | 4 | 5 | 3 |
| Moret | 71 | 71 | 71 | 0 | 0 |
| RE/MAX | 222 | 118 | 124 | 21 | 12 |
| **Public view rows** | | **279** | | | |

Sotheby's remains `adapter_status=recon` (not Ready). CHH absent.

## Root cause (why fields were under-applied)

1. **Dutch synonym gaps** — evidence/normalization missed common forms such as `uitzicht op zee` (sea view), `aan zee` / waterfront phrases, and `gemeubileerde` (furnished), so grounded proposals were rejected or never matched.
2. **Blue Bay gated community** — model often contradicted itself; gated was not auto-applied without a curated location rule for Blue Bay / Blue Bay Resort variants.
3. **Waterfront public allowlist** — `waterfront` could be decided internally but was missing from the public attribute allowlist / view projection, so Browse/Passport could not surface it.

## Zero-cost policy reeval (dry-run)

Artifact: `data/processed/zero_cost_policy_reeval_dry_run.json`  
(`mode: dry_run`, `policy_version: enrichment_policy_v4_2`, latest refresh after curated-gated conflict override)

| Metric | Count |
|---|---|
| Proposals inspected | 390 |
| Listings considered | 402 |
| Changed decisions | 456 |
| OpenAI calls | 0 |

**Before → after status totals (field decisions):**

| Status | Before | After |
|---|---:|---:|
| auto_applied | 3216 | 3455 |
| rejected | 1989 | 1690 |
| needs_attention | 45 | 94 |
| redundant | 279 | 343 |
| missing | 53 | *(cleared into other buckets)* |
| skipped | 29 | 29 |

**Main transitions:** `rejected→auto_applied` 215; `rejected→needs_attention` 70; `rejected→redundant` 63; `missing→auto_applied` 35; `auto_applied→needs_attention` 17; `needs_attention→rejected` 32; `needs_attention→auto_applied` 6.

Example listings (dry-run, not yet persisted):

| Listing | Field | Transition |
|---|---|---|
| `e6885eab-…` | `sea_view` | rejected → auto_applied (`uitzicht op zee`) |
| `872abe4a-…` | `furnished` | rejected → auto_applied (`gemeubileerde`) |
| `872abe4a-…` | `gated_community` | rejected → auto_applied (Blue Bay curated location) |

(`waterfront` on `e6885eab-…` was already auto_applied in stored decisions; public allowlist migration now projects it when applied attributes include it.)

### Apply status

**DB apply SKIPPED.** Write path refused while `property_pipeline_runs` had `status=running` (apply is blocked when a pipeline run is active). Dry-run only; proposal rows in Labs were not rematerialized yet.

## Neighbourhood canonicalization (display only)

Safe display aliases (source/map/AI evidence strings preserved elsewhere):

- Blue Bay marketing variants → **Blue Bay**
- Island suffixes (`… Curaçao` / `… Curacao`) stripped or aliased where reviewed
- **St. Joris** → **Sint Joris**
- Ambiguous multi-place / uncertain forms kept separate (no forced merge)

Implementation: `src/merkado_labs/enrichment/neighbourhood_canonical.py` + dashboard `neighbourhood-aliases.ts`.

## UI (Labs dashboard)

- **Indicative price:** tip/icon beside primary XCG when original currency is foreign → XCG (not a repeated inline disclaimer sentence).
- **MapPin** on browse/listing location affordances.
- Enrichment review shows **humanized reason-code labels** (not raw snake_case alone).

## Fixes applied in code vs pending DB

| Area | In code / migrations (repo) | Labs DB |
|---|---|---|
| Policy `enrichment_policy_v4_2`, bilingual evidence, Dutch synonyms, Blue Bay curated gated rule, reason codes | Yes | Rematerialize pending (apply after pipeline idle) |
| Neighbourhood display aliases | Yes | Display-layer; no asset merge |
| Indicative tip icon, MapPin, reason labels | Yes | N/A (frontend) |
| Waterfront on public attribute allowlist | Migration file(s) under `supabase/migrations/` | Apply migration when approved; then rematerialize proposals |
| Zero-cost reeval script | `scripts/reeval_stored_proposals_zero_cost.py` | Dry-run done; `--apply` pending |

## Remaining manual review / limitations

- Higher `needs_attention` after dry-run (45 → 133) — expected: more conflicts/ambiguity surface for human review rather than quiet reject.
- Waterfront still requires careful evidence (proximity-to-sea language must not prove waterfront).
- Uncertain neighbourhood strings stay unmerged by design.
- Public Browse only reflects allowlisted `auto_applied` attributes after DB apply + view migration.
- Sotheby's / CHH / scrapers / cron / production remain out of scope for this pass.

## Confirmations

- **Zero AI cost** for policy reeval (`openai_calls: 0`, `ai_cost_usd: 0`).
- **Billable input checksums untouched** — rematerialization does not create billable AI work; policy alone does not enqueue OpenAI.
- No scrape, cron, production (`jkrfyvukhhsapoivntms`), Sotheby's, or CHH changes in this pass.

## Recommended monitoring checks

1. When pipeline is idle: re-run zero-cost reeval with `--apply`; confirm `openai_calls` stays 0 and billable skip/checksum behaviour unchanged.
2. Spot-check Blue Bay listings for `gated_community` auto-apply + curated-location reason codes.
3. Spot-check Dutch copy for `furnished` / `sea_view` / `waterfront` after apply.
4. After waterfront migration: confirm `public_property_listings.public_attributes` can include waterfront; Browse filters/detail show the label.
5. Neighbourhood filters: Blue Bay / Sint Joris / suffix variants collapse correctly; uncertain labels still distinct.
6. Price UX: foreign→XCG shows tip icon only; XCG/ANG/NAf identity cases do not.
7. Enrichment review queue size and true attention rate after rematerialization.
8. No unexpected `property_pipeline_runs` interaction (apply only when idle).
