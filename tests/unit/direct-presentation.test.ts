import assert from "node:assert/strict";
import test from "node:test";

import { appHref } from "@/lib/pay/config";
import {
  canRecordCollection,
  formatDayMonthYear,
  onTimePercent,
  payerPayee,
  rentToIncomeBand,
} from "@/lib/rent-advance/helpers";
import { getSeedBook } from "@/lib/rent-advance/seed";
import type { OfferStatus } from "@/lib/rent-advance/types";

test("MRA-001 rent-to-income is Under 35%", () => {
  assert.equal(rentToIncomeBand(180000, 540000), "Under 35%");
});

test("on-time percent treats zero late months as 100%", () => {
  assert.equal(onTimePercent(0), 100);
  assert.equal(onTimePercent(2), 83);
});

test("due date formats as 30 Sep 2026", () => {
  assert.equal(formatDayMonthYear("2026-09-30"), "30 Sep 2026");
});

test("Option A payee is the property manager", () => {
  const offer = getSeedBook().offers.find((row) => row.reference === "MRA-001");
  assert.ok(offer);
  assert.equal(offer.paymentOption, "A");
  assert.equal(payerPayee(offer), "Property Management B.V.");
});

test("collections are only recorded on live, collecting, or defaulted offers", () => {
  for (const status of [
    "draft",
    "under_review",
    "funding",
    "live",
    "collecting",
    "closed",
    "default",
  ] as OfferStatus[]) {
    assert.equal(
      canRecordCollection(status),
      status === "live" || status === "collecting" || status === "default",
    );
  }
});

test("external app URLs open externally and invalid URLs stay internal", () => {
  assert.deepEqual(appHref("https://pay.example.com/rent", "/pay"), {
    href: "https://pay.example.com/rent",
    external: true,
  });
  assert.deepEqual(appHref("https://direct.example.com", "/originate"), {
    href: "https://direct.example.com",
    external: true,
  });
  assert.deepEqual(appHref(undefined, "/pay"), {
    href: "/pay",
    external: false,
  });
  assert.deepEqual(appHref("", "/originate"), {
    href: "/originate",
    external: false,
  });
  assert.deepEqual(appHref("   ", "/pay"), {
    href: "/pay",
    external: false,
  });
  assert.deepEqual(appHref("/pay", "/pay"), {
    href: "/pay",
    external: false,
  });
  assert.deepEqual(appHref("http://insecure.example.com", "/pay"), {
    href: "/pay",
    external: false,
  });
  assert.deepEqual(appHref("javascript:alert(1)", "/pay"), {
    href: "/pay",
    external: false,
  });
});
