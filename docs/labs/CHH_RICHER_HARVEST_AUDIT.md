# CHH harvest audit — richer fields & realtor attribution

**Date:** 2026-07-16  
**Scope:** Read-only inspection of Labs docs, CHH recon evidence, local snapshots,
snapshot/importer code, Supabase property foundation, tests, and Labs dashboard.  
**Supabase target:** Labs only (`csaefdkpwukshtouyixg`). Production untouched.

## How CHH data is discovered today

1. `create_snapshot.py` fetches `config.js`, parses `AppConfig.cachebust`, then downloads
   one bulk file: `https://caribbeanhousehunt.com/map-assets/data/{cachebust}-en.json`.
2. The immutable snapshot keeps raw bytes (`source.json`), a lightweight
   `normalized-index.json`, and `metadata.json` (checksum, observed_at, extractor version).
3. `import_supabase.py` imports the latest snapshot into Labs without network access,
   upserting `property_listings` and appending observations.

There is no CHH-hosted per-listing detail page. Cards link to third-party `url_page`
(original realtor listing). CHH is an aggregator, not the original realtor.

## Raw bulk fields (current snapshot, 1,449 records)

| Field | Coverage | In normalized index today | Notes |
|---|---:|---|---|
| `urlid` | 100% | yes | provisional external id |
| `id` | 100% | no | CHH internal id |
| `realtor_name` | 100% | **no** | original agency name |
| `realtor_id` | 100% | **no** | CHH realtor directory id |
| `realtor_filtername` | 100% | **no** | filter slug |
| `url_page` | 100% | yes as `original_realtor_url` | original listing URL |
| `status` | 100% | partially (`sale`/`rent`) | raw: for sale / for rent / under contract |
| `property_type` | 100% | yes | home / apartment / commercial / lot |
| `bedrooms` | 100% | yes | string/number in source |
| `floor_area` | 56% | yes as `floor_area_m2` | unit assumed m² by prior extractor |
| `lot_area` | 50% | **no** | mixed scale (0.01…1400); **unit not confirmed** |
| `amenity` | 96% | **no** | integer codes |
| `description` | 100% | **no** | full text |
| `street` / `house_number` | 31% / 28% | **no** | |
| `resort` | 47% | **no** | resort / complex name |
| `neighborhood` | 90% | yes | |
| `lat` / `lng` | 100% | yes | site says approximate |
| `coordinates_source` | 100% | **no** | e.g. `html_page` |
| `image_url` | 99.9% | yes (as CHH image path) | |
| `price_usd` / `price_naf` / `price_eur` | 28/59/38% | yes (display priority) | |
| `property_title` | 100% | via importer title | |
| `source`, `rnd` | 100% | no | operational noise |

## Amenity evidence

Public map filters (EN/NL HTML) label **15** codes. Bulk data also uses codes
**2, 3, 5, 7, 10, 12, 17** with **no public label** in map HTML, `lang-en.js`, or
`filter.js`. Bounded live check confirmed this.

Known labels from CHH UI evidence:

| Code | Label |
|---:|---|
| 1 | Waterfront |
| 4 | Scenic view |
| 6 | Furnished |
| 8 | Solar panels |
| 9 | Deep well |
| 11 | Swimming pool |
| 13 | Outdoor kitchen/bbq |
| 14 | Garage / carport |
| 15 | High ceilings |
| 16 | Porch / balcony |
| 18 | Home office |
| 19 | Guest apartment |
| 20 | Sea view |
| 21 | Pets allowed |
| 22 | Short term rental permitted |

Unlabeled codes must be stored as codes only — no invented names.

## Realtor attribution

- **Available in every raw record** today (1,449/1,449).
- **45** distinct `realtor_id` / `realtor_name` pairs and **45** original URL domains.
- Dashboard currently only surfaces `original_realtor_url`; name/domain are discarded
  by `build_index_record` / `_as_import_record`.

Top domains (by listing count): `www.realestate-curacao.com`, `century21numberone.com`,
`curahousecare.com`, `www.newwindsrealty.com`, `kw-curacao.com`, …

## Fields requested but not evidenced on CHH bulk

| Requested | Finding |
|---|---|
| Bathrooms | **Not present** in bulk JSON |
| Gated community | No labeled amenity; unlabeled codes must not be guessed |
| Listing reference beyond urlid/id | No separate reference field |
| First/last detected dates | Only Labs `first_seen_at` / `last_seen_at` after import; CHH `urlid` is detection-order-ish but not a date |

## Schema reuse

`property_listings.original_realtor_url` already exists. No realtor table. Observations
already store full `raw_payload` + `normalized_payload` (anon clients cannot read them).
Additive listing columns + richer normalized payloads are the lowest-risk path. Do not
auto-link `property_assets`.

## Original-realtor enrichment (investigation)

- CHH itself: robots empty Disallow (not legal permission); terms disclaim accuracy.
- Per-realtor sites: **not yet checked**. Requires robots.txt + terms + rate-limited PoC
  adapters before any fetch. Unlabeled amenity codes and bathroom gaps cannot be filled
  from CHH alone.

## Gaps to close in implementation

1. Persist realtor name/domain/id + attribution method/timestamp.
2. Expand normalized snapshot (version bump) while accepting older snapshots via raw fallback.
3. Store known amenities + unlabeled codes, description, resort/street, lot_area as raw
   (no false m² claim), source listing status.
4. Dashboard: realtor filter/column, source chain, completeness, amenity display.
5. PoC adapter framework + robots audit for a few domains; no unrestricted crawl.
