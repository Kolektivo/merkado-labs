import assert from "node:assert/strict";
import test from "node:test";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rentToMarketMultiplier(ratio) {
  if (ratio <= 0.7) return 1.1;
  if (ratio <= 0.85) return 1.05;
  if (ratio <= 1) return 1;
  if (ratio <= 1.15) return 0.95;
  return 0.9;
}

function derivePropertyScore(listingScore, contractual, market) {
  const listing = clamp(listingScore, 0, 100);
  const marketOk = Number.isFinite(market) && market > 0;
  if (!marketOk) {
    return {
      listingScore: listing,
      rentToMarketRatio: null,
      multiplier: 1,
      propertyScore: clamp(Math.round(listing), 0, 100),
      marketDataAvailable: false,
    };
  }
  const ratio = contractual / market;
  const multiplier = rentToMarketMultiplier(ratio);
  return {
    listingScore: listing,
    rentToMarketRatio: ratio,
    multiplier,
    propertyScore: clamp(Math.round(listing * multiplier), 0, 100),
    marketDataAvailable: true,
  };
}

function bandAdjustment(score) {
  if (score >= 85) return -0.0025;
  if (score >= 70) return 0;
  if (score >= 55) return 0.0025;
  return 0.005;
}

function feeRate(listingScore, payerScore, related) {
  return Math.max(0.045, 0.0575 + bandAdjustment(listingScore) + bandAdjustment(payerScore) + (related ? 0.0025 : 0));
}

test("ratio 0.60 selects multiplier 1.10", () => {
  const result = derivePropertyScore(80, 180000, 300000);
  assert.equal(result.rentToMarketRatio, 0.6);
  assert.equal(result.multiplier, 1.1);
  assert.equal(result.propertyScore, 88);
  assert.equal(result.marketDataAvailable, true);
});

test("Listing Score 95 and ratio 0.60 caps at 100", () => {
  assert.equal(derivePropertyScore(95, 1800, 3000).propertyScore, 100);
});

test("band boundaries use the approved multipliers", () => {
  assert.equal(rentToMarketMultiplier(0.7), 1.1);
  assert.equal(rentToMarketMultiplier(0.7001), 1.05);
  assert.equal(rentToMarketMultiplier(0.85), 1.05);
  assert.equal(rentToMarketMultiplier(0.8501), 1);
  assert.equal(rentToMarketMultiplier(1), 1);
  assert.equal(rentToMarketMultiplier(1.0001), 0.95);
  assert.equal(rentToMarketMultiplier(1.15), 0.95);
  assert.equal(rentToMarketMultiplier(1.1501), 0.9);
});

test("invalid market rent uses a neutral multiplier and unavailable state", () => {
  for (const market of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    const result = derivePropertyScore(80, 180000, market);
    assert.equal(result.multiplier, 1);
    assert.equal(result.propertyScore, 80);
    assert.equal(result.marketDataAvailable, false);
  }
});

test("listing score is clamped before the multiplier", () => {
  assert.equal(derivePropertyScore(140, 180000, 300000).propertyScore, 100);
  assert.equal(derivePropertyScore(-10, 180000, 300000).propertyScore, 0);
});

test("derived Property Score does not change quote pricing", () => {
  const listing = 80;
  const derived = derivePropertyScore(listing, 180000, 300000).propertyScore;
  assert.equal(derived, 88);
  const pricedFromListing = feeRate(listing, 95, true);
  const pricedFromDerived = feeRate(derived, 95, true);
  assert.equal(pricedFromListing, 0.0575);
  assert.equal(pricedFromDerived, 0.055);
  assert.notEqual(pricedFromListing, pricedFromDerived);
});
