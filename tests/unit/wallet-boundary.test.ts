import assert from "node:assert/strict";
import test from "node:test";

import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import { isMockPaymentRail, showDemoPaymentOutcomes } from "@/lib/pay/mode";
import { OP_SEPOLIA_CHAIN_ID, OP_SEPOLIA_NETWORK_KEY } from "@/lib/pay/networks";
import { CANONICAL_PAYMENT_REQUEST_ID } from "@/lib/rent-advance/ids";
import { cryptoConfigFor } from "@/lib/rent-advance/payment-apply";

const RECIPIENT = "0xDEMO0000SAFE00MERKADOPAY000000000000000";

// Reown/AppKit external-wallet foundation (docs/07 "Provider contract"): the
// Pay UI only ever talks to PaymentProvider, so the adapter boundary stays
// wallet-library-agnostic. The mocked rail must run with no Reown project id,
// no Privy App ID, and no wallet SDK at all.
test("the mocked rail needs no wallet configuration or SDK", () => {
  assert.equal(isMockPaymentRail(), true);
  assert.equal(showDemoPaymentOutcomes(), true);
  const provider = createMockPaymentProvider();
  assert.equal(provider.session()?.connected, false);
});

// docs/07 Flow A step 9: a wrong amount surfaces as a user-safe error code
// from the adapter itself, before any transfer is simulated.
test("the mock adapter reports amount_mismatch for a wrong USDC amount", async () => {
  const provider = createMockPaymentProvider();
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
  assert.equal(submitted.errorCode, "amount_mismatch");
  assert.notEqual(submitted.status, "confirmed");
});

// docs/07 Flow A step 9: a malformed receiving address is rejected before any
// transfer is simulated.
test("the mock adapter reports invalid_recipient for a malformed address", async () => {
  const provider = createMockPaymentProvider();
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
  assert.equal(submitted.errorCode, "invalid_recipient");
  assert.notEqual(submitted.status, "confirmed");
});

// docs/07 "Provider contract": the session must survive a failed submission —
// a rejected transfer must not silently disconnect the wallet.
test("the mock session persists across a failed submission", async () => {
  const provider = createMockPaymentProvider();
  await provider.connect();
  assert.equal(provider.session()?.connected, true);

  const submitted = await provider.submitPayment({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_001,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "wallet",
  });

  assert.equal(submitted.status, "failed");
  assert.equal(provider.session()?.connected, true);

  await provider.disconnect();
  assert.equal(provider.session()?.connected, false);
});

// docs/07 Flow A step 3a: the copy-address path walks the demo path without a
// connected wallet and must never fabricate a connection.
test("the copy-address path never connects a wallet", async () => {
  const provider = createMockPaymentProvider();
  const reported = await provider.reportExternalTransfer({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "external",
  });
  assert.equal(reported.status, "submitted");
  assert.equal(provider.session()?.connected, false);
});

// docs/03 section 5: mock mode keeps both documented pay paths — copy-address
// and the demo wallet — and the wallet path requires an explicit connection.
test("mock mode keeps both documented pay paths", async () => {
  const provider = createMockPaymentProvider({
    config: cryptoConfigFor(OP_SEPOLIA_NETWORK_KEY),
  });
  const input = {
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: RECIPIENT,
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
  } as const;

  const external = await provider.reportExternalTransfer({
    ...input,
    method: "external",
  });
  assert.equal(external.status, "submitted");

  const beforeConnect = await provider.submitPayment({ ...input, method: "wallet" });
  assert.equal(beforeConnect.status, "failed");

  await provider.connect();
  assert.equal(provider.session()?.connected, true);

  const connected = await provider.submitPayment({ ...input, method: "wallet" });
  assert.equal(connected.status, "submitted");
  assert.equal(connected.chainId, OP_SEPOLIA_CHAIN_ID);
});
