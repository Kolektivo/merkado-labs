import type { ScoreBand } from "@/lib/rent-advance/scoring";

export type DemoRole = "admin" | "approver" | "foundation" | "buyer" | "payer";

export type OfferStatus =
  | "draft"
  | "under_review"
  | "funding"
  | "live"
  | "collecting"
  | "closed"
  | "default";

export type ReceivableStatus = "scheduled" | "received" | "missed" | "partial";
export type CollectionStatus = "received" | "reconciled" | "released" | "frozen";
export type ChecklistState = "open" | "closed";
export type DocumentState = "generated" | "pending" | "signed" | "not_required";
export type PaymentOption = "A" | "B";
export type ActorRole =
  | "operations"
  | "independent_approver"
  | "foundation_signatory"
  | "purchaser"
  | "payer"
  | "landlord";

export type Actor = {
  id: string;
  name: string;
  initials: string;
  role: ActorRole;
  title: string;
};

export type Party = {
  id: string;
  name: string;
  kind: "natural_person" | "company" | "foundation";
  relatedParty?: boolean;
  relatedPartyNote?: string;
};

export type Comparable = {
  id: string;
  address: string;
  district: string;
  rentCents: number;
  bedrooms: number;
  interiorM2: number;
  daysListed: number;
  distanceKm: number;
  excluded?: boolean;
  excludeReason?: string;
};

export type PassportScores = {
  rentVsMarket: number;
  marketDepth: number;
  condition: number;
  accessibility: number;
  total: number;
};

export type PayerScores = {
  paymentHistory: number;
  rentToIncome: number;
  employment: number;
  savings: number;
  total: number;
};

export type PropertyRecord = {
  id: string;
  address: string;
  district: string;
  cbsBuurtCode: string;
  type: string;
  summary: string;
  bedrooms: number;
  bathrooms: number;
  interiorM2: number;
  yearBuilt: number | null;
  condition: string;
  features: string[];
  cadastralReference: string | null;
  mortgagePresent: boolean;
  mortgagee: string | null;
  photoLabels: string[];
};

export type LeaseRecord = {
  id: string;
  startDate: string;
  expiryDate: string;
  monthsRemaining: number;
  noticePeriod: string;
  monthlyRentCents: number;
  depositCents: number;
  depositHeldBy: "landlord";
  rentIncludes: string;
  occupancySince: string;
};

export type PayerFile = {
  id: string;
  fullName: string;
  initials: string;
  contact: string;
  employmentStatus: string;
  employer: string;
  employedSince: string;
  household: string;
  monthlyIncomeCents: number;
  monthsEvidenced: number;
  latePayments12m: number;
  savingsMonths: number;
  scores: PayerScores;
};

export type Receivable = {
  n: number;
  dueDate: string;
  amountCents: number;
  status: ReceivableStatus;
};

export type Collection = {
  id: string;
  receivableN: number;
  receivedOn: string;
  amountCents: number;
  daysVariance: number;
  status: CollectionStatus;
  note?: string;
};

export type ChecklistItem = {
  id: string;
  stage: 0 | 1;
  title: string;
  evidence: string;
  owner: string;
  state: ChecklistState;
  hardStop?: boolean;
  blocks?: string;
};

export type PackDocument = {
  id: string;
  code: string;
  title: string;
  state: DocumentState;
  detail: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  title: string;
  detail: string;
  actor: string;
};

export type HolderPosition = {
  holderId: string;
  holderName: string;
  units: number;
  contributedCents: number;
  receivedCents: number;
  anonymised: boolean;
};

export type ReleaseInstruction = {
  id: string;
  collectionId: string;
  instructorId: string;
  signatoryId: string | null;
  status: "instructed" | "released" | "rejected";
  note?: string;
};

export type Offer = {
  reference: string;
  status: OfferStatus;
  seriesDisplayName: string;
  createdAt: string;
  publishedAt: string | null;
  nextAction: string;
  relatedParty: boolean;
  relatedPartyNote: string | null;
  paymentOption: PaymentOption;
  landlord: Party;
  tenant: PayerFile;
  purchaserName: string;
  servicerName: string;
  collectionAgent: string;
  fundsCustodian: string;
  property: PropertyRecord;
  lease: LeaseRecord;
  passport: PassportScores;
  marketRentCents: number;
  estimatedVoidWeeks: number;
  comparables: Comparable[];
  months: number;
  monthlyRentCents: number;
  feeRate: number;
  baseFeeRate: number;
  relatedPartyPremiumBps: number;
  feeCents: number;
  purchasePriceCents: number;
  advanceRate: number;
  monthlyIrr: number;
  nominalAnnualised: number;
  effectiveAnnualised: number;
  unitsIssued: number;
  subscriptionPriceCents: number;
  offeringCents: number;
  fundedCents: number;
  originationSpreadCents: number;
  receivables: Receivable[];
  collections: Collection[];
  documents: PackDocument[];
  events: AuditEvent[];
  holders: HolderPosition[];
  releases: ReleaseInstruction[];
  agency: string;
};

export type OpenQuestion = {
  id: string;
  title: string;
  owner: string;
  blocks: string;
};

export type DemoBook = {
  series: {
    platform: "merkado_direct";
    seriesType: "rent_advance";
    displayName: string;
    referencePrefix: "MRA";
    instrument: "Digital Participation Right";
  };
  actors: Actor[];
  offers: Offer[];
  checklist: ChecklistItem[];
  openQuestions: OpenQuestion[];
  assignedTenancies: string[];
};

export type BuyerOfferCard = {
  reference: string;
  district: string;
  type: string;
  summary: string;
  bedrooms: number;
  passportScore: number;
  passportBand: ScoreBand;
  passportLabel: string;
  payerBand: ScoreBand;
  rentToMarket: number;
  months: number;
  offeringCents: number;
  fundedCents: number;
  scheduledAnnualised: number;
  agency: string;
  status: OfferStatus;
  relatedParty: boolean;
};

export type PurchaserOfferDetail = BuyerOfferCard & {
  relatedPartyNote: string | null;
  interiorM2: number;
  passport: {
    total: number;
    rentVsMarket: number;
    marketDepth: number;
    condition: number;
    accessibility: number;
  };
  comparables: Array<{
    id: string;
    rentCents: number;
    bedrooms: number;
    interiorM2: number;
    daysListed: number;
  }>;
  payer: {
    bandLabel: string;
    onTimePercent: number;
    employmentStatus: string;
    rentToIncomeBand: string;
  };
  receivables: Array<{
    n: number;
    dueDate: string;
    amountCents: number;
    status: string;
  }>;
};

export type PortfolioPosition = BuyerOfferCard & {
  receivedCents: number;
  remainingCents: number;
  collectedMonths: number;
};

export type PortfolioPositionDetail = PortfolioPosition & {
  receivables: Array<{
    n: number;
    dueDate: string;
    amountCents: number;
    status: string;
    actualOn: string | null;
    actualCents: number | null;
    missed: boolean;
  }>;
};

export type AttentionItem = {
  tone: "error" | "warning" | "info";
  label: string;
  count: number;
  detail: string;
  href: string;
};
