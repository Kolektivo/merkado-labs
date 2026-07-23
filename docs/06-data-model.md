# 06 - Data Model and Listing Lifecycle

**Purpose:** Canonical implementation rules for storing source truth, benchmark prices, source-run health, listing history, and Labs admin native listings in Merkado Labs.

**Labs project only:** `csaefdkpwukshtouyixg`

## Naming contract

- **Properties** is the umbrella for marketplace assets.
- Production-boundary discriminator: `property_type` ∈ {`car`, `real_estate`}.
- Real-estate subtypes use `real_estate_type`.
- Labs `property_listings.property_type` remains the scraped/legacy **subtype
  label** (house, apartment, …). Native rows also set `real_estate_type`
  explicitly and mirror the subtype into `property_type` for existing filters —
  never reinterpret Labs subtype values as `car|real_estate`.

## 1. Current foundation `[LABS]`

Existing concepts include:

- property sources and source listings;
- canonical property assets without automatic linking;
- immutable listing observations;
- immutable price observations;
- source-run health (`property_source_runs`);
- immutable listing activity events (`listing_activity_events`);
- original/benchmark currency provenance columns on listings;
- lifecycle fields (`source_listed_at`, `sold_at`, `missing_since`, `removed_at`, …);
- ingestion quarantine;
- neighbourhoods and geospatial assignment;
- experimental market signals and contract assessments;
- Labs dashboard (ops + Data Operations + Browse + Enrichment review — not read-only);
- Labs admin native/manual listings (`listing_origin=manual`) with Storage images.

Inspect actual migrations before finalizing column names. Use forward-only additive changes.

Applied forward migrations for the direct-source MVP foundation (Labs only):

- `20260716180000_direct_source_foundation.sql`
- `20260716180100_seed_approved_property_sources.sql`
- `20260716190000_chh_cleanup_immutable_delete_helper.sql`
- `20260716192000_remax_import_run_counters.sql`
- `20260717120000_evidence_and_ai_enrichment_foundation.sql`
- `20260717140000_v2_security_review_and_search_foundation.sql` — AI RLS lockdown,
  proposal review fields, `public_property_listings` view, Search Request / Agent /
  Match Report preview tables
- `20260717160000_property_v2_rls_and_eligibility_hardening.sql` — revoke anon from
  internal property tables; eligibility backfill; public view SELECT-only
- `20260717161000_public_listings_view_security_definer.sql` — public view runs as
  owner (`security_invoker=false`) so anon can read the projection without table grants
- `20260720120000_property_pipeline_orchestration.sql` /
  `20260721090000_property_pipeline_automation_foundation.sql` — pipeline locks/runs
- `20260720140000_public_property_listings_effective.sql` — replaces view
  `public.public_property_listings` (filename says “effective”; there is no
  separate `public_property_listings_effective` relation)
- `20260720180000_enrichment_quality_v4_public_effective.sql` — enrichment quality v4
- `20260720210000_review_v41_and_public_image_galleries.sql` — review_v41 galleries
- `20260721140000_source_official_currency_and_presentation.sql` — official alts +
  presentation timeline fields
- `20260721131309_english_presentation_public_effective.sql` — English
  `display_title` / `display_summary` on `public_property_listings` (prefers v5)
- `20260721155626_bilingual_display_descriptions.sql` — Dutch
  `listing_display_description_locales` + `display_description_nl` on the
  public view (English description unchanged; raw source preserved)
- `20260723120000_native_manual_listing_foundation.sql` — origin/contact/publish
  columns, draft/unpublished statuses, manual activity events, `listing_images`,
  `listing-images` Storage bucket
- `20260723120100_native_manual_public_listings_view.sql` — origin-aware
  `public_property_listings` (manual rows without scraper URL)
- `20260723140000_native_listing_hardening.sql` — at most one primary image per
  listing; `apply_native_listing_lifecycle` RPC so manual status + Passport
  event + eligibility commit atomically (service-role only)
- `20260723150000_native_listing_image_delete.sql` — atomic manual image removal,
  reorder/cover normalization, public projection, eligibility recomputation,
  and Passport event (service-role only)
- `20260723151000_native_listing_image_delete_jsonb_fix.sql` — forward fix for
  the deployed JSONB `image_urls` projection used by the image-delete RPC
- `20260723152000_native_listing_image_reorder_atomic.sql` — exact-permutation
  image reorder serialized with deletion so cover selection stays consistent

Labs public-effective + pipeline migrations above are **applied** (verify with
`list_migrations` before assuming a new file is live). Production merkado.cw
property migration remains **paused**.

### Listing origins

| Origin | Who creates | Identity | Media | Absence / removal |
|---|---|---|---|---|
| `scraped` | Direct-source adapters | `property_source_id` + `external_id` + `source_url` | External image URLs | Complete successful source snapshots |
| `manual` | Labs admin cookie (prototype) | Listing id; no source URL required | Merkado Storage `listing-images` | Owner/admin actions only — never `missing_from_source` / `removed_from_source` |

Production authenticated seller accounts (`seller_id = auth.uid()`) remain
**planned** on merkado.cw and are not this Labs admin prototype.

### Complete vs partial source runs

| Outcome | When | May create missing/removed? |
|---|---|---|
| `success` + `metadata.complete_catalog=true` | Full configured catalog finished with no caps (`max_items`/`max_pages`), no truncation, no relevant fetch/parser failures | Yes |
| `partial` | Any bound (`max_items`, `max_pages`, URL subset, first-page only, section subset), failed fetches, parser failures, early stop, incomplete pagination/catalog proof | **No** |
| `failure` | Nothing usable produced | **No** |

`SourceRunRecord.is_complete_success` requires `outcome=success`, `completed_at` set,
`complete_catalog=true`, and no `bounded` / `max_items` / `max_pages` / `truncated` flags.
Adapters must classify source-neutrally via `classify_run_outcome`.

Moret (`moret_real_estate`) v0.2.0: first complete catalog is the Dutch
`/properties/` archive (71). A prior five-listing bounded sample must not drive
missing/removed for listings never included in a previous complete catalog.
WPML English mirrors have distinct WordPress post IDs and merge via alias
metadata — they are not separate source listings. Terra-v3 initial backfill is
complete (**71/71** current results); normal Refresh & enrich remains
new/changed only and must not re-run the one-time backfill.

## 2. Public eligibility

Common rules:

- original price is known and positive;
- current status is `active`;
- no critical identity or price validation error exists.

Origin-specific rules:

- `scraped`: source enabled/not retired; attribution + original URL; removal
  threshold not reached;
- `manual`: required publish fields + ≥1 valid image + valid contact; not
  unpublished/sold/blocked; **no** scraper URL required.

No-price records may remain in raw evidence or quarantine, but public queries must exclude them.

Manual statuses used by the Labs admin prototype: `draft`, `active`,
`unpublished`, `sold`, `inactive` (rented). Scraped statuses are unchanged.

## 3. Price provenance

Never overwrite source truth with a converted value.

Store:

| Concept | Requirement |
|---|---|
| Original amount | Exact amount extracted from the source |
| Original currency | Explicit source currency where available |
| Benchmark amount | Derived XCG value |
| Conversion rate | Exact rate used |
| Conversion method | `identity`, `legacy_1_to_1`, `usd_fixed_peg`, `eur_api`, `source_official_conversion` |
| Provider | Policy/provider identifier |
| Rate timestamp | When the rate was observed |
| Currency evidence | Source text, selector, or structured data |
| Official alternates | `official_alternate_prices` jsonb — source-published alts with provenance `source_official_conversion` |
| Inference | Boolean, reason, and confidence |

### Conversion rules

- XCG: benchmark equals original amount.
- ANG/NAf: normalize 1:1 to XCG while retaining original currency text/code.
- USD: multiply by `1.79`.
- EUR: `EUR_TO_XCG = ECB_USD_PER_EUR × 1.79` via `ecb_eur_usd_xcg_peg`.
- Prefer source-official ANG/XCG for the public XCG figure when present; else Merkado conversion.
- Never invent `source_official_conversion` from a Merkado rate.
- One source run uses one cached EUR quote.
- Store provider, derived rate, ECB observation date, and fetch provenance.
- Store raw calculation precision and round only for display.
- When the rate provider fails, keep the original value and leave benchmark pending
  (preserve any previously valid listing benchmark). Never fabricate a rate.
- Manual `--eur-rate` providers are test-only and must be labelled as such.

### Anchor-currency inference

Explicit currency always wins.

An ambiguous value ending in `000` or `500` may be a weak EUR-anchor hint only when the source exposes multiple ambiguous currency representations. Store evidence, parser version, reason, and low confidence.

Never silently replace explicit XCG, ANG, NAf, USD, or EUR.

### UI copy

Converted benchmark:

`Indicative equivalent based on known information.`

Sold listing price:

`Last known listing price. The actual sale price may differ.`

## 4. Date model

Keep these separate:

- `source_listed_at`: source-provided listing date, nullable;
- `first_seen_at`: first time Merkado observed it;
- `last_seen_at`: latest observation containing it;
- `last_successfully_seen_at`: latest complete successful run containing it;
- `missing_since`: first successful absence;
- `sold_at`: source explicitly marked sold;
- `removed_at`: removal threshold reached.

Never present `first_seen_at` as the original listing date.

## 5. Lifecycle states (canonical)

| State | Meaning | Public browse |
|---|---|---|
| `active` | Available for consideration; may still have source under-contract label | Yes (if eligible) |
| `sold` | Source explicitly marks sold | No |
| `inactive` | Not publicly offerable; used for source-marked rented (among other cases) | No |
| `missing` | Absent from first complete successful snapshot | No |
| `removed` | Absent from configured consecutive complete successful snapshots | No |
| `unknown` | Insufficient canonical mapping | No |

Source-specific labels stay on `source_listing_status` (e.g. `Active`, `Under Contract`,
`rented`). Do **not** silently remap: rented↛sold, under_contract↛sold,
inactive↛removed, removed↛sold.

Default removal threshold: two **complete successful** runs, configurable per source.

`Sold` and `removed` are never synonyms.

## 6. Immutable activity events

Use a dedicated immutable event table when current observations cannot clearly support the public timeline.

Required event types:

- `first_seen`
- `source_listed`
- `price_changed`
- `currency_changed`
- `benchmark_recalculated`
- `source_marked_sold`
- `source_marked_rented`
- `source_marked_under_contract`
- `source_returned_active`
- `source_description_changed`
- `missing_from_source`
- `removed_from_source`
- `relisted`
- `source_attribution_changed`
- `material_field_changed`

Sold/rented timestamps:

- `source_status_date`: only when the source explicitly states a date
- `first_observed_sold_at` / `first_observed_rented_at` / `first_observed_under_contract_at`:
  earliest Merkado observation detecting that status
- UI wording: **First observed as sold/rented by Merkado** — never “transaction date” or “closing date”

### Source vs presentation layers

Keep these layers separate:

| Layer | Contents | Mutability |
|---|---|---|
| Source facts | Scraped title, description, price, currency, beds/baths, status, coords, URL, external ID | Immutable facts; scrapers preserve raw text |
| Official alternates | Source-published alt currencies (`official_alternate_prices`) | Import/refresh only; not AI |
| AI proposals | Enrichment proposal JSON (v5 English presentation + attributes) | Append/new checksums; never overwrite source columns |
| Public presentation | `display_title`, `display_summary`, English overview / `display_description` | Effective projection; AI when present, else deterministic English fallbacks |

English is the only public website language. Stable URLs are `/browse/{uuid}`.
Fallbacks must never blank a public title. Search synonyms Dutch↔English are
deterministic (`apps/labs-dashboard/src/lib/search/synonyms.ts`).

### AI enrichment tables

- `ai_enrichment_jobs` — manual job progress (queued → running → completed*)
- `ai_enrichment_proposals` — model/prompt/schema/input-checksum keyed proposals
  (current foundation uses **v5**: `listing_enrichment_v5` /
  `listing_enrichment_schema_v5` / `enrichment_policy_v5`; v3/v4 JSON remains
  replayable). Dashboard versions match
  (`apps/labs-dashboard/src/lib/enrichment/versions.ts`).
- Required v5 English presentation fields: `display_title`, `display_summary`,
  `display_overview` (plus optional layout/location/highlights/practical blocks).
  Title convention: `N-Bedroom Type [optional evidenced feature] in Neighbourhood`
  (e.g. `3-Bedroom Villa with Pool in Jan Thiel`).
- Review is **exception-based / exceptional**: only genuine conflicts,
  weak/ambiguous evidence, or new-attribute taxonomy reach `needs_attention`;
  style/wording/translation choices do not require human review; unsupported,
  duplicated, noisy proposals are rejected; already-represented source/map
  values are `redundant` and never enter the attention queue. Decision rows
  carry **reason codes** (humanized in the enrichment UI).
- Evidence matching is **bilingual** (Dutch/English synonyms and spans), e.g.
  `uitzicht op zee` → sea view, `gemeubileerde` → furnished, `aan zee` →
  waterfront when provenance rules allow. Policy alone does **not** create
  billable AI work.
- **Zero-cost policy reeval** rematerializes stored proposals under the current
  policy (`scripts/reeval_stored_proposals_zero_cost.py`) without OpenAI calls
  and without changing billable input checksums. Apply is refused while
  `property_pipeline_runs` is active. Inputs must be **immutable proposal
  fields only** (features/attributes/neighbourhood/resort_or_gated) with
  **canonical-key** dedupe — never feed materialized field_decisions/audit
  back as proposal inputs (synonym churn). Prior v4.2 corrective apply reached
  fixed point 2026-07-21 (`transitions={}`, `changed=0`); see
  local `docs/private/research/` quality-pass notes (gitignored).
- Decision statuses: `auto_applied` / `redundant` (same-value or already
  represented) / `needs_attention` (current conflicts only) / `rejected` /
  `skipped`.
- v5 can auto-apply grounded neighbourhood gap-fills and English public
  presentation fields. One-time English migration
  (`scripts/migrate_english_presentation.py`) was **applied** 2026-07-21 for
  **289** active Ready listings (~USD **7.83**, under USD **15** / **320**-call
  caps) and was not rerun for bilingual work. Dutch About-this-property copy
  lives in `listing_display_description_locales` (`locale='nl'`) and projects
  as `public_property_listings.display_description_nl`. Labs public-effective /
  gallery / bilingual view migrations are applied in Labs; production
  merkado.cw property projection remains **paused**.
- Never overwrite raw evidence, price, currency, status, dates, coords, address,
  neighbourhood, realtor, source reference, or source title/description

### Source / effective / enriched precedence

Public and dashboard **effective** values resolve in this order (stronger wins):

1. Explicit source facts (never overwritten by AI)
2. Safe deterministic normalization (currency, aliases, synonym keys)
3. Effective map / neighbourhood (point-in-polygon when source is missing/generic)
4. Automatically applied, evidence-grounded AI attributes and English
   presentation (`auto_applied` only; else English fallbacks)

Rejected / needs-attention proposals, confidence, evidence snippets, tokens,
costs, and private HTML never appear on `/browse`.

Each event should store:

- listing ID;
- event type and timestamp;
- previous/new value JSON where relevant;
- source observation ID;
- derivation type: `source_fact`, `system_calculated`, or `inferred`;
- notes/confidence where relevant;
- optional additive presentation fields: `presentation_class`, `suppressed_reason`,
  `presentation_metadata` (core event facts remain immutable; presentation_* may update).

### Price events vs benchmark (do not conflate)

Keep three concepts separate:

| Concept | Meaning |
|---|---|
| **Asking anchor** | Actual amount + currency set by the seller/source |
| **Official alternate** | XCG/ANG amount officially published by the same source |
| **Merkado benchmark** | Calculated XCG equivalent using an approved exchange rate |

| Event | Means |
|---|---|
| `price_changed` | Genuine asking-**anchor amount** change only |
| `currency_changed` | Asking **currency** changed (retained in storage; never public) |
| `benchmark_recalculated` | FX/rate/provider context only; asking anchor unchanged |

Only a change to the genuine asking anchor may create a public `price_changed`.
The following must **never** create a public price-change event:

- ECB exchange-rate movement / benchmark recalculation
- source currency-selector/session differences
- updated official alternate with unchanged asking anchor
- formatting or rounding differences / identical before→after
- repeated imports / legacy dual-writer duplicates
- foreign display wobble when a source-official XCG alternate is stable

Import pipeline is the sole writer for these three. Dual-writer duplication of
`price_changed` was fixed in the 2026-07-21 quality pass. From 2026-07-23,
imports also skip `price_changed` / `currency_changed` when the source-official
XCG alternate is present and unchanged (RE/MAX display/session drift).

**Official alternate backfill ≠ `price_changed`.** Capturing or refreshing a
source-official alternate currency (e.g. RE/MAX NAF-session XCG) while the
asking anchor is unchanged must not emit `price_changed` or `currency_changed`.
It is provenance/benchmark preference only (see `06` and
`data/processed/source_official_currency_refresh.json` for hr2066).

### Presentation timeline (Passport contract)

Default listing timeline shows genuine seller/source activity. Hide/group at
read-time (do **not** delete immutable events):

- `benchmark_recalculated` (rate-only)
- `currency_changed` and currency-session `price_changed` (EUR↔XCG switches)
- non-anchor foreign display observations when an official XCG alternate exists
- same normalized XCG before/after (rounded whole Cg)
- ambiguous anchors (publicly suppressed + admin_review flag; never guess)
- policy rematerialization / enrichment-only / ops noise
- `SYSTEM_REPAIR` operational notes
- dual-writer duplicate `price_changed` / `currency_changed` (numeric-normalized)
- duplicate `first_seen` (keep earliest “First seen by Merkado” only)
- repeated identical observations
- ±1 same-currency display jitter (`suspected_display_fx_jitter`)

The shared TypeScript/Python read contract
(`activity-presentation.ts` / `presentation.py`, alias `buildPassportTimeline`)
is used by internal listing detail and public `/browse/[id]`. It is intentionally
reusable for a future **car Passport** without modifying production Merkado.

Public rendering exposes a human label, timestamp, and **XCG-only** asking
delta (`Cg 2,500 → Cg 2,750`). It never shows EUR/USD activity deltas, raw
event notes, evidence, confidence, rates, providers, tokens, or ops metadata.
“Last updated” on Passport derives from the latest **visible material** timeline
event, not scraper `last_seen_at`.

Admin-only expandable **Price provenance** retains original amount/currency,
rate, provider, method, and official-alternate vs Merkado-benchmark labelling.

Genuine history remains immutable. Prefer presentation suppress metadata over
deletion; delete only provably synthetic test data (none identified in the
2026-07-23 inventory).

Migration: `20260721140000_source_official_currency_and_presentation.sql`.

## 7. Sold and removed handling

### Sold

- Requires explicit source evidence.
- Retain last known asking price.
- Never label asking price as transaction price.
- A possible 5% negotiation margin remains internal research only until approved and validated.

### Removed

- Means the listing is no longer found after the configured threshold.
- Does not confirm a sale.
- Failed or partial runs create no missing/removal transitions.
- A reappearing listing creates a `relisted` event after identity review.

## 8. CHH Labs data cleanup

Completed 2026-07-16 against Labs project `csaefdkpwukshtouyixg`.

Before deletion:

1. Verified project reference.
2. Dry-run counts matched the verified export.
3. Complete row payloads + SHA-256 manifest under
   `data/processed/chh_cleanup_export/payloads_20260716T165840Z/`
   (manifest SHA-256 `63913ece20570a016d8d212f756c3a89ea5186848d8c1aafe77ec7a3cd65a792`).
4. Deleted in dependency-safe order (immutable observation rows required a
   temporary trigger disable / service-role helper).
5. Post-delete integrity checks passed; five approved direct sources remain.
   RE/MAX bounded sample import began after cleanup (see `09` history).

Do not edit applied migrations. Cleanup tooling under `scripts/cleanup/` is retained
only for verification against the local export; it is not an active ingestion dependency.

### Final Labs synthetic cleanup (2026-07-23)

`scripts/cleanup/final_labs_data_cleanup.py` performed a second, narrower
reviewed cleanup. It classified legitimate/keep, confirmed synthetic,
duplicate-noise/keep, and ambiguous/keep rows; required zero locks and no
running pipeline; exported complete JSONL payloads; verified the SHA-256
manifest; deleted only exact allowlisted IDs; and passed an idempotent second
apply.

- Rollback export:
  `data/processed/final_labs_cleanup_export/payloads_20260723T150208Z/`
  (private/gitignored)
- Manifest SHA-256:
  `7daa683ff9e45d461ff7d8df790f5074e2a77a8a045a519d9adacc8d2b575d30`
- Deleted: 1 synthetic rental contract, its 1 unreferenced asset, 1 queued
  unstarted AI job with 0 proposals, and 6 explicit dry-run pipeline parents
  cascading 42 stage / 71 item / 68 progress-event rows.
- Retained: all 405 source listings and their immutable history/evidence,
  canary AI jobs/proposals, real source runs (including Moret runs with stale
  notes), duplicate observations, three RE/MAX evidence-folder gaps, and the
  Search Request / Agent / 15 Match Report Labs fixtures.

The rollback payload contains full deleted rows and the keep-fixture snapshots;
restoration must be a separate reviewed dependency-order operation, never an
automatic rollback.



## Currency, pricing, and normalization rules

**Purpose:** Approved original-currency and XCG benchmark conversion policy for Merkado Labs.
**Last updated:** July 23, 2026

Canonical home for currency policy (merged from former `06-currency-and-pricing-rules.md`). Dated listing-level audit evidence is local-only under `docs/private/research/` (gitignored).

## 1. Principles

- Preserve the original asking amount and original currency as source truth
  (scraped source text or Labs admin / future user-entered amount).
- Store a separate XCG benchmark for comparison.
- Labs admin native listings use the same conversion methods; never invent
  `source_official_conversion` from a Merkado rate.
- Never present the XCG figure as a bank conversion quote, transaction rate, appraisal, or contractual amount.
- For true foreign-currency → XCG conversions, surface an **indicative tip/icon**
  (copy: **Indicative equivalent based on known information.**). Do not repeat
  that sentence inline under every price.

### 2. Fixed conversions

| Original | Rule | Provider id |
|---|---|---|
| XCG | Identity | `policy:xcg_identity` |
| ANG / NAf | 1:1 to XCG | `policy:ang_naf_1_to_1` |
| USD | `1 USD = 1.79 XCG` | `policy:usd_1_79` |

### 3. Approved EUR → XCG policy

Use the European Central Bank daily USD-per-EUR reference rate.

```
EUR_TO_XCG = ECB_USD_PER_EUR × 1.79
```

- ECB publishes the number of USD per one EUR.
- XCG is legally pegged at `1 USD = 1.79 XCG`.
- Provider identifier: `ecb_eur_usd_xcg_peg`
- Source URL: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
- One cached quote per source run (never per listing).
- Weekends/TARGET holidays reuse the latest published working-day observation.
- Maximum accepted observation age: **5 calendar days** (fail closed if older).
- Retries with conservative timeouts; no fabricated fallback.

#### Stored provenance

- original EUR amount and currency
- ECB USD-per-EUR rate
- fixed USD→XCG peg `1.79`
- derived EUR→XCG rate
- ECB observation date (`conversion_rate_at`)
- fetch timestamp (in conversion provenance / quote)
- provider id `ecb_eur_usd_xcg_peg`
- calculation method `ecb_usd_per_eur_times_usd_xcg_peg`
- adapter/import version on the source run

#### Failure behaviour

- Keep importing / retaining original source prices.
- Leave XCG benchmark pending for new rows without a prior valid benchmark.
- **Do not** overwrite a previously valid listing benchmark with null because of a temporary provider failure.
- Never silently fall back to a manual `2.00` test rate.

#### Manual / test rates

CLI `--fx-provider manual --eur-rate …` is allowed for controlled tests only.
Provider ids such as `fixed_test` / `manual_test` must be labelled as historical/manual and must not be shown as current production benchmarks after an approved ECB recalculation.
The 2026-07-23 audit confirmed **0** current listing providers with test/manual
labels. All **51** immutable historical test-rate `price_observations` remain
stored for provenance and are filtered from Passport price rows/charts.

### 4. Public eligibility

Public eligibility requires an active listing with a positive original price (among other checks).
Benchmark pending does not by itself make a listing ineligible when the original price is present.

### 5. Confirmed RE/MAX ECB application (2026-07-16)

First complete RE/MAX Labs import used ECB observation date **2026-07-16**,
USD/EUR **1.1467**, derived EUR→XCG **2.052593**, provider `ecb_eur_usd_xcg_peg`.
Prior `fixed_test` listing benchmarks were recalculated with `benchmark_recalculated`
events (not `price_changed`). Current dashboard listing values use the ECB provider.

### 6. XCG-primary display (Labs dashboard)

- XCG is the **primary** price wherever a price is displayed — listing
  detail, browse cards, listing table — formatted with the `Cg` prefix
  (literal `Cg 1,927`, not `Intl` currency style — Node and browsers
  disagree on the XCG symbol and that breaks hydration).
- **Browse cards** show XCG only (no competing original line).
- Passport overview uses XCG as the primary price; original foreign asking
  may appear once in the Source/Provenance area, never as a public activity
  delta.
- Admin detail may show the original as a secondary line when its currency
  differs from XCG/ANG/NAf (ANG and NAf are 1:1 with XCG).
- Price search and filter ranges operate on the **effective XCG** amount, not
  the original currency; a listing without a valid benchmark is excluded from
  the mixed-currency sort/filter. Never fabricate an XCG amount when no valid
  benchmark exists.
- If an original price exists but no XCG benchmark is available yet, show
  the original amount with **"XCG equivalent currently unavailable"**
  instead of fabricating a conversion.
- True foreign→XCG conversions show an indicative **tip/icon** beside the
  primary XCG amount on detail surfaces (HelpTip); browse cards omit it.
  XCG/ANG/NAf identity cases omit it. Do not repeat the indicative sentence
  as always-visible body text under the price.
- Sold listings additionally show: **Last known listing price. The actual
  sale price may differ.**
- Implementation: `apps/labs-dashboard/src/lib/domain/price-display.ts` +
  `apps/labs-dashboard/src/components/price-display.tsx`.

### 7. Source-official alternate currencies (Phase 4)

Preserve the **asking anchor** (original amount + currency) separately from any
source-published alternate currency lines. Precedence for the public XCG figure:

1. Source-official ANG/XCG alternate when present (`conversion_method =
   source_official_conversion`)
2. Else Merkado conversion (`identity` / ANG 1:1 / USD peg / ECB EUR path)

| Rule | Detail |
|---|---|
| Anchor | Exact asking amount/currency from the source |
| Official alternates | Stored on `official_alternate_prices` with provenance **`source_official_conversion`** |
| Never invent | Do **not** derive `source_official_conversion` from Merkado/ECB rates |
| Public XCG preference | Prefer official XCG/ANG when available; else Merkado conversion |
| RE/MAX | Parse “listed in {CUR}” from the disclaimer. Live EUR pages typically omit the NAF/XCG selector amount — capture via **NAF cookie session** (`GET /currency/NAF/` then re-fetch detail; `remax_naf_session` / `capture_naf_official_alternate`). Do not invent amounts from Merkado/ECB |
| KW | First currency code remains the anchor; following EUR/XCG **inline** lines are official alternates |
| Moret | Sidebar widget `data-coef` values are evidence notes only — not Merkado rates |
| Monumentenzorg | Single currency; no official alts required |

#### Confirmed example — RE/MAX `hr2066` (2026-07-21)

Labs refresh applied (`data/processed/source_official_currency_refresh.json`,
`mode=apply`):

| Field | Value |
|---|---|
| Asking anchor | **EUR 664** (unchanged) |
| Official alternate | **XCG 1350** (`source_official_conversion`, evidence `XCG 1.350 / mo.`, label `remax_naf_session`) |
| Public XCG benchmark | **Cg 1350** (official precedence over prior ECB ~1358) |
| Timeline | No `price_changed` / `currency_changed` (official alt backfill is provenance-only) |

#### Event semantics

- `price_changed` — genuine asking-**anchor amount** changed (not FX, not session)
- `currency_changed` — asking **currency** changed (stored; never shown publicly)
- `benchmark_recalculated` — FX/rate/provider context only (anchor unchanged)
- Official alternate capture/backfill with unchanged anchor ≠ `price_changed`
- Stable official XCG + foreign display/session drift ≠ `price_changed`
- Import pipeline is the sole writer for these three; lifecycle must not duplicate them
  (dual-writer `price_changed` fixed in the 2026-07-21 quality pass)
- Tiny RE/MAX display jitter (±1) is flagged
  `suspected_display_fx_jitter`, retained, and hidden from Passport timelines
- Public Passport activity deltas are **XCG-only** (`Cg A → Cg B`); original
  currency/rate/provider stay in admin **Price provenance** (see this document)

#### XCG price-over-time chart

Dashboard chart points come from **material asking-price changes** only.
Y-value = source-official XCG when stored, else Merkado benchmark at that event.
Tooltips show original amount/currency + provenance. Rate-only changes do not move the chart.

### 8. Listing-level price audit (2026-07-23)

Audited all **405** Labs listings and the public-effective projection:

- **385** priced listings have positive original amounts, positive XCG
  benchmarks, and valid current provenance.
- **20** no-price source listings are public-ineligible; they are listed in
  local `docs/private/research/` price-currency audit notes (gitignored).
- **283** public rows therefore display/filter/sort with XCG primary.
- Current methods: 205 source-official conversions, 160 XCG identity, 11 ECB
  EUR, 7 fixed USD peg, 2 legacy ANG/NAf 1:1, and 20 no-price/no-conversion.
- A naive USD×1.79 check flagged **50** rows. Review showed every row uses
  `source_official_conversion` / `source:official_alternate`: authoritative
  whole-XCG source amounts with rounded USD secondary amounts. Differences
  were rounding (≤ XCG 0.50), not stale current benchmarks, so no listing
  mutation was justified.

No immutable price history was rewritten or deleted.

## 9. RLS and public/admin access

Public-safe access may expose:

- active priced listing facts;
- safe source attribution;
- benchmark price and conversion disclaimer;
- safe lifecycle timeline;
- safe neighbourhood information.

Admin/server only:

- raw source evidence (`listing_observations` metadata + Storage HTML);
- AI enrichment jobs and proposals (anon SELECT revoked 2026-07-17);
- Property Search Requests, Agent entitlements, Match Reports;
- source-run logs and failures;
- parser warnings;
- quarantine;
- detailed confidence/inference metadata;
- internal sale-margin estimates;
- cross-source match candidates.

### Labs admin auth limitations `[RISK]`

- Dashboard ops mutations use a shared `LABS_ADMIN_SECRET` (not per-user Auth).
- Publishable-key reads still see full `property_listings` inventory (Labs OS).
- Public-safe projection is `public_property_listings` / app `/browse`.
- The public view exposes **effective** consumer fields only:
  English `display_title` / `display_summary` (v5 when present),
  `effective_neighbourhood` (+ provenance label), `effective_property_type`,
  `public_attributes` (allowlisted `auto_applied` values, including waterfront),
  English display description / overview, XCG primary price, original
  price/currency, beds/baths/areas, listing type, images, first/last seen,
  source attribution. Raw source title/description remain available for admin
  / provenance, not as primary public copy. It never exposes raw proposals,
  evidence, confidence, tokens, costs, checksums, or private HTML.
- Service-role credentials are server-only; never `NEXT_PUBLIC_*`.

Enable RLS on every table in an exposed schema.

## Property Passport identity and presentation contract

Preserved from former `06-property-passport-and-intelligence.md` (product framing
also cross-linked from `01` and flows in `03`).

### MVP identity model

Start with one Passport per source listing. Do not automatically merge listings
from different websites. A later reviewed workflow may link multiple source
listings to one `property_asset`, while preserving each source history
independently.

### Labs admin manual Passport rules

- Origin `manual` facts are **User provided**, not source facts.
- Timeline may include `submitted`, `published`, `material_field_changed`,
  `price_changed`, `unpublished`, `marked_sold`, `marked_rented`, `republished`.
- Never emit `missing_from_source` or `removed_from_source` for manuals.
- Production Auth seller Passports remain planned separately.

### Provenance labels

Every fact should be distinguishable as:

- `Source fact`
- `Merkado calculated`
- `Merkado inferred`
- `Verified record` (future only when real external verification exists)

### Suggested future product entities (not MVP build)

Labs already has preview tables for Search Request / Agent / Match Reports
(`property_search_requests`, `merkado_agent_entitlements`,
`listing_match_reports`) — Labs prototypes only.

Do not add during the current scraper MVP unless explicitly instructed:

- `property_search_request_preferences`
- `merkado_agent_subscriptions`
- `listing_matches`
- `match_report_snapshots`
- `match_delivery_events`
- `match_feedback`
- `professional_referral_requests`

A match/report snapshot should preserve the search-request version, listing
observation, scoring version, evidence, and generated explanation used at that
time.

Consumer-facing activity timeline must render only a human label, event date, and
before→after asking amount for genuine price changes. Never render raw event
notes, private evidence, confidence, prompt/policy identifiers, token usage,
costs, or pipeline metadata.
