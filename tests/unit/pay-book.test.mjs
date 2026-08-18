import assert from "node:assert/strict";
import test from "node:test";

function roundHalfUp(value) {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
}

function usdcAtomicFromXcgCents(cents) {
  return roundHalfUp((cents * 1_000_000) / 179);
}

function collectionId(reference, n) {
  return `col-${reference}-${n}`;
}

function applyConfirmed(book, paymentRequestId) {
  const request = book.paymentRequests.find((row) => row.paymentRequestId === paymentRequestId);
  if (request.status === "confirmed") return book;
  request.status = "confirmed";
  const offer = book.offers.find((row) => row.reference === request.offerReference);
  const receivable = offer.receivables.find((row) => row.n === request.receivableN);
  receivable.status = "received";
  const id = collectionId(offer.reference, request.receivableN);
  if (!offer.collections.some((row) => row.id === id)) {
    offer.collections.push({ id, receivableN: request.receivableN, amountCents: receivable.amountCents });
  }
  if (!book.distributions.some((row) => row.collectionId === id)) {
    book.distributions.push({
      distributionId: `dist-${offer.reference.toLowerCase()}-${request.receivableN}`,
      collectionId: id,
      amountCents: receivable.amountCents,
    });
  }
  return book;
}

test("MRA-001 XCG 1800 becomes 1005586592 atomic USDC", () => {
  const atomic = usdcAtomicFromXcgCents(180000);
  assert.equal(atomic, 1005586592);
  assert.equal((atomic / 1_000_000).toFixed(2), "1005.59");
});

test("draft and unfunded offers are excluded from advanced totals", () => {
  const offers = [
    { status: "live", fundedCents: 1050000, purchasePriceCents: 1020600 },
    { status: "draft", fundedCents: 0, purchasePriceCents: 1134000 },
    { status: "under_review", fundedCents: 0, purchasePriceCents: 2211300 },
    { status: "funding", fundedCents: 480000, purchasePriceCents: 1474200 },
  ];
  const counted = offers.filter(
    (offer) => offer.status !== "draft" && offer.status !== "under_review" && offer.fundedCents > 0,
  );
  const total = counted.reduce((sum, offer) => sum + offer.purchasePriceCents, 0);
  assert.equal(total, 1020600 + 1474200);
});

test("confirming the same payment cannot duplicate collection or distribution", () => {
  const book = {
    offers: [
      {
        reference: "MRA-001",
        receivables: [{ n: 1, status: "scheduled", amountCents: 180000 }],
        collections: [],
      },
    ],
    paymentRequests: [
      {
        paymentRequestId: "payreq-mra-001-202609",
        offerReference: "MRA-001",
        receivableN: 1,
        status: "due",
      },
    ],
    distributions: [],
  };

  applyConfirmed(book, "payreq-mra-001-202609");
  applyConfirmed(book, "payreq-mra-001-202609");
  applyConfirmed(book, "payreq-mra-001-202609");

  assert.equal(book.offers[0].collections.length, 1);
  assert.equal(book.distributions.length, 1);
  assert.equal(book.paymentRequests[0].status, "confirmed");
  assert.equal(book.offers[0].receivables[0].status, "received");
});

test("later month cannot confirm while an earlier month is still open", () => {
  const open = new Set(["due", "initiated", "pending", "failed", "partial", "overdue"]);
  const requests = [
    { paymentRequestId: "payreq-mra-001-202610", accountId: "acc-renter-001", offerReference: "MRA-001", dueDate: "2026-10-28", periodLabel: "October 2026", status: "due" },
    { paymentRequestId: "payreq-mra-001-202611", accountId: "acc-renter-001", offerReference: "MRA-001", dueDate: "2026-11-28", periodLabel: "November 2026", status: "due" },
  ];
  const request = requests.find((row) => row.paymentRequestId === "payreq-mra-001-202611");
  const earlier = requests
    .filter(
      (row) =>
        row.accountId === request.accountId &&
        row.offerReference === request.offerReference &&
        row.dueDate < request.dueDate &&
        open.has(row.status),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  assert.equal(earlier.paymentRequestId, "payreq-mra-001-202610");
});

test("draft MRA-001 does not mint payment requests", () => {
  const offers = [
    { reference: "MRA-001", status: "draft", receivables: [{ n: 1 }] },
    { reference: "MRA-007", status: "draft", receivables: [{ n: 1 }] },
  ];
  const minted = [];
  for (const offer of offers) {
    if (offer.reference !== "MRA-001") continue;
    if (offer.status === "draft" || offer.status === "under_review") continue;
    minted.push(offer.reference);
  }
  assert.deepEqual(minted, []);
});

test("next renter payment is the earliest unpaid request", () => {
  const open = new Set(["due", "initiated", "pending", "failed", "partial", "overdue"]);
  const requests = [
    { paymentRequestId: "payreq-mra-001-202609", accountId: "acc-renter-001", dueDate: "2026-09-28", status: "confirmed" },
    { paymentRequestId: "payreq-mra-001-202610", accountId: "acc-renter-001", dueDate: "2026-10-28", status: "due" },
    { paymentRequestId: "payreq-mra-001-202611", accountId: "acc-renter-001", dueDate: "2026-11-28", status: "due" },
  ];
  const next = requests
    .filter((row) => row.accountId === "acc-renter-001")
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .find((row) => open.has(row.status));
  assert.equal(next?.paymentRequestId, "payreq-mra-001-202610");
});
