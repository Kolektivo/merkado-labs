import assert from "node:assert/strict";
import test from "node:test";

import {
  payerCopy,
  NOT_CONFIGURED,
} from "@/lib/rent-advance/copy";

test("live payer copy drops demo-wallet language and stays honest on testnet", () => {
  const copy = payerCopy.en;
  assert.equal(copy.confirmPay, "Pay rent");
  assert.equal(copy.connected, "Wallet connected");
  assert.equal(copy.approveUsdc, "Approve USDC");
  assert.match(copy.usdcTip, /one-to-one/);
  assert.doesNotMatch(copy.confirmPay, /demo wallet/i);
  assert.doesNotMatch(copy.connected, /demo/i);
  assert.doesNotMatch(copy.optionA, /nothing real is sent/i);
});

test("not-configured copy is honest that nothing was sent", () => {
  assert.match(NOT_CONFIGURED.body, /Nothing was sent/);
  assert.doesNotMatch(NOT_CONFIGURED.body, /nothing real is sent/i);
});

test("each locale exposes the same copy keys", () => {
  const enKeys = Object.keys(payerCopy.en).sort();
  const nlKeys = Object.keys(payerCopy.nl).sort();
  const papKeys = Object.keys(payerCopy.pap).sort();
  assert.deepEqual(nlKeys, enKeys);
  assert.deepEqual(papKeys, enKeys);
});