# 03 — Buildathon Scope & Discovery

**Purpose:** the working doc for the phase we are in right now. We are in discovery/scoping: aligning on what the 21-day build actually is before locking architecture. This file carries the deliverables, the priority order, what reuses v1 vs what is new, and the MVP thinking. Update it as answers come in.

**Tag legend:** `[WIP]` being scoped · `[OPEN]` waiting on Luuk · `[RISK]` concern.

---

## 1. Where we are (scope mostly landed)

**Status:** first call done, plus a follow-up that made the demo concrete. Transaction model, pipeline direction, and the actual demo are now defined. Still open: Kadaster access, and a couple of scoping clarifications (see `05` and `06`).

**Payment model (resolved) — three layers:**
- **Marketplace layer:** Sentoo checkout for advanced/boost features only (push a car to top, get featured). Fiat, for perks, not for assets.
- **Intelligence layer:** no payments.
- **Asset layer:** stablecoin stakes in assets (cars, real estate). User sends stablecoin manually or connects an EOA (self-custody wallet, "same as super account"). This signals Luuk is leaning **non-custodial** — confirm, but it likely answers the open wallet question.

**Why this matters:** we are NOT building asset checkout or escrow. Fiat payment is a small, scoped boost-payment flow. Asset "investment" is a stablecoin transfer to/from a wallet, not a payment processor. Both are far smaller than the original pitch implied.

**Intelligence-layer priority:** this is a core product layer, not a dashboard added after listings. The sprint must establish both parts of its foundation:
- [x] **Harvest data** from the first property source into structured, source-traceable records. `[LABS]`
- [~] **Create a lightweight knowledge graph** connecting property listings, neighbourhoods, sources, price observations, rental contracts, and calculated market signals. `[LABS]` partial — canonical asset linking still manual/reviewed

The MVP graph lives in normal Supabase tables and relationships. Do not add Neo4j, a vector database, or another major system for the 21-day scope. See `07-intelligence-layer.md`.

### Labs progress in this repository (July 2026)

Built safely in Merkado Labs (not yet on live merkado.cw):

- CHH full-snapshot harvest + Labs importer + daily GitHub Action
- Property foundation, market signals, pilot contract assessment tables
- Geospatial boundaries + neighbourhood assignment
- Read-only Labs dashboard (`apps/labs-dashboard`) for partner/internal review

Still required for the day-21 **product** demo on Merkado: real-estate listing UX on merkado.cw, WealthTech token/payout pieces with Luis, and any production promotion of Labs data.

## 2. Event context

- Event: Future Caribbean Innovathon / Buildathon (futurecaribbean.com)
- Track: 09 — AI for Real Estate & Development
- Duration: 21 days
- Framing: "deployable systems, not demos"
- Fully remote, global. Teams get H200 GPU compute (Highrise). Open-source agentic AI ethos (verify submission rules on open-sourcing).
- Applicant: Luuk Weber / EcoLabs.

## 3. The actual day-21 demo (Luuk's definition)

This replaces the vague "four deliverables." Luuk described the real demo, feature by feature:

1. **Add real estate to Merkado:** buy, rent, and lots (land) listings, alongside the existing cars.
2. **Intelligence layer — harvested data + basic signals:** structure the first property dataset, connect it through a lightweight knowledge graph, and read simple market signals per listing, e.g. average XCG rent per m² in the neighbourhood.
3. **Tokenize one real contract:** the pilot asset is a real rental contract between Luuk and his mother (informal, voluntary, low-stakes — exactly the kind of pilot he wanted).
4. **Market-fit formula:** a formula that scores the contract above or below market, based on the intelligence-layer signals.
5. **Stablecoin payout:** the tokenized contract pays out in stablecoins.

That is the whole demo. It is tight, honest, and buildable, and it still tells the full AutoTech → PropTech → WealthTech story in one thread: a real property listing → intelligence values it → one contract gets tokenized → pays out onchain.

## 4. What each demo piece actually requires (build breakdown)

| Demo piece | What it needs | Reuse vs new | Difficulty (solo) |
|---|---|---|---|
| 1. Real estate listings (buy/rent/lots) | property tables + CHH scraper + property detail/listing UI | mostly reuse of car engine | Low-Med |
| 2. Intelligence layer (harvest + graph + rent per m²) | structured source ingestion, canonical asset/location relationships, price observations, then neighbourhood aggregation; no AI needed for the first formula | new, but intentionally lightweight | Low-Med |
| 3. Tokenize one contract | define what the token represents; Luis builds the smart contract, you + Luuk scope it | new, but Luis owns the contract code | Med (scoping) |
| 4. Above/below-market formula | a scoring function comparing the contract's terms to the neighbourhood signal from piece 2 | new, straightforward logic | Low-Med |
| 5. Stablecoin payout | wallet/EOA + stablecoin transfer; user sends manually or connects EOA | new, Luis helps on contract side | Med |

**Notably NOT in this demo (dropped from the original pitch):** Kadaster title reconciliation, a KYC/AML wall, a "flywheel" reservation flow, a full Passport with confidence scoring, and any SPV/notary work. Those are still part of the longer-term vision (`02-v2-vision.md`) but are out of the 21-day scope. If you want, keep a light "Passport-style" record on the listing, but the headline is the 5 pieces above.

**Priority within the demo:** pieces 1 and 2 are the foundation and should ship first. Piece 2 is complete only when the data is harvested, source-traceable, connected to canonical asset/location records, and usable for at least one market signal. Pieces 3, 4, 5 (tokenize → score → payout) are the WealthTech proof and depend on Luis for the contract. Build 1-2 fully, then thread 3-5 through the single Luuk-and-mother contract.

## 5. MVP definition (updated to the real demo)

**Ships (the 5 demo pieces):**
- Real estate listings on merkado.cw: buy, rent, lots. Reuses the car marketplace engine.
- Intelligence-layer foundation: harvested property data, source history, a lightweight relational knowledge graph, and signals such as average XCG rent per m² by neighbourhood.
- One tokenized contract (Luuk + his mother), informal and voluntary, using real tokens.
- An above/below-market scoring formula driven by the intelligence signals.
- A stablecoin payout on that contract.

**Explicitly out of scope for 21 days (say so plainly):**
- Asset checkout / escrow (any asset). Only fiat flow is Sentoo boost payments.
- Kadaster title reconciliation (Luuk still chasing access; not needed for this demo).
- KYC/AML gating wall.
- A full Passport with confidence scoring (a light listing record is fine).
- SPV / notary / any binding legal transaction. The pilot is informal.
- A production custodial wallet system (asset layer uses EOA / manual stablecoin send).

**Demo narrative:** cars are live today → add real estate (buy/rent/lots) → intelligence reads the market (rent per m²) → one real contract gets tokenized → a formula scores it vs market → it pays out in stablecoins. One clean thread, honestly scoped, tells the whole AutoTech → PropTech → WealthTech story.

## 6. Real estate scraping (feasibility)

**Labs path already running:** Python snapshot harvest from CaribbeanHouseHunt → immutable
local evidence → Labs Supabase import (deterministic normalize, no GPT required for the first
pass). See `08-labs-property-foundation.md`.

**Production Merkado path (planned reuse of the car pattern):**
1. n8n harvests property listing pages (start with CaribbeanHouseHunt only, per Luuk).
2. Preserve source URL, external ID, raw evidence, and observation timestamps.
3. GPT-5-mini extracts and normalizes structured property fields where needed.
4. Upsert the listing and connect it to canonical asset, neighbourhood, source, and price-observation records in Supabase.
5. Aggregate the connected records into market signals such as rent per m² by neighbourhood.

Cost: Curaçao property inventory is small, so per-listing AI cost stays in the cents range. Not expensive. Labs already proved the dataset size (~1.4k CHH records per snapshot).

For the first intelligence signal (rent per m² by neighbourhood), no AI is strictly needed. It is deterministic aggregation over the knowledge graph: valid monthly rent observations divided by usable floor area, grouped by normalized neighbourhood. AI can be added later for smarter comparable selection, but a transparent baseline formula ships the demo.

### Lightweight knowledge-graph scope for day 21

Minimum entities: `property_assets`, `property_listings`, `property_sources`, `locations/neighbourhoods`, `price_observations`, `market_signals`, and the pilot `rental_contract`. Relationships should be represented through foreign keys and small join tables. Keep source evidence and timestamps so every signal can be traced back to the listings that produced it.

Entity resolution (same property across sites) is minimal because the MVP starts with one source. Still separate the external listing from the canonical property asset now, so a second source can be added later without rebuilding the model.

## 7. Things to watch (application accuracy)

Before submitting, the deck/application must match the live product. Full list in `04-reality-check.md`. The big ones: drop "rent cars" and on-platform "buy" from live claims, soften inspection/escrow/title-transfer language, present the pipeline as n8n (not LangGraph/CrewAI), and make sure the tokenization/Passport language matches this smaller, honest demo rather than the original grand pitch.

## 8. Open scope items

Tracked in `05-open-questions-luuk.md`. Still open after the latest context:
- Kadaster access (Luuk chasing; not blocking the demo).
- Custodial vs non-custodial wallet — latest context ("connect EOA, same as super account") leans non-custodial; confirm.
- Whether Luuk expects a specific visualization/tool for exploring complex relationships. The MVP data model itself is defined as a lightweight relational knowledge graph in Supabase.
- Exactly what the token represents in the Luuk-and-mother contract (rent stream? ownership share?) — needs a quick definition with Luis before contract work.
