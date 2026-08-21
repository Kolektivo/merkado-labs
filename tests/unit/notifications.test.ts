import assert from "node:assert/strict";
import test from "node:test";

import { CANONICAL_PAYMENT_REQUEST_ID } from "@/lib/rent-advance/ids";
import {
  dashboardNotifications,
  navNotificationCounts,
  visibleNotifications,
} from "@/lib/rent-advance/notifications";
import { applyPaymentOutcome, normalizeBook } from "@/lib/rent-advance/payment-apply";
import { CANONICAL_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";

test("seeded book notifies that MRA-001 was paid automatically", () => {
  const items = dashboardNotifications(normalizeBook(getSeedBook()));
  const sale = items.find(
    (item) => item.id === `sale-paid:${CANONICAL_REFERENCE}`,
  );
  assert.ok(sale);
  assert.equal(sale.title, "Sale amount paid automatically");
  assert.equal(sale.href, `/originate/${CANONICAL_REFERENCE}`);
  assert.equal(
    items.some((item) => item.kind === "rent_claim"),
    false,
  );
});

test("seeded open offer notifies that it was accepted and listed", () => {
  const items = dashboardNotifications(normalizeBook(getSeedBook()));
  const listed = items.find((item) => item.id === "listed:MRA-010");
  assert.ok(listed);
  assert.equal(listed.title, "Offer accepted and listed");
  assert.equal(listed.actionLabel, "View offer");
});

test("confirmed rent adds a Portfolio claim notification", () => {
  const paid = applyPaymentOutcome(
    normalizeBook(getSeedBook()),
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  const items = dashboardNotifications(paid);
  const rent = items.find((item) => item.id === `rent:${CANONICAL_REFERENCE}`);
  assert.ok(rent);
  assert.equal(rent.title, "Rent ready to claim");
  assert.equal(rent.href, `/portfolio/${CANONICAL_REFERENCE}`);
  assert.deepEqual(navNotificationCounts(items, []), {
    originate: 2,
    portfolio: 1,
  });
  assert.equal(
    visibleNotifications(items, [`sale-paid:${CANONICAL_REFERENCE}`]).length,
    2,
  );
});
