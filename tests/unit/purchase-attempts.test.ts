import assert from "node:assert/strict";
import test from "node:test";

import { emptyOnchainState } from "@/lib/rent-advance/custody";
import {
  appendPurchaseAttempt,
  hasPendingPurchaseAttempt,
  isTransactionHash,
  purchaseAttemptsFor,
  settlePurchaseAttempt,
} from "@/lib/rent-advance/purchase-attempts";
import type { OnchainOfferState } from "@/lib/rent-advance/types";

const HASH_A = "0x" + "a".repeat(64);
const HASH_B = "0x" + "b".repeat(64);
const HASH_C = "0x" + "c".repeat(64);
const BUYER_A = "0x1111111111111111111111111111111111111111";
const BUYER_B = "0x2222222222222222222222222222222222222222";

test("isTransactionHash only accepts a real 32-byte hash", () => {
  assert.equal(isTransactionHash(HASH_A), true);
  assert.equal(isTransactionHash("0xDEMO"), false);
  assert.equal(isTransactionHash(HASH_A.slice(0, 20)), false);
  assert.equal(isTransactionHash(""), false);
});

test("legacy single-hash records are normalized into pending attempts", () => {
  const onchain: OnchainOfferState = {
    ...emptyOnchainState(),
    submittedPurchaseTxHash: HASH_A,
    submittedPurchaseBuyer: BUYER_A,
  };
  const attempts = purchaseAttemptsFor(onchain);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].txHash, HASH_A);
  assert.equal(attempts[0].status, "pending");
  assert.equal(hasPendingPurchaseAttempt(onchain), true);
});

test("a bare legacy hash without a buyer still counts as pending", () => {
  const onchain: OnchainOfferState = {
    ...emptyOnchainState(),
    submittedPurchaseTxHash: HASH_A,
  };
  assert.equal(hasPendingPurchaseAttempt(onchain), true);
});

test("appendPurchaseAttempt stores every submitted hash, old ones included", () => {
  let onchain: OnchainOfferState = { ...emptyOnchainState() };
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_A,
    buyerAddress: BUYER_A,
    accountId: "acc-1",
    submittedAt: "2026-09-06T20:00:00.000Z",
  });
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_B,
    buyerAddress: BUYER_B,
    accountId: "acc-2",
    submittedAt: "2026-09-06T20:05:00.000Z",
  });
  const attempts = purchaseAttemptsFor(onchain);
  assert.equal(attempts.length, 2);
  assert.ok(attempts.some((row) => row.txHash === HASH_A));
  assert.ok(attempts.some((row) => row.txHash === HASH_B));
  assert.equal(hasPendingPurchaseAttempt(onchain), true);
});

test("appending the same hash again does not duplicate the attempt", () => {
  let onchain: OnchainOfferState = { ...emptyOnchainState() };
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_A,
    buyerAddress: BUYER_A,
    accountId: "acc-1",
    submittedAt: "2026-09-06T20:00:00.000Z",
  });
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_A,
    buyerAddress: BUYER_A,
    accountId: "acc-1",
    submittedAt: "2026-09-06T20:01:00.000Z",
  });
  assert.equal(purchaseAttemptsFor(onchain).length, 1);
});

test("confirming one attempt supersedes the other pending attempts", () => {
  let onchain: OnchainOfferState = { ...emptyOnchainState() };
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_A,
    buyerAddress: BUYER_A,
    accountId: "acc-1",
    submittedAt: "2026-09-06T20:00:00.000Z",
  });
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_B,
    buyerAddress: BUYER_B,
    accountId: "acc-2",
    submittedAt: "2026-09-06T20:05:00.000Z",
  });
  onchain = settlePurchaseAttempt(onchain, HASH_B, "confirmed");
  const attempts = purchaseAttemptsFor(onchain);
  const byHash = new Map(attempts.map((row) => [row.txHash, row.status]));
  assert.equal(byHash.get(HASH_B), "confirmed");
  assert.equal(byHash.get(HASH_A), "superseded");
  assert.equal(hasPendingPurchaseAttempt(onchain), false);
});

test("marking an attempt failed keeps the offer retryable", () => {
  let onchain: OnchainOfferState = { ...emptyOnchainState() };
  onchain = appendPurchaseAttempt(onchain, {
    txHash: HASH_A,
    buyerAddress: BUYER_A,
    accountId: "acc-1",
    submittedAt: "2026-09-06T20:00:00.000Z",
  });
  onchain = settlePurchaseAttempt(onchain, HASH_A, "failed", "transaction reverted");
  const attempts = purchaseAttemptsFor(onchain);
  assert.equal(attempts[0].status, "failed");
  assert.equal(attempts[0].failureReason, "transaction reverted");
  assert.equal(hasPendingPurchaseAttempt(onchain), false);
});

test("invalid hashes and addresses are never promoted into attempts", () => {
  const onchain: OnchainOfferState = {
    ...emptyOnchainState(),
    purchaseAttempts: [
      {
        txHash: "0xDEMO",
        buyerAddress: BUYER_A,
        accountId: "acc-1",
        submittedAt: null,
        status: "pending",
      },
      {
        txHash: HASH_C,
        buyerAddress: "not-an-address",
        accountId: "acc-1",
        submittedAt: null,
        status: "pending",
      },
    ],
  };
  assert.equal(purchaseAttemptsFor(onchain).length, 0);
});