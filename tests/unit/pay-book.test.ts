import assert from "node:assert/strict";
import test from "node:test";

import { usdcAtomicFromXcgCents } from "@/lib/rent-advance/money";
import { bookTotals } from "@/lib/rent-advance/helpers";
import { CANONICAL_PAYMENT_REQUEST_ID, collectionIdFor } from "@/lib/rent-advance/ids";
import {
  applyPaymentOutcome,
  currentRenterPaymentRequest,
  earlierOpenPaymentRequest,
  normalizeBook,
} from "@/lib/rent-advance/payment-apply";
import { getSeedBook } from "@/lib/rent-advance/seed";

test("MRA-001 XCG 1800 becomes 1005586592 atomic USDC", () => {
  const atomic = usdcAtomicFromXcgCents(180000);
  assert.equal(atomic, 1005586592);
  assert.equal((atomic / 1_000_000).toFixed(2), "1005.59");
});

test("draft and unfunded offers are excluded from advanced totals", () => {
  const book = getSeedBook();
  const mra001 = book.offers.find((offer) => offer.reference === "MRA-001");
  const funding = book.offers.find((offer) => offer.reference === "MRA-002");
  const review = book.offers.find((offer) => offer.reference === "MRA-004");
  const draft = book.offers.find((offer) => offer.reference === "MRA-006");

  assert.ok(mra001 && funding && review && draft);
  assert.equal(review.status, "under_review");
  assert.equal(review.fundedCents, 0);
  assert.equal(draft.status, "draft");
  assert.equal(draft.fundedCents, 0);

  const totals = bookTotals({
    ...book,
    offers: [mra001, funding, review, draft],
  });

  assert.equal(
    totals.totalAdvanced,
    mra001.purchasePriceCents + funding.purchasePriceCents,
  );
  assert.ok(totals.totalAdvanced < totals.totalAdvanced + draft.purchasePriceCents);
  assert.ok(totals.totalAdvanced < totals.totalAdvanced + review.purchasePriceCents);
});

test("confirming the same payment cannot duplicate collection or distribution", () => {
  const book = getSeedBook();
  const first = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  const second = applyPaymentOutcome(
    first,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:01:00.000Z",
  );
  const third = applyPaymentOutcome(
    second,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:02:00.000Z",
  );

  const collectionId = collectionIdFor("MRA-001", 1);
  for (const next of [first, second, third]) {
    const offer = next.offers.find((row) => row.reference === "MRA-001");
    const request = next.paymentRequests?.find(
      (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
    );
    const receivable = offer?.receivables.find((row) => row.n === 1);
    assert.ok(offer && request && receivable);
    assert.equal(request.status, "confirmed");
    assert.equal(receivable.status, "received");
    assert.equal(
      offer.collections.filter((row) => row.receivableN === 1).length,
      1,
    );
    assert.equal(
      (next.distributions ?? []).filter((row) => row.collectionId === collectionId)
        .length,
      1,
    );
  }
});

test("later month cannot confirm while an earlier month is still open", () => {
  const book = getSeedBook();
  const later = (book.paymentRequests ?? [])
    .filter((row) => row.offerReference === "MRA-001")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[1];

  assert.ok(later);
  const earlier = earlierOpenPaymentRequest(book, later.paymentRequestId);
  assert.equal(earlier?.paymentRequestId, CANONICAL_PAYMENT_REQUEST_ID);
  assert.throws(
    () => applyPaymentOutcome(book, later.paymentRequestId, "confirmed"),
    /first/,
  );
});

test("draft MRA-001 does not mint payment requests", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === "MRA-001");
  assert.ok(offer);
  offer.status = "draft";

  const next = normalizeBook(book);
  assert.deepEqual(
    (next.paymentRequests ?? []).filter((row) => row.offerReference === "MRA-001"),
    [],
  );
});

test("next renter payment is the earliest unpaid request", () => {
  const book = getSeedBook();
  assert.equal(
    currentRenterPaymentRequest(book)?.paymentRequestId,
    CANONICAL_PAYMENT_REQUEST_ID,
  );

  const afterSeptember = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  assert.equal(
    currentRenterPaymentRequest(afterSeptember)?.periodLabel,
    "October 2026",
  );
});
