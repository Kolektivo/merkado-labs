import assert from "node:assert/strict";
import test from "node:test";

import { payoutAddressLocked } from "@/lib/rent-advance/custody";
import { CANONICAL_PAYMENT_REQUEST_ID } from "@/lib/rent-advance/ids";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import {
  dashboardNotifications,
  navNotificationCounts,
  visibleNotifications,
} from "@/lib/rent-advance/notifications";
import {
  applyVerifiedPurchase,
  applyVerifiedRentDeposit,
  normalizeBook,
} from "@/lib/rent-advance/payment-apply";
import { CANONICAL_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";

const BUYER = "0x5555555555555555555555555555555555555555";
const PAYER = "0x4444444444444444444444444444444444444444";
const TX_PURCHASE = "0x" + "c".repeat(64);
const TX_RENT = "0x" + "d".repeat(64);
const OPAQUE = "0x" + "e".repeat(64);
const CONTRACT = "0x1111111111111111111111111111111111111111";

function minted(book: ReturnType<typeof getSeedBook>, reference: string) {
  const offer = book.offers.find((row) => row.reference === reference);
  assert.ok(offer);
  offer.onchain = {
    tokenId: 1,
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

test("seeded pre-mint offers notify as Listed with no mint wording", () => {
  const items = dashboardNotifications(normalizeBook(getSeedBook()));
  const pending = items.find((item) => item.id === `mint-pending:${CANONICAL_REFERENCE}`);
  assert.ok(pending);
  assert.equal(pending.title, "Offer approved · Listed");
  assert.equal(pending.href, `/originate/${CANONICAL_REFERENCE}`);
  assert.equal(
    items.some((item) => item.kind === "rent_claim"),
    false,
  );
  assert.equal(
    items.some((item) => item.id.startsWith("sale-paid:")),
    false,
  );
});

test("a minted offer notifies as listed on Marketplace with no mint wording", () => {
  const items = dashboardNotifications(minted(getSeedBook(), CANONICAL_REFERENCE));
  const listed = items.find((item) => item.id === `listed:${CANONICAL_REFERENCE}`);
  assert.ok(listed);
  assert.equal(listed.title, "Offer listed on Marketplace");
  assert.equal(listed.href, `/originate/${CANONICAL_REFERENCE}`);
});

test("a verified purchase notifies that sale proceeds were paid", () => {
  const book = minted(getSeedBook(), CANONICAL_REFERENCE);
  const offer = book.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(offer);
  const bought = applyVerifiedPurchase(book, CANONICAL_REFERENCE, {
    tokenId: 1,
    purchaserAddress: BUYER,
    txHash: TX_PURCHASE,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    purchasePriceAtomic: BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents)),
  }, "2026-08-20T12:00:00.000Z");
  const items = dashboardNotifications(bought);
  const sale = items.find((item) => item.id === `sale-paid:${CANONICAL_REFERENCE}`);
  assert.ok(sale);
  assert.equal(sale.title, "Offer sold · sale proceeds paid");
  assert.equal(sale.href, `/originate/${CANONICAL_REFERENCE}`);
});

test("confirmed rent adds a Portfolio claim notification", () => {
  const book = minted(getSeedBook(), CANONICAL_REFERENCE);
  const offer = book.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(offer);
  const bought = applyVerifiedPurchase(book, CANONICAL_REFERENCE, {
    tokenId: 1,
    purchaserAddress: BUYER,
    txHash: TX_PURCHASE,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    purchasePriceAtomic: BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents)),
  }, "2026-08-20T12:00:00.000Z");
  const paid = applyVerifiedRentDeposit(bought, CANONICAL_PAYMENT_REQUEST_ID, {
    tokenId: 1,
    opaquePaymentId: OPAQUE,
    payerAddress: PAYER,
    amountAtomic: BigInt(1_800_000_000),
    txHash: TX_RENT,
  }, "2026-09-28T12:00:00.000Z");
  const items = dashboardNotifications(paid);
  const rent = items.find((item) => item.id === `rent:${CANONICAL_REFERENCE}`);
  assert.ok(rent);
  assert.equal(rent.title, "Rent ready to claim");
  assert.equal(rent.href, `/portfolio/${CANONICAL_REFERENCE}`);
  assert.deepEqual(navNotificationCounts(items, []), {
    originate: 2,
    portfolio: 1,
  });
  assert.equal(
    visibleNotifications(items, [`sale-paid:${CANONICAL_REFERENCE}`]).length,
    2,
  );
});