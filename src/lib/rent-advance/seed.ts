import { ACTORS } from "@/lib/rent-advance/actors";
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

function receivables(rent: number, count: number, start = "2026-09-01"): Receivable[] {
  return monthsFrom(start, count).map((dueDate, index) => ({
    n: index + 1,
    dueDate,
    amountCents: rent,
    status: "scheduled" as const,
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
  receivedCount?: number;
  missedCount?: number;
  createdAt?: string;
}): Offer {
  const related = Boolean(input.relatedParty);
  const quote = quoteFor(
    input.rent,
    input.months,
    related,
    input.passportTotal,
    input.payerScore,
  );
  const units = 1000;
  const subscriptionPriceCents = 1050;
  const offeringCents = units * subscriptionPriceCents;
  const schedule = holderSchedule({
    offeringCents,
    purchasePriceCents: quote.purchasePriceCents,
    monthlyCollectionCents: input.rent,
    months: input.months,
    units,
  });
  const rows = receivables(input.rent, input.months);
  const receivedCount = input.receivedCount ?? 0;
  const missedCount = input.missedCount ?? 0;
  rows.forEach((row, index) => {
    if (index < receivedCount) row.status = "received";
    else if (index < receivedCount + missedCount) row.status = "missed";
  });

  return {
    reference: input.reference,
    status: input.status,
    seriesDisplayName: "Merkado Direct · Rent Advance",
    createdAt: input.createdAt ?? "2026-08-13T09:44:00-04:00",
    publishedAt: input.status === "draft" ? null : "2026-08-28T10:05:00-04:00",
    nextAction: input.nextAction,
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
    marketRentCents: Math.round(input.rent / 0.75),
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
    fundedCents: input.fundedCents ?? (input.status === "draft" ? 0 : offeringCents),
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
        detail: `D. Martina · Passport ${input.passportTotal}`,
        actor: "D. Martina",
      },
    ],
    holders: [
      {
        holderId: "act-purchaser",
        holderName: "Merkado Receivables I B.V.",
        units,
        contributedCents: offeringCents,
        receivedCents: receivedCount * input.rent,
        anonymised: true,
      },
    ],
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
    status: "live",
    nextAction: "Record month 1 · 30 Sep",
    relatedParty: true,
    relatedPartyNote:
      "The landlord on this offer is a family member of an EcoLabs board member. An independent approver must credit-approve. The fee carries a +25 bp related-party premium.",
    months: 6,
    rent: 180000,
    passportTotal: 89,
    payerScore: 95,
    agency: "Moret Real Estate",
    fundedCents: 1050000,
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
      fullName: "L. Rosaria",
      initials: "L.R.",
    }),
  });
  mra001.feeRate = 0.055;
  mra001.feeCents = 59400;
  mra001.purchasePriceCents = 1020600;
  mra001.advanceRate = 0.945;
  mra001.offeringCents = 1050000;
  mra001.originationSpreadCents = 29400;
  mra001.events = [
    {
      id: "ev-001-6",
      at: "2026-09-30",
      title: "Collection month 1 scheduled",
      detail: "End of month · Cg 1,800.00",
      actor: "System",
    },
    {
      id: "ev-001-5",
      at: "2026-09-04T14:40:00-04:00",
      title: "Settled to the landlord",
      detail: "D. Martina · purchase price released in one payment",
      actor: "D. Martina",
    },
    {
      id: "ev-001-4",
      at: "2026-09-03T11:22:00-04:00",
      title: "Offer fully funded",
      detail: "Sole holder · 1,000 participation units",
      actor: "System",
    },
    {
      id: "ev-001-3",
      at: "2026-09-01T10:05:00-04:00",
      title: "Notice of assignment served on the payer",
      detail: "By hand against receipt · EN · NL · PAP · Option A",
      actor: "D. Martina",
    },
    {
      id: "ev-001-2",
      at: "2026-08-28T10:05:00-04:00",
      title: "Offer published",
      detail: "D. Martina",
      actor: "D. Martina",
    },
    {
      id: "ev-001-1",
      at: "2026-08-27T16:31:00-04:00",
      title: "Approved",
      detail: "R. Girigoria · independent approver",
      actor: "R. Girigoria",
    },
    {
      id: "ev-001-0",
      at: "2026-08-26T09:44:00-04:00",
      title: "Offer created",
      detail: "D. Martina · composite 92.3 · Grade A",
      actor: "D. Martina",
    },
  ];

  return [
    mra001,
    makeOffer({
      reference: "MRA-002",
      status: "funding",
      nextAction: "Wait for remaining funding",
      months: 6,
      rent: 260000,
      passportTotal: 82,
      payerScore: 88,
      agency: "Keller Williams Curaçao",
      fundedCents: 480000,
      property: makeProperty({
        id: "prop-002",
        address: "Demo address · Jan Thiel",
        district: "Jan Thiel",
        type: "Apartment",
        summary: "Apartment, ground floor, pool access",
        features: ["AC", "pool"],
      }),
      payer: makePayer({
        id: "tn-002",
        fullName: "M. C.",
        initials: "M.C.",
        scores: { paymentHistory: 36, rentToIncome: 20, employment: 18, savings: 14, total: 88 },
      }),
    }),
    makeOffer({
      reference: "MRA-003",
      status: "closed",
      nextAction: "Archive",
      months: 6,
      rent: 155000,
      passportTotal: 76,
      payerScore: 80,
      agency: "RE/MAX BonBini",
      receivedCount: 6,
      property: makeProperty({
        id: "prop-003",
        address: "Demo address · Otrobanda",
        district: "Otrobanda",
        type: "Townhouse",
        summary: "Townhouse near the boulevard",
        bedrooms: 3,
      }),
      payer: makePayer({
        id: "tn-003",
        fullName: "K. A.",
        initials: "K.A.",
        scores: { paymentHistory: 34, rentToIncome: 18, employment: 16, savings: 12, total: 80 },
      }),
    }),
    makeOffer({
      reference: "MRA-004",
      status: "under_review",
      nextAction: "Approve",
      months: 6,
      rent: 390000,
      passportTotal: 91,
      payerScore: 90,
      agency: "Keller Williams Curaçao",
      fundedCents: 0,
      property: makeProperty({
        id: "prop-004",
        address: "Demo address · Blue Bay",
        district: "Blue Bay",
        type: "Villa",
        summary: "3-bed villa with sea view",
        bedrooms: 3,
        bathrooms: 2,
        interiorM2: 160,
        features: ["AC", "sea view"],
      }),
      payer: makePayer({
        id: "tn-004",
        fullName: "S. D.",
        initials: "S.D.",
        monthlyIncomeCents: 1200000,
        scores: { paymentHistory: 38, rentToIncome: 22, employment: 18, savings: 12, total: 90 },
      }),
    }),
    makeOffer({
      reference: "MRA-005",
      status: "default",
      nextAction: "Start recovery",
      months: 6,
      rent: 105000,
      passportTotal: 64,
      payerScore: 58,
      agency: "Moret Real Estate",
      receivedCount: 2,
      missedCount: 1,
      property: makeProperty({
        id: "prop-005",
        address: "Demo address · Vista Royal",
        district: "Vista Royal",
        type: "Studio",
        summary: "Studio in a gated block",
        bedrooms: 1,
        interiorM2: 42,
      }),
      payer: makePayer({
        id: "tn-005",
        fullName: "R. B.",
        initials: "R.B.",
        monthlyIncomeCents: 280000,
        monthsEvidenced: 6,
        latePayments12m: 2,
        scores: { paymentHistory: 22, rentToIncome: 14, employment: 12, savings: 10, total: 58 },
      }),
    }),
    makeOffer({
      reference: "MRA-006",
      status: "draft",
      nextAction: "Finish draft",
      months: 6,
      rent: 200000,
      passportTotal: 71,
      payerScore: 74,
      agency: "SeriDomi",
      fundedCents: 0,
      property: makeProperty({
        id: "prop-006",
        address: "Demo address · Brakkeput",
        district: "Brakkeput",
        type: "Apartment",
        summary: "2-bed apartment, renovated",
      }),
      payer: makePayer({
        id: "tn-006",
        fullName: "J. W.",
        initials: "J.W.",
        scores: { paymentHistory: 30, rentToIncome: 18, employment: 14, savings: 12, total: 74 },
      }),
    }),
  ];
}

export function getSeedBook(): DemoBook {
  return {
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
    assignedTenancies: ["tn-001", "tn-002", "tn-003", "tn-005"],
  };
}

export const CANONICAL_REFERENCE = "MRA-001";
