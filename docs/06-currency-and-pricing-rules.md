# 06 - Currency and Pricing Rules

**Purpose:** Approved original-currency and XCG benchmark conversion policy for Merkado Labs.
**Last updated:** July 23, 2026

## 1. Principles

- Preserve the original asking amount and original currency as source truth
  (scraped source text or Labs admin / future user-entered amount).
- Store a separate XCG benchmark for comparison.
- Labs admin native listings use the same conversion methods; never invent
  `source_official_conversion` from a Merkado rate.
- Never present the XCG figure as a bank conversion quote, transaction rate, appraisal, or contractual amount.
- For true foreign-currency → XCG conversions, surface an **indicative tip/icon**
  (copy: **Indicative equivalent based on known information.**). Do not repeat
  that sentence inline under every price.

## 2. Fixed conversions

| Original | Rule | Provider id |
|---|---|---|
| XCG | Identity | `policy:xcg_identity` |
| ANG / NAf | 1:1 to XCG | `policy:ang_naf_1_to_1` |
| USD | `1 USD = 1.79 XCG` | `policy:usd_1_79` |

## 3. Approved EUR → XCG policy

Use the European Central Bank daily USD-per-EUR reference rate.

```
EUR_TO_XCG = ECB_USD_PER_EUR × 1.79
```

- ECB publishes the number of USD per one EUR.
- XCG is legally pegged at `1 USD = 1.79 XCG`.
- Provider identifier: `ecb_eur_usd_xcg_peg`
- Source URL: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
- One cached quote per source run (never per listing).
- Weekends/TARGET holidays reuse the latest published working-day observation.
- Maximum accepted observation age: **5 calendar days** (fail closed if older).
- Retries with conservative timeouts; no fabricated fallback.

### Stored provenance

- original EUR amount and currency
- ECB USD-per-EUR rate
- fixed USD→XCG peg `1.79`
- derived EUR→XCG rate
- ECB observation date (`conversion_rate_at`)
- fetch timestamp (in conversion provenance / quote)
- provider id `ecb_eur_usd_xcg_peg`
- calculation method `ecb_usd_per_eur_times_usd_xcg_peg`
- adapter/import version on the source run

### Failure behaviour

- Keep importing / retaining original source prices.
- Leave XCG benchmark pending for new rows without a prior valid benchmark.
- **Do not** overwrite a previously valid listing benchmark with null because of a temporary provider failure.
- Never silently fall back to a manual `2.00` test rate.

### Manual / test rates

CLI `--fx-provider manual --eur-rate …` is allowed for controlled tests only.
Provider ids such as `fixed_test` / `manual_test` must be labelled as historical/manual and must not be shown as current production benchmarks after an approved ECB recalculation.
The 2026-07-23 audit confirmed **0** current listing providers with test/manual
labels. All **51** immutable historical test-rate `price_observations` remain
stored for provenance and are filtered from Passport price rows/charts.

## 4. Public eligibility

Public eligibility requires an active listing with a positive original price (among other checks).
Benchmark pending does not by itself make a listing ineligible when the original price is present.

## 5. Confirmed RE/MAX ECB application (2026-07-16)

First complete RE/MAX Labs import used ECB observation date **2026-07-16**,
USD/EUR **1.1467**, derived EUR→XCG **2.052593**, provider `ecb_eur_usd_xcg_peg`.
Prior `fixed_test` listing benchmarks were recalculated with `benchmark_recalculated`
events (not `price_changed`). Current dashboard listing values use the ECB provider.

## 6. XCG-primary display (Labs dashboard)

- XCG is the **primary** price wherever a price is displayed — listing
  detail, browse cards, listing table — formatted with the `Cg` prefix
  (literal `Cg 1,927`, not `Intl` currency style — Node and browsers
  disagree on the XCG symbol and that breaks hydration).
- The original source amount is shown as a **secondary** line only when its
  currency differs from XCG/ANG/NAf (ANG and NAf are 1:1 with XCG, so they
  are not treated as a "different" currency).
- Price search and filter ranges operate on the **XCG benchmark**, not the
  original currency; a listing without a valid benchmark is excluded from
  the mixed-currency sort/filter.
- If an original price exists but no XCG benchmark is available yet, show
  the original amount with **"XCG equivalent currently unavailable"**
  instead of fabricating a conversion.
- True foreign→XCG conversions show an indicative **tip/icon** beside the
  primary XCG amount (HelpTip); XCG/ANG/NAf identity cases omit it. Do not
  repeat the indicative sentence as always-visible body text under the price.
- Sold listings additionally show: **Last known listing price. The actual
  sale price may differ.**
- Implementation: `apps/labs-dashboard/src/lib/domain/price-display.ts` +
  `apps/labs-dashboard/src/components/price-display.tsx`.

## 7. Source-official alternate currencies (Phase 4)

Preserve the **asking anchor** (original amount + currency) separately from any
source-published alternate currency lines. Precedence for the public XCG figure:

1. Source-official ANG/XCG alternate when present (`conversion_method =
   source_official_conversion`)
2. Else Merkado conversion (`identity` / ANG 1:1 / USD peg / ECB EUR path)

| Rule | Detail |
|---|---|
| Anchor | Exact asking amount/currency from the source |
| Official alternates | Stored on `official_alternate_prices` with provenance **`source_official_conversion`** |
| Never invent | Do **not** derive `source_official_conversion` from Merkado/ECB rates |
| Public XCG preference | Prefer official XCG/ANG when available; else Merkado conversion |
| RE/MAX | Parse “listed in {CUR}” from the disclaimer. Live EUR pages typically omit the NAF/XCG selector amount — capture via **NAF cookie session** (`GET /currency/NAF/` then re-fetch detail; `remax_naf_session` / `capture_naf_official_alternate`). Do not invent amounts from Merkado/ECB |
| KW | First currency code remains the anchor; following EUR/XCG **inline** lines are official alternates |
| Moret | Sidebar widget `data-coef` values are evidence notes only — not Merkado rates |
| Monumentenzorg | Single currency; no official alts required |

### Confirmed example — RE/MAX `hr2066` (2026-07-21)

Labs refresh applied (`data/processed/source_official_currency_refresh.json`,
`mode=apply`):

| Field | Value |
|---|---|
| Asking anchor | **EUR 664** (unchanged) |
| Official alternate | **XCG 1350** (`source_official_conversion`, evidence `XCG 1.350 / mo.`, label `remax_naf_session`) |
| Public XCG benchmark | **Cg 1350** (official precedence over prior ECB ~1358) |
| Timeline | No `price_changed` / `currency_changed` (official alt backfill is provenance-only) |

### Event semantics

- `price_changed` — asking **amount** changed
- `currency_changed` — asking **currency** changed
- `benchmark_recalculated` — FX/rate/provider context only (anchor unchanged)
- Official alternate capture/backfill with unchanged anchor ≠ `price_changed`
- Import pipeline is the sole writer for these three; lifecycle must not duplicate them
  (dual-writer `price_changed` fixed in the 2026-07-21 quality pass)
- Tiny RE/MAX display jitter (±1) is flagged
  `suspected_display_fx_jitter`, retained, and hidden from Passport timelines
- Presentation timeline suppresses rate-only / enrichment / policy-rematerialization
  noise at read-time (see `05`)

### XCG price-over-time chart

Dashboard chart points come from **material asking-price changes** only.
Y-value = source-official XCG when stored, else Merkado benchmark at that event.
Tooltips show original amount/currency + provenance. Rate-only changes do not move the chart.

## 8. Listing-level price audit (2026-07-23)

Audited all **405** Labs listings and the public-effective projection:

- **385** priced listings have positive original amounts, positive XCG
  benchmarks, and valid current provenance.
- **20** no-price source listings are public-ineligible; they are listed in
  `labs/PRICE_CURRENCY_AUDIT_2026-07-23.md`.
- **283** public rows therefore display/filter/sort with XCG primary.
- Current methods: 205 source-official conversions, 160 XCG identity, 11 ECB
  EUR, 7 fixed USD peg, 2 legacy ANG/NAf 1:1, and 20 no-price/no-conversion.
- A naive USD×1.79 check flagged **50** rows. Review showed every row uses
  `source_official_conversion` / `source:official_alternate`: authoritative
  whole-XCG source amounts with rounded USD secondary amounts. Differences
  were rounding (≤ XCG 0.50), not stale current benchmarks, so no listing
  mutation was justified.

No immutable price history was rewritten or deleted.
