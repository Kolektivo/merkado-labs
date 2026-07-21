# 01 - Merkado Live Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** July 21, 2026

**Labs automation foundation:** the four Ready property sources share a Labs-only
orchestration path (orchestrator/worker/locks/anomaly/budgets/`change_hash`) via
`run_property_pipeline.py` / `run_property_pipeline_worker.py` and GHA
`property-pipeline-labs.yml`. **Automatic daily cron is On**
(`AUTOMATIC_REFRESH_ENABLED = true`) after 2026-07-21 supervised + idempotent
gates; schedule `0 10 * * *` UTC = 06:00 America/Curacao begins only when this
workflow reaches the default branch. Manual/`workflow_dispatch` and dashboard
Data Operations dispatch remain available. Sotheby's remains blocked and excluded.
This does not change production or deploy anything.

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
- **English is the default public website language** for Browse / Passport /
  titles, summaries, filters, navigation, and SEO. Stable public URLs are
  `/browse/{uuid}`. Scrapers keep raw source title/description; AI generates
  English `display_title` / `display_summary` / description. Deterministic
  English fallbacks never leave a blank public title. **About this property**
  additionally supports Dutch (`display_description_nl`) via a compact
  English/Nederlands toggle — not full-site localization. Dutch↔English search
  synonyms are deterministic (no AI per query).
- RE/MAX Curaçao as the first end-to-end direct-source adapter (catalog contract
  **220**; Labs DB may show **222** — operational drift; adapter **v0.4.1**;
  **199/220** coordinates; Terra initial backfill complete; pipeline ready /
  cron On / dispatch available; normal Refresh & enrich = new/changed only);
- Keller Williams: Labs inventory **104** listings; live complete catalogs
  discover ~**102** (offline import preview still gates the historical **84**
  artifact only — not a scheduled input). Crawl-Delay 20 sequential. Earlier
  bounded/partial adapter runs had falsely marked 35 KW listings `removed` on
  2026-07-17; restored from last valid pre-absence status without deleting
  immutable events. Pipeline ready / cron On / dispatch available.
- Moret Real Estate adapter **v0.2.0**: **71** listings; coordinates 71/71;
  Terra coverage complete; pipeline ready / cron On / dispatch available;
  Refresh & enrich = new/changed only; live Dutch `/properties/` catalog;
- AI enrichment **v5 / policy v5** is current in Labs across KW, RE/MAX, Moret,
  and Monumentenzorg (Sotheby's out of scope): prompt/schema/policy
  `listing_enrichment_v5` / `listing_enrichment_schema_v5` /
  `enrichment_policy_v5` with v3/v4 history retained. English public presentation
  fields (`display_title`, `display_summary`, English overview) are part of the
  v5 contract. Title convention: `N-Bedroom Type [feature] in Neighbourhood`.
  AI never overwrites protected facts (price, currency, beds/baths, areas,
  coords, IDs, status, raw source title/description). Human review is
  exceptional — genuine conflicts only. Decisions distinguish auto_applied /
  redundant / rejected / needs_attention (v5 field decisions:
  auto_applied **3679** / rejected **386** / redundant **361** /
  needs_attention **9** across **9** listings). Public listings (**285**)
  expose English `display_title` / `display_summary` / `display_description`,
  optional Dutch `display_description_nl`, effective neighbourhood, feature
  attrs, and image galleries. SEO / JSON-LD use English presentation + XCG
  when available. Dashboard AI job execution is disabled; pipeline AI runs
  under budgets (USD 2/day, USD 25/month, 25 listings/run) when the worker
  executes. One-time English presentation migration **applied** for **289**
  active Ready listings (~USD **7.83**, under USD **15** / **320**-call caps)
  and was **not rerun** for bilingual work. Targeted one-time Dutch description
  backfill **applied** for **285** public listings (~USD **2.42**, under USD
  **5** / **320**-call caps); post-run selection is zero-billable
  (`selected_count=0` / `already_complete=285`). Unchanged bilingual hashes
  skip at zero cost. Future new/changed enrichment generates English
  presentation then Dutch description in the same job pass (Dutch failure does
  not remove English). Zero-cost policy rematerialization does not create
  billable AI work. Labs public-effective + bilingual view migrations exist in
  repo; production merkado.cw property migration remains **paused**.
- Labs Search Request + test Agent entitlement + 15 Match Reports (`rules_v1`) —
  **Labs prototypes**, not live on merkado.cw.

The previous CaribbeanHouseHunt (CHH) workflow is retired and removed from the
active repository. CHH-derived Labs rows were deleted from Labs on 2026-07-16
after a verified rollback export. Monumentenzorg adapter **v0.2.0** is Ready
(5 imported, coordinates 0/5; pipeline ready / cron On / dispatch available).
Live Labs inventory (post supervised automation gates 2026-07-21): KW **104**,
Remax **222** (live complete discover **220**; two IDs removed via two-absence
rule), Moret **71**, Monumentenzorg **5**; `public_property_listings` **286**
(KW **88** / Remax **125** / Moret **71** / Monumentenzorg **2**) with EN/NL
About-this-property on **283** (3 newly public Remax deferred under the 25/day
AI cap). Supervised run `e34eb779-…` spent ~USD **0.96** on **25** Remax
new/changed; idempotent rerun spent **USD 0** (budget-deferred remainder **71**).
Next active source task: **Sotheby's** remains access-route **BLOCKED** after
2026-07-20 recon (not Ready; excluded from Ready pipelines; official
feed/partner API required).

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
- Re-enabled GitHub daily cron for property pipeline (implemented but still Off until supervised pipeline dry-run + worker activation gates)
- Production merkado.cw property surface (Labs English Browse preview is ready)
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
