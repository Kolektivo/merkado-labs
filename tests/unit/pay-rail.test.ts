import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPaymentRailCopy,
  payerCopy,
} from "@/lib/rent-advance/copy";

test("live rail copy drops demo-wallet language and stays honest on testnet", () => {
  const live = applyPaymentRailCopy(payerCopy.en, {
    locale: "en",
    mode: "live",
    isTestnet: true,
    networkLabel: "Base Sepolia",
  });

  assert.equal(live.confirmPay, "Pay with wallet");
  assert.equal(live.connected, "Wallet connected");
  assert.match(live.demoOnly, /test USDC on Base Sepolia/);
  assert.doesNotMatch(live.demoOnly, /does not send a real transfer/);
  assert.doesNotMatch(live.confirmPay, /demo wallet/i);
  assert.match(live.networkTip, /test network/);
});

test("live mainnet copy warns that real USDC will be sent", () => {
  const live = applyPaymentRailCopy(payerCopy.en, {
    locale: "en",
    mode: "live",
    isTestnet: false,
    networkLabel: "Base Mainnet",
  });

  assert.match(live.demoOnly, /real USDC/);
  assert.doesNotMatch(live.demoOnly, /test USDC/);
});

test("mock rail copy is unchanged", () => {
  const mock = applyPaymentRailCopy(payerCopy.en, { mode: "mock" });
  assert.equal(mock.confirmPay, "Pay with demo wallet");
  assert.equal(mock, payerCopy.en);
});
