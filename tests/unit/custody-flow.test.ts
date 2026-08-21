import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHolderCollect,
  isClaimableAddress,
  landlordProceedsPresentation,
  mergeCustody,
} from "@/lib/rent-advance/custody";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  collectionIdFor,
  offerNftPaymentAddress,
} from "@/lib/rent-advance/ids";
import { toPortfolioPosition } from "@/lib/rent-advance/helpers";
import {
  applyPaymentOutcome,
  applySubscribe,
  normalizeBook,
} from "@/lib/rent-advance/payment-apply";
import {
  CANONICAL_REFERENCE,
  CHEAP_OFFER_REFERENCE,
  getSeedBook,
} from "@/lib/rent-advance/seed";

test("only fictional demo addresses are accepted for mock payouts", () => {
  assert.equal(isClaimableAddress("0xDEMO0000LANDLORD00PAYOUT00000000000001"), true);
  assert.equal(
    isClaimableAddress("0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8"),
    false,
  );
  assert.equal(isClaimableAddress("not-an-address"), false);

  const legacy = getSeedBook();
  assert.ok(legacy.accounts?.[0]);
  legacy.accounts[0].payoutAddress =
    "0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8";
  assert.equal(normalizeBook(legacy).accounts?.[0]?.payoutAddress, null);
});

test("an older MRA-001 migrates to automatic payout without legacy settlement", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(offer);
  delete offer.custody;
  offer.settlementTransactionId = "tx-settle-mra-001";
  book.ledgerTransactions = [
    ...(book.ledgerTransactions ?? []),
    {
      transactionId: "tx-settle-mra-001",
      kind: "advance_settlement",
      offerId: offer.offerId ?? "offer-mra-001",
      offerReference: offer.reference,
      paymentRequestId: null,
      collectionId: null,
      distributionId: null,
      amountXcgCents: offer.purchasePriceCents,
      amountUsdcAtomic: null,
      status: "confirmed",
      createdAt: offer.createdAt,
      confirmedAt: offer.createdAt,
      txHash: "0xDEMOlegacy",
      fromLabel: "Holder wallet",
      toLabel: "Landlord",
    },
  ];
  const position = book.positions?.find(
    (row) => row.offerReference === CANONICAL_REFERENCE,
  );
  assert.ok(position);
  position.settlementTransactionId = "tx-settle-mra-001";
  const next = normalizeBook(book);
  const custody = mergeCustody(
    next.offers.find((row) => row.reference === CANONICAL_REFERENCE)?.custody,
  );
  assert.equal(custody.saleProceedsStatus, "claimed");
  assert.equal(
    next.offers.find((row) => row.reference === CANONICAL_REFERENCE)
      ?.settlementTransactionId,
    null,
  );
  assert.equal(
    next.ledgerTransactions?.some((row) => row.kind === "advance_settlement"),
    false,
  );
  assert.equal(
    next.positions?.find((row) => row.offerReference === CANONICAL_REFERENCE)
      ?.settlementTransactionId,
    null,
  );
});

test("landlord proceeds card maps waiting and automatically paid", () => {
  const seed = getSeedBook();
  const funded = seed.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  const open = seed.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(funded && open);
  assert.equal(landlordProceedsPresentation(open).status, "waiting");
  assert.equal(landlordProceedsPresentation(funded).status, "paid");
  const filled = applySubscribe(seed, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const paid = filled.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(paid);
  const presentation = landlordProceedsPresentation(paid);
  assert.equal(presentation.status, "paid");
  assert.equal(presentation.amountCents, paid.purchasePriceCents);
  assert.equal(toPortfolioPosition(funded, seed).settlementTxHash, null);
});

test("MRA-001 is minted, fully purchased, and paid automatically", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  const custody = mergeCustody(offer?.custody);
  assert.equal(custody.nftOwner, "holder");
  assert.equal(custody.saleProceedsStatus, "claimed");
  assert.equal(custody.landlordClaimableCents, 0);
  assert.equal(custody.landlordClaimedCents, offer?.purchasePriceCents);
  assert.equal(offer?.fundedCents, offer?.purchasePriceCents);
  assert.equal(offer?.offeringCents, offer?.purchasePriceCents);
  assert.equal(custody.landlordClaimTxHash, null);
  assert.equal(custody.feeTransferTxHash, null);
  assert.equal(custody.saleProceedsTxHash, null);
  assert.ok(custody.nftTokenId);
  assert.equal(
    book.paymentRequests?.find((row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID)
      ?.receivingAddress,
    offerNftPaymentAddress(CANONICAL_REFERENCE),
  );
});

test("MRA-010 is minted and still owned by Merkado until sale", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  const custody = mergeCustody(offer?.custody);
  assert.equal(offer?.status, "funding");
  assert.equal(custody.nftOwner, "company_safe");
  assert.equal(custody.saleProceedsStatus, "none");
  assert.ok(custody.nftTokenId);
});

test("filling an offer pays the landlord and points rent at the offer", () => {
  const book = getSeedBook();
  const next = applySubscribe(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  const custody = mergeCustody(offer?.custody);
  assert.equal(custody.nftOwner, "holder");
  assert.equal(custody.saleProceedsStatus, "claimed");
  assert.equal(custody.landlordClaimableCents, 0);
  assert.equal(custody.landlordClaimedCents, offer?.purchasePriceCents);
  const request = next.paymentRequests?.find(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.equal(request?.receivingAddress, offerNftPaymentAddress(CHEAP_OFFER_REFERENCE));
});

test("whole-offer purchase pays the address saved on the offer", () => {
  const book = getSeedBook();
  const open = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(open);
  open.payout.cryptoAddress = "0xDEMO0000LANDLORD00PAYOUT00000000000001";
  const claimed = applySubscribe(
    book,
    CHEAP_OFFER_REFERENCE,
    "2026-08-20T12:00:00.000Z",
  );
  const offer = claimed.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  const custody = mergeCustody(offer?.custody);
  assert.equal(custody.saleProceedsStatus, "claimed");
  assert.equal(custody.landlordClaimableCents, 0);
  assert.equal(
    custody.landlordClaimToAddress,
    "0xDEMO0000LANDLORD00PAYOUT00000000000001",
  );
  const ledger = claimed.ledgerTransactions?.find((row) => row.kind === "landlord_claim");
  assert.ok(ledger);
  assert.equal(ledger.txHash, null);
});

test("confirmed rent stays on the listing until the holder claims it", () => {
  const book = normalizeBook(getSeedBook());
  const paid = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  const collectionId = collectionIdFor(CANONICAL_REFERENCE, 1);
  const waiting = paid.distributions?.find((row) => row.collectionId === collectionId);
  assert.equal(waiting?.status, "pending");
  const holder = paid.offers.find((row) => row.reference === CANONICAL_REFERENCE)?.holders[0];
  assert.equal(holder?.receivedCents, 0);

  const collected = applyHolderCollect(
    paid,
    CANONICAL_REFERENCE,
    waiting?.distributionId,
    "2026-09-28T12:05:00.000Z",
  );
  const done = collected.distributions?.find((row) => row.collectionId === collectionId);
  assert.equal(done?.status, "distributed");
  const after = collected.offers.find((row) => row.reference === CANONICAL_REFERENCE)?.holders[0];
  assert.equal(after?.receivedCents, 180000);
});
