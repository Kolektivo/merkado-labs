import assert from "node:assert/strict";
import test from "node:test";

import {
  dryRunPresentationCounts,
  filterDefaultTimeline,
} from "../../src/lib/domain/activity-presentation.ts";
import { buildXcgPriceSeries } from "../../src/lib/domain/xcg-price-series.ts";
import { formatXcgPrimary } from "../../src/lib/domain/price-display.ts";

test("XCG series uses official alternate when present and ignores rate-only drift", () => {
  const series = buildXcgPriceSeries([
    {
      id: "a",
      observedAt: "2026-07-01T10:00:00Z",
      price: 664,
      currency: "EUR",
      originalPrice: 664,
      originalCurrency: "EUR",
      benchmarkPriceXcg: 1358,
      conversionProvider: "ecb_eur_usd_xcg_peg",
      officialAlternatePrices: [
        {
          amount: 1350,
          currency: "XCG",
          provenance: "source_official_conversion",
        },
      ],
    },
    {
      id: "b",
      observedAt: "2026-07-08T10:00:00Z",
      price: 664,
      currency: "EUR",
      originalPrice: 664,
      originalCurrency: "EUR",
      // Rate-only change on same asking amount — collapsed, no second point.
      benchmarkPriceXcg: 1362,
      conversionProvider: "ecb_eur_usd_xcg_peg",
      officialAlternatePrices: [
        {
          amount: 1350,
          currency: "XCG",
          provenance: "source_official_conversion",
        },
      ],
    },
    {
      id: "c",
      observedAt: "2026-07-15T10:00:00Z",
      price: 700,
      currency: "EUR",
      originalPrice: 700,
      originalCurrency: "EUR",
      benchmarkPriceXcg: 1430,
      conversionProvider: "ecb_eur_usd_xcg_peg",
      officialAlternatePrices: [],
    },
  ]);

  assert.equal(series.length, 2);
  assert.equal(series[0].priceXcg, 1350);
  assert.equal(series[0].xcgProvenance, "source_official_conversion");
  assert.equal(series[0].originalAmount, 664);
  assert.equal(series[0].originalCurrency, "EUR");
  assert.equal(series[1].priceXcg, 1430);
  assert.equal(series[1].xcgProvenance, "merkado_benchmark");
});

test("presentation timeline filters rate-only and dual-writer duplicates", () => {
  const newestFirst = [
    {
      id: "4",
      eventType: "first_seen",
      previousValue: null,
      newValue: { source_url: "https://example.com" },
    },
    {
      id: "3",
      eventType: "benchmark_recalculated",
      previousValue: { benchmark_price_xcg: "200" },
      newValue: { benchmark_price_xcg: "210" },
      notes: "Asking amount unchanged; conversion context changed",
    },
    {
      id: "2",
      eventType: "price_changed",
      previousValue: { amount: "100", currency: "EUR" },
      newValue: { amount: "110", currency: "EUR" },
    },
    {
      id: "1",
      eventType: "price_changed",
      previousValue: { amount: "100", currency: "EUR" },
      newValue: { amount: "110", currency: "EUR" },
    },
  ];

  const visible = filterDefaultTimeline(newestFirst);
  const ids = visible.map((event) => event.id);
  assert.deepEqual(ids, ["4", "1"]);

  const counts = dryRunPresentationCounts(newestFirst);
  assert.equal(counts.benchmark_rate_only, 1);
  assert.equal(counts.dual_writer_duplicate, 1);
  assert.equal(counts.visible_default, 2);
});

test("Cg primary formatting stays hydration-stable", () => {
  assert.equal(formatXcgPrimary(1350), "Cg 1,350");
});
