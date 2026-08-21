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
  assert.equal(
    canSubscribe(
      offer.status,
      offer.offeringCents,
      offer.fundedCents,
      offer.expiresAt,
      "2026-08-20T12:00:00.000Z",
    ),
    true,
  );
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

test("a fractional purchase is rejected", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const remaining = offer.offeringCents - offer.fundedCents;
  assert.ok(remaining > 200);
  assert.throws(
    () =>
      applySubscribe(
        book,
        CHEAP_OFFER_REFERENCE,
        "2026-08-20T12:00:00.000Z",
        200,
      ),
    /purchased in full/,
  );
});

test("an explicit whole-offer amount opens the offer and mints Pay requests", () => {
  const book = getSeedBook();
  const cheap = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(cheap);
  const whole = cheap.offeringCents - cheap.fundedCents;
  const next = applySubscribe(
    book,
    CHEAP_OFFER_REFERENCE,
    "2026-08-20T12:01:00.000Z",
    whole,
  );
  const filled = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(filled);
  assert.equal(filled.status, "live");
  assert.equal(filled.fundedCents, filled.offeringCents);
  const requests = (next.paymentRequests ?? []).filter(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(requests.length, 6);
});

test("any amount other than the whole offer is rejected", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.throws(
    () => applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z", offer.offeringCents + 1),
    /purchased in full/,
  );
});

test("a non-integer cent amount is rejected", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.throws(
    () =>
      applySubscribe(
        book,
        CHEAP_OFFER_REFERENCE,
        "2026-08-20T12:00:00.000Z",
        offer.offeringCents + 0.1,
      ),
    /purchased in full/,
  );
});

test("an offer cannot be purchased after its 60-day window", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  offer.expiresAt = "2026-10-01T00:00:00.000Z";
  assert.throws(
    () =>
      applySubscribe(
        book,
        CHEAP_OFFER_REFERENCE,
        "2026-10-01T00:00:00.000Z",
      ),
    /60-day purchase window has ended/,
  );
});

test("a listed offer with a missing or invalid deadline cannot be purchased", () => {
  for (const expiresAt of [null, "not-a-date"]) {
    const book = getSeedBook();
    const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
    assert.ok(offer);
    offer.expiresAt = expiresAt;
    assert.throws(
      () =>
        applySubscribe(
          book,
          CHEAP_OFFER_REFERENCE,
          "2026-08-20T12:00:00.000Z",
        ),
      /not open|60-day purchase window/,
    );
  }
});

test("already funded offers cannot be purchased again", () => {
  const book = getSeedBook();
  const funded = book.offers.find((row) => row.reference === "MRA-001");
  assert.ok(funded);
  assert.equal(canSubscribe(funded.status, funded.offeringCents, funded.fundedCents), false);
  assert.throws(() => applySubscribe(book, "MRA-001"), /not open/);
});
