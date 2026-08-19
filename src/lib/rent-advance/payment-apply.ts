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
  offerIdFromReference,
  paymentTxIdFor,
  periodLabelFromDueDate,
  positionIdFor,
  receivableIdFor,
  settlementTxIdFor,
} from "@/lib/rent-advance/ids";
import {
  getPayNetwork,
  resolvePayNetworkKey,
} from "@/lib/pay/networks";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import type {
  CryptoConfig,
  DemoAccount,
  DemoBook,
  DistributionRecord,
  LedgerTransaction,
  Offer,
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
  return {
    ...offer,
    offerId,
    settlementTransactionId:
      offer.settlementTransactionId ??
      (offer.fundedCents > 0 ? settlementTxIdFor(offer.reference) : null),
    receivables: offer.receivables.map((row) => ({
      ...row,
      receivableId: row.receivableId ?? receivableIdFor(offer.reference, row.n),
    })),
    collections: offer.collections.map((row) => ({
      ...row,
      id: row.id.startsWith("col-") ? row.id.replace(/-\d{10,}$/, "") : collectionIdFor(offer.reference, row.receivableN),
    })),
  };
}

function settlementTransaction(offer: Offer): LedgerTransaction | null {
  if (offer.fundedCents <= 0) return null;
  const transactionId = settlementTxIdFor(offer.reference);
  return {
    transactionId,
    kind: "advance_settlement",
    offerId: offer.offerId ?? offerIdFromReference(offer.reference),
    offerReference: offer.reference,
    paymentRequestId: null,
    collectionId: null,
    distributionId: null,
    amountXcgCents: offer.purchasePriceCents,
    amountUsdcAtomic: null,
    status: "confirmed",
    createdAt: offer.publishedAt ?? offer.createdAt,
    confirmedAt: offer.publishedAt ?? offer.createdAt,
    txHash: demoTxHash(`settle${offer.reference}`),
    fromLabel: "Merkado Direct",
    toLabel: "Landlord",
  };
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
    accountId: offer.tenant.id === "tn-001" ? RENTER_ACCOUNT_ID : `acc-${offer.tenant.id}`,
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
    settlementTransactionId: settlementTxIdFor(offer.reference),
    externalTokenId: null,
  };
}

export function normalizeBook(raw: unknown): DemoBook {
  const book = (raw ?? {}) as DemoBook;
  const cryptoConfig = mergeCryptoConfig(book.cryptoConfig);
  const receivingAddress = cryptoConfig.safeAddress ?? DEMO_RECEIVING_ADDRESS;
  const offers = (book.offers ?? []).map(ensureOfferIds);
  const seedAccounts = book.accounts?.length ? book.accounts : defaultAccounts();
  const existingRequests = new Map(
    (book.paymentRequests ?? []).map((row) => [row.paymentRequestId, row]),
  );
  const paymentRequests: PaymentRequest[] = [];
  for (const offer of offers) {
    if (offer.reference !== "MRA-001") continue;
    if (offer.status === "draft" || offer.status === "under_review") continue;
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
  for (const offer of offers) {
    const settlement = settlementTransaction(offer);
    if (settlement) ledgerTransactions.push(existingTx.get(settlement.transactionId) ?? settlement);
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
      fromLabel: "Renter demo wallet",
      toLabel: "Demo receiving address",
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
    .map((row) => existingPositions.get(row.positionId) ?? row);

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
      fromLabel: "Renter demo wallet",
      toLabel: "Demo receiving address",
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
    fromLabel: "Renter demo wallet",
    toLabel: "Demo receiving address",
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
