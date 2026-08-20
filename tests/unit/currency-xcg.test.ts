import assert from "node:assert/strict";
import test from "node:test";

import {
  formatXcg,
  usdCentsToXcgCents,
  usdCentsToXcgInput,
  xcgMajorToUsdCents,
} from "@/lib/rent-advance/money";

test("USD cents convert to XCG at 1.79", () => {
  assert.equal(usdCentsToXcgCents(100), 179);
  assert.equal(usdCentsToXcgCents(180000), 322200);
  assert.equal(formatXcg(100), "XCG 1.79");
  assert.equal(formatXcg(180000), "XCG 3,222.00");
  assert.equal(usdCentsToXcgInput(180000), "3222.00");
});

test("typed XCG amounts convert back to stored USD cents", () => {
  assert.equal(xcgMajorToUsdCents(1.79), 100);
  assert.equal(xcgMajorToUsdCents(3222), 180000);
});
