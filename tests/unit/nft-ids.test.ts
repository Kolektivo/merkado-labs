import assert from "node:assert/strict";
import test from "node:test";

import { offerKey, randomOfferKey } from "@/lib/onchain/ids";

test("randomOfferKey returns a unique bytes32 offer key each call", () => {
  const a = randomOfferKey();
  const b = randomOfferKey();
  assert.match(a, /^0x[0-9a-fA-F]{64}$/);
  assert.match(b, /^0x[0-9a-fA-F]{64}$/);
  assert.notEqual(a, b, "two random keys must not collide");
});

test("deterministic offerKey is stable for the same input", () => {
  const input = {
    chainId: 84532,
    contractAddress: "0xFc9378915ceF4ca7aa4A180F0FDF119038Cf609a",
    internalId: "MRA-001",
  };
  assert.equal(offerKey(input), offerKey(input));
});
