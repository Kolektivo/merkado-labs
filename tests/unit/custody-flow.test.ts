import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidPayoutAddress,
  mergeOnchain,
  mintState,
  proceedsPresentation,
  payoutAddressLocked,
  rentReceivingAddressFor,
} from "@/lib/rent-advance/custody";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  collectionIdFor,
} from "@/lib/rent-advance/ids";
import { toPortfolioPosition } from "@/lib/rent-advance/helpers";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import {
  applyVerifiedPurchase,
  applyVerifiedRentClaim,
  applyVerifiedRentDeposit,
  normalizeBook,
  type VerifiedRentClaimFacts,
} from "@/lib/rent-advance/payment-apply";
import {
  CANONICAL_REFERENCE,
  CHEAP_OFFER_REFERENCE,
  getSeedBook,
} from "@/lib/rent-advance/seed";

const BUYER = "0x5555555555555555555555555555555555555555";
const PAYER = "0x4444444444444444444444444444444444444444";
const TX_PURCHASE = "0x" + "c".repeat(64);
const TX_RENT = "0x" + "d".repeat(64);
const TX_CLAIM = "0x" + "f".repeat(64);
const OPAQUE = "0x" + "e".repeat(64);
const CONTRACT = "0x1111111111111111111111111111111111111111";

function buyOffer(reference: string, tokenId = 1) {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === reference);
  assert.ok(offer);
  offer.onchain = {
    tokenId,
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
  return applyVerifiedPurchase(book, reference, {
    tokenId,
    purchaserAddress: BUYER,
    txHash: TX_PURCHASE,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    purchasePriceAtomic: BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents)),
  }, "2026-08-20T12:00:00.000Z");
}

test("only real checksummed addresses are accepted for payouts", () => {
  assert.equal(
    isValidPayoutAddress("0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8"),
    true,
  );
  assert.equal(isValidPayoutAddress("0xDEMOLANDLORDPAYOUT0001"), false);
  assert.equal(isValidPayoutAddress("0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D7"), false);
  assert.equal(isValidPayoutAddress("not-an-address"), false);
  assert.equal(isValidPayoutAddress(""), false);

  const legacy = getSeedBook();
  assert.ok(legacy.accounts?.[0]);
  legacy.accounts[0].payoutAddress = "0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8";
  assert.equal(
    normalizeBook(legacy).accounts?.[0]?.payoutAddress,
    "0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8",
  );
  legacy.accounts[0].payoutAddress = "0xDEMOLANDLORDPAYOUT0001";
  assert.equal(normalizeBook(legacy).accounts?.[0]?.payoutAddress, null);
});

test("an older MRA-001 payload normalizes to pre-mint onchain defaults", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(offer);
  const legacy = structuredClone(book) as unknown as Record<string, unknown>;
  const offers = legacy.offers as Array<Record<string, unknown>>;
  const target = offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(target);
  target.custody = {
    nftTokenId: "nft-mra-001",
    nftOwner: "holder",
    saleProceedsStatus: "claimed",
    landlordClaimedCents: 1020600,
  };
  delete target.onchain;
  const next = normalizeBook(legacy);
  const normalized = next.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(normalized);
  const onchain = mergeOnchain(normalized.onchain);
  assert.equal(onchain.tokenId, null);
  assert.equal(onchain.purchased, false);
  assert.equal(onchain.landlordPaid, false);
  assert.equal(onchain.mintTxHash, null);
  assert.equal(
    next.ledgerTransactions?.some((row) => (row.kind as unknown as string) === "advance_settlement"),
    false,
  );
  assert.equal(
    next.ledgerTransactions?.some((row) => (row.kind as unknown as string) === "landlord_claim"),
    false,
  );
});

test("sale proceeds card maps waiting, minted, and paid", () => {
  const seed = getSeedBook();
  const open = seed.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(open);
  const waiting = proceedsPresentation(open);
  assert.equal(waiting.minted, false);
  assert.equal(waiting.landlordPaid, false);
  assert.equal(waiting.processing, false);
  assert.ok(waiting.payoutAddress);

  const minted = seed.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(minted);
  const mintedView = proceedsPresentation(minted);
  assert.equal(mintedView.minted, false);

  const bought = buyOffer(CHEAP_OFFER_REFERENCE, 2);
  const paid = bought.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(paid);
  const paidView = proceedsPresentation(paid);
  assert.equal(paidView.purchased, true);
  assert.equal(paidView.landlordPaid, true);
  assert.equal(paidView.processing, false);
  assert.equal(paidView.purchasePriceCents, paid.purchasePriceCents);
  assert.equal(toPortfolioPosition(paid, bought).settlementTxHash, null);
});

test("a submitted-but-unverified purchase reads Processing, not Paid", () => {
  const book = getSeedBook();
  const open = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(open);
  open.onchain = {
    ...mergeOnchain(open.onchain),
    tokenId: 2,
    mintTxHash: "0x" + "b".repeat(64),
    submittedPurchaseTxHash: "0x" + "c".repeat(64),
    purchased: false,
    landlordPaid: false,
  };
  const processing = proceedsPresentation(open);
  assert.equal(processing.processing, true);
  assert.equal(processing.purchased, false);
  assert.equal(processing.landlordPaid, false);
});

test("mint state requires both token id and mint tx hash to read Minted", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);

  const unminted = structuredClone(offer);
  unminted.onchain = { ...mergeOnchain(offer.onchain), tokenId: null, mintTxHash: null };
  assert.equal(mintState(unminted), "not_minted");

  const broadcastUnverified = structuredClone(offer);
  broadcastUnverified.onchain = {
    ...mergeOnchain(offer.onchain),
    tokenId: null,
    mintTxHash: "0x" + "b".repeat(64),
  };
  assert.equal(mintState(broadcastUnverified), "not_minted");

  const minted = structuredClone(offer);
  minted.onchain = {
    ...mergeOnchain(offer.onchain),
    tokenId: 2,
    mintTxHash: "0x" + "b".repeat(64),
  };
  assert.equal(mintState(minted), "minted");

  const purchased = structuredClone(minted);
  purchased.onchain = {
    ...mergeOnchain(minted.onchain),
    purchased: true,
    purchaseTxHash: "0x" + "c".repeat(64),
    landlordPaid: true,
  };
  assert.equal(mintState(purchased), "purchased");
});

test("seeded offers are pre-mint listings with no fabricated chain state", () => {
  const book = getSeedBook();
  for (const reference of [CANONICAL_REFERENCE, CHEAP_OFFER_REFERENCE]) {
    const offer = book.offers.find((row) => row.reference === reference);
    assert.ok(offer);
    assert.equal(offer.status, "funding");
    assert.equal(offer.fundedCents, 0);
    const onchain = mergeOnchain(offer.onchain);
    assert.equal(onchain.tokenId, null);
    assert.equal(onchain.purchased, false);
    assert.equal(onchain.landlordPaid, false);
    assert.equal(onchain.mintTxHash, null);
    assert.equal(offer.payout.method, "crypto");
    assert.ok(offer.payout.cryptoAddress);
  }
});

test("a verified purchase points rent at the contract and pays the landlord", () => {
  const next = buyOffer(CHEAP_OFFER_REFERENCE, 2);
  const offer = next.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.status, "live");
  assert.equal(offer.fundedCents, offer.offeringCents);
  assert.equal(offer.onchain?.purchased, true);
  assert.equal(offer.onchain?.landlordPaid, true);
  assert.equal(offer.onchain?.purchaserAddress, BUYER);
  const request = next.paymentRequests?.find(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.ok(request);
  assert.equal(request.amountXcgCents, 100);
  assert.equal(request.amountUsdcAtomic, 1_000_000);
});

test("the locked payout address is the one locked at mint", () => {
  const book = getSeedBook();
  const open = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(open);
  const locked = payoutAddressLocked(open);
  assert.ok(locked);
  const bought = buyOffer(CHEAP_OFFER_REFERENCE, 2);
  const offer = bought.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.equal(payoutAddressLocked(offer ?? open), locked);
});

test("confirmed rent stays claimable until the owner claims it", () => {
  const book = buyOffer(CANONICAL_REFERENCE, 1);
  const paid = applyVerifiedRentDeposit(book, CANONICAL_PAYMENT_REQUEST_ID, {
    tokenId: 1,
    opaquePaymentId: OPAQUE,
    payerAddress: PAYER,
    amountAtomic: BigInt(1_800_000_000),
    txHash: TX_RENT,
  }, "2026-09-28T12:00:00.000Z");
  const collectionId = collectionIdFor(CANONICAL_REFERENCE, 1);
  const waiting = paid.distributions?.find((row) => row.collectionId === collectionId);
  assert.equal(waiting?.status, "claimable");
  assert.equal(paid.offers.find((row) => row.reference === CANONICAL_REFERENCE)?.holders[0]?.receivedCents, 0);
  assert.equal(
    paid.offers.find((row) => row.reference === CANONICAL_REFERENCE)?.onchain?.claimableRentCents,
    180000,
  );

  const facts: VerifiedRentClaimFacts = {
    tokenId: 1,
    ownerAddress: BUYER,
    amountAtomic: BigInt(1_800_000_000),
    txHash: TX_CLAIM,
  };
  const pendingClaim = structuredClone(paid);
  const pendingOffer = pendingClaim.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(pendingOffer);
  pendingOffer.onchain = {
    ...mergeOnchain(pendingOffer.onchain),
    submittedClaimTxHash: TX_CLAIM,
    submittedClaimOwner: BUYER,
  };
  const claimed = applyVerifiedRentClaim(pendingClaim, CANONICAL_REFERENCE, facts, "2026-09-28T12:05:00.000Z");
  const done = claimed.distributions?.find((row) => row.collectionId === collectionId);
  assert.equal(done?.status, "claimed");
  const offer = claimed.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.equal(offer?.onchain?.claimableRentCents, 0);
  assert.equal(offer?.onchain?.claimedRentCents, 180000);
  assert.equal(offer?.holders[0]?.receivedCents, 180000);
  assert.equal(offer?.onchain?.submittedClaimTxHash, null);
  assert.equal(offer?.onchain?.submittedClaimOwner, null);

  const repeat = applyVerifiedRentClaim(claimed, CANONICAL_REFERENCE, facts, "2026-09-28T12:06:00.000Z");
  const afterRepeat = repeat.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.equal(afterRepeat?.onchain?.claimedRentCents, 180000);
  assert.equal(
    (repeat.distributions ?? []).filter((row) => row.status === "claimed").length,
    1,
  );
});

test("rent paying address is the offer contract when minted", () => {
  const book = getSeedBook();
  const config = book.cryptoConfig!;
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  const bought = buyOffer(CHEAP_OFFER_REFERENCE, 2);
  const boughtOffer = bought.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(boughtOffer?.onchain?.contractAddress ?? null);
  const address = rentReceivingAddressFor(boughtOffer!, config);
  assert.equal(address, boughtOffer!.onchain?.contractAddress ?? config.offerNftContract);
});
