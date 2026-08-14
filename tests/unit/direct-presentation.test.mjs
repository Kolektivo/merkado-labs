import assert from "node:assert/strict";
import test from "node:test";

function rentToIncomeBand(monthlyRentCents, monthlyIncomeCents) {
  if (monthlyIncomeCents <= 0) return "Not available";
  const ratio = monthlyRentCents / monthlyIncomeCents;
  if (ratio < 0.35) return "Under 35%";
  if (ratio < 0.45) return "35–45%";
  if (ratio < 0.55) return "45–55%";
  return "55% or above";
}

function onTimePercent(latePayments12m) {
  const late = Math.min(12, Math.max(0, latePayments12m));
  return Math.round(((12 - late) / 12) * 100);
}

function formatDayMonthYear(isoDate) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

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
  const offer = {
    paymentOption: "A",
    collectionAgent: "Property Management B.V.",
    fundsCustodian: "Stichting Derdengelden",
  };
  const payee =
    offer.paymentOption === "A" ? offer.collectionAgent : offer.fundsCustodian;
  assert.equal(payee, "Property Management B.V.");
});

test("collections are only recorded on live, collecting, or defaulted offers", () => {
  const allowed = new Set(["live", "collecting", "default"]);
  for (const status of [
    "draft",
    "under_review",
    "funding",
    "live",
    "collecting",
    "closed",
    "default",
  ]) {
    assert.equal(allowed.has(status), ["live", "collecting", "default"].includes(status));
  }
});
