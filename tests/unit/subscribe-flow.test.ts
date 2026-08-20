import assert from "node:assert/strict";
import test from "node:test";

import { canSubscribe } from "@/lib/rent-advance/helpers";
import { RENTER_ACCOUNT_ID } from "@/lib/rent-advance/ids";
import { applySubscribe } from "@/lib/rent-advance/payment-apply";
import { priceQuote } from "@/lib/rent-advance/pricing";
import { CHEAP_OFFER_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";

test("cheap seeded offer is open on Marketplace at about XCG 10", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.status, "funding");
  assert.equal(offer.monthlyRentCents, 100);
  assert.equal(offer.fundedCents, 0);
  const quote = priceQuote({
    monthlyRentCents: 100,
    months: 6,
    passportScore: 89,
    payerScore: 95,
    relatedParty: false,
  });
  assert.equal(offer.offeringCents, quote.purchasePriceCents);
  assert.equal(canSubscribe(offer.status, offer.offeringCents, offer.fundedCents), true);
});

test("subscribing the cheap offer creates a live position and $1 rent requests", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.status, "live");
  assert.equal(offer.fundedCents, offer.offeringCents);
  assert.ok(next.positions?.some((row) => row.offerReference === CHEAP_OFFER_REFERENCE));
  const requests = (next.paymentRequests ?? []).filter(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(requests.length, 6);
  assert.equal(requests[0]?.amountXcgCents, 100);
  assert.equal(requests[0]?.amountUsdcAtomic, 1_000_000);
  assert.equal(requests[0]?.accountId, RENTER_ACCOUNT_ID);
});

test("a newly created cheap offer still lands in the renter Pay inbox", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const created = structuredClone(offer);
  created.reference = "MRA-011";
  created.offerId = "offer-mra-011";
  created.tenant = { ...created.tenant, id: "tn-mra-011" };
  created.receivables = created.receivables.map((row) => ({
    ...row,
    receivableId: `recv-mra-011-${row.n}`,
  }));
  book.offers.push(created);
  const next = applySubscribe(book, "MRA-011", "2026-08-20T12:00:00.000Z");
  const requests = (next.paymentRequests ?? []).filter(
    (row) => row.offerReference === "MRA-011",
  );
  assert.equal(requests.length, 6);
  assert.equal(requests[0]?.accountId, RENTER_ACCOUNT_ID);
  assert.equal(requests[0]?.amountXcgCents, 100);
});

test("a holder can buy a portion without filling the offering", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const remaining = offer.offeringCents - offer.fundedCents;
  assert.ok(remaining > 200);
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z", 200);
  const updated = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(updated);
  assert.equal(updated.status, "funding");
  assert.equal(updated.fundedCents, offer.fundedCents + 200);
  const requests = (next.paymentRequests ?? []).filter(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(requests.length, 0);
});

test("filling the last portion opens the offer and mints Pay requests", () => {
  const book = getSeedBook();
  const first = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z", 200);
  const cheap = first.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(cheap);
  assert.equal(cheap.status, "funding");
  const rest = cheap.offeringCents - cheap.fundedCents;
  const next = applySubscribe(first, CHEAP_OFFER_REFERENCE, "2026-08-20T12:01:00.000Z", rest);
  const filled = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(filled);
  assert.equal(filled.status, "live");
  assert.equal(filled.fundedCents, filled.offeringCents);
  const requests = (next.paymentRequests ?? []).filter(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(requests.length, 6);
});

test("a purchase above the remaining amount is rejected", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.throws(
    () => applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z", offer.offeringCents + 1),
    /more than is still open/,
  );
});

test("already funded offers cannot be purchased again", () => {
  const book = getSeedBook();
  const funded = book.offers.find((row) => row.reference === "MRA-001");
  assert.ok(funded);
  assert.equal(canSubscribe(funded.status, funded.offeringCents, funded.fundedCents), false);
  assert.throws(() => applySubscribe(book, "MRA-001"), /not open/);
});
