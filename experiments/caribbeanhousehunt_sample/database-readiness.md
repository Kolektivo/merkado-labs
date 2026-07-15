# CaribbeanHouseHunt database readiness

## Decision

**INSUFFICIENT_EVIDENCE for creating the Labs property database now.**

Recommendation: **Repeat another snapshot after the source changes and at least six hours have
elapsed.**

Two formal full snapshots were captured successfully on 2026-07-15, each with 1,449 records and
zero duplicate non-null `urlid` values. All 1,449 IDs were shared, with no new, disappeared,
changed, collided, or remapped records. However, the snapshots are only 13 minutes 27 seconds
(0.22 hours) apart and have the same source SHA-256. This proves repeatable extraction, but not
identifier behavior across a real source update. The current identifier status remains
`insufficient_evidence`.

## 1. Confirmed source delivery method

CHH loads one public, language-specific bulk JSON array from:

`/map-assets/data/{cachebust}-en.json`

The current cache-buster is read from public `config.js`; the snapshot then makes one bulk JSON
request. Filtering and pagination happen client-side after this bulk load. No browser automation,
individual listing requests, realtor-site requests, or image downloads are required.

## 2. Snapshot method

Each execution of `create_snapshot.py` creates an immutable UTC timestamp directory under
`snapshots/` containing:

- `source.json`: exact full response bytes;
- `metadata.json`: source URL, status, request count, cache-buster, count, checksum, and version;
- `normalized-index.json`: one lightweight comparison row per source record;
- `comparison.json`: comparison against the most recent earlier formal snapshot.

The root `snapshot-health.json` is a compact UI projection. Prior snapshots and values are never
overwritten.

## 3. `urlid` stability evidence

Current evidence:

- formal snapshots: 2;
- previous observation: `2026-07-15T13:22:03.413612+00:00`;
- current observation: `2026-07-15T13:35:30.429250+00:00`;
- spacing: 13 minutes 27 seconds (0.22 hours);
- previous/current records: 1,449 / 1,449;
- shared/new/disappeared IDs: 1,449 / 0 / 0;
- duplicate non-null `urlid` values: 0 in both snapshots;
- identity collisions: 0;
- fingerprints with changed `urlid`: 0;
- price, realtor URL, and all other indexed field changes: 0;
- source checksum changed: no;
- stability result: `insufficient_evidence`.

The application code describes `urlid` as stable across data rebuilds, while the CHH UI warns
that recreated realtor listings can appear newly detected. The byte-identical second response
contains no listing lifecycle event with which to test those claims.

## 4. Duplicate and collision findings

No duplicate `urlid` values exist inside either formal snapshot. The comparison found no
identity collisions and no fingerprint-to-new-ID remaps, but the source payloads were identical.
There were no individual anomalies to inspect or classify as additions, removals, updates, ID
changes, ID reuse, or normalization defects.

The comparator flags:

- duplicate IDs within either snapshot;
- one shared `urlid` whose realtor URL plus another identity signal changes;
- one stable-looking fingerprint assigned to different `urlid` values.

## 5. Proposed same-source deduplication key

Use `(property_source_id, source_listing_id)` where `source_listing_id` is CHH `urlid`.

This key is source-specific only. It must not imply that the row is a canonical physical
property. Keep CHH's rebuild-local `id` as observation metadata rather than as the durable key.
Rows without `urlid` should not be merged automatically.

## 6. Proposed fallback fingerprint

Primary fallback: SHA-256 of the canonical original realtor URL after removing UTM parameters,
normalizing host/scheme case, and removing a trailing slash.

If the realtor URL is unavailable, use a deterministic compound of normalized title, property
type, realtor name, neighbourhood, and coordinates rounded to five decimal places. Price and
status are deliberately excluded because they are expected to change.

The fingerprint is a review signal, not an automatic canonical-property identifier.

## 7. Fields suitable for direct database import

With source provenance and nullable types:

- `urlid` as provisional `source_listing_id`;
- original realtor URL;
- listing type/status;
- property type;
- price and original displayed currency;
- bedrooms;
- floor area where present;
- neighbourhood text;
- latitude and longitude marked approximate;
- CHH image URL as a remote reference;
- realtor name and source-specific realtor identifier;
- observation timestamp, source URL, snapshot ID, checksum, and raw evidence path.

## 8. Fields that must remain nullable

- `urlid`;
- price and currency;
- bedrooms;
- floor area;
- neighbourhood;
- coordinates;
- image URL;
- original realtor URL;
- realtor name;
- address, bathrooms, and confirmed square-metre lot area from the richer sample schema.

No missing value should be inferred from descriptions.

## 9. Fields that need later enrichment

- verified bathrooms and lot area with units;
- normalized address and neighbourhood entities;
- exact coordinate confidence/provenance;
- availability and lifecycle status;
- canonical currency conversion as a separate observation;
- canonical property matching across duplicate or multi-realtor listings;
- image rights, asset identity, and lifecycle;
- verified physical-property attributes.

AI enrichment remains out of scope until source observations and provenance are reliable.

## 10. Future data model guidance

### `property_sources`

One row per external source, including CHH identity, base URL, language, and collection-policy
metadata.

### `property_listings`

One row per source-specific listing. Enforce the proposed source-plus-`urlid` deduplication key
only after repeated snapshot evidence supports it. A CHH listing is not automatically a
canonical property asset.

### `property_assets`

Canonical physical-property entities created only by a separate matching process. Never merge
source listings into assets solely because coordinates, price, or title look similar.

### `neighbourhoods`

Normalized Curaçao neighbourhood entities linked from listings or assets while retaining the
original source text and provenance.

### `listing_observations`

Append one observation per harvest or record the latest-seen timestamp without destroying prior
values. Preserve snapshot linkage, source status, mutable fields, and quality flags.

### `price_observations`

Append amount, currency, and observation time. Price history must never be overwritten by the
latest value.

Canonical property matching must remain separate from same-source deduplication. A later MVP
knowledge graph can use these ordinary relational tables and foreign keys; Neo4j, vector
databases, and graph-specific infrastructure are unnecessary.

## GO condition

Create the Labs database only after at least one later snapshot has a changed checksum, adequate
time separation, no duplicate IDs or identity collisions, and no material fingerprint-to-`urlid`
remapping. A clean second comparison would support **Ready with safeguards**, not a claim of
long-term stability.

## Required safeguards when readiness becomes GO or GO_WITH_SAFEGUARDS

- use `(property_source_id, external_id)` for same-source identity;
- store CHH `urlid` as `external_id`;
- keep source listings separate from canonical property assets;
- preserve every harvest timestamp and raw payload reference;
- append price observations instead of overwriting history;
- quarantine duplicate IDs, identifier reuse, and identity collisions;
- use the fallback fingerprint only as a warning or matching candidate;
- never silently merge canonical assets based only on price, coordinates, or fingerprint.
