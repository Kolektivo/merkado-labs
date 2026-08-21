import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeOfferInput } from "@/lib/rent-advance/offer-input";
import { getSeedBook } from "@/lib/rent-advance/seed";

test("offer input strips undeclared root and nested bank fields", () => {
  const input = structuredClone(getSeedBook().offers[0]) as unknown as Record<
    string,
    unknown
  >;
  input.bankAccountNumber = "REAL-ACCOUNT";
  input.payout = {
    ...(input.payout as Record<string, unknown>),
    cryptoAddress: "0xDEMO-SAFE",
    bankDetails: { accountNumber: "REAL-ACCOUNT" },
  };
  input.tenant = {
    ...(input.tenant as Record<string, unknown>),
    bankDetails: { accountNumber: "REAL-ACCOUNT" },
  };

  const sanitized = sanitizeOfferInput(input);

  assert.equal(sanitized.payout.cryptoAddress, "0xDEMO-SAFE");
  assert.equal("bankAccountNumber" in sanitized, false);
  assert.equal("bankDetails" in sanitized.payout, false);
  assert.equal("bankDetails" in sanitized.tenant, false);
});
