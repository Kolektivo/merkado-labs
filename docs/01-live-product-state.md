# 01 - Merkado Live Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** July 21, 2026

**Labs automation foundation:** the four Ready property sources share a Labs-only
orchestration path (orchestrator/worker/locks/anomaly/budgets/`change_hash`) via
`run_property_pipeline.py` / `run_property_pipeline_worker.py` and GHA
`property-pipeline-labs.yml`. **Automatic daily cron is temporarily Off**
(`AUTOMATIC_REFRESH_ENABLED = false`) pending post-hash-repair supervised
verification; intended schedule remains `0 10 * * *` UTC = 06:00 America/Curacao.
Manual/`workflow_dispatch` and dashboard Data Operations dispatch remain available.
Sotheby's remains blocked and excluded. This does not change production or deploy
anything.

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
- Labs dashboard with ops pages, **Data Operations**, Browse as **public preview**,
  Enrichment review, Search Request / What Fits Me / Agent prototypes;
- cleaned internal dashboard navigation: Overview, Listings, Sources,
  Enrichment, Quality, Data Operations, Settings; Browse under Explore/Public
  preview (separate from Prototypes);
- internal routes protected by the signed Labs admin cookie; public
  Browse/Passport reads `public_property_listings` / public-effective projection;
- RE/MAX Curaçao as the first end-to-end direct-source adapter (catalog contract
  **220**; Labs DB may show **222** — operational drift; adapter **v0.4.1**;
  **199/220** coordinates; Terra initial backfill complete; pipeline ready /
  cron Off / dispatch available; normal Refresh & enrich = new/changed only);
- Keller Williams: Labs inventory **104** listings (offline import artifact still
  gates at **84** in import preview). Crawl-Delay 20 sequential. Earlier
  bounded/partial adapter runs had falsely marked 35 KW listings `removed` on
  2026-07-17; restored from last valid pre-absence status without deleting
  immutable events. Pipeline ready / cron Off / dispatch available.
- Moret Real Estate adapter **v0.2.0**: **71** listings; coordinates 71/71;
  Terra coverage complete; pipeline ready / cron Off / dispatch available;
  Refresh & enrich = new/changed only;
- AI enrichment **v4 / policy v4.2** is current in Labs across KW, RE/MAX, Moret,
  and Monumentenzorg (Sotheby's out of scope): prompt/schema/policy
  `listing_enrichment_v4` / `listing_enrichment_schema_v4` /
  `enrichment_policy_v4_2` with v3/v4 history retained. Decisions distinguish
  accepted / redundant / rejected / needs_attention. Public listings (~**279**)
  expose effective neighbourhood, feature attrs, `effective_summary`,
  same-language `display_description`, and image galleries. Dashboard AI job
  execution is disabled; pipeline AI runs under budgets (USD 2/day, USD 25/month,
  25 listings/run) when the worker executes. Exception-based review only.
  Zero-cost policy rematerialization does not create billable AI work. Labs
  public-effective migrations are **applied**; waterfront allowlist + v4.2
  proposal rematerialize were pending DB apply as of 2026-07-21 quality pass.
  Production merkado.cw property migration remains **paused**.
- Labs Search Request + test Agent entitlement + 15 Match Reports (`rules_v1`) —
  **Labs prototypes**, not live on merkado.cw.

The previous CaribbeanHouseHunt (CHH) workflow is retired and removed from the
active repository. CHH-derived Labs rows were deleted from Labs on 2026-07-16
after a verified rollback export. Monumentenzorg adapter **v0.2.0** is Ready
(5 imported, coordinates 0/5; pipeline ready / cron Off / dispatch available).
Live Labs inventory (2026-07-21): KW **104**, Remax **222**, Moret **71**,
Monumentenzorg **5**; `public_property_listings` **279**. Next active source
task: **Sotheby's** remains access-route **BLOCKED** after 2026-07-20 recon
(not Ready; excluded from Ready pipelines; official feed/partner API required).

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
  original amount and currency as secondary. For true foreign→XCG conversions,
  show an indicative tip/icon (not a repeated inline disclaimer sentence).
- Convert USD at `1 USD = 1.79 XCG`.
- Convert EUR using ECB daily USD-per-EUR × 1.79 (`ecb_eur_usd_xcg_peg`).
- Tip copy for converted values: `Indicative equivalent based on known information.`
- Preserve source listing dates separately from Merkado detection dates.
- Append lifecycle events instead of only overwriting current values.
- Keep `sold` separate from `removed`.
- Treat the Property Passport as an off-chain activity log.

## 4. Not built yet

- Production-ready live-crawl adapters for all five sources (KW/Moret/
  Monumentenzorg catalogs were activated from verified offline complete-catalog
  artifacts, not continuous live crawls; Sotheby's remains access-route BLOCKED)
- Re-enabled GitHub daily cron for property pipeline (implemented but temporarily Off)
- Public property browse/detail UI on `merkado.cw` (Labs `/browse` public preview exists)
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
