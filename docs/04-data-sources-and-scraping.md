# 04 - Direct Data Sources & Scraping

**Purpose:** Canonical source strategy and adapter rules for the property MVP.

## 1. Approved sources

| Source key | Display name | Status |
|---|---|---|
| `keller_williams_curacao` | Keller Williams Curaçao | [LABS] v0.3.0; 84-listing complete catalog; 84/84 successful Terra v3 proposals (manual/unscheduled) |
| `sothebys_curacao` | Sotheby's International Realty | [PLANNED] Access route BLOCKED (2026-07-20 recon); not Ready |
| `remax_curacao` | RE/MAX | [LABS] Complete manual catalog (220); Terra-v3 initial backfill complete; unscheduled |
| `moret_real_estate` | Moret Real Estate | [LABS] v0.2.0 WPEstate; complete catalog activated (71); Terra-v3 initial backfill complete (71/71) |
| `monumentenzorg_curacao` | Monumentenzorg Curaçao | [LABS] Adapter v0.2.0 Ready; catalog 5; public eligible 2; Terra 5/5 |

Confirm the exact domain, listing index, detail paths, robots rules, and terms note before implementing each adapter.

### RE/MAX Curaçao (`remax_curacao`) — verified 2026-07-20 (v0.4.1 Data Ops preflight)

| Item | Value |
|---|---|
| Primary domain | `https://www.realestate-curacao.com` (RE/MAX BonBini) |
| Sale index | `/en/homes/homes-for-sale/` |
| Rent index | `/en/homes/homes-for-rent/` |
| Pagination | `/en/homes/homes-for-sale/paginate-{n}/` and `/en/homes/homes-for-rent/paginate-{n}/` (~25/page; HTML pager links omit a slash and must be normalized) |
| Detail URL | `/en/homes/homes-for-{sale\|rent}/(hs\|hr)\d+/…html`; sold/rented paths include `/sold/` or `/rented/` |
| External ID | Lowercase `hs####` / `hr####` / `lo####` / `co####` from URL path |
| Robots | `robots.txt` allows listing paths; only `/page_commercialcontact.php` disallowed |
| Rendering | Server-rendered HTML with labelled tables + `itemprop=price` microdata; images on `cdn.remax-abc.com` |
| Catalog size | **220** listings (164 sale + 56 rent); 12 index pages; latest complete success 2026-07-17; checksum `54f8e094…9177`; Labs matches (125 active / 59 sold / 36 inactive; 119 public eligible) |
| Currency UI | Site switcher EUR / USD / XCG (NAF path); explicit symbols/codes in price node |
| Currency | 208/220 priced EUR with ECB XCG benchmarks; 12 no-price; original amounts preserved; XCG-primary shared display |
| Coordinates | Source HTML uses `new google.maps.LatLng(lat,lng)` on **199/220** pages. Adapter **v0.4.1** imported offline into Labs (**199/220**; 21 remain without coordinates). Do not invent coordinates. |
| Listing agent | `[itemprop=employee]` extracted in v0.4.1 (`raw_payload.listing_agent`); agent headshots excluded from gallery |
| Bathrooms / year / project | Full/half bathroom derivation, `year_built`, project/resort labels in v0.4.1 (observation/raw payload) |
| Listing dates | Not published on detail pages observed (0/220 `source_listed_at`) |
| Rate limit | Use robots crawl-delay when present; otherwise ≥1.5–2s between live requests |
| Adapter | `src/merkado_labs/scrapers/adapters/remax_curacao.py` **v0.4.1**; CLI `scripts/adapters/run_remax_curacao.py` (`--preview-import` / `--import-from-file`) |
| Description extraction | Full `p.description-text` + `#description` body (v0.3.x incorrectly used meta description only) |
| Raw evidence | Private Storage bucket `listing-raw-evidence`; observation metadata + cleaned text in DB |
| First complete Labs import | 2026-07-16T19:21:43Z–19:29:41Z UTC; outcome `success`; run `3bf72218-914e-49f9-a577-cdf6ca76e500` |
| Evidence + description refresh | 2026-07-17; outcome `success`; run `a6a32434-36e5-46b1-8033-143917eb0aeb`; avg description length ~1970 (was ~147); 220/220 evidence uploads |
| ECB quote used | USD/EUR 1.1467 → EUR→XCG 2.052593; observation date 2026-07-16; provider `ecb_eur_usd_xcg_peg`; one cached quote per run |
| Import counts | 170 new + 50 updated (first import); refresh updated 220 identities unchanged |
| Status mix | 125 active (105 sale / 20 rent), 59 sold, 36 inactive/rented; 29 under-contract stay `active` with explicit `source_listing_status` |
| First-observed status events | Backfilled 2026-07-17: 59 `source_marked_sold`, 36 `source_marked_rented`, 29 `source_marked_under_contract` (earliest Merkado observation; not transaction dates) |
| Idempotency | Immediate re-import 2026-07-16T19:37–19:45Z: imported 0, updated 220, no new price/first_seen/benchmark events |
| Scheduling | Remains **off** — manual only / unscheduled |
| Historical AI | 29 proposals on **gpt-4.1-mini** + prompt/schema **v1** (2026-07-17); obsolete for Terra v3 |
| Terra v3 canary (2026-07-20) | Five IDs (`hs2467`, `hr1013`, `hr2165`, `hs2941`, `hr1393`); **5/5** `needs_review` after `hs2467` retry; model `gpt-5.6-terra` |
| v0.4.1 preflight (2026-07-20) | Artifact integrity ok. Geospatial preview: **193** inferred / **6** outside polygons / **21** no coords; effective neighbourhood changes **5**. Lifecycle/public stable. Legacy AI checksum would flip **220**; semantic billable **5**. See `data/processed/remax_v041_*` + `remax_pipeline_preflight.*`. |
| AI / refresh policy | Normal `Refresh & enrich` = new/changed only (ceiling USD 0.75). Initial Terra backfill was a separately approved one-time action (ceiling USD 10; completed 2026-07-20). Coordinate-only import must not rebill all 220. |
| Terra-v3 initial backfill | Selection **211** + **9** already current; job `remax_remaining_terra_backfill` **211/211** succeeded; gross ≈ **USD 6.67**; coverage **220/220**; see `data/processed/remax_activation_final_report.*` |
| Verdict | **v0.4.1 active** + Terra-v3 initial backfill **complete**; remains manual/unscheduled |
| Next gated action | Monumentenzorg Labs import (adapter v0.2.0 complete; not Ready); normal refresh = new/changed only |

### Keller Williams Curaçao (`keller_williams_curacao`) — [LABS] 2026-07-17

| Item | Value |
|---|---|
| Primary domain | `https://kw-curacao.com` |
| Detail URL | `/listings/{slug}` (e.g. `…-JC-0027`); exclude `/silent-listings` |
| External ID | Trailing slug token (`JC-0027`, `ID-008`, `UJ32`, …) |
| Robots | `Crawl-Delay: 20` — sequential detail only; no parallel |
| Price UI | USD primary with EUR/XCG equivalents; European thousands (`.` ) |
| Adapter | `keller_williams_curacao.py` **v0.3.0**; CLI `scripts/adapters/run_keller_williams_curacao.py` |
| Complete catalog import | Offline import from verified Stage-3 artifact (`--import-from-file`); **84** listings; no live website crawl for that import |
| Public eligibility | 81 public eligible / 3 excluded (no-price / ineligible) |
| Coordinates | Present for 82/84; missing only `RL-42`, `RL-44` |
| False-removal repair (earlier) | 35 listings wrongly marked `removed` by bounded runs; restored 2026-07-17 |
| AI enrichment | **GPT-5.6 Terra** (`OPENAI_ENRICHMENT_MODEL=gpt-5.6-terra`) with automatic policy application; prompt/schema/policy **v3** (`listing_enrichment_v3` / `listing_enrichment_schema_v3` / `enrichment_policy_v3`) |
| Enrichment architecture | Source facts / AI proposals / effective applied attributes kept as separate layers; evidence must ground in normalized source text |
| Review model | Exception-based: high-confidence evidenced fields auto-apply; conflicts / weak / variant evidence need attention; unsupported/duplicated/noisy proposals are rejected outright and never reach the attention queue |
| Cost safeguards | Preflight worst-case uses configured `max_output_tokens`; hard USD ceiling; per-listing persist; resume skips unchanged checksums (including prior failures unless `--force`) |
| Retry batch (2026-07-17) | 24 listings that truncated at `max_output_tokens=2500` retried on the compact v3 schema: **24/24 succeeded**, cost **USD 0.7054** |
| Final coverage & cost | **84/84** successful latest-proposal Terra runs (0 failed, 0 never enriched); latest-proposal cost total **USD 3.1266**; gross (all DB Terra proposals) **USD 4.1463**; retained-result **USD 3.1266**; wasted/deferred **USD 1.0197**; policy outcomes 235 auto-applied / 77 needs attention / 1039 rejected fields — see `data/processed/kw_activation_final_report.md` |
| Timeline | Immutable `ai_enrichment_*` activity events (started/completed/failed/skipped/auto_applied/needs_attention) |
| Attributes | Flexible metadata bag — not first-class browse filters in this activation |
| Neighbourhood provenance | Dedicated source location remains source truth; geospatial assignment separate; AI neighbourhood candidates must be evidence-backed; generic `Curaçao` is not a confirmed neighbourhood; coordinates are never AI-generated |
| Scheduling | **Off** — manual only; AI enrichment also unscheduled |
| Production claims | Labs research only — no production property marketplace claims |

### Moret Real Estate (`moret_real_estate`) — [LABS] 2026-07-20

| Item | Value |
|---|---|
| Domain | `https://moretrealestate.com` (WPEstate) |
| Robots | Allows `/properties/`; empty `Disallow:`; sitemap index present; effective delay **2s** |
| Index | Canonical Dutch `/properties/` with `rel=next` + `/properties/page/{n}/` |
| Catalog | **71** unique Dutch archive listings (8 index pages; pagination termination `no_next_page`) |
| External ID | `post-{wordpress_post_id}` (Dutch page). WPML English mirrors use distinct post IDs — treat as aliases, do not double-import |
| Bilingual | Prefer Dutch `/properties/{slug}/`; record EN switcher URLs as aliases |
| Price | Prefer nested-aware `price_area` (incl. `635.000 euro`); labelled Prijs; reject global/footer amounts |
| Sale/rent | Explicit category / phrase evidence only (no low-price sole classifier) |
| Status | Explicit sold/rented/under-contract/reserved; page load alone does not force active beyond listing body |
| Adapter | `moret_real_estate.py` **v0.2.0**; CLI `scripts/adapters/run_moret_real_estate.py` |
| Images | prettyPhoto gallery `href`s; `og:image` fallback; skip logos / agent / related cards |
| Labs import | **Activated 2026-07-20** — offline `--import-from-file` (66 insert / 5 update); first complete baseline; public eligible **71**; coords **71/71**; evidence private `listing-raw-evidence` |
| AI | Terra-v3 initial backfill **complete**: canary **5/5** (~USD 0.1165) + remaining **66/66** (~USD 1.8259 / ceiling 2.40); coverage **71/71**; cumulative ~USD 1.94; public effective attributes on Browse/Passport |
| Scheduling | Manual / unscheduled; normal Refresh & enrich = new/changed only |
| Artifact | `data/processed/moret_complete_catalog.json` (`complete_catalog=true`; checksum `386cbe65…`); final report `moret_activation_final_report.*` |

### Monumentenzorg Curaçao (`monumentenzorg_curacao`) — [LABS] Ready 2026-07-20 (adapter v0.2.0)

| Item | Value |
|---|---|
| Primary domain | `https://monumentenzorg.cw/` (`www` → apex) |
| Scope | WPEstate `estate_property` for-rent/sale catalog only |
| Out of scope | `/our_property/*` and `/our-properties/` heritage portfolio CPT |
| Index | `/properties/` (single page; termination `no_next_page`) |
| Sitemap | `estate_property-sitemap.xml` (cross-check required) |
| Detail URL | `/properties/{slug}/` |
| External ID | `property-{wordpress_post_id}` from Property Id / postid |
| Catalog | **5** unique commercial listings (4 rent / 1 sale) |
| Price | ANG when numeric; preserve text for TBD/offers; do not invent amounts |
| Numeric priced | 2/5 public-eligible; 3/5 non-numeric excluded from Browse (`Rental fee to be determined` / `Open to reasonable offers`) |
| From-price | Villa Maria preserves “Starting at” evidence; marked `from_price` in adapter payload |
| Status | `sold_under_reservation` → sold/inactive for public; raw status retained |
| Currency | Original ANG retained; XCG benchmark via existing `legacy_1_to_1` |
| Coordinates | **0/5** (source has none; no geocoding; geospatial unresolved) |
| Robots | Allow-all; effective delay **≥2s**; certifi-backed TLS (never `verify=False`) |
| Adapter | `monumentenzorg_curacao.py` **v0.2.0**; CLI `scripts/adapters/run_monumentenzorg_curacao.py` |
| Labs import | Offline complete import 2026-07-20; source run `8b78353b-ec47-4126-b251-db247fcdcb1a`; checksum `b4dd8d05…` |
| Public Browse | **2** eligible (Bargestraat 28-D, Villa Maria) |
| AI enrichment | Terra-v3 initial backfill **5/5** (canary 2 + remaining 3; ~USD 0.06 total) |
| Scheduling | **Off** — manual/unscheduled; Refresh & enrich = new/changed only |
| Data Ops | **Ready** |

### Adapter status — July 2026

- [LABS] **RE/MAX**: complete manual catalog; **adapter v0.4.1 active** (199/220 coords); Terra-v3 initial backfill complete (**220/220**); remains manual/unscheduled.
- [LABS] **Keller Williams**: adapter v0.3.0; complete 84-listing catalog imported offline; Terra v3 auto-enrichment activated, 84/84 successful proposals (manual/unscheduled).
- [LABS] **Moret**: adapter v0.2.0; first complete catalog activated (71); Terra-v3 initial backfill complete (**71/71**); manual/unscheduled.
- [LABS] **Monumentenzorg**: adapter **v0.2.0** Ready; catalog 5; public eligible 2; Terra-v3 **5/5**; coordinates 0/5; manual/unscheduled.
- [PLANNED] **Sotheby's**: Access route **BLOCKED** (recon 2026-07-20) — affiliate `curacaosothebysrealty.com` TLS expired/mismatched (HTTP redirects to network office path); `www.sothebysrealty.com` inventory/office/robots/sitemap return HTTP 202 WAF/challenge; `app.sir.com/curacaosir` is an office/app shell without listing catalog HTML. Skeleton adapter **v0.1.2** remains fail-closed. Not Ready. Next: official affiliate feed/export or Anywhere partner API with written approval (no WAF bypass).

### Source readiness matrix and next track

`data/processed/property_source_readiness.md` is a read-only audit (no
scrapes, imports, or AI calls) comparing listings/public-eligible/AI
proposals/catalog maturity per source. Monumentenzorg v0.2.0 activation +
Terra-v3 initial backfill completed 2026-07-20. Next active source task:
**Sotheby's** remains access-route **BLOCKED** (2026-07-20 recon; official
feed/partner API required). Normal Refresh & enrich enriches new/changed only.
KW/RE/MAX/Moret/Monumentenzorg remain manual and unscheduled.

## 2. CHH removal rule

CHH is not a fallback, upstream dependency, or active research workflow.

Remove:

- scheduled and manually runnable CHH workflows;
- CHH harvest/import runtime code;
- CHH-specific configuration and active source registration;
- CHH fixtures and active tests;
- CHH dashboard routes, filters, labels, and queries;
- CHH-derived Labs listings and dependent records through a reviewed cleanup;
- any runnable CHH fallback path.

Reusable patterns may be extracted only after becoming source-neutral:

- immutable snapshots;
- raw evidence storage;
- bounded/rate-limited requests;
- deterministic normalization;
- source-run health;
- idempotent imports;
- lifecycle comparison;
- parser fixture testing.

## 3. Adapter contract

Each adapter must return the same source-neutral structure:

- source key and original URL;
- external listing ID;
- observation timestamp;
- adapter/parser version;
- raw payload or HTML checksum;
- source listing date, when explicitly available;
- original amount and currency;
- source status;
- normalized property fields;
- image references;
- extraction warnings;
- field provenance and inference metadata.

Listing identity is scoped to `(property_source_id, external_id)`.

Do not auto-create or auto-merge canonical `property_assets` during import.

## 4. Scraping rules

- Use deterministic extraction first.
- AI may normalize ambiguous text only when explicitly approved.
- AI must never invent price, currency, listing date, status, address, or identifiers.
- Preserve raw evidence before normalization.
- Respect rate limits and source-specific delays.
- Support bounded runs and dry runs.
- Use fixtures for parser tests. Tests must not depend on live source pages.
- Keep adapters independent so one source failure does not block others.
- Do not use browser automation unless a source cannot be handled otherwise and the task is explicitly approved.

## 5. Source-run health

Every run stores:

- source key;
- adapter/parser version;
- started and completed timestamps;
- `success`, `partial`, or `failure` outcome;
- discovered item count;
- parsed item count;
- excluded no-price count;
- warnings/errors;
- snapshot checksum.

Only a **complete successful run** may create missing/removal transitions.

A failed or partial run must never mass-remove or alter availability state.

## 6. Recommended build order

1. RE/MAX (complete manual import done 2026-07-16; remains unscheduled)
2. Next source after reconnaissance — prefer Keller Williams or Moret for likely lower parser complexity than Sotheby's; confirm Monumentenzorg listing scope
3. Remaining sources one by one

For each source:

1. Record approved domain, robots, terms, pagination, and rate limit.
2. Capture fixtures and a bounded raw snapshot.
3. Implement deterministic index/detail parsing.
4. Add price, currency, sold-state, and no-price fixtures.
5. Run dry mode and review output.
6. Import into Labs manually.
7. Compare repeated complete snapshots.
8. Enable scheduling only after lifecycle safety passes.

## 7. Per-source QA checklist

- Exact domain and listing section approved
- Robots/terms note recorded
- Request delay and maximum page/item limits configured
- Pagination completeness verified
- Stable external ID strategy documented
- Detail parser fixtures pass
- Original price/currency fixtures pass
- No-price exclusion passes
- Sold-state extraction passes
- Failed-run safety passes
- Raw snapshot retained
- Import is idempotent
- Repeated manual runs reviewed
- Schedule remains disabled until approval
