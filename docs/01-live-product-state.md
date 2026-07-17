# 01 - Merkado Live Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** July 17, 2026

## 1. Production today `[LIVE]`

Merkado is a Curaçao vehicle marketplace aggregator. Users browse cars and contact sellers through WhatsApp.

Live production does **not** currently include:

- real-estate listings;
- property search or property detail pages;
- Property Passports;
- property checkout, escrow, title transfer, or Kadaster verification;
- on-chain property records;
- property market reports, agents, or alerts.

## 2. Property work in Labs `[LABS]`

The isolated Labs project currently has:

- property, source, listing, observation, price, neighbourhood, signal, and pilot-contract tables;
- immutable observation patterns + listing activity events;
- private raw HTML evidence (`listing-raw-evidence`) for RE/MAX catalog;
- AI enrichment jobs/proposals with Labs human review fields (service-role only);
- Property Search Request / Agent entitlement / Match Report preview tables;
- geospatial neighbourhood boundaries and assignment;
- Labs dashboard with ops pages, public browse preview, Search Request / What Fits Me / Agent previews;
- RE/MAX Curaçao as the first end-to-end direct-source adapter (220 listings;
  evidence refresh 2026-07-17; still unscheduled);
- Keller Williams adapter v0.1 with **40 Labs listings** (39 active + 1 unknown;
  Crawl-Delay 20, sequential, unscheduled). All KW runs remain **partial**
  (bounded `max_items` / incomplete pagination). On 2026-07-17 a bounded-run
  classification bug falsely marked 35 KW listings `removed`; they were restored
  from last valid pre-absence status without deleting immutable events.
- Moret Real Estate adapter v0.1 with **5 Labs listings** (bounded WPEstate import);
- AI enrichment: 29 proposal rows (24 needs_review, 4 skipped_unchanged, 1 succeeded;
  model `gpt-4.1-mini` because the prior batch script hardcoded that model). Proposals
  only; no auto-approve. Model now required via `OPENAI_ENRICHMENT_MODEL` (no silent default).
- Labs Search Request + test Agent entitlement + 15 Match Reports (`rules_v1`) —
  **Labs prototypes**, not live on merkado.cw.

The previous CaribbeanHouseHunt (CHH) workflow is retired and removed from the
active repository. CHH-derived Labs rows were deleted from Labs on 2026-07-16
after a verified rollback export. RE/MAX remains manual and unscheduled.

## 3. Current property MVP direction `[WIP]`

Approved direct sources:

1. Keller Williams Curaçao
2. Sotheby's International Realty
3. RE/MAX
4. Moret Real Estate
5. Monumentenzorg Curaçao

Core MVP rules:

- Build one direct source adapter per website.
- Run adapters manually and in bounded mode during validation.
- Show only active listings with a known positive price.
- Preserve the original amount and original currency.
- Display a benchmark price in XCG with disclaimer: indicative equivalent based on known information.
- Convert USD at `1 USD = 1.79 XCG`.
- Convert EUR using ECB daily USD-per-EUR × 1.79 (`ecb_eur_usd_xcg_peg`).
- Show `Indicative equivalent based on known information.` for converted values.
- Preserve source listing dates separately from Merkado detection dates.
- Append lifecycle events instead of only overwriting current values.
- Keep `sold` separate from `removed`.
- Treat the Property Passport as an off-chain activity log.

## 4. Not built yet

- Production-ready adapters for all five sources (KW/Moret/Monumentenzorg/Sotheby's incomplete)
- Direct-source scheduled ingestion
- Public property browse/detail UI on `merkado.cw` (Labs `/browse` preview exists)
- Reliable multi-source property entity resolution
- Confirmed sale prices
- Automated valuation or sold-probability models
- Weekly intelligence reports
- Production What Fits Me / Merkado Agent (Labs preview only)
- Matching-listing email notifications / real billing

## 5. Required accuracy language

Use:

- `Experimental Merkado Labs dataset, separate from merkado.cw.`
- `Direct-source property ingestion is being built.`
- `The Passport is an off-chain listing activity log.`
- `Converted prices are indicative, not contractual.`
- `Last known listing price. The actual sale price may differ.`

Never claim:

- verified ownership;
- confirmed sale price;
- automated property identity resolution;
- on-chain Property Passports;
- a CHH partnership or active CHH dependency.
