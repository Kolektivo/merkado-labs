/**
 * Node assertion check for dashboard price-observation collapse logic.
 * Mirrors apps/labs-dashboard/src/lib/data/price-observations.ts
 */
import assert from "node:assert/strict";

function moneyKey(point) {
  const amount = point.originalPrice ?? point.price;
  const currency = point.originalCurrency ?? point.currency;
  return `${amount}|${currency}`;
}

function collapseUnchangedPriceObservations(observations) {
  if (!observations.length) return [];
  const sorted = [...observations].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt),
  );
  const collapsed = [];
  for (const point of sorted) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && moneyKey(previous) === moneyKey(point)) {
      collapsed[collapsed.length - 1] = {
        ...previous,
        id: point.id,
        observedAt: point.observedAt,
        suppressedDuplicateCount:
          (previous.suppressedDuplicateCount ?? 0) + 1,
      };
      continue;
    }
    collapsed.push({ ...point, suppressedDuplicateCount: 0 });
  }
  return collapsed;
}

const duplicates = [
  { id: "1", observedAt: "2026-07-16T17:31:33Z", price: 100, currency: "EUR" },
  { id: "2", observedAt: "2026-07-16T17:32:18Z", price: 100, currency: "EUR" },
  { id: "3", observedAt: "2026-07-16T17:40:00Z", price: 100, currency: "EUR" },
];
const collapsedDupes = collapseUnchangedPriceObservations(duplicates);
assert.equal(collapsedDupes.length, 1);
assert.equal(collapsedDupes[0].suppressedDuplicateCount, 2);
assert.equal(collapsedDupes[0].id, "3");

const changed = [
  { id: "1", observedAt: "2026-07-16T17:00:00Z", price: 100, currency: "EUR" },
  { id: "2", observedAt: "2026-07-16T18:00:00Z", price: 100, currency: "EUR" },
  { id: "3", observedAt: "2026-07-16T19:00:00Z", price: 120, currency: "EUR" },
  { id: "4", observedAt: "2026-07-16T20:00:00Z", price: 120, currency: "USD" },
];
const collapsedChanged = collapseUnchangedPriceObservations(changed);
assert.equal(collapsedChanged.length, 3);
assert.equal(collapsedChanged[0].price, 100);
assert.equal(collapsedChanged[1].price, 120);
assert.equal(collapsedChanged[1].currency, "EUR");
assert.equal(collapsedChanged[2].currency, "USD");
assert.equal(collapsedChanged[0].suppressedDuplicateCount, 1);

console.log("price-collapse checks passed");
