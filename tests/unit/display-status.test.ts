import assert from "node:assert/strict";
import test from "node:test";

import { displayStatusLabel } from "@/lib/rent-advance/helpers";

test("a funding offer reads 'Mint pending' only until it is minted", () => {
  assert.equal(displayStatusLabel("funding", false), "Mint pending");
  assert.equal(displayStatusLabel("funding", true), "Listed");
});

test("non-funding statuses keep their normal label regardless of mint state", () => {
  assert.equal(displayStatusLabel("under_review", false), "Under review");
  assert.equal(displayStatusLabel("under_review", true), "Under review");
  assert.equal(displayStatusLabel("live", false), "Sold");
  assert.equal(displayStatusLabel("collecting", true), "Sold");
  assert.equal(displayStatusLabel("draft", false), "Draft");
  assert.equal(displayStatusLabel("denied", true), "Denied");
});
