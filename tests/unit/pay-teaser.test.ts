import assert from "node:assert/strict";
import test from "node:test";

import { payerCopy } from "@/lib/rent-advance/copy";

test("bank teaser is non-actionable copy that never promises the rail now", () => {
  const en = payerCopy.en;
  assert.equal(typeof en.bankPaymentComingSoon, "string");
  assert.match(en.bankPaymentComingSoon, /coming soon/i);
  // The teaser must not imply the bank rail is available today.
  assert.doesNotMatch(en.bankPaymentComingSoon, /\bnow\b/i);
});

test("pay copy stays live: no demo hashes, demo-outcome copy, or demo-only disclaimers", () => {
  const copy = payerCopy.en;
  const values = Object.values(copy).join(" ");
  assert.doesNotMatch(values, /0xDEMO/i);
  assert.doesNotMatch(values, /I've sent this payment/i);
  assert.doesNotMatch(values, /Demo only/i);
});
