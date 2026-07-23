import assert from "node:assert/strict";
import test from "node:test";

import {
  activityPriceDelta,
  activityPublicXcgDelta,
  activityTitle,
  dryRunPresentationCounts,
  filterDefaultTimeline,
  latestVisibleMaterialAt,
  toNormalizedXcgAmount,
} from "../../src/lib/domain/activity-presentation.ts";
import {
  filterPresentationPriceObservations,
} from "../../src/lib/data/price-observations.ts";
import { buildXcgPriceSeries } from "../../src/lib/domain/xcg-price-series.ts";
import {
  buildPriceDisplay,
  formatXcgPrimary,
} from "../../src/lib/domain/price-display.ts";

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

test("1. same EUR asking + new ECB rate → zero public price changes", () => {
  const newestFirst = [
    {
      id: "rate",
      eventType: "benchmark_recalculated",
      previousValue: { benchmark_price_xcg: "1358", conversion_rate: "2.05" },
      newValue: { benchmark_price_xcg: "1362", conversion_rate: "2.052" },
      notes: "Asking amount unchanged; conversion context changed",
    },
    {
      id: "seen",
      eventType: "first_seen",
      eventAt: "2026-07-01T00:00:00Z",
      newValue: { source_url: "https://example.com" },
    },
  ];
  const visible = filterDefaultTimeline(newestFirst, {
    audience: "public",
    hasOfficialXcgAlternate: true,
  });
  assert.deepEqual(
    visible.map((event) => event.eventType),
    ["first_seen"],
  );
  assert.equal(
    visible.filter((event) => event.eventType === "price_changed").length,
    0,
  );
});

test("2. same source price imported twice → one visible event maximum", () => {
  const newestFirst = [
    {
      id: "dup",
      eventType: "price_changed",
      previousValue: { amount: "2500", currency: "XCG" },
      newValue: { amount: "2750", currency: "XCG" },
    },
    {
      id: "first",
      eventType: "price_changed",
      previousValue: { amount: "2500.0", currency: "XCG" },
      newValue: { amount: "2750.0", currency: "XCG" },
    },
  ];
  const visible = filterDefaultTimeline(newestFirst);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, "first");
});

test("3. duplicate first_seen → one visible First seen by Merkado", () => {
  const newestFirst = [
    {
      id: "later",
      eventType: "first_seen",
      eventAt: "2026-07-16T19:29:41Z",
      newValue: { source_url: "https://example.com" },
    },
    {
      id: "earlier",
      eventType: "first_seen",
      eventAt: "2026-07-01T10:00:00Z",
      notes: "First Labs observation for this source listing",
      newValue: { source_url: "https://example.com" },
    },
  ];
  const visible = filterDefaultTimeline(newestFirst);
  assert.deepEqual(visible.map((event) => event.id), ["earlier"]);
  assert.equal(activityTitle("first_seen"), "First seen by Merkado");
  const counts = dryRunPresentationCounts(newestFirst);
  assert.equal(counts.duplicate_first_seen, 1);
});

test("4. currency-session EUR→XCG with stable official alternate → no public price/currency event", () => {
  const newestFirst = [
    {
      id: "cur",
      eventType: "currency_changed",
      previousValue: { currency: "EUR" },
      newValue: { currency: "XCG" },
    },
    {
      id: "price",
      eventType: "price_changed",
      previousValue: { amount: "627.0", currency: "EUR" },
      newValue: { amount: "1275.0", currency: "XCG" },
    },
    {
      id: "seen",
      eventType: "first_seen",
      eventAt: "2026-07-01T00:00:00Z",
    },
  ];
  const visible = filterDefaultTimeline(newestFirst, {
    audience: "public",
    hasOfficialXcgAlternate: true,
  });
  assert.deepEqual(
    visible.map((event) => event.eventType),
    ["first_seen"],
  );
});

test("5. genuine asking-price change → exactly one visible XCG delta", () => {
  const newestFirst = [
    {
      id: "change",
      eventType: "price_changed",
      eventAt: "2026-07-21T19:54:14Z",
      previousValue: { amount: "4300.0", currency: "XCG" },
      newValue: { amount: "4500.0", currency: "XCG" },
    },
    {
      id: "seen",
      eventType: "first_seen",
      eventAt: "2026-07-01T00:00:00Z",
    },
  ];
  const visible = filterDefaultTimeline(newestFirst);
  assert.equal(visible.length, 2);
  const delta = activityPublicXcgDelta(visible[0]);
  assert.deepEqual(delta, {
    previousXcg: 4300,
    nextXcg: 4500,
    previousOriginal: { amount: 4300, currency: "XCG" },
    nextOriginal: { amount: 4500, currency: "XCG" },
  });
  assert.equal(
    `${formatXcgPrimary(delta.previousXcg)} → ${formatXcgPrimary(delta.nextXcg)}`,
    "Cg 4,300 → Cg 4,500",
  );
});

test("6. same normalized XCG before/after → event hidden", () => {
  const newestFirst = [
    {
      id: "same-xcg",
      eventType: "price_changed",
      previousValue: { amount: "100", currency: "USD" },
      newValue: { amount: "100.0001", currency: "USD" },
    },
  ];
  // 100 USD and 100.0001 USD both round to Cg 179
  assert.equal(toNormalizedXcgAmount(100, "USD"), 179);
  assert.equal(toNormalizedXcgAmount(100.0001, "USD"), 179);
  const visible = filterDefaultTimeline(newestFirst);
  assert.deepEqual(visible, []);
});

test("7. Browse cards: XCG only", () => {
  const model = buildPriceDisplay({
    originalPrice: 100_000,
    originalCurrency: "EUR",
    benchmarkPriceXcg: 204_000,
    surface: "browse",
  });
  assert.equal(model.primaryCurrency, "XCG");
  assert.equal(model.primaryAmount, 204_000);
  assert.equal(model.secondaryLabel, null);
  assert.equal(model.showIndicativeTip, false);
});

test("8. Admin provenance retains original amount/currency; public delta is XCG", () => {
  const event = {
    eventType: "price_changed",
    previousValue: { amount: "2500", currency: "USD" },
    newValue: { amount: 2750, currency: "USD" },
  };
  assert.deepEqual(activityPriceDelta(event), {
    previous: { amount: 2500, currency: "USD" },
    next: { amount: 2750, currency: "USD" },
  });
  const publicDelta = activityPublicXcgDelta(event);
  assert.equal(publicDelta.previousXcg, Math.round(2500 * 1.79));
  assert.equal(publicDelta.nextXcg, Math.round(2750 * 1.79));
  assert.equal(publicDelta.previousOriginal.currency, "USD");
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
      previousValue: { amount: "100", currency: "XCG" },
      newValue: { amount: "110", currency: "XCG" },
    },
    {
      id: "1",
      eventType: "price_changed",
      previousValue: { amount: "100", currency: "XCG" },
      newValue: { amount: "110", currency: "XCG" },
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

test("Passport hides ±1 jitter and SYSTEM_REPAIR even when legacy rows were stored visible", () => {
  const visible = filterDefaultTimeline([
    {
      id: "repair",
      eventType: "material_field_changed",
      notes: "SYSTEM_REPAIR normalized stale value",
      presentationClass: "primary",
    },
    {
      id: "jitter",
      eventType: "price_changed",
      previousValue: { amount: "1095", currency: "EUR" },
      newValue: { amount: "1096", currency: "EUR" },
      presentationClass: "secondary",
      suppressedReason: "suspected_display_fx_jitter",
    },
    {
      id: "real",
      eventType: "price_changed",
      previousValue: { amount: "4300", currency: "XCG" },
      newValue: { amount: "4500", currency: "XCG" },
    },
  ]);
  assert.deepEqual(visible.map((event) => event.id), ["real"]);
});

test("non-anchor EUR display wobble with official XCG is suppressed", () => {
  const visible = filterDefaultTimeline(
    [
      {
        id: "wobble",
        eventType: "price_changed",
        previousValue: { amount: "1331231.0", currency: "EUR" },
        newValue: { amount: "1332398.0", currency: "EUR" },
      },
    ],
    { hasOfficialXcgAlternate: true, audience: "public" },
  );
  assert.deepEqual(visible, []);
});

test("historical EUR wobble on re-anchored XCG listing is suppressed", () => {
  const visible = filterDefaultTimeline(
    [
      {
        id: "legacy-eur",
        eventType: "price_changed",
        previousValue: { amount: "731000", currency: "EUR" },
        newValue: { amount: "732000", currency: "EUR" },
      },
    ],
    { stableAskingCurrency: "XCG", audience: "public" },
  );
  assert.deepEqual(visible, []);
});

test("Last updated uses latest visible material event", () => {
  const newestFirst = [
    {
      id: "enrich",
      eventType: "ai_enrichment_completed",
      eventAt: "2026-07-22T12:00:00Z",
    },
    {
      id: "price",
      eventType: "price_changed",
      eventAt: "2026-07-21T19:54:14Z",
      previousValue: { amount: "4300", currency: "XCG" },
      newValue: { amount: "4500", currency: "XCG" },
    },
    {
      id: "seen",
      eventType: "first_seen",
      eventAt: "2026-07-01T10:00:00Z",
    },
  ];
  assert.equal(
    latestVisibleMaterialAt(newestFirst),
    "2026-07-21T19:54:14Z",
  );
});

test("Cg primary formatting stays hydration-stable", () => {
  assert.equal(formatXcgPrimary(1350), "Cg 1,350");
});

test("historical test-rate price rows stay stored but out of Passport pricing", () => {
  const visible = filterPresentationPriceObservations([
    {
      id: "test",
      observedAt: "2026-07-01T00:00:00Z",
      price: 100,
      currency: "EUR",
      conversionProvider: "fixed_test",
    },
    {
      id: "current",
      observedAt: "2026-07-02T00:00:00Z",
      price: 100,
      currency: "EUR",
      conversionProvider: "ecb_eur_usd_xcg_peg",
    },
  ]);
  assert.deepEqual(visible.map((point) => point.id), ["current"]);
});
