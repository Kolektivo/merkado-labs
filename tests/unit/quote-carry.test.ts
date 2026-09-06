import assert from "node:assert/strict";
import test from "node:test";

import { getSeedBook } from "@/lib/rent-advance/seed";
import {
  applyQuoteCarry,
  parseQuoteCarry,
  quoteHref,
} from "@/lib/rent-advance/quote-carry";

const WALLET = "0x4444444444444444444444444444444444444444";

test("simulator quote carry preserves the connected renter wallet", () => {
  const url = quoteHref({
    rentCents: 180000,
    marketCents: 300000,
    listing: 89,
    payer: 95,
    months: 6,
    renterWalletAddress: WALLET,
  });
  const parsed = new URL(url, "https://labs.example");
  const carry = parseQuoteCarry(Object.fromEntries(parsed.searchParams));

  assert.ok(carry);
  assert.equal(carry.renterWalletAddress, WALLET);

  const offer = getSeedBook().offers[0];
  assert.equal(applyQuoteCarry(offer, carry).renterWalletAddress, WALLET);
});

test("quote carry leaves the renter wallet empty when disconnected", () => {
  const parsed = new URL(
    quoteHref({
      rentCents: 180000,
      marketCents: 300000,
      listing: 89,
      payer: 95,
      months: 6,
    }),
    "https://labs.example",
  );
  const carry = parseQuoteCarry(Object.fromEntries(parsed.searchParams));

  assert.ok(carry);
  assert.equal(carry.renterWalletAddress, null);
});
