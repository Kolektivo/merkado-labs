import assert from "node:assert/strict";
import test from "node:test";

import { assertDistinctOfficers } from "@/lib/rent-advance/dual-control";
import { CapExceededError } from "@/lib/rent-advance/money";
import { holderSchedule, priceOrBlock, priceQuote } from "@/lib/rent-advance/pricing";

const MRA_001 = {
  monthlyRentCents: 180000,
  months: 6,
  passportScore: 89,
  payerScore: 95,
  relatedParty: true,
} as const;

test("MRA-001 landlord pricing matches the locked pack", () => {
  const quote = priceQuote(MRA_001);

  assert.equal(quote.grossReceivablesCents, 1080000);
  assert.equal(quote.feeRate, 0.055);
  assert.equal(quote.feeCents, 59400);
  assert.equal(quote.purchasePriceCents, 1020600);
  assert.equal(quote.advanceRate, 0.945);
  assert.equal((quote.feeRate * 100).toFixed(2), "5.50");
  assert.equal((quote.effectiveAnnualised * 100).toFixed(1), "21.6");
  assert.equal(quote.capBreached, false);
  assert.equal(quote.termApproved, true);
  assert.doesNotThrow(() => priceOrBlock(MRA_001));
});

test("holder schedule matches the locked pack", () => {
  const quote = priceQuote(MRA_001);
  const schedule = holderSchedule({
    offeringCents: 1050000,
    purchasePriceCents: quote.purchasePriceCents,
    monthlyCollectionCents: 180000,
    months: 6,
    units: 1000,
  });

  assert.equal(schedule.originationSpreadCents, 29400);
  assert.equal(schedule.perUnitPerMonthCents, 180);
  assert.equal(schedule.perUnitTotalCents, 1080);
  assert.equal(schedule.perUnitReturnCents, 30);
  assert.ok(Math.abs(schedule.monthlyIrr - 0.008109) < 1e-5);
  assert.ok(Math.abs(schedule.effectiveAnnualised - 0.1018) < 5e-4);
});

test("quotes above 24% remain blocked", () => {
  const blockedInput = {
    monthlyRentCents: 180000,
    months: 6,
    passportScore: 40,
    payerScore: 40,
    relatedParty: true,
  };
  const quote = priceQuote(blockedInput);

  assert.equal(quote.capBreached, true);
  assert.ok(quote.effectiveAnnualised > 0.24);
  assert.throws(() => priceOrBlock(blockedInput), (error: unknown) => {
    assert.ok(error instanceof CapExceededError);
    assert.ok(error.effectiveAnnualised > 0.24);
    return true;
  });
});

test("dual control fails closed when the same person is used twice", () => {
  assert.throws(
    () => assertDistinctOfficers("act-martina", "act-martina"),
    /different people/,
  );
});

test("dual control allows two different people", () => {
  assert.doesNotThrow(() =>
    assertDistinctOfficers("act-martina", "act-sambo"),
  );
});
