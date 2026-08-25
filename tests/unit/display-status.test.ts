import assert from "node:assert/strict";
import test from "node:test";

import {
  customerStatusLabel,
  displayStatusLabel,
  effectiveOfferStatus,
  isUpcomingPaymentRequest,
  listingExpiresAt,
  openPaymentRequests,
  type PaymentRowLike,
} from "@/lib/rent-advance/helpers";
import type { PaymentRequestStatus } from "@/lib/rent-advance/types";

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

test("customer status labels never expose mint state on customer surfaces", () => {
  assert.equal(customerStatusLabel("funding"), "Listed");
  assert.equal(customerStatusLabel("live"), "Sold");
  assert.equal(customerStatusLabel("collecting"), "Sold");
  assert.equal(customerStatusLabel("under_review"), "Under review");
  assert.equal(customerStatusLabel("denied"), "Denied");
  assert.equal(customerStatusLabel("expired"), "Expired");
  assert.equal(customerStatusLabel("closed"), "Closed");
  assert.equal(customerStatusLabel("default"), "Sold");
  assert.equal(customerStatusLabel("draft"), "Draft");
  assert.notEqual(customerStatusLabel("funding"), "Mint pending");
  assert.notEqual(customerStatusLabel("default"), "Default");
});

test("the 60-day listing window is display-only and never enforced", () => {
  const published = "2026-08-25T12:00:00.000Z";
  const expires = listingExpiresAt(published);
  assert.ok(expires);
  assert.equal(expires, "2026-10-24T12:00:00.000Z");
  assert.equal(listingExpiresAt(null), null);
  assert.equal(listingExpiresAt("not-a-date"), null);

  const pastExpiry = effectiveOfferStatus({ status: "funding", expiresAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(pastExpiry, "funding");
  assert.equal(effectiveOfferStatus({ status: "live" }), "live");
  assert.equal(effectiveOfferStatus({ status: "collecting" }), "collecting");
});

function row(id: string, status: PaymentRequestStatus, dueDate: string): PaymentRowLike {
  return {
    paymentRequestId: id,
    status,
    dueDate,
  };
}

test("openPaymentRequests classifies the earliest open request as Due", () => {
  const requests = [
    row("sep", "due", "2026-09-01"),
    row("oct", "initiated", "2026-10-01"),
    row("nov", "pending", "2026-11-01"),
    row("dec", "confirmed", "2026-12-01"),
  ];
  const open = openPaymentRequests(requests);
  assert.deepEqual(
    open.map((request) => request.paymentRequestId),
    ["sep", "oct", "nov"],
  );
  assert.equal(isUpcomingPaymentRequest(requests, requests[0]), false);
  assert.equal(isUpcomingPaymentRequest(requests, requests[1]), true);
  assert.equal(isUpcomingPaymentRequest(requests, requests[2]), true);
});

test("all-future open requests: first is Due, the rest are Upcoming", () => {
  const requests = [
    row("sep", "due", "2026-09-01"),
    row("oct", "due", "2026-10-01"),
    row("nov", "due", "2026-11-01"),
  ];
  assert.equal(isUpcomingPaymentRequest(requests, requests[0]), false);
  assert.equal(isUpcomingPaymentRequest(requests, requests[1]), true);
  assert.equal(isUpcomingPaymentRequest(requests, requests[2]), true);
});

test("confirmed or expired rows are never counted as open or Upcoming", () => {
  const requests = [
    row("sep", "confirmed", "2026-09-01"),
    row("oct", "expired", "2026-10-01"),
    row("nov", "due", "2026-11-01"),
  ];
  assert.deepEqual(
    openPaymentRequests(requests).map((request) => request.paymentRequestId),
    ["nov"],
  );
  assert.equal(isUpcomingPaymentRequest(requests, requests[0]), false);
  assert.equal(isUpcomingPaymentRequest(requests, requests[1]), false);
  assert.equal(isUpcomingPaymentRequest(requests, requests[2]), false);
});
