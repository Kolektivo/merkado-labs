"use server";

import { revalidatePath } from "next/cache";

import { canPersistPayNetwork, parseExactPayNetworkKey } from "@/lib/pay/networks";
import { verifyLivePayment } from "@/lib/pay/verify";
import { PAYMENT_RAIL_MODE } from "@/lib/pay/mode";
import { assertDemoUnlocked } from "@/lib/demo-gate-server";
import { assertDistinctOfficers, assertReleasesDistinct } from "@/lib/rent-advance/dual-control";
import { buildScheduledReceivables, canRecordCollection } from "@/lib/rent-advance/helpers";
import { RENTER_ACCOUNT_ID } from "@/lib/rent-advance/ids";
import {
  applyOpsCollection,
  applyPaymentOutcome,
  cryptoConfigFor,
  type PaymentMockOutcome,
  type PaymentOutcomeMeta,
} from "@/lib/rent-advance/payment-apply";
import { priceOrBlock } from "@/lib/rent-advance/pricing";
import { getSeedBook } from "@/lib/rent-advance/seed";
import { loadBook, resetBook, saveBook, updateOffer } from "@/lib/rent-advance/store";
import type { Offer, OfferStatus } from "@/lib/rent-advance/types";

function refresh() {
  revalidatePath("/", "layout");
}

export async function resetDemoAction() {
  await resetBook();
  refresh();
}

export async function setPayNetworkAction(networkKey: string) {
  const key = parseExactPayNetworkKey(networkKey);
  if (!key || !canPersistPayNetwork(key)) {
    throw new Error("That payment network is not available.");
  }
  const book = await loadBook();
  book.cryptoConfig = cryptoConfigFor(key, book.cryptoConfig);
  await saveBook(book);
  refresh();
}

export async function setOfferStatusAction(reference: string, status: OfferStatus) {
  await updateOffer(reference, (offer) => ({
    ...offer,
    status,
    events: [
      {
        id: `ev-${reference}-${Date.now()}`,
        at: new Date().toISOString(),
        title: `Status set to ${status.replaceAll("_", " ")}`,
        detail: "Demo action",
        actor: "D. Martina",
      },
      ...offer.events,
    ],
  }));
  refresh();
}

export async function approveOfferAction(reference: string, actorId: string) {
  if (actorId !== "act-girigoria") {
    throw new Error("Only R. Girigoria can approve this offer in the walkthrough.");
  }
  await updateOffer(reference, (offer) => ({
    ...offer,
    status: offer.status === "under_review" ? "funding" : offer.status,
    events: [
      {
        id: `ev-${reference}-approve-${Date.now()}`,
        at: new Date().toISOString(),
        title: "Approved",
        detail: "R. Girigoria · independent approver",
        actor: "R. Girigoria",
      },
      ...offer.events,
    ],
  }));
  refresh();
}

export async function recordCollectionAction(
  reference: string,
  receivableN: number,
) {
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  if (!canRecordCollection(offer.status)) {
    throw new Error(
      "Collections can be recorded only on live, collecting, or defaulted offers.",
    );
  }
  await saveBook(applyOpsCollection(book, reference, receivableN));
  refresh();
}

export async function confirmPaymentAction(
  paymentRequestId: string,
  outcome: PaymentMockOutcome = "confirmed",
  meta?: PaymentOutcomeMeta,
) {
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== RENTER_ACCOUNT_ID) {
    throw new Error("Payment request not found.");
  }
  const next = applyPaymentOutcome(book, paymentRequestId, outcome, new Date().toISOString(), meta);
  await saveBook(next);
  refresh();
}

/**
 * Server-side live confirmation. Verifies the on-chain receipt, USDC
 * transfer, and confirmation depth before confirming the book through the
 * existing idempotent helper. Only usable when the rail is live.
 */
export async function verifyLivePaymentAction(paymentRequestId: string, txHash: string) {
  if (PAYMENT_RAIL_MODE !== "live") {
    throw new Error("Live payment verification is not enabled.");
  }
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== RENTER_ACCOUNT_ID) {
    throw new Error("Payment request not found.");
  }
  const config = book.cryptoConfig;
  if (!config) {
    throw new Error("Payment configuration is missing.");
  }
  const result = await verifyLivePayment({ txHash, config, request });
  if (!result.verified) {
    return result;
  }
  const next = applyPaymentOutcome(
    book,
    paymentRequestId,
    "confirmed",
    new Date().toISOString(),
    { txHash },
  );
  await saveBook(next);
  refresh();
  return result;
}

export async function releaseCollectionAction(input: {
  reference: string;
  collectionId: string;
  instructorId: string;
  signatoryId: string;
}) {
  assertDistinctOfficers(input.instructorId, input.signatoryId);
  await updateOffer(input.reference, (offer) => {
    const collection = offer.collections.find((row) => row.id === input.collectionId);
    if (!collection) throw new Error("Collection not found.");
    collection.status = "released";
    return {
      ...offer,
      releases: [
        {
          id: `rel-${Date.now()}`,
          collectionId: input.collectionId,
          instructorId: input.instructorId,
          signatoryId: input.signatoryId,
          status: "released",
        },
        ...offer.releases,
      ],
      events: [
        {
          id: `ev-${input.reference}-rel-${Date.now()}`,
          at: new Date().toISOString(),
          title: "Collection released under dual control",
          detail: "Instructing officer and foundation signatory are different people",
          actor: "A. Sambo",
        },
        ...offer.events,
      ],
    };
  });
  refresh();
}

export async function closeChecklistItemAction(id: string, evidence: string) {
  const book = await loadBook();
  book.checklist = book.checklist.map((item) =>
    item.id === id ? { ...item, state: "closed", evidence } : item,
  );
  await saveBook(book);
  refresh();
}

export async function submitOfferForReviewAction(reference: string) {
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  if (offer.status !== "draft") {
    throw new Error("Only a draft can be submitted for review.");
  }
  if (offer.months !== 6) {
    throw new Error("Only the six-month term is approved for origination.");
  }
  priceOrBlock({
    monthlyRentCents: offer.monthlyRentCents,
    months: offer.months,
    feeRate: offer.feeRate,
    relatedParty: offer.relatedParty,
  });
  await updateOffer(reference, (current) => ({
    ...current,
    status: "under_review",
    nextAction: "Independent approval",
    events: [
      {
        id: `ev-${reference}-submit-${Date.now()}`,
        at: new Date().toISOString(),
        title: "Submitted for review",
        detail: "Draft sent for independent approval before funding.",
        actor: "D. Martina",
      },
      ...current.events,
    ],
  }));
  refresh();
}

export async function saveDraftOfferAction(offer: Offer) {
  if (offer.reference === "MRA-001") {
    throw new Error("MRA-001 is the locked reference deal. Create a new draft instead.");
  }
  if (offer.months !== 6) {
    throw new Error("Only the six-month term is approved for origination.");
  }
  priceOrBlock({
    monthlyRentCents: offer.monthlyRentCents,
    months: offer.months,
    feeRate: offer.feeRate,
    relatedParty: offer.relatedParty,
  });
  assertReleasesDistinct(offer.releases);
  const book = await loadBook();
  const toSave = { ...offer, status: "draft" as const };
  const index = book.offers.findIndex((row) => row.reference === toSave.reference);
  if (index === -1) book.offers.unshift(toSave);
  else book.offers[index] = toSave;
  if (toSave.tenant.id && !book.assignedTenancies.includes(toSave.tenant.id)) {
    book.assignedTenancies.push(toSave.tenant.id);
  }
  await saveBook(book);
  refresh();
}

export async function payerPayNowAction(paymentRequestId: string) {
  return confirmPaymentAction(paymentRequestId, "confirmed");
}

export async function nextDraftReference(): Promise<string> {
  const book = await loadBook();
  const numbers = book.offers.map((offer) => Number(offer.reference.replace("MRA-", "")));
  const next = Math.max(0, ...numbers) + 1;
  return `MRA-${String(next).padStart(3, "0")}`;
}

export async function seedOfferTemplate(): Promise<Offer> {
  await assertDemoUnlocked();
  const book = getSeedBook();
  const canonical = book.offers[0];
  const reference = await nextDraftReference();
  return {
    ...structuredClone(canonical),
    offerId: `offer-${reference.toLowerCase()}`,
    settlementTransactionId: null,
    reference,
    status: "draft",
    fundedCents: 0,
    collections: [],
    releases: [],
    publishedAt: null,
    tenant: {
      ...canonical.tenant,
      id: `tn-${reference.toLowerCase()}`,
    },
    receivables: buildScheduledReceivables(
      reference,
      canonical.monthlyRentCents,
      canonical.months,
    ),
    nextAction: "Finish draft",
    events: [
      {
        id: `ev-${reference}-new`,
        at: new Date().toISOString(),
        title: "Draft created",
        detail: "Copied from the MRA-001 reference shape",
        actor: "D. Martina",
      },
    ],
  };
}
