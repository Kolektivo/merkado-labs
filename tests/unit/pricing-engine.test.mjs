import assert from "node:assert/strict";
import test from "node:test";

function roundHalfUp(value) {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
}

function percentOfCents(cents, rate) {
  return roundHalfUp(cents * rate);
}

function solveMonthlyIrr(purchasePrice, rent, months) {
  let low = 1e-12;
  let high = 2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const pv = (rent * (1 - (1 + mid) ** -months)) / mid;
    if (pv > purchasePrice) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

test("MRA-001 landlord pricing matches the locked pack", () => {
  const monthlyRent = 180000;
  const months = 6;
  const feeRate = 0.055;
  const gross = monthlyRent * months;
  const fee = percentOfCents(gross, feeRate);
  const purchase = gross - fee;
  const monthlyIrr = solveMonthlyIrr(purchase, monthlyRent, months);
  const nominal = monthlyIrr * 12;
  const effective = (1 + monthlyIrr) ** 12 - 1;

  assert.equal(gross, 1080000);
  assert.equal(fee, 59400);
  assert.equal(purchase, 1020600);
  assert.equal(purchase / gross, 0.945);
  assert.ok(Math.abs(monthlyIrr - 0.016406) < 1e-5);
  assert.ok(Math.abs(nominal - 0.1969) < 5e-4);
  assert.ok(Math.abs(effective - 0.2157) < 5e-4);
  assert.equal(effective > 0.24, false);
});

test("holder schedule matches the locked pack", () => {
  const offering = 1050000;
  const purchase = 1020600;
  const units = 1000;
  const monthly = 180000;
  const months = 6;
  const perMonth = Math.round(monthly / units);
  const perTotal = perMonth * months;
  const unitPrice = Math.round(offering / units);
  const monthlyIrr = solveMonthlyIrr(unitPrice, perMonth, months);
  const effective = (1 + monthlyIrr) ** 12 - 1;

  assert.equal(offering - purchase, 29400);
  assert.equal(perMonth, 180);
  assert.equal(perTotal, 1080);
  assert.equal(perTotal - unitPrice, 30);
  assert.ok(Math.abs(monthlyIrr - 0.008109) < 1e-5);
  assert.ok(Math.abs(effective - 0.1018) < 5e-4);
});

test("effective annualised above 24% is a hard block", () => {
  const monthlyRent = 180000;
  const months = 6;
  const feeRate = 0.08;
  const gross = monthlyRent * months;
  const fee = percentOfCents(gross, feeRate);
  const purchase = gross - fee;
  const monthlyIrr = solveMonthlyIrr(purchase, monthlyRent, months);
  const effective = (1 + monthlyIrr) ** 12 - 1;
  assert.ok(effective > 0.24);
});

function assertDistinctOfficers(instructorId, signatoryId) {
  if (!instructorId || !signatoryId) {
    throw new Error("Release requires two named people.");
  }
  if (instructorId === signatoryId) {
    throw new Error(
      "Two different people must approve. You chose the same person twice.",
    );
  }
}

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
