"use server";

import { revalidatePath } from "next/cache";

import { assertDistinctOfficers, assertReleasesDistinct } from "@/lib/rent-advance/dual-control";
import { canRecordCollection } from "@/lib/rent-advance/helpers";
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
  daysVariance = 0,
) {
  await updateOffer(reference, (offer) => {
    if (!canRecordCollection(offer.status)) {
      throw new Error(
        "Collections can be recorded only on live, collecting, or defaulted offers.",
      );
    }
    const receivable = offer.receivables.find((row) => row.n === receivableN);
    if (!receivable) throw new Error("Receivable not found.");
    receivable.status = "received";
    const collection = {
      id: `col-${reference}-${receivableN}-${Date.now()}`,
      receivableN,
      receivedOn: new Date().toISOString().slice(0, 10),
      amountCents: receivable.amountCents,
      daysVariance,
      status: "received" as const,
    };
    return {
      ...offer,
      collections: [collection, ...offer.collections],
      events: [
        {
          id: `ev-${reference}-col-${Date.now()}`,
          at: new Date().toISOString(),
          title: `Collection received · month ${receivableN}`,
          detail: "Awaiting dual-control release",
          actor: "System",
        },
        ...offer.events,
      ],
    };
  });
  refresh();
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

export async function saveDraftOfferAction(offer: Offer) {
  priceOrBlock({
    monthlyRentCents: offer.monthlyRentCents,
    months: offer.months,
    feeRate: offer.feeRate,
    relatedParty: offer.relatedParty,
  });
  assertReleasesDistinct(offer.releases);
  const book = await loadBook();
  const index = book.offers.findIndex((row) => row.reference === offer.reference);
  if (index === -1) book.offers.unshift(offer);
  else book.offers[index] = offer;
  if (offer.tenant.id && !book.assignedTenancies.includes(offer.tenant.id)) {
    book.assignedTenancies.push(offer.tenant.id);
  }
  await saveBook(book);
  refresh();
}

export async function payerPayNowAction(reference: string) {
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const next = offer.receivables.find((row) => row.status === "scheduled");
  if (!next) throw new Error("No scheduled receivable remains.");
  await recordCollectionAction(reference, next.n, 0);
}

export async function nextDraftReference(): Promise<string> {
  const book = await loadBook();
  const numbers = book.offers.map((offer) => Number(offer.reference.replace("MRA-", "")));
  const next = Math.max(0, ...numbers) + 1;
  return `MRA-${String(next).padStart(3, "0")}`;
}

export async function seedOfferTemplate(): Promise<Offer> {
  const book = getSeedBook();
  const canonical = book.offers[0];
  const reference = await nextDraftReference();
  return {
    ...structuredClone(canonical),
    reference,
    status: "draft",
    fundedCents: 0,
    collections: [],
    releases: [],
    publishedAt: null,
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
