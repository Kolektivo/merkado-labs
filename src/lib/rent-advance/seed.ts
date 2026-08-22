import { DEMO_RENTER_PROFILE } from "@/lib/demo-account-profile";
import { defaultLandlordPayout } from "@/lib/rent-advance/custody";
import { ACTORS } from "@/lib/rent-advance/actors";
import {
  DEMO_LANDLORD_EOA,
  offerIdFromReference,
  receivableIdFor,
} from "@/lib/rent-advance/ids";
import { normalizeBook } from "@/lib/rent-advance/payment-apply";
import { holderSchedule, priceQuote } from "@/lib/rent-advance/pricing";
import type {
  ChecklistItem,
  Comparable,
  DemoBook,
  Offer,
  OfferStatus,
  OpenQuestion,
  PackDocument,
  PayerFile,
  PropertyRecord,
  Receivable,
} from "@/lib/rent-advance/types";

const COMPARABLES: Comparable[] = [
  {
    id: "cmp-1",
    address: "Kaya Seru Cueba 11, Sun Set Heights",
    district: "Sun Set Heights",
    rentCents: 245000,
    bedrooms: 2,
    interiorM2: 96,
    daysListed: 21,
    distanceKm: 0.3,
  },
  {
    id: "cmp-2",
    address: "Kaya Flamboyan 22, Sun Set Heights",
    district: "Sun Set Heights",
    rentCents: 230000,
    bedrooms: 2,
    interiorM2: 88,
    daysListed: 18,
    distanceKm: 0.6,
  },
  {
    id: "cmp-3",
    address: "Van Engelenweg 4, Emmastad",
    district: "Emmastad",
    rentCents: 260000,
    bedrooms: 3,
    interiorM2: 104,
    daysListed: 31,
    distanceKm: 1.4,
  },
  {
    id: "cmp-4",
    address: "Kaya Seru 19, Sun Set Heights",
    district: "Sun Set Heights",
    rentCents: 225000,
    bedrooms: 2,
    interiorM2: 82,
    daysListed: 24,
    distanceKm: 0.9,
  },
  {
    id: "cmp-5",
    address: "Schottegatweg 210, Kwartje",
    district: "Kwartje",
    rentCents: 195000,
    bedrooms: 2,
    interiorM2: 76,
    daysListed: 47,
    distanceKm: 2.2,
  },
];

function monthsFrom(start: string, count: number, endDay = 28): string[] {
  const date = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + index + 1, 0);
    const day = Math.min(endDay, next.getUTCDate());
    next.setUTCDate(day);
    return next.toISOString().slice(0, 10);
  });
}

function receivables(
  reference: string,
  rent: number,
  count: number,
  start = "2026-09-01",
): Receivable[] {
  return monthsFrom(start, count).map((dueDate, index) => ({
    n: index + 1,
    dueDate,
    amountCents: rent,
    status: "scheduled" as const,
    receivableId: receivableIdFor(reference, index + 1),
  }));
}

function docs(related: boolean): PackDocument[] {
  return [
    {
      id: "doc-b",
      code: "B",
      title: "Receivables purchase agreement",
      state: "generated",
      detail: "Generated from template · koopovereenkomst inzake huurvorderingen",
    },
    {
      id: "doc-c",
      code: "C",
      title: "Deed of assignment (akte van cessie)",
      state: "generated",
      detail: "Six monthly rent claims from an existing lease",
    },
    {
      id: "doc-d",
      code: "D",
      title: "Notice of assignment to payer",
      state: "generated",
      detail: "EN · NL · PAP · Option A",
    },
    {
      id: "doc-e",
      code: "E",
      title: "Payer acknowledgement",
      state: "pending",
      detail: "Awaiting signature",
    },
    {
      id: "doc-f",
      code: "F",
      title: "Related-party disclosure",
      state: related ? "generated" : "not_required",
      detail: related
        ? "Family of EcoLabs beneficial owner · +25 bp"
        : "Not required",
    },
    {
      id: "doc-j",
      code: "J",
      title: "Risk disclosure for holders",
      state: "generated",
      detail: "Includes single-payer concentration",
    },
  ];
}

function makePayer(partial: Partial<PayerFile> & Pick<PayerFile, "id" | "fullName" | "initials">): PayerFile {
  return {
    contact: "on file",
    employmentStatus: "Permanent",
    employer: "On file · admin only",
    employedSince: "2021-03-01",
    household: "2 adults",
    monthlyIncomeCents: 540000,
    monthsEvidenced: 8,
    latePayments12m: 0,
    savingsMonths: 2.1,
    scores: {
      paymentHistory: 40,
      rentToIncome: 23,
      employment: 19,
      savings: 13,
      total: 95,
    },
    ...partial,
  };
}

function makeProperty(
  partial: Partial<PropertyRecord> & Pick<PropertyRecord, "id" | "address" | "district" | "type" | "summary">,
): PropertyRecord {
  return {
    cbsBuurtCode: "CW-DEMO",
    bedrooms: 2,
    bathrooms: 1,
    interiorM2: 94,
    yearBuilt: 2008,
    condition: "Good",
    features: ["AC", "parking", "solar"],
    cadastralReference: null,
    mortgagePresent: false,
    mortgagee: null,
    photoLabels: ["cover · exterior", "living", "kitchen", "yard"],
    ...partial,
  };
}

function quoteFor(rent: number, months: number, related: boolean, passport: number, payer: number) {
  return priceQuote({
    monthlyRentCents: rent,
    months,
    passportScore: passport,
    payerScore: payer,
    relatedParty: related,
  });
}

function makeOffer(input: {
  reference: string;
  status: OfferStatus;
  nextAction: string;
  relatedParty?: boolean;
  relatedPartyNote?: string | null;
  months: number;
  rent: number;
  passportTotal: number;
  payerScore: number;
  property: PropertyRecord;
  payer: PayerFile;
  agency: string;
  fundedCents?: number;
  offeringCents?: number;
  receivedCount?: number;
  missedCount?: number;
  createdAt?: string;
  marketRentCents?: number;
}): Offer {
  const related = Boolean(input.relatedParty);
  const quote = quoteFor(
    input.rent,
    input.months,
    related,
    input.passportTotal,
    input.payerScore,
  );
  const units = input.offeringCents != null ? 1 : 1000;
  const subscriptionPriceCents =
    input.offeringCents != null ? input.offeringCents : 1050;
  const offeringCents = input.offeringCents ?? units * subscriptionPriceCents;
  const schedule = holderSchedule({
    offeringCents,
    purchasePriceCents: quote.purchasePriceCents,
    monthlyCollectionCents: input.rent,
    months: input.months,
    units,
  });
  const rows = receivables(input.reference, input.rent, input.months);
  const publishedAt =
    input.status === "draft" || input.status === "under_review"
      ? null
      : "2026-08-28T10:05:00-04:00";
  const receivedCount = input.receivedCount ?? 0;
  const missedCount = input.missedCount ?? 0;
  rows.forEach((row, index) => {
    if (index < receivedCount) row.status = "received";
    else if (index < receivedCount + missedCount) row.status = "missed";
  });

  return {
    offerId: offerIdFromReference(input.reference),
    settlementTransactionId: null,
    reference: input.reference,
    status: input.status,
    seriesDisplayName: "Merkado Direct · Rent Advance",
    createdAt: input.createdAt ?? "2026-08-13T09:44:00-04:00",
    publishedAt,
    expiresAt: null,
    nextAction: input.nextAction,
    payout: defaultLandlordPayout({
      method: "crypto",
      cryptoAddress: DEMO_LANDLORD_EOA,
    }),
    relatedParty: related,
    relatedPartyNote: input.relatedPartyNote ?? null,
    paymentOption: "A",
    landlord: {
      id: `ll-${input.reference}`,
      name: "Demo landlord",
      kind: "natural_person",
      relatedParty: related,
      relatedPartyNote: input.relatedPartyNote ?? undefined,
    },
    tenant: input.payer,
    purchaserName: "Merkado Receivables I B.V.",
    servicerName: "EcoLabs B.V.",
    collectionAgent: "Property Management B.V.",
    fundsCustodian: "Stichting Derdengelden",
    property: input.property,
    lease: {
      id: `lease-${input.reference}`,
      startDate: "2025-08-01",
      expiryDate: "2027-07-31",
      monthsRemaining: 11,
      noticePeriod: "1 month",
      monthlyRentCents: input.rent,
      depositCents: input.rent,
      depositHeldBy: "landlord",
      rentIncludes: "Water not included",
      occupancySince: "2025-08-01",
    },
    passport: {
      rentVsMarket: 40,
      marketDepth: 20,
      condition: 15,
      accessibility: 14,
      total: input.passportTotal,
    },
    marketRentCents: input.marketRentCents ?? Math.round(input.rent / 0.75),
    estimatedVoidWeeks: 4,
    comparables: COMPARABLES,
    months: input.months,
    monthlyRentCents: input.rent,
    feeRate: quote.feeRate,
    baseFeeRate: quote.baseFeeRate,
    relatedPartyPremiumBps: related ? 25 : 0,
    feeCents: quote.feeCents,
    purchasePriceCents: quote.purchasePriceCents,
    advanceRate: quote.advanceRate,
    monthlyIrr: quote.monthlyIrr,
    nominalAnnualised: quote.nominalAnnualised,
    effectiveAnnualised: quote.effectiveAnnualised,
    unitsIssued: units,
    subscriptionPriceCents,
    offeringCents,
    fundedCents: input.fundedCents ?? 0,
    originationSpreadCents: schedule.originationSpreadCents,
    receivables: rows,
    collections: rows
      .filter((row) => row.status === "received")
      .map((row) => ({
        id: `col-${input.reference}-${row.n}`,
        receivableN: row.n,
        receivedOn: row.dueDate,
        amountCents: row.amountCents,
        daysVariance: 0,
        status: "reconciled" as const,
      })),
    documents: docs(related),
    events: [
      {
        id: `ev-${input.reference}-1`,
        at: input.createdAt ?? "2026-08-13T09:44:00-04:00",
        title: "Offer created",
        detail: `D. Martina · Listing Score ${input.passportTotal}`,
        actor: "D. Martina",
      },
    ],
    holders:
      (input.fundedCents ?? 0) > 0
        ? [
            {
              holderId: "act-purchaser",
              holderName: "Merkado Receivables I B.V.",
              units,
              contributedCents: input.fundedCents ?? 0,
              receivedCents: receivedCount * input.rent,
              anonymised: true,
            },
          ]
        : [],
    releases: [],
    agency: input.agency,
  };
}

const CHECKLIST: ChecklistItem[] = [
  {
    id: "s0-1",
    stage: 0,
    title: "DPR regulatory opinion obtained",
    evidence: "Blocks M.1.2 · no third-party subscription until received",
    owner: "External counsel",
    state: "open",
    blocks: "All third-party holder activity",
  },
  {
    id: "s0-2",
    stage: 0,
    title: "Stichting statuten reviewed and object confirmed",
    evidence: "statuten-derdengelden-v3.pdf",
    owner: "Legal",
    state: "closed",
  },
  {
    id: "s0-3",
    stage: 0,
    title: "Stichting board composition confirmed adequate",
    evidence: "board-resolution-2026-07.pdf",
    owner: "Legal",
    state: "closed",
  },
  {
    id: "s0-4",
    stage: 0,
    title: "Purchaser B.V. incorporated, banked, sub-ledger opened",
    evidence: "Merkado Receivables I B.V. · MCB account · sub-ledger MRA-001",
    owner: "Finance",
    state: "closed",
  },
  {
    id: "s0-5",
    stage: 0,
    title: "Property management agreement in place at market rate, independent of any advance",
    evidence: "pm-agreement-2024.pdf · same rate with or without an advance",
    owner: "Operations",
    state: "closed",
  },
  {
    id: "s0-6",
    stage: 0,
    title: "AML/CFT programme documented and adopted",
    evidence: "aml-programme-v2.pdf · adopted 12 Jun 2026",
    owner: "Compliance",
    state: "closed",
  },
  {
    id: "s0-7",
    stage: 0,
    title: "Independent approver appointed for related-party deals",
    evidence: "Appointment letter outstanding",
    owner: "Governance",
    state: "open",
    blocks: "Related-party credit approval",
  },
  {
    id: "s1-mortgage",
    stage: 1,
    title: "Mortgaged property without lender acknowledgement",
    evidence: "The mortgagee’s claim on rent ranks ahead of ours",
    owner: "Underwriting",
    state: "open",
    hardStop: true,
  },
  {
    id: "s1-term",
    stage: 1,
    title: "Fewer than 6 months remaining on the tenancy",
    evidence: "The term can never run past the lease",
    owner: "Underwriting",
    state: "open",
    hardStop: true,
  },
  {
    id: "s1-history",
    stage: 1,
    title: "Fewer than 6 months of payment history evidenced",
    evidence: "Ledger or statements, independently sourced",
    owner: "Underwriting",
    state: "open",
    hardStop: true,
  },
  {
    id: "s1-dup",
    stage: 1,
    title: "Duplicate-assignment check against the assigned-tenancies register",
    evidence: "Run at underwriting and again before notice",
    owner: "Operations",
    state: "closed",
  },
  {
    id: "s1-cap",
    stage: 1,
    title: "Effective annualised cost above 24%",
    evidence: "Enforced in the pricing engine, not the interface",
    owner: "Pricing engine",
    state: "closed",
    hardStop: true,
  },
  {
    id: "s1-approver",
    stage: 1,
    title: "Credit approval by the independent approver",
    evidence: "Mandatory on every related-party transaction",
    owner: "Governance",
    state: "open",
  },
];

const OPEN_QUESTIONS: OpenQuestion[] = [
  {
    id: "M.1.2",
    title: "Regulatory characterisation of the DPR",
    owner: "External counsel",
    blocks: "All third-party investor activity",
  },
  {
    id: "M.1.3",
    title: "Stichting Derdengelden object and board composition",
    owner: "Legal",
    blocks: "All collection flow",
  },
  {
    id: "M.1.4",
    title: "Whether holding investor funds requires licensing in its own right",
    owner: "External counsel",
    blocks: "Merkado Direct as a public surface",
  },
  {
    id: "M.2.1",
    title: "Assignment of future rent claims under Book 3 · form of deed and notification",
    owner: "External counsel",
    blocks: "Documentation template sign-off",
  },
  {
    id: "M.3.1",
    title: "Arm’s-length substantiation of the related-party pilot",
    owner: "Tax",
    blocks: "Nothing — priced 25bp above market",
  },
];

function buildOffers(): Offer[] {
  const mra001 = makeOffer({
    reference: "MRA-001",
    status: "funding",
    nextAction: "Minting automatically after approval",
    relatedParty: true,
    relatedPartyNote:
      "The landlord on this offer is a family member of an EcoLabs board member. An independent approver must sign. The fee carries a +25 bp related-party premium.",
    months: 6,
    rent: 180000,
    passportTotal: 89,
    payerScore: 95,
    agency: "Moret Real Estate",
    fundedCents: 0,
    offeringCents: 1020600,
    marketRentCents: 300000,
    property: makeProperty({
      id: "prop-001",
      address: "Kaya Seru Cueba 20",
      district: "Sun Set Heights",
      type: "House",
      summary: "2-bed house with yard and solar",
      bathrooms: 1.5,
    }),
    payer: makePayer({
      id: "tn-001",
      fullName: DEMO_RENTER_PROFILE.fullName,
      initials: DEMO_RENTER_PROFILE.payerInitials,
    }),
  });
  mra001.feeRate = 0.055;
  mra001.feeCents = 59400;
  mra001.purchasePriceCents = 1020600;
  mra001.advanceRate = 0.945;
  mra001.originationSpreadCents = 0;
  mra001.events = [
    {
      id: "ev-001-2",
      at: "2026-08-28T10:05:00-04:00",
      title: "Approved and prepared",
      detail:
        "Approved by the independent approver. The offer awaits an automatic backend mint before it can open on Marketplace.",
      actor: "System",
    },
    {
      id: "ev-001-1",
      at: "2026-08-27T16:31:00-04:00",
      title: "Approved",
      detail: "Enrique · independent approver. Payout address is locked at mint.",
      actor: "Enrique",
    },
    {
      id: "ev-001-0",
      at: "2026-08-26T09:44:00-04:00",
      title: "Offer request submitted",
      detail: "Requested from the Merkado account. No wallet was needed.",
      actor: "D. Martina",
    },
  ];

  return [
    mra001,
    makeOffer({
      reference: "MRA-010",
      status: "funding",
      nextAction: "Minting automatically after approval",
      relatedParty: false,
      months: 6,
      rent: 100,
      passportTotal: 89,
      payerScore: 95,
      agency: "Moret Real Estate",
      fundedCents: 0,
      offeringCents: quoteFor(100, 6, false, 89, 95).purchasePriceCents,
      marketRentCents: 200,
      property: makeProperty({
        id: "prop-010",
        address: "Demo address · Punda",
        district: "Punda",
        type: "Studio",
        summary: "Compact studio near the waterfront",
        bedrooms: 1,
        bathrooms: 1,
        interiorM2: 28,
        features: ["AC", "furnished"],
      }),
      payer: makePayer({
        id: "tn-010",
        fullName: DEMO_RENTER_PROFILE.fullName,
        initials: DEMO_RENTER_PROFILE.payerInitials,
        monthlyIncomeCents: 45000,
      }),
    }),
  ];
}

export function getSeedBook(): DemoBook {
  return normalizeBook({
    series: {
      platform: "merkado_direct",
      seriesType: "rent_advance",
      displayName: "Merkado Direct · Rent Advance",
      referencePrefix: "MRA",
      instrument: "Digital Participation Right",
    },
    actors: ACTORS,
    offers: buildOffers(),
    checklist: CHECKLIST,
    openQuestions: OPEN_QUESTIONS,
    assignedTenancies: ["tn-001", "tn-010"],
  });
}

/**
 * A fresh, empty demo book with no pre-created offers. The Product Lead
 * creates offers themselves via Create Offer. Keep the base actors,
 * checklist, open questions, and the demo renter account so the rest of the
 * walkthrough (approvers, payment inbox) still works.
 */
export function emptyBook(): DemoBook {
  return normalizeBook({
    series: {
      platform: "merkado_direct",
      seriesType: "rent_advance",
      displayName: "Merkado Direct · Rent Advance",
      referencePrefix: "MRA",
      instrument: "Digital Participation Right",
    },
    actors: ACTORS,
    offers: [],
    checklist: CHECKLIST,
    openQuestions: OPEN_QUESTIONS,
    assignedTenancies: [],
  });
}

export const CANONICAL_REFERENCE = "MRA-001";
export const CHEAP_OFFER_REFERENCE = "MRA-010";
export const DEMO_SEED_OFFER_REFERENCES = [CANONICAL_REFERENCE, CHEAP_OFFER_REFERENCE] as const;

/** Filler offers retired so the walkthrough only shows the two demo deals. */
export const RETIRED_DEMO_OFFER_REFERENCES = [
  "MRA-002",
  "MRA-003",
  "MRA-004",
  "MRA-005",
  "MRA-006",
] as const;

const RETIRED_DEMO_TENANCY_IDS = new Set(["tn-002", "tn-003", "tn-004", "tn-005", "tn-006"]);

export function dropRetiredDemoOffers(book: DemoBook): DemoBook {
  const retired = new Set<string>(RETIRED_DEMO_OFFER_REFERENCES);
  const offers = book.offers.filter((offer) => !retired.has(offer.reference));
  const assignedTenancies = (book.assignedTenancies ?? []).filter(
    (id) => !RETIRED_DEMO_TENANCY_IDS.has(id),
  );
  if (
    offers.length === book.offers.length &&
    assignedTenancies.length === (book.assignedTenancies ?? []).length
  ) {
    return book;
  }
  return { ...book, offers, assignedTenancies };
}
