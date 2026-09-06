import type { ScoreBand } from "@/lib/rent-advance/scoring";

export type DemoRole = "admin" | "approver" | "foundation" | "buyer" | "payer";

export type OfferStatus =
  | "draft"
  | "under_review"
  | "denied"
  | "funding"
  | "live"
  | "collecting"
  | "closed"
  | "default"
  | "expired";

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
  /** Uploaded cover, or empty to use the type fallback photo. */
  coverImageSrc?: string | null;
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

export type PaymentRequestStatus =
  | "due"
  | "initiated"
  | "pending"
  | "confirmed"
  | "failed"
  | "overdue"
  | "expired"
  | "partial";

export type DistributionStatus = "claimable" | "claimed";

export type LedgerTransactionKind = "rent_payment" | "holder_distribution";

export type LandlordPayoutMethod = "crypto" | "bank";

export type LandlordPayout = {
  method: LandlordPayoutMethod;
  /** The Optimism Mainnet payout address locked at mint. Null until saved. */
  cryptoAddress: string | null;
  fiatCurrency: "XCG";
  partner: "Girasol";
  bankFeeRate: number;
  bankAvailability: "coming_soon";
};

/**
 * Verified on-chain facts for one Merkado Rent Offer NFT (Optimism Mainnet).
 * All values start null/zero and are only filled by a verified receipt
 * recorded through a server action. Nothing here is ever fabricated.
 */
export type OnchainOfferState = {
  /** ERC-721 token id, assigned by the Safe mint. */
  tokenId: number | null;
  /** Opaque bytes32 offer key (keccak of the internal reference). */
  offerKey: string | null;
  /** Deployed Merkado contract address. */
  contractAddress: string | null;
  /** Active chain-store epoch id the offer was prepared in. */
  epochId: string | null;
  mintTxHash: string | null;
  mintBlockNumber: bigint | string | null;
  /** Short server-side lease preventing overlapping mint broadcasts. */
  mintLeaseId?: string | null;
  mintLeaseExpiresAt?: string | null;
  /** True once a verified OfferPurchased event exists. */
  purchased: boolean;
  purchaseTxHash: string | null;
  purchaserAddress: string | null;
  /** Landlord payout address locked at mint by the Safe. */
  payoutAddress: string | null;
  /** True when the verified purchase paid the landlord payout address. */
  landlordPaid: boolean;
  /** Pooled USDC rent waiting for the current NFT owner to claim, in USD cents. */
  claimableRentCents: number;
  /** Pooled USDC rent already claimed by the current owner, in USD cents. */
  claimedRentCents: number;
  /** Submitted claim tx hash + owner, persisted so a pending claim can be re-verified. */
  submittedClaimTxHash?: string | null;
  submittedClaimOwner?: string | null;
  /** Submitted purchase tx hash + buyer, persisted so a pending purchase can be re-verified. */
  submittedPurchaseTxHash?: string | null;
  submittedPurchaseBuyer?: string | null;
};

export type LedgerTransactionStatus = "initiated" | "pending" | "confirmed" | "failed";

/** Network / contract facts the walkthrough runs on. */
export type CryptoConfig = {
  networkKey: string | null;
  chainId: number | null;
  networkLabel: string | null;
  usdcContract: string | null;
  usdcDecimals: number;
  safeAccountId: string | null;
  /** Legacy alias for the company Safe. */
  safeAddress: string | null;
  companySafeAddress: string | null;
  /** Deployed Merkado Rent Offer contract, or null until configured. */
  offerNftContract: string | null;
  explorerBaseUrl: string | null;
};

export type PublicCryptoConfig = Pick<
  CryptoConfig,
  | "networkKey"
  | "chainId"
  | "networkLabel"
  | "usdcContract"
  | "usdcDecimals"
  | "explorerBaseUrl"
>;

export type DemoAccount = {
  accountId: string;
  displayName: string;
  roleLabel: string;
  payerFileId: string;
  payoutAddress: string | null;
  payoutAddressUpdatedAt: string | null;
};

export type PaymentRequest = {
  paymentRequestId: string;
  accountId: string;
  offerId: string;
  offerReference: string;
  propertyId: string;
  receivableId: string;
  receivableN: number;
  periodLabel: string;
  dueDate: string;
  /** USD cents. Legacy field name from the XCG book. */
  amountXcgCents: number;
  amountUsdcAtomic: number;
  paymentReference: string;
  receivingAddress: string;
  status: PaymentRequestStatus;
  initiatedAt: string | null;
  confirmedAt: string | null;
  transactionId: string | null;
  txHash: string | null;
  /** Opaque bytes32 on-chain payment id created for the rent deposit attempt. */
  opaquePaymentId?: string | null;
  /** Submitted on-chain deposit tx hash, persisted so a pending payment can be re-verified after a refresh. */
  submittedTxHash?: string | null;
  /** The payer (msg.sender) of the submitted deposit, needed to re-verify on resume. */
  submittedPayer?: string | null;
  /** Wallet designated to pay this renter request. */
  renterWalletAddress?: string | null;
};

export type LedgerTransaction = {
  transactionId: string;
  kind: LedgerTransactionKind;
  offerId: string;
  offerReference: string;
  paymentRequestId: string | null;
  collectionId: string | null;
  distributionId: string | null;
  amountXcgCents: number;
  amountUsdcAtomic: number | null;
  status: LedgerTransactionStatus;
  createdAt: string;
  confirmedAt: string | null;
  txHash: string | null;
  fromLabel: string;
  toLabel: string;
};

export type DistributionRecord = {
  distributionId: string;
  collectionId: string;
  positionId: string;
  offerId: string;
  offerReference: string;
  amountCents: number;
  status: DistributionStatus;
  createdAt: string;
  claimedAt: string | null;
  transactionId: string;
  txHash: string | null;
};

export type PositionRecord = {
  positionId: string;
  offerId: string;
  offerReference: string;
  holderId: string;
  settlementTransactionId: string | null;
  externalTokenId: string | null;
  /** Verified current holder wallet when known. */
  holderWalletAddress?: string | null;
};

export type Receivable = {
  n: number;
  dueDate: string;
  amountCents: number;
  status: ReceivableStatus;
  receivableId?: string;
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
  offerId?: string;
  settlementTransactionId?: string | null;
  reference: string;
  status: OfferStatus;
  seriesDisplayName: string;
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  nextAction: string;
  payout: LandlordPayout;
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
  /** Verified on-chain NFT facts. Nulls until a verified mint event exists. */
  onchain?: OnchainOfferState;
  /** Supabase account identity that created or owns the landlord workflow. */
  createdByAccountId?: string | null;
  /** Legacy wallet identity retained for older payloads. */
  createdByWalletAddress?: string | null;
  /** Wallet designated to pay rent for this offer. */
  renterWalletAddress?: string | null;
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
  cryptoConfig?: CryptoConfig;
  accounts?: DemoAccount[];
  paymentRequests?: PaymentRequest[];
  ledgerTransactions?: LedgerTransaction[];
  distributions?: DistributionRecord[];
  positions?: PositionRecord[];
  /** Supabase account that triggered the most recent Reset for this demo epoch. */
  seedOwnerAccountId?: string | null;
  /** Server-managed revision used to reject stale shared-book writes. */
  sharedStateUpdatedAt?: string | null;
};

export type BuyerOfferCard = {
  reference: string;
  district: string;
  type: string;
  summary: string;
  bedrooms: number;
  listingScore: number;
  propertyScore: number;
  propertyBand: ScoreBand;
  propertyLabel: string;
  passportScore: number;
  passportBand: ScoreBand;
  passportLabel: string;
  payerBand: ScoreBand;
  months: number;
  offeringCents: number;
  fundedCents: number;
  scheduledAnnualised: number;
  status: OfferStatus;
  expiresAt: string | null;
  /** Set at approval. Used only to render the display-only 60-day window. */
  publishedAt: string | null;
  coverImageSrc?: string | null;
  /** True once a verified OfferMinted event exists for the NFT. */
  minted: boolean;
  tokenId: number | null;
  /** The contract the offer was minted on; null until verified. Public on-chain. */
  contractAddress: string | null;
  purchased: boolean;
  /** True when a purchase was submitted but not yet verified (recovery). */
  pendingPurchase: boolean;
};

export type PurchaserOfferDetail = BuyerOfferCard & {
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
  };
  receivables: Array<{
    n: number;
    dueDate: string;
    amountCents: number;
    status: string;
  }>;
};

export type PortfolioPosition = BuyerOfferCard & {
  positionId: string;
  offerAddress: string | null;
  receivedCents: number;
  remainingCents: number;
  collectedCents: number;
  pendingDistributionCents: number;
  distributedCents: number;
  collectedMonths: number;
  settlementTxHash: string | null;
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
