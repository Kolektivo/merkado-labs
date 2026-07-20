# 05 - Data Model, Currency & Listing Lifecycle

**Purpose:** Canonical implementation rules for storing source truth, benchmark prices, source-run health, and listing history in Merkado Labs.

**Labs project only:** `csaefdkpwukshtouyixg`

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
- read-only dashboard.

Inspect actual migrations before finalizing column names. Use forward-only additive changes.

Applied forward migrations for the direct-source MVP foundation:

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

A listing may appear publicly only when all are true:

- original price is known and positive;
- current status is `active`;
- source is enabled;
- source attribution and original URL exist;
- removal threshold has not been reached;
- no critical identity or price parser error exists.

No-price records may remain in raw evidence or quarantine, but public queries must exclude them.

## 3. Price provenance

Never overwrite source truth with a converted value.

Store:

| Concept | Requirement |
|---|---|
| Original amount | Exact amount extracted from the source |
| Original currency | Explicit source currency where available |
| Benchmark amount | Derived XCG value |
| Conversion rate | Exact rate used |
| Conversion method | `identity`, `legacy_1_to_1`, `usd_fixed_peg`, `eur_api` |
| Provider | Policy/provider identifier |
| Rate timestamp | When the rate was observed |
| Currency evidence | Source text, selector, or structured data |
| Inference | Boolean, reason, and confidence |

### Conversion rules

- XCG: benchmark equals original amount.
- ANG/NAf: normalize 1:1 to XCG while retaining original currency text/code.
- USD: multiply by `1.79`.
- EUR: `EUR_TO_XCG = ECB_USD_PER_EUR × 1.79` via `ecb_eur_usd_xcg_peg`.
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

### AI enrichment tables

- `ai_enrichment_jobs` — manual job progress (queued → running → completed*)
- `ai_enrichment_proposals` — model/prompt/schema/input-checksum keyed proposals
  (current KW batches use prompt/schema/policy **v3**: `listing_enrichment_v3`
  / `listing_enrichment_schema_v3` / `enrichment_policy_v3`)
- Review is **exception-based**: only conflicts, weak/ambiguous evidence, or
  new-attribute taxonomy reach `needs_attention`; unsupported, duplicated,
  noisy, or already-represented proposals are rejected outright and never
  enter the attention queue
- Never overwrite raw evidence, price, currency, status, dates, coords, address, neighbourhood, realtor, or source reference

Each event should store:

- listing ID;
- event type and timestamp;
- previous/new value JSON where relevant;
- source observation ID;
- derivation type: `source_fact`, `system_calculated`, or `inferred`;
- notes/confidence where relevant.

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
  `effective_neighbourhood` (+ provenance label), `effective_property_type`,
  `public_attributes` (allowlisted `auto_applied` values), optional
  `effective_summary`, XCG primary price, original price/currency, beds/baths/
  areas, listing type, images, source description, first/last seen, source
  attribution. It never exposes raw proposals, evidence, confidence, tokens,
  costs, checksums, or private HTML.
- Service-role credentials are server-only; never `NEXT_PUBLIC_*`.

Enable RLS on every table in an exposed schema.
