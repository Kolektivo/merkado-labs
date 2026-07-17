# 06 - Currency and Pricing Rules

**Purpose:** Approved original-currency and XCG benchmark conversion policy for Merkado Labs.
**Last updated:** July 16, 2026

## 1. Principles

- Preserve the original asking amount and original currency as source truth.
- Store a separate XCG benchmark for comparison.
- Never present the XCG figure as a bank conversion quote, transaction rate, appraisal, or contractual amount.
- Display disclaimer: **Indicative equivalent based on known information.**

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

## 4. Public eligibility

Public eligibility requires an active listing with a positive original price (among other checks).
Benchmark pending does not by itself make a listing ineligible when the original price is present.

## 5. Confirmed RE/MAX ECB application (2026-07-16)

First complete RE/MAX Labs import used ECB observation date **2026-07-16**,
USD/EUR **1.1467**, derived EUR→XCG **2.052593**, provider `ecb_eur_usd_xcg_peg`.
Prior `fixed_test` listing benchmarks were recalculated with `benchmark_recalculated`
events (not `price_changed`). Current dashboard listing values use the ECB provider.
