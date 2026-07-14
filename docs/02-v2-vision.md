# 02 — Merkado V2 Vision

**Purpose:** the direction the business is designed around, from Luuk's application, deck, and workflow diagram. None of this is built yet unless it overlaps with `01-live-product-state.md`.

**Tag legend:** `[WIP]` being scoped · `[RISK]` concern.

---

## 1. Core idea

Merkado becomes a premium hybrid ecosystem for hard assets, with a two-tier structure and an AI-verified trust layer (the "Passport") underneath both tiers.

## 2. Two-tier architecture

**Tier 1 — public marketplace (open to all) `[WIP]`.** High-volume, top-of-funnel. AutoTech (live, cars) expanding to PropTech (property). Every listing meant to carry a Passport. Intended revenue: listing, lead, escrow fees.

**Tier 2 — gated WealthTech (accredited investors only) `[WIP]`.** Fractional ownership via SPV + permissioned tokens, stablecoin payouts, behind a KYC/AML/accreditation wall. Intended revenue: origination, AUM, carry.

**The flywheel:** affluent buyers reveal themselves by buying on Tier 1, then get funneled into Tier 2 verification. Claimed edge: near-zero investor acquisition cost.

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

The Passport is meant to be the bridge: the same verified record that makes a PropTech purchase safe is the record a Tier 2 SPV tokenizes.

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

Merkado as the Caribbean's hard-asset and private-investment operating system: discover, verify, buy, sell, finance, and fractionally invest in the region's biggest assets. The Passport dataset is the moat (every closed transaction deepens a comparable-sales record no competitor can see). Public marketplace across cars and property, multiple islands; gated WealthTech tier for fractional real estate and regional development; the Passport on its way to a regional standard banks, notaries, and governments build on, with EcoLabs onchain rails underneath.
