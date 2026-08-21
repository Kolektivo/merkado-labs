import assert from "node:assert/strict";
import test from "node:test";

import { anonymizeOffer, toPortfolioPosition } from "@/lib/rent-advance/helpers";
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
import type { LedgerTransaction } from "@/lib/rent-advance/types";

const DEST = "0x" + "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4";
const OTHER = "0x" + "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6";

test("all seeded offers use landlord proceeds claims, including historical MRA-001", () => {
  const book = normalizeBook(getSeedBook());
  assert.deepEqual(
    book.offers.map((offer) => [offer.reference, offer.settlementMode]),
    [
      ["MRA-001", "landlord_claim"],
      [CHEAP_OFFER_REFERENCE, "landlord_claim"],
    ],
  );

  const offer = book.offers.find((row) => row.reference === "MRA-001");
  assert.ok(offer);
  const funding = (book.offerFundingRecords ?? []).filter(
    (row) => row.offerReference === "MRA-001",
  );
  const claim = findLandlordProceedsClaim(book, "MRA-001");
  assert.equal(funding.length, 1);
  assert.equal(funding[0]?.purchasePriceCents, offer.purchasePriceCents);
  assert.ok(claim);
  assert.equal(claim.status, "available");
  assert.equal(claim.claimableCents, offer.purchasePriceCents);
});

test("normalization migrates missing and automatic modes and removes legacy settlements", () => {
  const book = getSeedBook();
  const canonical = book.offers.find((row) => row.reference === "MRA-001");
  const cheap = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(canonical && cheap);

  (canonical as unknown as { settlementMode: "automatic" | "landlord_claim" }).settlementMode =
    "automatic";
  canonical.settlementTransactionId = "legacy-advance-settlement";
  delete (cheap as { settlementMode?: "automatic" | "landlord_claim" }).settlementMode;
  const staleLedgerRow: LedgerTransaction = {
    transactionId: "legacy-advance-settlement",
    kind: "advance_settlement",
    offerId: canonical.offerId ?? "offer-mra-001",
    offerReference: "MRA-001",
    paymentRequestId: null,
    collectionId: null,
    distributionId: null,
    amountXcgCents: canonical.purchasePriceCents,
    amountUsdcAtomic: null,
    status: "confirmed",
    createdAt: canonical.publishedAt ?? canonical.createdAt,
    confirmedAt: canonical.publishedAt ?? canonical.createdAt,
    txHash: "0xDEMOlegacy",
    fromLabel: "Merkado Direct",
    toLabel: "Landlord",
  };
  book.ledgerTransactions = [...(book.ledgerTransactions ?? []), staleLedgerRow];

  const normalized = normalizeBook(book);
  assert.equal(normalized.offers.every((offer) => offer.settlementMode === "landlord_claim"), true);
  assert.equal(
    normalized.ledgerTransactions?.some((row) => row.kind === "advance_settlement"),
    false,
  );
  assert.equal(
    normalized.offers.find((row) => row.reference === "MRA-001")?.settlementTransactionId,
    null,
  );
});

test("normalization creates deterministic claim records exactly once for funded MRA-001", () => {
  const once = normalizeBook(getSeedBook());
  const twice = normalizeBook(once);
  const fundingOnce = (once.offerFundingRecords ?? []).filter(
    (row) => row.offerReference === "MRA-001",
  );
  const fundingTwice = (twice.offerFundingRecords ?? []).filter(
    (row) => row.offerReference === "MRA-001",
  );
  const claimOnce = (once.landlordProceedsClaims ?? []).filter(
    (row) => row.offerReference === "MRA-001",
  );
  const claimTwice = (twice.landlordProceedsClaims ?? []).filter(
    (row) => row.offerReference === "MRA-001",
  );

  assert.equal(fundingOnce.length, 1);
  assert.equal(fundingTwice.length, 1);
  assert.equal(fundingTwice[0]?.fundingRecordId, fundingOnce[0]?.fundingRecordId);
  assert.equal(claimOnce.length, 1);
  assert.equal(claimTwice.length, 1);
  assert.equal(claimTwice[0]?.claimId, claimOnce[0]?.claimId);
  assert.equal(claimTwice[0]?.status, "available");
});

test("fully funding MRA-010 creates no automatic settlement", () => {
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
  assert.equal(
    (next.offerFundingRecords ?? []).filter(
      (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
    ).length,
    0,
  );
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

test("normalization never derives an advance_settlement for any offer", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const normalized = normalizeBook(next);
  const settle = normalized.ledgerTransactions?.some((row) => row.kind === "advance_settlement");
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
  assert.throws(
    () => applyLandlordClaimStart(failed, CHEAP_OFFER_REFERENCE, OTHER),
    /different address/,
  );
  const resumed = applyLandlordClaimStart(failed, CHEAP_OFFER_REFERENCE, DEST);
  assert.equal(findLandlordProceedsClaim(resumed, CHEAP_OFFER_REFERENCE)?.status, "processing");
});

test("an available claim cannot be marked failed before processing starts", () => {
  const book = getSeedBook();
  const funded = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  assert.throws(
    () => applyLandlordClaimFail(funded, CHEAP_OFFER_REFERENCE),
    /Start the claim before marking it as failed/,
  );
});

test("normalization removes legacy settlement and token evidence from positions", () => {
  const book = getSeedBook();
  const position = book.positions?.find((row) => row.offerReference === "MRA-001");
  assert.ok(position);
  position.settlementTransactionId = "tx-settle-mra-001";
  (position as unknown as { externalTokenId: string | null }).externalTokenId = "legacy-token";

  const normalized = normalizeBook(book);
  const migrated = normalized.positions?.find((row) => row.offerReference === "MRA-001");
  assert.ok(migrated);
  assert.equal(migrated.settlementTransactionId, null);
  assert.equal(migrated.externalTokenId, null);
});

test("normalization drops stale and duplicate claim records for partial offers", () => {
  const book = getSeedBook();
  const cheap = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  const canonical = book.landlordProceedsClaims?.find((row) => row.offerReference === "MRA-001");
  assert.ok(cheap && canonical);
  book.landlordProceedsClaims = [
    ...(book.landlordProceedsClaims ?? []),
    { ...canonical, claimId: "duplicate-claim", offerReference: "MRA-001" },
    {
      ...canonical,
      claimId: "stale-partial-claim",
      offerId: cheap.offerId ?? "offer-mra-010",
      offerReference: CHEAP_OFFER_REFERENCE,
    },
  ];
  const funding = book.offerFundingRecords?.find((row) => row.offerReference === "MRA-001");
  assert.ok(funding);
  book.offerFundingRecords = [
    ...(book.offerFundingRecords ?? []),
    { ...funding, fundingRecordId: "duplicate-funding", offerReference: "MRA-001" },
    {
      ...funding,
      fundingRecordId: "stale-partial-funding",
      offerId: cheap.offerId ?? "offer-mra-010",
      offerReference: CHEAP_OFFER_REFERENCE,
    },
  ];

  const normalized = normalizeBook(book);
  assert.equal(
    normalized.landlordProceedsClaims?.filter((row) => row.offerReference === "MRA-001").length,
    1,
  );
  assert.equal(findLandlordProceedsClaim(normalized, CHEAP_OFFER_REFERENCE), undefined);
  assert.equal(
    normalized.offerFundingRecords?.filter((row) => row.offerReference === "MRA-001").length,
    1,
  );
  assert.equal(
    normalized.offerFundingRecords?.some((row) => row.offerReference === CHEAP_OFFER_REFERENCE),
    false,
  );
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

test("normalization canonicalizes duplicate paid payout ledger rows", () => {
  const book = getSeedBook();
  const started = applyLandlordClaimStart(book, "MRA-001", DEST);
  const paid = applyLandlordClaimComplete(started, "MRA-001", "2026-08-20T12:00:00.000Z");
  const payout = paid.ledgerTransactions?.find(
    (row) => row.kind === "landlord_proceeds_claim" && row.offerReference === "MRA-001",
  );
  assert.ok(payout);
  paid.ledgerTransactions = [
    ...(paid.ledgerTransactions ?? []),
    { ...payout, transactionId: "duplicate-payout" },
  ];

  const normalized = normalizeBook(paid);
  const payouts = normalized.ledgerTransactions?.filter(
    (row) => row.kind === "landlord_proceeds_claim" && row.offerReference === "MRA-001",
  );
  assert.equal(payouts?.length, 1);
  assert.equal(payouts?.[0]?.transactionId, landlordPayoutTxIdFor("MRA-001"));
});

test("a stale duplicate cannot revert a paid claim to available", () => {
  const book = getSeedBook();
  const started = applyLandlordClaimStart(book, "MRA-001", DEST);
  const paid = applyLandlordClaimComplete(started, "MRA-001", "2026-08-20T12:00:00.000Z");
  const canonical = findLandlordProceedsClaim(paid, "MRA-001");
  assert.ok(canonical);
  paid.landlordProceedsClaims = [
    {
      ...canonical,
      claimId: "stale-available-claim",
      status: "available",
      destinationEoa: null,
      transactionId: null,
      paidAt: null,
    },
    canonical,
  ];

  const normalized = normalizeBook(paid);
  const claim = findLandlordProceedsClaim(normalized, "MRA-001");
  assert.ok(claim);
  assert.equal(claim.status, "paid");
  assert.equal(claim.claimId, landlordClaimIdFor("MRA-001"));
  assert.equal(
    normalized.ledgerTransactions?.filter(
      (row) => row.kind === "landlord_proceeds_claim" && row.offerReference === "MRA-001",
    ).length,
    1,
  );
});

test("a paid claim has no token, NFT, transaction hash, or explorer evidence", () => {
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
  const claim = findLandlordProceedsClaim(paid, CHEAP_OFFER_REFERENCE);
  const funding = (paid.offerFundingRecords ?? []).find(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.ok(claim && funding);
  assert.equal(claim.txHash, null);
  assert.equal("externalTokenId" in claim, false);
  assert.equal("externalTokenId" in funding, false);
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
  assert.equal(JSON.stringify(started.paymentRequests ?? []).includes(DEST), false);

  const offer = started.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(JSON.stringify(toPortfolioPosition(offer, started)).includes(DEST), false);

  assert.equal(json.includes(DEST), true);
});

function anonymize(book: ReturnType<typeof getSeedBook>, reference: string) {
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("offer not found");
  return anonymizeOffer(offer);
}
