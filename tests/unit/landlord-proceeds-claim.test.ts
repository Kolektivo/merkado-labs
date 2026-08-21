import assert from "node:assert/strict";
import test from "node:test";

import { anonymizeOffer } from "@/lib/rent-advance/helpers";
import { landlordClaimIdFor, landlordPayoutTxIdFor } from "@/lib/rent-advance/ids";
import {
  applyLandlordClaimComplete,
  applyLandlordClaimFail,
  applyLandlordClaimStart,
  applySubscribe,
  findLandlordProceedsClaim,
  normalizeBook,
} from "@/lib/rent-advance/payment-apply";
import { CHEAP_OFFER_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";

const DEST = "0x" + "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4";
const OTHER = "0x" + "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6";

test("MRA-001 stays automatic and historically settled", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === "MRA-001");
  assert.ok(offer);
  assert.equal(offer.settlementMode, "automatic");
  assert.equal(offer.settlementTransactionId, "tx-settle-mra-001");
  const claim = findLandlordProceedsClaim(book, "MRA-001");
  assert.equal(claim, undefined);
});

test("the cheap offer is claim-mode and fully funded creates no automatic settlement", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.settlementMode, "landlord_claim");

  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const filled = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(filled);
  assert.equal(filled.status, "live");
  assert.equal(filled.settlementTransactionId, null);

  const settle = next.ledgerTransactions?.find(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE && row.kind === "advance_settlement",
  );
  assert.equal(settle, undefined);
});

test("partial funding creates no funding record and no landlord claim", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z", 200);
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.status, "funding");
  assert.equal((next.offerFundingRecords ?? []).length, 0);
  assert.equal(findLandlordProceedsClaim(next, CHEAP_OFFER_REFERENCE), undefined);
});

test("full funding creates one funding record and one available claim", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);

  const funding = (next.offerFundingRecords ?? []).filter(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(funding.length, 1);
  assert.equal(funding[0]?.status, "recorded");
  assert.equal(funding[0]?.purchasePriceCents, offer.purchasePriceCents);

  const claim = findLandlordProceedsClaim(next, CHEAP_OFFER_REFERENCE);
  assert.ok(claim);
  assert.equal(claim.status, "available");
  assert.equal(claim.claimId, landlordClaimIdFor(CHEAP_OFFER_REFERENCE));
});

test("claimable amount equals purchase price and the fee is not deducted twice", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  const claim = findLandlordProceedsClaim(next, CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.ok(claim);
  assert.equal(claim.claimableCents, offer.purchasePriceCents);
  assert.equal(claim.claimableCents, offer.offeringCents);
  assert.equal(claim.claimableCents, offer.fundedCents);
  assert.equal(claim.feeCents, offer.feeCents);
});

test("claim mode never records an advance_settlement during normalization", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const normalized = normalizeBook(next);
  const settle = normalized.ledgerTransactions?.some(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE && row.kind === "advance_settlement",
  );
  assert.equal(settle, false);
  assert.equal(findLandlordProceedsClaim(normalized, CHEAP_OFFER_REFERENCE)?.status, "available");
});

test("starting a claim locks the destination and moves it to processing", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const next = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);
  const claim = findLandlordProceedsClaim(next, CHEAP_OFFER_REFERENCE);
  assert.ok(claim);
  assert.equal(claim.status, "processing");
  assert.equal(claim.destinationEoa, DEST);
  assert.equal(claim.transactionId, landlordPayoutTxIdFor(CHEAP_OFFER_REFERENCE));
});

test("an invalid EOA address is rejected", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  assert.throws(
    () => applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, "not-an-address"),
    /valid 20-byte demo wallet address/,
  );
});

test("a same-destination retry while processing is idempotent", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const started = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);
  const retried = applyLandlordClaimStart(started, CHEAP_OFFER_REFERENCE, DEST);
  assert.equal(findLandlordProceedsClaim(retried, CHEAP_OFFER_REFERENCE)?.status, "processing");
});

test("a different destination is rejected after processing starts", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const started = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);
  assert.throws(
    () => applyLandlordClaimStart(started, CHEAP_OFFER_REFERENCE, OTHER),
    /different address/,
  );
});

test("a failed claim may retry only to the locked destination", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const started = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);
  const failed = applyLandlordClaimFail(started, CHEAP_OFFER_REFERENCE);
  const claim = findLandlordProceedsClaim(failed, CHEAP_OFFER_REFERENCE);
  assert.ok(claim);
  assert.equal(claim.status, "failed");
  const resumed = applyLandlordClaimStart(failed, CHEAP_OFFER_REFERENCE, DEST);
  assert.equal(findLandlordProceedsClaim(resumed, CHEAP_OFFER_REFERENCE)?.status, "processing");
});

test("paid is terminal and never duplicates ledger rows or claim state", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const started = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);
  const paid = applyLandlordClaimComplete(started, CHEAP_OFFER_REFERENCE);
  const claim = findLandlordProceedsClaim(paid, CHEAP_OFFER_REFERENCE);
  assert.ok(claim);
  assert.equal(claim.status, "paid");
  assert.ok(claim.paidAt);

  const payoutRows = (paid.ledgerTransactions ?? []).filter(
    (row) => row.kind === "landlord_proceeds_claim" && row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(payoutRows.length, 1);

  const retried = applyLandlordClaimComplete(paid, CHEAP_OFFER_REFERENCE);
  assert.equal(findLandlordProceedsClaim(retried, CHEAP_OFFER_REFERENCE)?.status, "paid");
  const payoutRowsAfter = (retried.ledgerTransactions ?? []).filter(
    (row) => row.kind === "landlord_proceeds_claim" && row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(payoutRowsAfter.length, 1);
  assert.throws(
    () => applyLandlordClaimStart(retried, CHEAP_OFFER_REFERENCE, OTHER),
    /already been paid/,
  );
});

test("a paid claim sets the offer settlement id to the claim payout, with no fake chain hash", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const started = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);
  const paid = applyLandlordClaimComplete(started, CHEAP_OFFER_REFERENCE);
  const offer = paid.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.settlementTransactionId, landlordPayoutTxIdFor(CHEAP_OFFER_REFERENCE));
  const payout = (paid.ledgerTransactions ?? []).find(
    (row) => row.kind === "landlord_proceeds_claim" && row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.ok(payout);
  assert.equal(payout.txHash, null);
});

test("a claim cannot complete before it is started", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  assert.throws(
    () => applyLandlordClaimComplete(funded, CHEAP_OFFER_REFERENCE),
    /Start the claim before completing it/,
  );
});

test("no EOA appears in purchaser, portfolio, or payer serialization", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const started = applyLandlordClaimStart(funded, CHEAP_OFFER_REFERENCE, DEST);

  const json = JSON.stringify(started);
  const purchaser = JSON.stringify(anonymize(started, CHEAP_OFFER_REFERENCE));
  assert.equal(purchaser.includes(DEST), false);

  const account = started.accounts ?? [];
  const payerView = JSON.stringify(account);
  assert.equal(payerView.includes(DEST), false);

  assert.equal(json.includes(DEST), true);
});

function anonymize(book: ReturnType<typeof getSeedBook>, reference: string) {
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("offer not found");
  return anonymizeOffer(offer);
}
