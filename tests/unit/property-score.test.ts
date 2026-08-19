import assert from "node:assert/strict";
import test from "node:test";

import { priceQuote } from "@/lib/rent-advance/pricing";
import {
  derivePropertyScore,
  rentToMarketMultiplier,
} from "@/lib/rent-advance/property-score";

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
  for (const market of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = derivePropertyScore(80, 180000, market);
    assert.equal(result.multiplier, 1);
    assert.equal(result.propertyScore, 80);
    assert.equal(result.marketDataAvailable, false);
    assert.equal(result.rentToMarketRatio, null);
  }
});

test("listing score is clamped to 0–100 before the multiplier", () => {
  assert.equal(derivePropertyScore(140, 180000, 300000).propertyScore, 100);
  assert.equal(derivePropertyScore(-10, 180000, 300000).propertyScore, 0);
  assert.equal(derivePropertyScore(80, 180000, 300000).listingScore, 80);
  assert.equal(derivePropertyScore(140, 180000, 300000).listingScore, 100);
  assert.equal(derivePropertyScore(-10, 180000, 300000).listingScore, 0);
});

test("derived Property Score does not change quote pricing", () => {
  const listing = 80;
  const favourable = derivePropertyScore(listing, 180000, 300000);
  const unfavourable = derivePropertyScore(listing, 180000, 150000);
  assert.equal(favourable.propertyScore, 88);
  assert.equal(unfavourable.propertyScore, 72);
  assert.notEqual(favourable.propertyScore, unfavourable.propertyScore);

  const quoteInput = {
    monthlyRentCents: 180000,
    months: 6,
    passportScore: listing,
    payerScore: 95,
    relatedParty: true,
  };
  const pricedFromListing = priceQuote(quoteInput);

  assert.equal(pricedFromListing.feeRate, 0.0575);
  assert.equal(pricedFromListing.purchasePriceCents, 1017900);
  assert.equal(
    pricedFromListing.purchasePriceCents,
    priceQuote(quoteInput).purchasePriceCents,
  );

  const ifPricedFromPropertyScore = priceQuote({
    ...quoteInput,
    passportScore: favourable.propertyScore,
  });
  assert.equal(ifPricedFromPropertyScore.feeRate, 0.055);
  assert.notEqual(
    pricedFromListing.purchasePriceCents,
    ifPricedFromPropertyScore.purchasePriceCents,
  );
});
