# 04 - Direct Data Sources & Scraping

**Purpose:** Canonical source strategy and adapter rules for the property MVP.

## 1. Approved sources

| Source key | Display name | Status |
|---|---|---|
| `keller_williams_curacao` | Keller Williams Curaçao | [LABS] v0.1; 40 listings imported (manual) |
| `sothebys_curacao` | Sotheby's International Realty | [PLANNED][RISK] HTTP 202/WAF; skeleton only |
| `remax_curacao` | RE/MAX | [LABS] Complete manual catalog (220; unscheduled) |
| `moret_real_estate` | Moret Real Estate | [LABS][WIP] v0.1 WPEstate; 5 bounded listings |
| `monumentenzorg_curacao` | Monumentenzorg Curaçao | [RISK] SSL expired / DNS fail; fixture parser only |

Confirm the exact domain, listing index, detail paths, robots rules, and terms note before implementing each adapter.

### RE/MAX Curaçao (`remax_curacao`) — confirmed 2026-07-16

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
| Catalog size (complete import 2026-07-16) | 220 listings (164 sale + 56 rent); 12 index pages; `complete_catalog` true |
| Currency UI | Site switcher EUR / USD / XCG (NAF path); explicit symbols/codes in price node |
| Coordinates | Absent from detail HTML for this catalog (0/220); do not invent; map shows "No map pin" |
| Listing dates | Not published on detail pages observed (0/220 `source_listed_at`) |
| Rate limit | Use robots crawl-delay when present; otherwise ≥1.5–2s between live requests |
| Adapter | `src/merkado_labs/scrapers/adapters/remax_curacao.py` **v0.4**; CLI `scripts/adapters/run_remax_curacao.py` |
| Description extraction | Full `p.description-text` + `#description` body (v0.3.x incorrectly used meta description only) |
| Raw evidence | Private Storage bucket `listing-raw-evidence`; observation metadata + cleaned text in DB |
| First complete Labs import | 2026-07-16T19:21:43Z–19:29:41Z UTC; outcome `success`; run `3bf72218-914e-49f9-a577-cdf6ca76e500` |
| Evidence + description refresh | 2026-07-17; outcome `success`; run `a6a32434-36e5-46b1-8033-143917eb0aeb`; avg description length ~1970 (was ~147); 220/220 evidence uploads |
| ECB quote used | USD/EUR 1.1467 → EUR→XCG 2.052593; observation date 2026-07-16; provider `ecb_eur_usd_xcg_peg`; one cached quote per run |
| Import counts | 170 new + 50 updated (first import); refresh updated 220 identities unchanged |
| Status mix | 125 active (105 sale / 20 rent), 59 sold, 36 inactive/rented; 29 under-contract stay `active` with explicit `source_listing_status` |
| First-observed status events | Backfilled 2026-07-17: 59 `source_marked_sold`, 36 `source_marked_rented`, 29 `source_marked_under_contract` (earliest Merkado observation; not transaction dates) |
| Idempotency | Immediate re-import 2026-07-16T19:37–19:45Z: imported 0, updated 220, no new price/first_seen/benchmark events |
| Scheduling | Remains **off** — manual only |
| AI enrichment | Foundation live; validated on 5 listings 2026-07-17; do not bulk-run all 220 without review |

### Keller Williams Curaçao (`keller_williams_curacao`) — [WIP] 2026-07-17

| Item | Value |
|---|---|
| Primary domain | `https://kw-curacao.com` |
| Detail URL | `/listings/{slug}` (e.g. `…-JC-0027`); exclude `/silent-listings` |
| External ID | Trailing slug token (`JC-0027`, `ID-008`, `UJ32`, …) |
| Robots | `Crawl-Delay: 20` — sequential detail only; no parallel |
| Price UI | USD primary with EUR/XCG equivalents; European thousands (`.` ) |
| Adapter | `keller_williams_curacao.py` **v0.1**; CLI `scripts/adapters/run_keller_williams_curacao.py` |
| Labs import | 2026-07-17: discovered/parsed 40, imported 36 + 4 prior = **40** listings |
| Run class | All KW runs to date are **partial** (`max_items` / incomplete catalog). Never treat as complete success. |
| False-removal repair | 35 listings wrongly marked `removed` by two `max_items=5` runs mislabeled `success`; restored 2026-07-17 (`kw_bounded_run_false_removal_v1`) |
| Current mix | 39 `active` + 1 `unknown` (Under Contract source status); 0 removed |
| Evidence | Private Storage HTML backfilled for all 40 |
| Scheduling | **Off** — manual only |

### Moret Real Estate (`moret_real_estate`) — [LABS][WIP] 2026-07-17

| Item | Value |
|---|---|
| Domain | `https://moretrealestate.com` (WPEstate) |
| Index | `/properties/` (+ pagination `/properties/page/{n}/`) |
| External ID | `post-{wordpress_post_id}` when present |
| Bilingual | Canonicalize `/en|nl/properties/` → `/properties/` |
| Price | Prefer `price_area`; flag `vanaf`/from prices; rent inferred when low/“te huur” |
| Adapter | `moret_real_estate.py` **v0.1**; CLI `scripts/adapters/run_moret_real_estate.py` |
| Labs import | Bounded **5** listings + evidence; scheduling off |
| Notes | Some prices use global fallback — tighten price_area selectors before full catalog |

### Adapter status — July 2026

- [LABS] **RE/MAX**: complete manual catalog + evidence refresh; AI 25-listing batch done.
- [LABS] **Keller Williams**: 40 listings imported; Crawl-Delay 20; pagination still incomplete.
- [LABS][WIP] **Moret**: WPEstate parser + 5 bounded imports; expand after price QA.
- [RISK] **Monumentenzorg**: SSL certificate expired on `monumentenzorg.cw`; alt DNS failed; fixture-only parser.
- [PLANNED][RISK] **Sotheby's**: robots/search/sitemap HTTP 202 (WAF); no browser automation.

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
