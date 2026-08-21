import assert from "node:assert/strict";
import test from "node:test";

import { applyLandlordClaim } from "@/lib/rent-advance/custody";
import { CANONICAL_PAYMENT_REQUEST_ID } from "@/lib/rent-advance/ids";
import {
  dashboardNotifications,
  navNotificationCounts,
  visibleNotifications,
} from "@/lib/rent-advance/notifications";
import { applyPaymentOutcome, normalizeBook } from "@/lib/rent-advance/payment-apply";
import { CANONICAL_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";

test("seeded book notifies that MRA-001 sale proceeds are ready to claim", () => {
  const items = dashboardNotifications(normalizeBook(getSeedBook()));
  const sale = items.find((item) => item.id === `sale:${CANONICAL_REFERENCE}`);
  assert.ok(sale);
  assert.equal(sale.title, "Sale amount ready to claim");
  assert.equal(sale.href, `/originate/${CANONICAL_REFERENCE}`);
  assert.equal(
    items.some((item) => item.kind === "rent_claim"),
    false,
  );
});

test("claiming sale proceeds removes that notification", () => {
  const claimed = normalizeBook(
    applyLandlordClaim(
      getSeedBook(),
      CANONICAL_REFERENCE,
      "0xDEMO0000LANDLORD00PAYOUT00000000000001",
      "2026-08-21T12:00:00.000Z",
    ),
  );
  const items = dashboardNotifications(claimed);
  assert.equal(
    items.some((item) => item.id === `sale:${CANONICAL_REFERENCE}`),
    false,
  );
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
    originate: 1,
    portfolio: 1,
  });
  assert.equal(visibleNotifications(items, [`sale:${CANONICAL_REFERENCE}`]).length, 1);
});
