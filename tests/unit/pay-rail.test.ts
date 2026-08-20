import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPaymentRailCopy,
  payerCopy,
} from "@/lib/rent-advance/copy";
import {
  isMockPaymentRail,
  overviewPayCardBody,
  overviewPrototypeBody,
  paymentNetworkBody,
  receivingLedgerLabel,
  renterWalletLedgerLabel,
  showDemoPaymentOutcomes,
  walletConnectError,
} from "@/lib/pay/mode";

test("the payment rail stays mocked until Luis flips the switch", () => {
  assert.equal(isMockPaymentRail(), true);
  assert.equal(showDemoPaymentOutcomes(), true);
  assert.match(overviewPrototypeBody(), /mocked/);
  assert.match(overviewPayCardBody(), /nothing real is sent/);
  assert.match(paymentNetworkBody("Base Sepolia"), /does not send real money/);
  assert.equal(renterWalletLedgerLabel(), "Renter demo wallet");
  assert.equal(receivingLedgerLabel(), "Demo receiving address");
  assert.match(walletConnectError(), /demo wallet/);
});

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
