# 07 — Merkado Intelligence Layer

**Purpose:** canonical definition of the intelligence layer that sits between Merkado's marketplace and future asset products. This document explains what must be built, why it matters, what the 21-day MVP includes, and what is intentionally deferred.

**Status:** `[WIP]` / `[LABS]` — foundation defined; Labs implementation is underway.
Harvest, relational graph tables, first market signals, pilot contract assessment, and a
read-only Labs dashboard exist in this repository. Real estate UI on live merkado.cw is
still out of this Labs workspace.

---

## 1. Why this layer matters

Merkado should not only display fragmented listings. Its long-term advantage comes from continuously turning fragmented market activity into connected, source-traceable asset intelligence.

The marketplace creates distribution and data access. The intelligence layer converts that data into relationships, history, comparables, and signals. The Passport is the user-facing record produced from this foundation. Future tokenized or financed assets should reference the same underlying evidence rather than creating a separate data silo.

## 2. The two core objectives

- [x] **Harvest data** `[LABS]`
  - Collect public listing and market data from approved sources (CHH snapshots).
  - Preserve the source URL, external identifier, raw evidence, and observation time.
  - Normalize fields without inventing missing facts.
  - Retain price and rent changes as history instead of only overwriting the latest value.

- [~] **Create a knowledge graph** `[LABS]` partial
  - External listings, sources, neighbourhoods, observations, signals, and pilot contracts are connected in Labs Supabase.
  - Canonical `property_assets` exist as a table, but import does **not** auto-create or merge assets yet.
  - Signals retain evidence links.
  - Cross-category growth (cars + property) and production Passport UI remain later work.

## 3. What “knowledge graph” means for the MVP

For the 21-day buildathon, the knowledge graph is a **relational graph in Supabase**. Entities are normal Postgres tables; relationships are foreign keys and focused join tables.

This is enough because the first dataset is small and begins with one property source. Do not introduce Neo4j, Obsidian, pgvector, Pinecone, or another new system unless a concrete query cannot be handled cleanly in Supabase.

The architecture should remain graph-ready: external listings and canonical assets must be separate records, observations must be timestamped, and relationships must have stable identifiers.

## 4. Minimum entities for day 21

| Entity | Purpose |
|---|---|
| `property_assets` | One canonical real-world property, independent of any website listing. |
| `property_listings` | One advertisement or source-specific representation of an asset. |
| `property_sources` | The website or feed where a listing was observed. |
| `locations` / `neighbourhoods` | Normalized geographic areas used for grouping and signals. |
| `price_observations` | Timestamped sale-price or rent observations tied to a listing/asset. |
| `market_signals` | Calculated values such as average rent per m², including method and time window. |
| `signal_evidence` | Links a calculated signal to the observations used to produce it. |
| `rental_contracts` | The pilot contract used for market-fit scoring and tokenization. |

Exact table names can change during schema design, but these concepts and separations should remain.

## 5. MVP data flow

Labs currently implements the harvest path in Python + GitHub Actions (not n8n). Production
Merkado may later reuse the same relational model through the existing n8n + GPT-5-mini
pattern. The entity model below is shared either way.

```text
HARVEST `[LABS]`
CHH public map data → immutable snapshot + observed_at

STRUCTURE `[LABS]` deterministic normalize; production may use GPT-5-mini
snapshot → normalized property fields

LINK `[LABS]`
source listing → neighbourhood / observations / signals
(canonical property_asset linking is reviewed, not auto-merged on import)

CALCULATE `[LABS]`
valid observations → rent per m² signal by neighbourhood

APPLY `[LABS]`
pilot rental contract → above/below-market score

PRESENT `[LABS]`
Labs dashboard listing/intelligence views
(production Passport UI on merkado.cw still separate)
```


## 6. First market signal

The first production-quality signal should be simple and explainable:

**Average XCG monthly rent per m² by normalized neighbourhood.**

Baseline method:

1. Include active rental listings with valid monthly rent and usable floor area.
2. Calculate `monthly_rent_xcg / floor_area_m2` for each observation.
3. Group observations by normalized neighbourhood.
4. Store count, average, median if practical, observation window, and calculation timestamp.
5. Link the signal back to its evidence records.

The demo contract can then be scored above or below the neighbourhood benchmark. A transparent formula is preferred over an opaque AI estimate.

## 7. Day-21 completion criteria

The intelligence-layer MVP is complete when:

- [x] At least one approved property source is harvested repeatedly. `[LABS]`
- [x] Every imported record retains source evidence and observation time. `[LABS]`
- [~] External listings are separated from canonical property assets. `[LABS]` table exists; linking process not automated
- [x] Listings are connected to normalized neighbourhoods (source + inferred geography). `[LABS]`
- [x] Price or rent history is stored as observations. `[LABS]`
- [x] At least one market signal is calculated from linked observations. `[LABS]`
- [x] The signal can show which data produced it. `[LABS]`
- [x] The pilot rental contract can be scored against that signal. `[LABS]`
- [~] A user can see the result in a simple listing/contract intelligence view. `[LABS]` dashboard; full Passport/contract UX on merkado.cw still open


## 8. Explicitly out of scope for day 21

- Multi-source property entity resolution at scale.
- A dedicated graph database or vector database.
- Kadaster title reconciliation.
- Full ownership-chain modeling.
- Automated legal, zoning, structural, or compliance conclusions.
- A full AVM with production-grade confidence scoring.
- A regional cross-island knowledge graph.
- Treating AI-generated assumptions as verified facts.

## 9. Evolution after the buildathon

1. Add a second property source and activate real cross-source entity resolution.
2. Add geocoding and stronger address normalization.
3. Add sale-price history, listing lifecycle, and richer comparable selection.
4. Add verified Kadaster/notary records when access is legally and technically confirmed.
5. Add confidence scoring and exception review.
6. Evaluate graph/vector infrastructure only when real query complexity or scale requires it.
7. Reuse the same model for vehicle Passports and other hard assets.

## 10. Product principle

**Harvest once, preserve evidence, connect relationships, calculate transparently, and reuse the intelligence everywhere.**
