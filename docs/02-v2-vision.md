# 02 — Merkado V2 Vision

**Purpose:** the direction the business is designed around, from Luuk's application, deck, and workflow diagram. Live product ground truth remains `01-live-product-state.md`. Experimental Labs progress (harvest, schema, dashboard) is documented in `07`–`09` and must not be described as live on merkado.cw.

**Tag legend:** `[WIP]` being scoped · `[LABS]` built in Merkado Labs only · `[RISK]` concern.

---

## 1. Core idea

Merkado becomes a premium hybrid ecosystem for hard assets, with a two-tier structure and an AI-verified trust layer (the "Passport") underneath both tiers.

## 2. Two-tier architecture

**Tier 1 — public marketplace (open to all) `[WIP]`.** High-volume, top-of-funnel. AutoTech (live, cars) expanding to PropTech (property). Every listing meant to carry a Passport. Intended revenue: listing, lead, escrow fees.

**Tier 2 — gated WealthTech (accredited investors only) `[WIP]`.** Fractional ownership via SPV + permissioned tokens, stablecoin payouts, behind a KYC/AML/accreditation wall. Intended revenue: origination, AUM, carry.

**The flywheel:** affluent buyers reveal themselves by buying on Tier 1, then get funneled into Tier 2 verification. Claimed edge: near-zero investor acquisition cost.

### The intelligence layer between both tiers

The intelligence layer is not a secondary analytics feature. It is the core data system that makes the marketplace more useful over time and makes the Passport and future asset products possible. Its two continuous jobs are:

- [x] **Harvest data:** `[LABS]` collect public listing and market data, preserve source history, normalize it, and turn fragmented records into structured asset data.
- [~] **Create a knowledge graph:** `[LABS]` partial — connect listings, neighbourhoods, sources, prices, contracts, and market signals in Supabase; canonical asset linking and production Passport UI remain open.

For the 21-day buildathon, this should be implemented as a lightweight relational knowledge graph in Supabase, not a separate graph database. Dedicated graph infrastructure is only justified later if source count, ownership chains, or relationship queries become materially more complex. See `07-intelligence-layer.md`.

## 3. The asset-class arc

`AutoTech (live)` → `PropTech (this sprint)` → `WealthTech (gated future)`.

Monetization sub-arc:
1. car purchase [live today]
2. car purchase + rent (fractional vehicles, rental income)
3. real-estate purchase + rent (fractional property + tokenized rent streams)

Rationale: cars are movable personal property (simple, high-velocity, good to prove marketplace trust). Real estate is immovable real property (larger, more trust-sensitive, the natural home for the Passport and fractionalization). No foreign-ownership limits on Curaçao property.

## 4. The Property Passport (Pasaporte di Kas)

The central innovation. A standardized, AI-generated, verifiable digital record per property:
- verified ownership / title status and encumbrances (via Kadaster)
- consolidated price and rent history (ends "same house, three prices")
- independent AI valuation + rent/ROI estimate
- legal / zoning / structural flags
- a transparency confidence score

Intended pipeline (Luuk's diagram, 5 agents): Crawler → Entity Resolution (vector DB) → Reconcile (vs Kadaster title/sales) → Valuation (AVM: price, rent, ROI) → Risk & Compliance (legal/zoning flags, KYC/AML). Human review on exceptions.

The Passport is the user-facing record produced by the intelligence layer. The knowledge graph is the underlying system that connects evidence and relationships; the Passport is the clear, confidence-scored view presented to a user. The same record that improves PropTech trust can later support a Tier 2 asset product.

**Reality note `[RISK]`:** only the crawl + a simplified enrichment step exist today, for cars. Entity resolution (vector DB), Kadaster reconciliation, AVM, and the risk agent are all new builds. See `04-reality-check.md`.

## 5. Claimed market opportunity (planning estimates, verify before binding use)

- No MLS, no published sales data, listings across 40+ sites, same house at different prices.
- Median Curaçao home ~USD 650k, roughly 40x median local annual income.
- ~9,000-person social-housing (FKP) waitlist.
- Curaçao ~USD 1.18B annual property transactions (Kadaster, 2024).
- Working estimate: assets trade ~15-25% from fair value; goal is to compress toward ~5-8% (mature-market AVM error range). `[RISK: defend methodology]`
- ~26-30% of LAC adults unbanked; regional MSME finance gap ~USD 1T.

## 6. Tokenization pilot (WealthTech proof)

One small, legible asset. Two options:
- one full rental car (fractionalize ownership + rental income), OR
- 6-12 months of pre-paid rent on one property (tokenize a defined rent stream).

Stack named: Celo (via Kolektivo), ERC-3643 / ERC-1400 permissioned tokens, stablecoin (cUSD/USDC) payouts, SPV with human-in-the-loop (notary, fund manager, compliance officer).

**Recommendation:** the pre-paid-rent property pilot fits Track 09 (real estate) better than the car pilot.

## 7. Five-year vision (from application)

Merkado as the Caribbean's hard-asset and private-investment operating system: discover, verify, buy, sell, finance, and fractionally invest in the region's biggest assets. The intelligence layer is the moat: every harvested listing, resolved asset, price change, market signal, and later closed transaction deepens the knowledge graph and comparable-sales record. Public marketplace across cars and property, multiple islands; gated WealthTech tier for fractional real estate and regional development; the Passport on its way to a regional standard banks, notaries, and governments build on, with EcoLabs onchain rails underneath.
