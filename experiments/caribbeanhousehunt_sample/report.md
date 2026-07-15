# CaribbeanHouseHunt controlled sample extraction

## Scope and result

This experiment used static public HTTPS requests only. It made **3 GET requests** to
`caribbeanhousehunt.com`, extracted **12 listings** from a 1,449-record source array, preserved
the selected source objects, and produced a normalized sample and local inspector. It did not
use a browser, request an image, visit an external realtor domain, or access a database.

## 1. What was discovered about `DataManager`

The saved reconnaissance established that the HTML is an application shell and that
`ListViewModule` synchronously calls `DataManager.selectItems()` after a `dataloaded` event.
The newly captured `data-manager.js` completes that trace:

1. `DataManager.init()` calls `loadPropertyData()`.
2. The preferred path starts `/map-assets/js/data-loader.worker.js` and sends the worker the
   `AppConfig.cachebust` value and document language.
3. The explicit main-thread fallback fetches
   `/map-assets/data/${AppConfig.cachebust}-${lang}.json`.
4. The returned JSON must be an array. `setPropertyData()` keys records by `item.id`.
5. Filtering, sorting, map selection, and page slicing happen in memory after that one bulk load.

There is no map-bound listing request. The visible infinite scroll is local pagination over the
already-loaded array.

## 2. Confirmed listing-data source

`config.js` supplied cache-buster `EPxHyi6w`. `data-manager.js` supplied the public path
template. Together they resolved to:

`https://caribbeanhousehunt.com/map-assets/data/EPxHyi6w-en.json`

The endpoint returned HTTP 200, `application/json`, 1,416,083 bytes, and a top-level array of
1,449 property objects. The cache-buster is build-specific, so a future run must rediscover it
from `config.js`; it must not hard-code this observed value as permanent.

## 3. Exact request count

The sample experiment made exactly **3** requests:

1. `config.js`
2. `data-manager.js`
3. the resolved English listing JSON

All requests used `MerkadoLabs-SampleExtraction/0.1`, timeouts, no retries, and same-domain
validation. Details are in `request-log.json`.

## 4. Sample size and selection

The sample contains **12 real listings**, the configured maximum. Selection is deterministic:
the 12 highest numeric `urlid` values, with internal `id` as a secondary descending key. This
gives a recent-looking bounded sample without relying on the source's randomized `rnd` order.

Raw evidence contains only the 12 selected source objects plus source metadata, not a duplicate
copy of the full 1,449-record payload.

## 5. Fields successfully extracted

Across this sample:

- listing type, property type, title, price/currency, bedrooms, coordinates, realtor name,
  description, original realtor URL, and `urlid`: 100%;
- primary image URL: 91.7% (11/12);
- neighbourhood: 83.3% (10/12);
- floor area: 75.0% (9/12);
- street/house-number address: 25.0% (3/12).

Prices preserve the first source currency used by CHH's own display priority: USD, then
NAF/XCG, then EUR. No currency conversion is performed during normalization.

## 6. Fields frequently missing or unusable

- bathrooms: 0% structured coverage; some descriptions mention bathrooms, but prose was not
  treated as structured truth;
- lot area in square metres: 0% confirmed coverage;
- address: 75% missing;
- floor area: 25% missing;
- neighbourhood: 16.7% missing;
- image: 8.3% missing.

The raw payload has a `lot_area` field on two sampled records, with values `0.27` and `0.55`.
The unit is not declared by the captured application code. Because those values must not be
silently labeled as square metres, they remain only in raw evidence and `lot_area_m2` is null.

## 7. Identifier candidate assessment

The best candidate is **`urlid`**, stored provisionally as `source_listing_id`.

The captured `DataManager.getItemByUrlId()` documentation explicitly says `urlid` is stable
across data rebuilds, unlike regular `id`. The map page separately warns that a realtor
recreating a source listing can make it appear newly detected, so `urlid` is not yet proven to
survive source recreation. It needs comparison across later observations.

The numeric `id` is useful only inside one generated payload because `DataManager` keys its
in-memory store by it. The original `url_page` is the best fallback fingerprint, but external
URLs can also change.

## 8. Image behavior

The payload provides a filename such as a WebP name. The renderer constructs
`/map-assets/property-images/{image_url}` on the CHH domain. Normalization stores that remote
URL; neither the extractor nor the repository downloads or re-hosts images. The local UI lets
the browser preview the remote URL and displays a fallback when it is absent or fails.

## 9. Data-quality problems

- Bathrooms are absent as structured data despite appearing in some generated descriptions.
- Lot-area units are ambiguous.
- Locations are present for all 12 records, but CHH itself says locations are approximations.
- Some neighbourhoods are blank while a resort is present; the resort was not relabeled as a
  neighbourhood.
- One image filename is blank.
- Several records expose multiple currencies. The normalized value follows display priority
  rather than asserting that converted values are original asking currencies.
- CHH says descriptions and details are AI-generated and may be inaccurate.

No simple numeric range anomaly was flagged in this sample. That does not establish accuracy.

## 10. Is deterministic scraping practical?

**Yes, for a controlled static-HTTP experiment, with limitations.** The delivery method is a
single public language-specific JSON array resolved from a build cache-buster. No browser is
needed, and post-load filtering/paging is local. The extractor can deterministically select and
normalize a bounded subset.

Reliability across site builds is not yet proven. A future run must resolve a new cache-buster,
and a second observation is required to measure `urlid`, URL, field, and disappearance behavior.
This is not yet evidence for a production crawler.

## 11. Should Labs Supabase be the next step?

**Not immediately.** The next experiment should repeat the same bounded extraction after the
source changes and compare `urlid`, internal `id`, original URL, status, and field drift. If
`urlid` and the transport remain sufficiently stable, the following prompt can set up the
isolated Labs Supabase project with reviewed migrations and RLS. No Supabase work occurred here.

## 12. Recommended schema concepts (no migrations)

- `sources`: source identity, base URL, and collection policy metadata;
- `source_listings`: source plus provisional `source_listing_id`, original URL, realtor, and
  current normalized attributes;
- `listing_observations`: observed timestamp, status/prices, location, quality flags, and a raw
  evidence reference so changes remain auditable;
- `realtors`: source realtor identifiers/names without assuming cross-source identity;
- `raw_evidence`: content metadata, request metadata, checksum, and local evidence path;
- explicit price observations with amount and currency, rather than one converted canonical
  price;
- separate approximate coordinates and address/neighbourhood fields with provenance;
- deduplication candidates that retain `urlid`, original URL, and rebuild-local `id` separately.

Any future exposed tables need RLS, and every change must be represented by a reviewed
migration targeting only the Labs project.

## Local inspector design note

Figma MCP was configured, but no Merkado Figma file key or node reference was present in this
repository. Its read tools require such a reference, so no production design was accessed or
copied. The Streamlit inspector uses a neutral card hierarchy and makes no Figma writes.
