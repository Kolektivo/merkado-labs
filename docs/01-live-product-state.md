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
- cleaned internal dashboard navigation: Overview, Listings, Sources,
  Enrichment, Quality, Settings, and one clearly separated Prototypes area;
- internal routes protected by the signed Labs admin cookie; public
  Browse/Passport reads only `public_property_listings`;
- RE/MAX Curaçao as the first end-to-end direct-source adapter (**220** listings;
  adapter **v0.4.1** active; **199/220** coordinates; **119** public eligible;
  GPT-5.6 Terra prompt/schema/policy **v3** initial backfill complete —
  **220/220** successful Terra-v3 results; batch job
  `remax_remaining_terra_backfill` 211/211 under USD 10; remains manual and
  unscheduled; normal Refresh & enrich stays new/changed only);
- Keller Williams complete catalog: **84 listings** (offline-imported from a
  verified Stage-3 artifact; 81 public eligible / 3 excluded); Crawl-Delay
  20 sequential, still unscheduled. Earlier bounded/partial adapter runs had
  falsely marked 35 KW listings `removed` on 2026-07-17; restored from last
  valid pre-absence status without deleting immutable events.
- Moret Real Estate adapter **v0.2.0**: first complete catalog activated in Labs
  (**71** listings; offline import 66 insert / 5 update; public eligible 71;
  coordinates 71/71; GPT-5.6 Terra-v3 initial backfill complete — **71/71**
  successful current results; canary ~USD 0.1165 + remaining 66 at ~USD 1.8259
  under USD 2.40; cumulative ~USD 1.94; manual/unscheduled; normal Refresh &
  enrich remains new/changed only);
- AI enrichment stabilized on the KW catalog: GPT-5.6 Terra with prompt/
  schema/policy **v3** (`listing_enrichment_v3` / `listing_enrichment_schema_v3`
  / `enrichment_policy_v3`) and exception-based review — only conflicts, weak
  evidence, or new-attribute taxonomy reach the attention queue; unsupported/
  noisy/duplicate proposals are rejected outright and never shown as pending
  review. A 24-listing retry batch on the compact v3 schema succeeded 24/24
  (~USD 0.7054), bringing KW to **84/84** successful latest-proposal Terra
  runs (0 failed, 0 never enriched). The `/enrichment` dashboard reports
  gross vs. retained-result vs. wasted AI spend and a model-efficiency
  comparison (grouped by model + prompt + schema version — different
  combinations are not directly comparable). KW enrichment remains manual
  and unscheduled.
- Labs Search Request + test Agent entitlement + 15 Match Reports (`rules_v1`) —
  **Labs prototypes**, not live on merkado.cw.

The previous CaribbeanHouseHunt (CHH) workflow is retired and removed from the
active repository. CHH-derived Labs rows were deleted from Labs on 2026-07-16
after a verified rollback export. RE/MAX and KW remain manual and unscheduled.
Moret Terra-v3 initial backfill is complete; Moret remains manual/unscheduled
with Refresh & enrich = new/changed only. Next active source task:
**Monumentenzorg reconnaissance** (public pages reachable again; completeness
must be reverified). Sotheby's: access route under investigation (approved
public route/feed still required). Neither Monumentenzorg nor Sotheby's is Ready.

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
- Display XCG as the primary displayed, search, and filter price; show the
  original amount and currency as secondary, with disclaimer: indicative
  equivalent based on known information.
- Convert USD at `1 USD = 1.79 XCG`.
- Convert EUR using ECB daily USD-per-EUR × 1.79 (`ecb_eur_usd_xcg_peg`).
- Show `Indicative equivalent based on known information.` for converted values.
- Preserve source listing dates separately from Merkado detection dates.
- Append lifecycle events instead of only overwriting current values.
- Keep `sold` separate from `removed`.
- Treat the Property Passport as an off-chain activity log.

## 4. Not built yet

- Production-ready adapters for all five sources (KW's live-crawl adapter still
  has incomplete pagination — its 84-listing catalog came from an offline
  Stage-3 import, not a live crawl; Moret/Monumentenzorg/Sotheby's incomplete)
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
