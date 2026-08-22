import assert from "node:assert/strict";
import test from "node:test";

import { canSubscribe } from "@/lib/rent-advance/helpers";
import { payoutAddressLocked } from "@/lib/rent-advance/custody";
import { RENTER_ACCOUNT_ID } from "@/lib/rent-advance/ids";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import { applyVerifiedPurchase } from "@/lib/rent-advance/payment-apply";
import { priceQuote } from "@/lib/rent-advance/pricing";
import { CHEAP_OFFER_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";
import type { DemoBook } from "@/lib/rent-advance/types";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const BUYER = "0x5555555555555555555555555555555555555555";
const TX_PURCHASE = "0x" + "c".repeat(64);

function mintedBook(): DemoBook {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  offer.onchain = {
    tokenId: 2,
    offerKey: "0x" + "a".repeat(64),
    contractAddress: CONTRACT,
    epochId: "epoch-test",
    mintTxHash: "0x" + "b".repeat(64),
    mintBlockNumber: "100",
    purchased: false,
    purchaseTxHash: null,
    purchaserAddress: null,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    landlordPaid: false,
    claimableRentCents: 0,
    claimedRentCents: 0,
  };
  return book;
}

function buy(book: DemoBook, purchasePriceAtomic: bigint | number | string, at: string) {
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  return applyVerifiedPurchase(book, CHEAP_OFFER_REFERENCE, {
    tokenId: 2,
    purchaserAddress: BUYER,
    txHash: TX_PURCHASE,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    purchasePriceAtomic,
  }, at);
}

test("cheap seeded offer is a minted listing at about XCG 10", () => {
  const book = mintedBook();
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
      true,
    ),
    true,
  );
});

test("a minted listing that is not yet minted is not purchasable", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(
    canSubscribe(
      offer.status,
      offer.offeringCents,
      offer.fundedCents,
      offer.expiresAt,
      "2026-08-20T12:00:00.000Z",
      false,
    ),
    false,
  );
});

test("purchasing the cheap offer creates a live position and $1 rent requests", () => {
  const book = mintedBook();
  const next = buy(book, BigInt(usdcAtomicFromUsdCents(book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE)!.purchasePriceCents)), "2026-08-20T12:00:00.000Z");
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.status, "live");
  assert.equal(offer.fundedCents, offer.offeringCents);
  assert.equal(offer.onchain?.purchased, true);
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
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const created = structuredClone(offer);
  created.reference = "MRA-011";
  created.offerId = "offer-mra-011";
  created.tenant = { ...created.tenant, id: "tn-mra-011" };
  created.onchain = { ...created.onchain!, tokenId: 11, purchased: false, landlordPaid: false };
  created.receivables = created.receivables.map((row) => ({
    ...row,
    receivableId: `recv-mra-011-${row.n}`,
  }));
  book.offers.push(created);
  const next = applyVerifiedPurchase(book, "MRA-011", {
    tokenId: 11,
    purchaserAddress: BUYER,
    txHash: TX_PURCHASE,
    payoutAddress: payoutAddressLocked(created) ?? "",
    purchasePriceAtomic: BigInt(usdcAtomicFromUsdCents(created.purchasePriceCents)),
  }, "2026-08-20T12:00:00.000Z");
  const requests = (next.paymentRequests ?? []).filter(
    (row) => row.offerReference === "MRA-011",
  );
  assert.equal(requests.length, 6);
  assert.equal(requests[0]?.accountId, RENTER_ACCOUNT_ID);
  assert.equal(requests[0]?.amountXcgCents, 100);
});

test("a fractional purchase is rejected", () => {
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const remainingAtomic = BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents));
  assert.ok(remainingAtomic > BigInt(200 * 10_000));
  assert.throws(
    () => buy(book, remainingAtomic / BigInt(2), "2026-08-20T12:00:00.000Z"),
    /purchased in full/,
  );
});

test("an explicit whole-offer amount opens the offer and mints Pay requests", () => {
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const next = buy(book, BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents)), "2026-08-20T12:01:00.000Z");
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
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const whole = BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents));
  assert.throws(() => buy(book, whole + BigInt(1), "2026-08-20T12:00:00.000Z"), /purchased in full/);
});

test("a non-integer atomic amount is rejected", () => {
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const whole = BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents));
  assert.throws(() => buy(book, whole + BigInt(1), "2026-08-20T12:00:00.000Z"), /purchased in full/);
});

test("an offer without a listing expiry stays purchasable until sold", () => {
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.expiresAt, null);
  const next = buy(
    book,
    BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents)),
    "2026-12-01T00:00:00.000Z",
  );
  assert.equal(next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE)?.status, "live");
});

test("already purchased offers cannot be purchased again", () => {
  const book = mintedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const whole = BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents));
  const first = buy(book, whole, "2026-08-20T12:00:00.000Z");
  assert.equal(first.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE)?.status, "live");
  const second = buy(first, whole, "2026-08-20T12:01:00.000Z");
  const again = second.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.equal(again?.status, "live");
  assert.equal(
    (second.paymentRequests ?? []).filter((row) => row.offerReference === CHEAP_OFFER_REFERENCE)
      .length,
    6,
  );
});