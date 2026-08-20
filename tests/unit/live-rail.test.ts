import assert from "node:assert/strict";
import test from "node:test";

import { createPaymentProvider } from "@/lib/pay/create-provider";
import {
  OP_MAINNET_CHAIN_ID,
  OP_SEPOLIA_CHAIN_ID,
  OP_SEPOLIA_NETWORK_KEY,
  OP_SEPOLIA_USDC_CONTRACT,
} from "@/lib/pay/networks";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  collectionIdFor,
  paymentTxIdFor,
} from "@/lib/rent-advance/ids";
import {
  applyPaymentOutcome,
  cryptoConfigFor,
  currentRenterPaymentRequest,
} from "@/lib/rent-advance/payment-apply";
import { getSeedBook } from "@/lib/rent-advance/seed";

const RECIPIENT = "0xDEMO0000SAFE00MERKADOPAY000000000000000";
const REAL_HASH = "0x" + "a".repeat(64);

// docs/07 provider contract: connect, disconnect, session, submitPayment,
// reportExternalTransfer, getStatus are the public PaymentProvider surface.
test("the payment provider exposes the documented contract", () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  for (const method of [
    "connect",
    "disconnect",
    "session",
    "submitPayment",
    "reportExternalTransfer",
    "getStatus",
  ]) {
    assert.equal(
      typeof (provider as unknown as Record<string, unknown>)[method],
      "function",
      `PaymentProvider must expose ${method}`,
    );
  }
});

// docs/07 Flow A steps 2–3b: an address comes only from an external wallet
// connection. No embedded wallet may fabricate one before connect().
test("an external wallet connection is the only way to obtain an address", async () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  assert.equal(provider.session().connected, false);

  const connected = await provider.connect();
  assert.equal(connected.connected, true);
  assert.match(connected.address, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(connected.chainId, OP_SEPOLIA_CHAIN_ID);

  await provider.disconnect();
  assert.equal(provider.session().connected, false);
});

// docs/07 Flow A step 3b + docs/08 section 8: the selected testnet is
// enforced and a mainnet chain is never reported by a testnet provider.
test("OP Sepolia is enforced and a mainnet chain is never reported", async () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  const connected = await provider.connect();
  assert.equal(connected.chainId, OP_SEPOLIA_CHAIN_ID);
  assert.notEqual(connected.chainId, OP_MAINNET_CHAIN_ID);
});

// docs/07 approved networks: submitted payments must carry Circle native
// USDC for the selected network, the exact atomic amount, and the selected
// chain id.
test("a submitted payment carries native USDC, the exact atomic amount, and the selected chain", async () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  const connected = await provider.connect();

  const submitted = await provider.submitPayment({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "wallet",
  });

  assert.equal(submitted.from, connected.address);
  assert.equal(submitted.to, RECIPIENT);
  assert.equal(submitted.tokenContract, OP_SEPOLIA_USDC_CONTRACT);
  assert.equal(submitted.atomicAmount, 1_800_000_000);
  assert.equal(submitted.chainId, OP_SEPOLIA_CHAIN_ID);
  assert.ok(submitted.transactionId);
  assert.ok(submitted.txHash);
  assert.notEqual(submitted.status, "confirmed");
});

// docs/07 Flow A step 9: a wallet reject, revert, or amount mismatch must
// surface as a failed outcome with a user-safe error code, never a confirm.
test("a wrong USDC amount is rejected and never confirms", async () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  await provider.connect();

  const submitted = await provider.submitPayment({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_001,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "wallet",
  });

  assert.equal(submitted.status, "failed");
  assert.ok(submitted.errorCode);
  assert.notEqual(submitted.status, "confirmed");
});

// docs/07 Flow A step 9: recipient is validated before any transfer.
test("an invalid recipient is rejected and never confirms", async () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  await provider.connect();

  const submitted = await provider.submitPayment({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: "not-an-address",
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "wallet",
  });

  assert.equal(submitted.status, "failed");
  assert.ok(submitted.errorCode);
  assert.notEqual(submitted.status, "confirmed");
});

// docs/07 "What you must not do": a wallet popup or button click alone must
// never confirm. Confirmation requires chain confirmation (approved five-block
// depth), so a fresh submission stays submitted/pending and getStatus must not
// report confirmed yet.
test("a payment is never confirmed before the five-block chain depth", async () => {
  const provider = createPaymentProvider(cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY));
  await provider.connect();

  const submitted = await provider.submitPayment({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "wallet",
  });

  assert.ok(["submitted", "pending"].includes(submitted.status));

  const status = await provider.getStatus(submitted.transactionId);
  assert.notEqual(
    status.status,
    "confirmed",
    "confirmed requires chain confirmation, not a client-side event",
  );
});

// docs/07 Flow A step 3a + "Done when": the copy-address path reports
// submitted without a connected wallet and cannot self-confirm the book.
// Confirmation is server-owned, so a pending book write finalizes nothing.
test("the copy-address path cannot falsely confirm the book", async () => {
  const provider = createPaymentProvider();
  const reported = await provider.reportExternalTransfer({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "external",
  });
  assert.equal(reported.status, "submitted");
  assert.notEqual(reported.status, "confirmed");

  const book = getSeedBook();
  const pending = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "pending",
    "2026-09-28T12:00:00.000Z",
  );
  const request = pending.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(request?.status, "pending");

  const offer = pending.offers.find((row) => row.reference === "MRA-001");
  assert.equal(offer?.collections.filter((row) => row.receivableN === 1).length, 0);
  assert.equal(
    (pending.distributions ?? []).filter(
      (row) => row.collectionId === collectionIdFor("MRA-001", 1),
    ).length,
    0,
  );
});

// docs/07 "Done when" + docs/09 shared book: one confirmed payment updates
// the payment request, the receivable, one collection, one automatic holder
// distribution, and one ledger row exactly once, and My Payments advances.
test("one confirmed payment updates Pay, Direct, and Portfolio exactly once", () => {
  const book = getSeedBook();
  const next = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
    { txHash: REAL_HASH },
  );

  const request = next.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(request?.status, "confirmed");
  assert.equal(request?.txHash, REAL_HASH);

  const offer = next.offers.find((row) => row.reference === "MRA-001");
  assert.equal(offer?.receivables.find((row) => row.n === 1)?.status, "received");
  assert.equal(offer?.collections.filter((row) => row.receivableN === 1).length, 1);
  assert.equal(
    (next.distributions ?? []).filter(
      (row) => row.collectionId === collectionIdFor("MRA-001", 1),
    ).length,
    1,
  );
  assert.equal(
    (next.ledgerTransactions ?? []).filter(
      (row) => row.transactionId === paymentTxIdFor(CANONICAL_PAYMENT_REQUEST_ID),
    ).length,
    1,
  );
  assert.equal(currentRenterPaymentRequest(next)?.periodLabel, "October 2026");
});