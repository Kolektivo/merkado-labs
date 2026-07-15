# 06 — Technical Decisions

**Purpose:** the key forks that shape the architecture. Status updated after the first call with Luuk. Some are now RESOLVED, some are OPEN in a new, narrower way. Full answer detail in `05-open-questions-luuk.md`.

---

## Decision 1 — Transaction model

**RESOLVED.** No payment for purchase/rent of the underlying asset (car or property) in this sprint. In-platform payment IS in scope, but only for "boosts" (listing perks) via Sentoo/CXPay or similar. Actual asset transactions stay offline (WhatsApp for cars; connecting + paid support service for property, see Decision 1a below).

**Implication:** Tier 1 architecture does not need a checkout/escrow system. It needs a listing-perk payment flow (smaller, well-scoped) plus the existing discovery/contact flow.

---

## Decision 1a — Real estate "buying" model (new, more specific than before)

**RESOLVED — phased.** Phase 1: connect buyer and seller (discovery, same as today). Phase 1 revenue: a paid support service — template documents, tips, pricing recommendation, and direct contact with the Merkado team, charged as an XCG fee. This is a real, scoped product to build, not just a vague "future" line.

**Also new:** Luuk wants a mockable "digitized deed-transfer + payment execution" flow, starting with **cars** (not property, since property legally requires the notary). Positioned as: mock/demo now, build for real later. This is a genuinely new small deliverable — worth scoping as its own feature, separate from the Passport.

---

## Decision 2 — Intelligence layer and Passport pipeline stack

**RESOLVED — direction set.** Luuk wants to move away from LangGraph/CrewAI if the current n8n + AI stack can do the job, and asked for a draft of what that architecture looks like.

**Core intelligence-layer requirement:**
- [ ] **Harvest data:** collect source-traceable listing observations and preserve enough evidence to reproduce or challenge a market signal.
- [ ] **Create a knowledge graph:** connect external listings to canonical assets, locations, sources, price/rent observations, contracts, and derived signals.

For the MVP, "knowledge graph" means a relational graph implemented with Supabase tables, foreign keys, and focused join tables. It does not require Neo4j, Obsidian, pgvector, or another new infrastructure layer. A separate graph exploration tool remains optional and can be revisited when relationships become difficult to query or explain.

**Remaining sub-need:** a cheap estimation approach for valuation, scoped first as transparent comparables and basic aggregates before any AI reasoning.

**Proposed n8n-based architecture (draft, replaces LangGraph/CrewAI):**

```
1. HARVEST (n8n, per-source workflow — same pattern as car scrapers)
   → CaribbeanHouseHunt listing pages
   → preserve source URL, external ID, raw evidence, and observed_at timestamp

2. STRUCTURE (n8n + GPT-5-mini, same as current enrichment)
   → extract: address, neighbourhood, price/rent, size, bedrooms, type, images, listing date
   → normalize fields without inventing missing facts

3. LINK / KNOWLEDGE GRAPH (new, lightweight relational model)
   → external property_listing links to one canonical property_asset
   → asset links to location/neighbourhood and source observations
   → price/rent changes become timestamped observations rather than overwritten history
   → market signals retain links to the observations used to calculate them

4. ENTITY RESOLUTION / DEDUP
   → rule-based first pass: normalize address text, compare geocoded lat/long,
     compare size and price/m2 — cheap, deterministic, no AI needed for clear matches
   → AI fallback only for ambiguous cases (same/different + confidence)
   → no vector database required at the initial Curaçao property volume

5. RECONCILE (new, depends on Decision 3 — Kadaster)
   → if Kadaster access exists: match against title records
   → if not: skip or flag as "unverified" until access is confirmed

6. SIGNALS / VALUATION (new — start with transparent market signals)
   → comparables-based estimate (nearby properties, price/m2) as the cheap
     first layer, no AI required for a baseline number
   → optional GPT-5-mini reasoning pass on top for a written rationale
   → confidence score based on how many comparables + how recent

7. PASSPORT PAGE (new, frontend + data)
   → confidence-scored record per property, same "validated_at" concept
     as the current listing_details table
```

This whole thing runs on the same n8n + Supabase + GPT-5-mini pattern already in production. No LangGraph, CrewAI, vector database, or dedicated graph database is required for the buildathon. The relational knowledge graph is an architectural foundation, not an excuse to expand scope. More specialized infrastructure can be added later behind the same entity and relationship model.

**Status:** pipeline direction confirmed by Luuk. The intelligence-layer foundation is now explicit: harvest source-traceable data, connect it in Supabase, and calculate transparent market signals. Open: exact valuation methodology beyond the first basic signal, and whether a separate relationship-visualization tool is useful later.

**Labs note (July 2026):** the first property harvest in this repo uses Python snapshots + a
Labs-only GitHub Action rather than n8n. That does not change the production direction above;
Labs proved the relational model and signals first. See `07`–`09` and `apps/labs-dashboard`.

---

## Decision 3 — Kadaster data access

**OPEN — action item with Luuk, not yet resolved.** Luuk will reach out based on what's stated in the application. No access confirmed.

**Builder lean unchanged:** until access is confirmed, build the pipeline to work on a manually-sourced sample set, and mark step 4 (Reconcile) as "unverified" / skippable so the rest of the pipeline isn't blocked by this.

---

## Decision 4 — Tokenization: ownership + realism

**RESOLVED.**
- **Ownership:** Luis builds the smart contracts, when needed. Builder + Luuk scope features and define smart contract requirements together — builder is not writing contract code solo. Luuk wants the builder to pick up some Web3 basics along the way.
- **Realism:** partly simulated, but using actual tokens (not a fully mocked UI). Pilot should be informal and voluntary — not a regulated, binding transaction.

**Implication:** this de-risks the biggest concern from the original review (no blockchain background, solo, real money). The scope is now: builder defines what the contract needs to do, Luis implements it, demo uses real tokens in an informal/voluntary pilot rather than a fully binding legal transaction.

---

## Decision 5 — Wallet UX for investors

**OPEN — joint decision still needed.** Team has prior experience in this area, but custodial vs non-custodial has not been decided. This is now a "have the conversation" item, not a research unknown.

**Builder lean unchanged:** custodial/embedded (no seed phrase) is better for a non-crypto local investor base, but raise this explicitly with Luuk rather than assuming.

---

## Decision summary

| # | Decision | Status | Notes |
|---|---|---|---|
| 1 | Transaction model | **Resolved** | Boost payments only; no asset checkout/escrow this sprint. |
| 1a | Real estate "buying" model | **Resolved (phased)** | Phase 1 = connect + paid support service (XCG fee). Plus new: mock deed-transfer flow for cars. |
| 2 | Intelligence layer / pipeline stack | **Resolved (direction)** | n8n + GPT-5-mini + Supabase; harvest data and build a lightweight relational knowledge graph before adding specialized graph/vector infrastructure. |
| 3 | Kadaster access | **Open** | Luuk to reach out. Build with sample-set fallback until resolved. |
| 4 | Tokenization ownership + realism | **Resolved** | Luis builds SC; builder+Luuk scope; simulated but with real tokens, informal/voluntary pilot. |
| 5 | Wallet UX | **Open** | Joint decision needed — custodial vs non-custodial, not yet discussed in depth. |

## What this unblocks (docs to create/update next)

- Decision 2 (pipeline direction) → use `07-intelligence-layer.md` as the foundation, then draft `property-passport-spec.md` as its user-facing record/spec.
- Decision 1a (CHH as only source for now) → draft `proptech-data-sources.md`, scoped to CaribbeanHouseHunt only.
- Decision 1 + 1a → update `merkado-monetization` — the real Tier 1 PropTech revenue model is now the XCG paid-support-service, not escrow/transaction fees.
- Decision 4 → still write `wealthtech-compliance-notes.md`, but scoped to "informal/voluntary pilot with real tokens," not a full regulated SPV flow.
- New: scope a small "digitized deed-transfer mock" feature for cars — doesn't fit neatly into an existing doc yet, could be its own short spec once discussed further with Luuk.
