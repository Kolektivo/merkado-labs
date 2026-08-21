import { DEMO_RENTER_PROFILE } from "@/lib/demo-account-profile";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  DEMO_RECEIVING_ADDRESS,
  RENTER_ACCOUNT_ID,
  SAFE_ACCOUNT_ID,
  acceptedPaymentTxHash,
  collectionIdFor,
  demoTxHash,
  distributionIdFor,
  distributionTxIdFor,
  fundingRecordIdFor,
  landlordClaimIdFor,
  landlordPayoutTxIdFor,
  offerIdFromReference,
  paymentTxIdFor,
  periodLabelFromDueDate,
  positionIdFor,
  receivableIdFor,
} from "@/lib/rent-advance/ids";
import { receivingLedgerLabel, renterWalletLedgerLabel } from "@/lib/pay/mode";
import {
  getPayNetwork,
  resolvePayNetworkKey,
} from "@/lib/pay/networks";
import { formatXcg, usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import type {
  CryptoConfig,
  DemoAccount,
  DemoBook,
  DistributionRecord,
  LandlordProceedsClaim,
  LedgerTransaction,
  Offer,
  OfferFundingRecord,
  PaymentRequest,
  PositionRecord,
} from "@/lib/rent-advance/types";

export type PaymentMockOutcome = "pending" | "confirmed" | "failed" | "partial";

export type PaymentOutcomeMeta = {
  txHash?: string | null;
  /** Ignored. Ledger ids are always `paymentTxIdFor(...)`. */
  transactionId?: string | null;
  /** Ignored. Labels stay server-owned. */
  fromLabel?: string;
  /** Ignored. Labels stay server-owned. */
  toLabel?: string;
};

export function cryptoConfigFor(
  key = resolvePayNetworkKey(),
  incoming?: Partial<CryptoConfig> | null,
): CryptoConfig {
  const network = getPayNetwork(key);
  return {
    networkKey: network.key,
    chainId: network.chainId,
    networkLabel: network.networkLabel,
    usdcContract: network.usdcContract,
    usdcDecimals: network.usdcDecimals,
    safeAccountId: incoming?.safeAccountId ?? SAFE_ACCOUNT_ID,
    safeAddress: incoming?.safeAddress?.trim() || DEMO_RECEIVING_ADDRESS,
    explorerBaseUrl: network.explorerBaseUrl,
  };
}

export function emptyCryptoConfig(): CryptoConfig {
  return cryptoConfigFor();
}

export function mergeCryptoConfig(raw?: Partial<CryptoConfig> | null): CryptoConfig {
  return cryptoConfigFor(resolvePayNetworkKey(raw), raw);
}

export function defaultAccounts(): DemoAccount[] {
  return [
    {
      accountId: RENTER_ACCOUNT_ID,
      displayName: DEMO_RENTER_PROFILE.fullName,
      roleLabel: "Renter",
      payerFileId: "tn-001",
    },
  ];
}

function ensureOfferIds(offer: Offer): Offer {
  const offerId = offer.offerId ?? offerIdFromReference(offer.reference);
  const fullyFunded = offer.offeringCents > 0 && offer.fundedCents >= offer.offeringCents;
  const offeringCents = fullyFunded ? offer.purchasePriceCents : offer.offeringCents;
  const fundedCents = fullyFunded ? offer.purchasePriceCents : offer.fundedCents;
  return {
    ...offer,
    offerId,
    settlementMode: "landlord_claim",
    offeringCents,
    fundedCents,
    settlementTransactionId: offer.settlementTransactionId?.startsWith("tx-claim-")
      ? offer.settlementTransactionId
      : null,
    receivables: offer.receivables.map((row) => ({
      ...row,
      receivableId: row.receivableId ?? receivableIdFor(offer.reference, row.n),
    })),
    collections: offer.collections.map((row) => ({
      ...row,
      id: row.id.startsWith("col-") ? row.id.replace(/-\d{10,}$/, "") : collectionIdFor(offer.reference, row.receivableN),
    })),
    events: offer.events.filter((row) => row.title !== "Settled to the landlord"),
    holders: offer.holders.map((holder, index) =>
      fullyFunded && index === 0
        ? { ...holder, contributedCents: offer.purchasePriceCents }
        : holder,
    ),
  };
}

function renterAccountIdFor(): string {
  return RENTER_ACCOUNT_ID;
}

function shouldMintPaymentRequests(offer: Offer): boolean {
  return offer.status === "live" || offer.status === "collecting" || offer.status === "default";
}

export function canSubscribeOffer(offer: Offer): boolean {
  return (
    (offer.status === "funding" || offer.status === "live" || offer.status === "collecting") &&
    offer.offeringCents > offer.fundedCents
  );
}

export function applySubscribe(
  book: DemoBook,
  reference: string,
  at = new Date().toISOString(),
  amountCents?: number,
): DemoBook {
  const next = structuredClone(book);
  const offer = next.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  if (!canSubscribeOffer(offer)) {
    throw new Error("This offer is not open to purchase.");
  }

  const remaining = offer.offeringCents - offer.fundedCents;
  const purchaseCents =
    amountCents == null ? remaining : Math.round(amountCents);
  if (!Number.isFinite(purchaseCents) || purchaseCents <= 0) {
    throw new Error("Enter an amount above zero.");
  }
  if (purchaseCents > remaining) {
    throw new Error("That amount is more than is still open.");
  }

  offer.fundedCents += purchaseCents;
  const filled = offer.fundedCents >= offer.offeringCents;
  if (filled && offer.status === "funding") offer.status = "live";
  if (filled) {
    offer.publishedAt = offer.publishedAt ?? at;
    addOfferFundingRecord(next, offer, at);
    addAvailableClaim(next, offer, at);
    offer.settlementTransactionId = null;
    offer.nextAction = "Collect first rent";
  } else {
    offer.nextAction = "Wait for remaining funding";
  }

  const existingHolder = offer.holders[0];
  if (existingHolder) {
    existingHolder.contributedCents = offer.fundedCents;
    existingHolder.units = Math.max(1, existingHolder.units || offer.unitsIssued || 1);
  } else {
    offer.holders = [
      {
        holderId: "act-purchaser",
        holderName: "Merkado Receivables I B.V.",
        units: Math.max(1, offer.unitsIssued || 1),
        contributedCents: offer.fundedCents,
        receivedCents: 0,
        anonymised: true,
      },
    ];
  }

  const purchaseEvent = {
    id: `ev-${reference}-subscribe-${at}`,
    at,
    title: filled ? "Offer filled" : "Participation purchased",
    detail: filled
      ? `${formatXcg(purchaseCents)} filled the offering. Proceeds are now available for the landlord to claim.`
      : `${formatXcg(purchaseCents)} purchased. ${formatXcg(offer.offeringCents - offer.fundedCents)} still open.`,
    actor: "System",
  };

  offer.events = [
    purchaseEvent,
    ...offer.events.filter((row) => row.id !== `ev-${reference}-settled`),
  ];

  return normalizeBook(next);
}

function addOfferFundingRecord(book: DemoBook, offer: Offer, at: string): void {
  const id = fundingRecordIdFor(offer.reference);
  const existing = (book.offerFundingRecords ?? []).find((row) => row.fundingRecordId === id);
  if (existing) {
    existing.offerId = offer.offerId ?? offerIdFromReference(offer.reference);
    existing.offerReference = offer.reference;
    existing.safeAddress = book.cryptoConfig?.safeAddress ?? DEMO_RECEIVING_ADDRESS;
    existing.purchasePriceCents = offer.purchasePriceCents;
    existing.amountUsdcAtomic = usdcAtomicFromUsdCents(offer.purchasePriceCents);
    return;
  }
  const record: OfferFundingRecord = {
    fundingRecordId: id,
    offerId: offer.offerId ?? offerIdFromReference(offer.reference),
    offerReference: offer.reference,
    category: "offer_purchase",
    railMode: "mock",
    safeAddress: book.cryptoConfig?.safeAddress ?? DEMO_RECEIVING_ADDRESS,
    purchasePriceCents: offer.purchasePriceCents,
    amountUsdcAtomic: usdcAtomicFromUsdCents(offer.purchasePriceCents),
    status: "recorded",
    createdAt: at,
  };
  book.offerFundingRecords = [record, ...(book.offerFundingRecords ?? [])];
}

function addAvailableClaim(book: DemoBook, offer: Offer, at: string): void {
  const claimId = landlordClaimIdFor(offer.reference);
  const existing = (book.landlordProceedsClaims ?? []).find((row) => row.claimId === claimId);
  if (existing) {
    existing.offerId = offer.offerId ?? offerIdFromReference(offer.reference);
    existing.offerReference = offer.reference;
    existing.landlordId = offer.landlord.id;
    existing.feeCents = offer.feeCents;
    existing.claimableCents = offer.purchasePriceCents;
    existing.txHash = null;
    return;
  }
  const claim: LandlordProceedsClaim = {
    claimId,
    offerId: offer.offerId ?? offerIdFromReference(offer.reference),
    offerReference: offer.reference,
    landlordId: offer.landlord.id,
    feeCents: offer.feeCents,
    claimableCents: offer.purchasePriceCents,
    destinationEoa: offer.landlord.eoaAddress ?? null,
    status: "available",
    transactionId: null,
    txHash: null,
    createdAt: at,
    paidAt: null,
  };
  book.landlordProceedsClaims = [claim, ...(book.landlordProceedsClaims ?? [])];
}

export function findLandlordProceedsClaim(
  book: DemoBook,
  reference: string,
): LandlordProceedsClaim | undefined {
  return (book.landlordProceedsClaims ?? []).find(
    (row) => row.offerReference === reference,
  );
}

/**
 * Start a mock landlord claim. Locks the destination EOA (unverified demo
 * address) and moves the claim to processing. Idempotent for the same
 * destination; a different destination once processing has begun is rejected.
 */
export function applyLandlordClaimStart(
  book: DemoBook,
  reference: string,
  destinationEoa: string,
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const claim = findLandlordProceedsClaim(next, reference);
  if (!claim) throw new Error("No landlord claim is available for this offer.");
  const destination = destinationEoa.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(destination)) {
    throw new Error("Enter a valid 20-byte demo wallet address.");
  }
  if (claim.status === "paid") {
    throw new Error("This claim has already been paid.");
  }
  if (
    (claim.status === "processing" || claim.status === "failed") &&
    claim.destinationEoa?.toLowerCase() !== destination
  ) {
    throw new Error("This claim is already processing to a different address.");
  }
  claim.destinationEoa = destination;
  claim.status = "processing";
  claim.transactionId = landlordPayoutTxIdFor(reference);
  return next;
}

/**
 * Mark a mock landlord claim paid and record the mocked payout ledger row.
 * Terminal; retries return the existing paid claim without duplicating rows.
 */
export function applyLandlordClaimComplete(
  book: DemoBook,
  reference: string,
  at = new Date().toISOString(),
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const claim = findLandlordProceedsClaim(next, reference);
  if (!claim) throw new Error("No landlord claim is available for this offer.");
  if (claim.status === "paid") return next;
  if (claim.status !== "processing") {
    throw new Error("Start the claim before completing it.");
  }
  claim.status = "paid";
  claim.paidAt = at;
  const offer = next.offers.find((row) => row.reference === reference);
  if (offer) {
    offer.settlementTransactionId = landlordPayoutTxIdFor(reference);
    offer.nextAction = "Collect first rent";
  }
  upsertLedger(next, {
    transactionId: landlordPayoutTxIdFor(reference),
    kind: "landlord_proceeds_claim",
    offerId: claim.offerId,
    offerReference: claim.offerReference,
    paymentRequestId: null,
    collectionId: null,
    distributionId: null,
    amountXcgCents: claim.claimableCents,
    amountUsdcAtomic: usdcAtomicFromUsdCents(claim.claimableCents),
    status: "confirmed",
    createdAt: at,
    confirmedAt: at,
    txHash: null,
    fromLabel: "Sale proceeds",
    toLabel: "Landlord",
  });
  return next;
}

/**
 * Mark a mock landlord claim as failed so the landlord can retry to the same
 * locked destination.
 */
export function applyLandlordClaimFail(
  book: DemoBook,
  reference: string,
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const claim = findLandlordProceedsClaim(next, reference);
  if (!claim) throw new Error("No landlord claim is available for this offer.");
  if (claim.status === "paid") return next;
  if (claim.status === "failed") return next;
  if (claim.status !== "processing") {
    throw new Error("Start the claim before marking it as failed.");
  }
  claim.status = "failed";
  return next;
}

function paymentRequestForReceivable(
  offer: Offer,
  n: number,
  receivingAddress: string,
): PaymentRequest | null {
  const receivable = offer.receivables.find((row) => row.n === n);
  if (!receivable) return null;
  const paymentRequestId =
    offer.reference === "MRA-001" && n === 1
      ? CANONICAL_PAYMENT_REQUEST_ID
      : `payreq-${offer.reference.toLowerCase()}-${receivable.dueDate.slice(0, 7).replace("-", "")}`;
  const confirmed = receivable.status === "received";
  return {
    paymentRequestId,
    accountId: renterAccountIdFor(),
    offerId: offer.offerId ?? offerIdFromReference(offer.reference),
    offerReference: offer.reference,
    propertyId: offer.property.id,
    receivableId: receivable.receivableId ?? receivableIdFor(offer.reference, n),
    receivableN: n,
    periodLabel: periodLabelFromDueDate(receivable.dueDate),
    dueDate: receivable.dueDate,
    amountXcgCents: receivable.amountCents,
    amountUsdcAtomic: usdcAtomicFromUsdCents(receivable.amountCents),
    paymentReference: `${offer.reference}-${String(n).padStart(2, "0")}`,
    receivingAddress,
    status: confirmed ? "confirmed" : receivable.status === "missed" ? "overdue" : "due",
    initiatedAt: null,
    confirmedAt: confirmed ? receivable.dueDate : null,
    transactionId: confirmed ? paymentTxIdFor(paymentRequestId) : null,
    txHash: confirmed ? demoTxHash(paymentRequestId) : null,
  };
}

function distributionsForOffer(offer: Offer): DistributionRecord[] {
  return offer.collections
    .filter((row) => row.status === "received" || row.status === "reconciled" || row.status === "released")
    .map((row) => ({
      distributionId: distributionIdFor(offer.reference, row.receivableN),
      collectionId: collectionIdFor(offer.reference, row.receivableN),
      positionId: positionIdFor(offer.reference),
      offerId: offer.offerId ?? offerIdFromReference(offer.reference),
      offerReference: offer.reference,
      amountCents: row.amountCents,
      status: "distributed" as const,
      createdAt: row.receivedOn,
      distributedAt: row.receivedOn,
      transactionId: distributionTxIdFor(offer.reference, row.receivableN),
      txHash: demoTxHash(`dist${offer.reference}${row.receivableN}`),
    }));
}

function positionForOffer(offer: Offer): PositionRecord | null {
  if (offer.fundedCents <= 0) return null;
  return {
    positionId: positionIdFor(offer.reference),
    offerId: offer.offerId ?? offerIdFromReference(offer.reference),
    offerReference: offer.reference,
    holderId: offer.holders[0]?.holderId ?? "act-purchaser",
    settlementTransactionId: offer.settlementTransactionId ?? null,
    externalTokenId: null,
  };
}

export function normalizeBook(raw: unknown): DemoBook {
  const book = (raw ?? {}) as DemoBook;
  const cryptoConfig = mergeCryptoConfig(book.cryptoConfig);
  const receivingAddress = cryptoConfig.safeAddress ?? DEMO_RECEIVING_ADDRESS;
  const offers = (book.offers ?? []).map(ensureOfferIds);
  const normalizedRecords: DemoBook = {
    ...book,
    cryptoConfig,
    offerFundingRecords: [],
    landlordProceedsClaims: [],
  };
  for (const offer of offers) {
    if (offer.offeringCents <= 0 || offer.fundedCents < offer.offeringCents) continue;
    const fundedAt = offer.publishedAt ?? offer.createdAt;
    const existingRecord = (book.offerFundingRecords ?? []).find(
      (row) => row.offerReference === offer.reference,
    );
    if (existingRecord) {
      normalizedRecords.offerFundingRecords?.push({
        ...existingRecord,
        fundingRecordId: fundingRecordIdFor(offer.reference),
      });
    }
    const canonicalClaimId = landlordClaimIdFor(offer.reference);
    const claimStatusRank: Record<LandlordProceedsClaim["status"], number> = {
      paid: 4,
      processing: 3,
      failed: 2,
      available: 1,
    };
    const existingClaim = (book.landlordProceedsClaims ?? [])
      .filter((row) => row.offerReference === offer.reference)
      .sort((a, b) => {
        const statusDifference = claimStatusRank[b.status] - claimStatusRank[a.status];
        if (statusDifference !== 0) return statusDifference;
        if (a.claimId === canonicalClaimId) return -1;
        if (b.claimId === canonicalClaimId) return 1;
        return 0;
      })[0];
    if (existingClaim) {
      normalizedRecords.landlordProceedsClaims?.push({
        ...existingClaim,
        claimId: canonicalClaimId,
        transactionId:
          existingClaim.status === "available"
            ? null
            : landlordPayoutTxIdFor(offer.reference),
        txHash: null,
      });
    }
    addOfferFundingRecord(normalizedRecords, offer, fundedAt);
    addAvailableClaim(normalizedRecords, offer, fundedAt);
  }
  for (const offer of offers) {
    const claim = (normalizedRecords.landlordProceedsClaims ?? []).find(
      (row) => row.offerReference === offer.reference,
    );
    offer.settlementTransactionId = claim?.status === "paid" ? claim.transactionId : null;
  }
  const seedAccounts = book.accounts?.length ? book.accounts : defaultAccounts();
  const existingRequests = new Map(
    (book.paymentRequests ?? []).map((row) => [row.paymentRequestId, row]),
  );
  const paymentRequests: PaymentRequest[] = [];
  for (const offer of offers) {
    if (!shouldMintPaymentRequests(offer)) continue;
    for (const receivable of offer.receivables) {
      const next = paymentRequestForReceivable(offer, receivable.n, receivingAddress);
      if (!next) continue;
      const previous = existingRequests.get(next.paymentRequestId);
      paymentRequests.push(
        previous
          ? {
              ...next,
              ...previous,
              receivableId: next.receivableId,
              amountXcgCents: next.amountXcgCents,
              amountUsdcAtomic: next.amountUsdcAtomic,
              receivingAddress: next.receivingAddress,
              status: next.status === "confirmed" ? "confirmed" : previous.status,
              confirmedAt: previous.confirmedAt ?? next.confirmedAt,
              transactionId: previous.transactionId ?? next.transactionId,
              txHash: previous.txHash ?? next.txHash,
            }
          : next,
      );
    }
  }

  const existingDist = new Map((book.distributions ?? []).map((row) => [row.distributionId, row]));
  const distributions = offers.flatMap((offer) =>
    distributionsForOffer(offer).map((row) => existingDist.get(row.distributionId) ?? row),
  );

  const existingTx = new Map((book.ledgerTransactions ?? []).map((row) => [row.transactionId, row]));
  const ledgerTransactions: LedgerTransaction[] = [];
  for (const claim of normalizedRecords.landlordProceedsClaims ?? []) {
    if (claim.status !== "paid") continue;
    const transactionId = landlordPayoutTxIdFor(claim.offerReference);
    const existing = (book.ledgerTransactions ?? []).find(
      (row) =>
        row.kind === "landlord_proceeds_claim" &&
        row.offerReference === claim.offerReference,
    );
    const paidAt = claim.paidAt ?? claim.createdAt;
    ledgerTransactions.push({
      ...(existing ?? {}),
      transactionId,
      kind: "landlord_proceeds_claim",
      offerId: claim.offerId,
      offerReference: claim.offerReference,
      paymentRequestId: null,
      collectionId: null,
      distributionId: null,
      amountXcgCents: claim.claimableCents,
      amountUsdcAtomic: usdcAtomicFromUsdCents(claim.claimableCents),
      status: "confirmed",
      createdAt: existing?.createdAt ?? paidAt,
      confirmedAt: paidAt,
      txHash: null,
      fromLabel: "Sale proceeds",
      toLabel: "Landlord",
    });
  }
  for (const request of paymentRequests) {
    if (!request.transactionId) continue;
    const fallback: LedgerTransaction = {
      transactionId: request.transactionId,
      kind: "rent_payment",
      offerId: request.offerId,
      offerReference: request.offerReference,
      paymentRequestId: request.paymentRequestId,
      collectionId: collectionIdFor(request.offerReference, request.receivableN),
      distributionId: distributionIdFor(request.offerReference, request.receivableN),
      amountXcgCents: request.amountXcgCents,
      amountUsdcAtomic: request.amountUsdcAtomic,
      status: request.status === "confirmed" ? "confirmed" : "pending",
      createdAt: request.initiatedAt ?? request.confirmedAt ?? request.dueDate,
      confirmedAt: request.confirmedAt,
      txHash: request.txHash,
      fromLabel: renterWalletLedgerLabel(),
      toLabel: receivingLedgerLabel(),
    };
    ledgerTransactions.push(existingTx.get(request.transactionId) ?? fallback);
  }
  for (const distribution of distributions) {
    const fallback: LedgerTransaction = {
      transactionId: distribution.transactionId,
      kind: "holder_distribution",
      offerId: distribution.offerId,
      offerReference: distribution.offerReference,
      paymentRequestId: null,
      collectionId: distribution.collectionId,
      distributionId: distribution.distributionId,
      amountXcgCents: distribution.amountCents,
      amountUsdcAtomic: null,
      status: distribution.status === "distributed" ? "confirmed" : "pending",
      createdAt: distribution.createdAt,
      confirmedAt: distribution.distributedAt,
      txHash: distribution.txHash,
      fromLabel: "Collection account",
      toLabel: "Holder position",
    };
    if (!ledgerTransactions.some((row) => row.transactionId === fallback.transactionId)) {
      ledgerTransactions.push(existingTx.get(fallback.transactionId) ?? fallback);
    }
  }

  const existingPositions = new Map((book.positions ?? []).map((row) => [row.positionId, row]));
  const positions = offers
    .map(positionForOffer)
    .filter((row): row is PositionRecord => Boolean(row))
    .map((row) => {
      const existing = existingPositions.get(row.positionId);
      return {
        ...row,
        holderId: existing?.holderId ?? row.holderId,
        settlementTransactionId: row.settlementTransactionId,
        externalTokenId: null,
      };
    });

  return {
    ...book,
    offers,
    actors: book.actors ?? [],
    checklist: book.checklist ?? [],
    openQuestions: book.openQuestions ?? [],
    assignedTenancies: book.assignedTenancies ?? [],
    cryptoConfig,
    accounts: seedAccounts,
    paymentRequests,
    ledgerTransactions,
    distributions,
    positions,
    offerFundingRecords: normalizedRecords.offerFundingRecords,
    landlordProceedsClaims: normalizedRecords.landlordProceedsClaims,
  };
}

export function ensureCollection(offer: Offer, receivableN: number, receivedOn: string) {
  const receivable = offer.receivables.find((row) => row.n === receivableN);
  if (!receivable) throw new Error("Receivable not found.");
  receivable.status = "received";
  const id = collectionIdFor(offer.reference, receivableN);
  const existing = offer.collections.find((row) => row.id === id || row.receivableN === receivableN);
  if (existing) {
    existing.status = existing.status === "released" ? "released" : "received";
    existing.amountCents = receivable.amountCents;
    return existing;
  }
  const collection = {
    id,
    receivableN,
    receivedOn,
    amountCents: receivable.amountCents,
    daysVariance: 0,
    status: "received" as const,
  };
  offer.collections = [collection, ...offer.collections];
  return collection;
}

export function applyPaymentOutcome(
  book: DemoBook,
  paymentRequestId: string,
  outcome: PaymentMockOutcome,
  at = new Date().toISOString(),
  meta: PaymentOutcomeMeta = {},
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const request = next.paymentRequests?.find((row) => row.paymentRequestId === paymentRequestId);
  if (!request) throw new Error("Payment request not found.");
  if (request.status === "expired") throw new Error("This payment link has expired.");

  if (request.status === "confirmed") {
    return next;
  }

  const offer = next.offers.find((row) => row.reference === request.offerReference);
  if (!offer) throw new Error("Offer not found.");
  if (offer.status === "draft" || offer.status === "under_review") {
    throw new Error("This offer is not live, so rent cannot be collected yet.");
  }
  const earlier = earlierOpenPaymentRequest(next, paymentRequestId);
  if (earlier) {
    throw new Error(`Pay ${earlier.periodLabel} first.`);
  }

  if (outcome === "failed") {
    request.status = "failed";
    return next;
  }
  if (outcome === "partial") {
    request.status = "partial";
    request.initiatedAt = request.initiatedAt ?? at;
    return next;
  }
  if (outcome === "pending") {
    request.status = "pending";
    request.initiatedAt = request.initiatedAt ?? at;
    request.transactionId = paymentTxIdFor(paymentRequestId);
    request.txHash =
      acceptedPaymentTxHash(meta.txHash) ?? request.txHash ?? demoTxHash(paymentRequestId);
    upsertLedger(next, {
      transactionId: request.transactionId,
      kind: "rent_payment",
      offerId: request.offerId,
      offerReference: request.offerReference,
      paymentRequestId,
      collectionId: null,
      distributionId: null,
      amountXcgCents: request.amountXcgCents,
      amountUsdcAtomic: request.amountUsdcAtomic,
      status: "pending",
      createdAt: request.initiatedAt,
      confirmedAt: null,
      txHash: request.txHash,
      fromLabel: renterWalletLedgerLabel(),
      toLabel: receivingLedgerLabel(),
    });
    return next;
  }

  const day = at.slice(0, 10);
  request.status = "confirmed";
  request.initiatedAt = request.initiatedAt ?? at;
  request.confirmedAt = at;
  request.transactionId = paymentTxIdFor(paymentRequestId);
  request.txHash =
    acceptedPaymentTxHash(meta.txHash) ?? request.txHash ?? demoTxHash(paymentRequestId);

  const collection = ensureCollection(offer, request.receivableN, day);
  collection.status = "released";
  const distributionId = distributionIdFor(offer.reference, request.receivableN);
  const existingDistribution = next.distributions?.find((row) => row.distributionId === distributionId);
  const distribution: DistributionRecord = existingDistribution ?? {
    distributionId,
    collectionId: collection.id,
    positionId: positionIdFor(offer.reference),
    offerId: request.offerId,
    offerReference: offer.reference,
    amountCents: collection.amountCents,
    status: "distributed",
    createdAt: at,
    distributedAt: at,
    transactionId: distributionTxIdFor(offer.reference, request.receivableN),
    txHash: demoTxHash(`dist${offer.reference}${request.receivableN}`),
  };
  if (!existingDistribution) {
    next.distributions = [distribution, ...(next.distributions ?? [])];
  } else {
    existingDistribution.status = "distributed";
    existingDistribution.distributedAt = existingDistribution.distributedAt ?? at;
  }

  upsertLedger(next, {
    transactionId: request.transactionId,
    kind: "rent_payment",
    offerId: request.offerId,
    offerReference: request.offerReference,
    paymentRequestId,
    collectionId: collection.id,
    distributionId,
    amountXcgCents: request.amountXcgCents,
    amountUsdcAtomic: request.amountUsdcAtomic,
    status: "confirmed",
    createdAt: request.initiatedAt,
    confirmedAt: at,
    txHash: request.txHash,
    fromLabel: renterWalletLedgerLabel(),
    toLabel: receivingLedgerLabel(),
  });
  upsertLedger(next, {
    transactionId: distribution.transactionId,
    kind: "holder_distribution",
    offerId: request.offerId,
    offerReference: offer.reference,
    paymentRequestId,
    collectionId: collection.id,
    distributionId,
    amountXcgCents: collection.amountCents,
    amountUsdcAtomic: null,
    status: "confirmed",
    createdAt: at,
    confirmedAt: at,
    txHash: distribution.txHash,
    fromLabel: "Collection account",
    toLabel: "Holder position",
  });

  const holder = offer.holders[0];
  if (holder) {
    holder.receivedCents = offer.collections
      .filter((row) => row.status === "received" || row.status === "reconciled" || row.status === "released")
      .reduce((sum, row) => sum + row.amountCents, 0);
  }
  if (offer.status === "live") offer.status = "collecting";
  offer.nextAction = "Record the next scheduled month";
  offer.events = [
    {
      id: `ev-${offer.reference}-pay-${request.receivableN}`,
      at,
      title: `Collection received · month ${request.receivableN}`,
      detail: "Rent collected. Later collections go to holders, not back to the landlord.",
      actor: "System",
    },
    ...offer.events.filter((row) => row.id !== `ev-${offer.reference}-pay-${request.receivableN}`),
  ];

  return next;
}

function upsertLedger(book: DemoBook, row: LedgerTransaction) {
  const list = book.ledgerTransactions ?? [];
  const index = list.findIndex((item) => item.transactionId === row.transactionId);
  if (index === -1) book.ledgerTransactions = [row, ...list];
  else list[index] = { ...list[index], ...row };
}

export function applyOpsCollection(
  book: DemoBook,
  reference: string,
  receivableN: number,
  at = new Date().toISOString(),
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const offer = next.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const collection = ensureCollection(offer, receivableN, at.slice(0, 10));
  const request = next.paymentRequests?.find(
    (row) => row.offerReference === reference && row.receivableN === receivableN,
  );
  if (request && request.status !== "confirmed") {
    return applyPaymentOutcome(next, request.paymentRequestId, "confirmed", at);
  }
  const distributionId = distributionIdFor(offer.reference, receivableN);
  collection.status = "released";
  if (!next.distributions?.some((row) => row.distributionId === distributionId)) {
    next.distributions = [
      {
        distributionId,
        collectionId: collection.id,
        positionId: positionIdFor(offer.reference),
        offerId: offer.offerId ?? offerIdFromReference(offer.reference),
        offerReference: offer.reference,
        amountCents: collection.amountCents,
        status: "distributed",
        createdAt: at,
        distributedAt: at,
        transactionId: distributionTxIdFor(offer.reference, receivableN),
        txHash: demoTxHash(`dist${offer.reference}${receivableN}`),
      },
      ...(next.distributions ?? []),
    ];
  }
  const holder = offer.holders[0];
  if (holder) {
    holder.receivedCents = offer.collections
      .filter(
        (row) =>
          row.status === "received" ||
          row.status === "reconciled" ||
          row.status === "released",
      )
      .reduce((sum, row) => sum + row.amountCents, 0);
  }
  if (offer.status === "live") offer.status = "collecting";
  offer.nextAction = "Record the next scheduled month";
  offer.events = [
    {
      id: `ev-${offer.reference}-ops-${receivableN}`,
      at,
      title: `Collection received · month ${receivableN}`,
      detail:
        "Rent collected. Later collections go to holders, not back to the landlord.",
      actor: "D. Martina",
    },
    ...offer.events.filter((row) => row.id !== `ev-${offer.reference}-ops-${receivableN}`),
  ];
  return next;
}

const OPEN_PAYMENT_STATUSES = new Set([
  "due",
  "initiated",
  "pending",
  "failed",
  "partial",
  "overdue",
]);

export function currentRenterPaymentRequest(book: DemoBook): PaymentRequest | null {
  const requests = (book.paymentRequests ?? [])
    .filter((row) => row.accountId === RENTER_ACCOUNT_ID)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return requests.find((row) => OPEN_PAYMENT_STATUSES.has(row.status)) ?? null;
}

export function earlierOpenPaymentRequest(
  book: DemoBook,
  paymentRequestId: string,
): PaymentRequest | null {
  const request = (book.paymentRequests ?? []).find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request) return null;
  return (
    (book.paymentRequests ?? [])
      .filter(
        (row) =>
          row.accountId === request.accountId &&
          row.offerReference === request.offerReference &&
          row.dueDate < request.dueDate &&
          OPEN_PAYMENT_STATUSES.has(row.status),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
  );
}
