import { DEMO_RENTER_PROFILE } from "@/lib/demo-account-profile";
import { ACTORS } from "@/lib/rent-advance/actors";
import {
  defaultLandlordPayout,
  mergeOnchain,
  rentReceivingAddressFor,
  purchasePriceAtomicFor,
  withPayoutDefaults,
} from "@/lib/rent-advance/custody";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  COMPANY_SAFE_ACCOUNT_ID,
  RENTER_ACCOUNT_ID,
  acceptedLiveTxHash,
  collectionIdFor,
  distributionIdFor,
  distributionTxIdFor,
  offerIdFromReference,
  paymentTxIdFor,
  periodLabelFromDueDate,
  positionIdFor,
  receivableIdFor,
} from "@/lib/rent-advance/ids";
import {
  getPayNetwork,
  merkadoContractAddressOrNull,
  resolvePayNetworkKey,
  resolvedCompanySafe,
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

export type VerifiedPurchaseFacts = {
  tokenId: bigint | number | string;
  purchaserAddress: string;
  txHash: string;
  blockNumber?: bigint | number | null;
  payoutAddress: string;
  purchasePriceAtomic: bigint | number | string;
};

export type VerifiedRentDepositFacts = {
  tokenId: bigint | number | string;
  opaquePaymentId: string;
  payerAddress: string;
  amountAtomic: bigint | number | string;
  txHash: string;
  blockNumber?: bigint | number | null;
};

export type VerifiedRentClaimFacts = {
  tokenId: bigint | number | string;
  ownerAddress: string;
  amountAtomic: bigint | number | string;
  txHash: string;
  blockNumber?: bigint | number | null;
};

export function cryptoConfigFor(
  key = resolvePayNetworkKey(),
  incoming?: Partial<CryptoConfig> | null,
): CryptoConfig {
  const network = getPayNetwork(key);
  const companySafeAddress = resolvedCompanySafe();
  // The env value is the single source of truth for the contract address and
  // is used every time. Reset does not clear it.
  const contract = merkadoContractAddressOrNull();
  return {
    networkKey: network.key,
    chainId: network.chainId,
    networkLabel: network.networkLabel,
    usdcContract: network.usdcContract,
    usdcDecimals: network.usdcDecimals,
    safeAccountId: incoming?.safeAccountId ?? COMPANY_SAFE_ACCOUNT_ID,
    explorerBaseUrl: network.explorerBaseUrl,
    companySafeAddress,
    safeAddress: companySafeAddress,
    offerNftContract: contract,
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
      payoutAddress: null,
      payoutAddressUpdatedAt: null,
    },
  ];
}

function ensureOfferIds(offer: Offer): Offer {
  const offerId = offer.offerId ?? offerIdFromReference(offer.reference);
  return {
    ...offer,
    offerId,
    payout: defaultLandlordPayout(offer.payout),
    expiresAt: null,
    settlementTransactionId: null,
    onchain: mergeOnchain(offer.onchain),
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

function renterAccountIdFor(): string {
  return RENTER_ACCOUNT_ID;
}

function shouldMintPaymentRequests(offer: Offer): boolean {
  return offer.status === "live" || offer.status === "collecting" || offer.status === "default";
}

export function canSubscribeOffer(offer: Offer): boolean {
  const onchain = mergeOnchain(offer.onchain);
  return (
    (offer.status === "funding" || offer.status === "live" || offer.status === "collecting") &&
    onchain.tokenId != null &&
    !onchain.purchased &&
    offer.offeringCents > offer.fundedCents
  );
}

/**
 * Apply a verified whole-offer purchase to the book projection. The receipt
 * was verified server-side before this runs; this never trusts the client.
 * Idempotent: a second verified purchase of the same offer does nothing.
 */
export function applyVerifiedPurchase(
  book: DemoBook,
  reference: string,
  facts: VerifiedPurchaseFacts,
  at = new Date().toISOString(),
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const offer = next.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.purchased) return next;
  if (!canSubscribeOffer(offer)) {
    throw new Error("This offer is not open to purchase.");
  }

  const expectedAtomic = purchasePriceAtomicFor(offer);
  const actualAtomic = toBigInt(facts.purchasePriceAtomic);
  if (actualAtomic !== expectedAtomic) {
    throw new Error("This offer must be purchased in full.");
  }

  offer.fundedCents = offer.offeringCents;
  offer.status = "live";
  offer.nextAction = "Sale proceeds paid to the locked payout address";
  offer.onchain = {
    ...onchain,
    purchased: true,
    purchaseTxHash: acceptedLiveTxHash(facts.txHash),
    purchaserAddress: facts.purchaserAddress,
    landlordPaid: true,
  };
  offer.holders = [
    {
      holderId: `nft-${String(facts.tokenId)}`,
      holderName: "Current NFT owner",
      units: 1,
      contributedCents: offer.purchasePriceCents,
      receivedCents: 0,
      anonymised: true,
    },
  ];
  offer.events = [
    {
      id: `ev-${reference}-purchase-${at}`,
      at,
      title: "Whole offer purchased",
      detail:
        "A buyer bought the whole offer NFT. The sale amount was paid to the payout address locked at mint. Rent now goes to the offer contract.",
      actor: "System",
    },
    ...offer.events.filter((row) => row.id !== `ev-${reference}-purchase-${at}`),
  ];
  return normalizeBook(next);
}

function toBigInt(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function paymentRequestForReceivable(
  offer: Offer,
  n: number,
  receivingAddress: string | null,
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
    receivingAddress: receivingAddress ?? "",
    status: confirmed ? "confirmed" : receivable.status === "missed" ? "overdue" : "due",
    initiatedAt: null,
    confirmedAt: confirmed ? receivable.dueDate : null,
    transactionId: confirmed ? paymentTxIdFor(paymentRequestId) : null,
    txHash: null,
    opaquePaymentId: null,
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
      status: "claimable" as const,
      createdAt: row.receivedOn,
      claimedAt: null,
      transactionId: distributionTxIdFor(offer.reference, row.receivableN),
      txHash: null,
    }));
}

function positionForOffer(offer: Offer): PositionRecord | null {
  const onchain = mergeOnchain(offer.onchain);
  if (offer.fundedCents <= 0) return null;
  return {
    positionId: positionIdFor(offer.reference),
    offerId: offer.offerId ?? offerIdFromReference(offer.reference),
    offerReference: offer.reference,
    holderId: offer.holders[0]?.holderId ?? "act-purchaser",
    settlementTransactionId: null,
    externalTokenId: onchain.tokenId != null ? String(onchain.tokenId) : null,
  };
}

export function normalizeBook(raw: unknown): DemoBook {
  const book = (raw ?? {}) as DemoBook;
  const cryptoConfig = mergeCryptoConfig(book.cryptoConfig);
  const offers = (book.offers ?? [])
    .map(ensureOfferIds)
    .map((offer) => ({ ...offer, onchain: mergeOnchain(offer.onchain) }));
  const seedAccounts = (book.accounts?.length ? book.accounts : defaultAccounts()).map(
    withPayoutDefaults,
  );
  const existingRequests = new Map(
    (book.paymentRequests ?? []).map((row) => [row.paymentRequestId, row]),
  );
  const paymentRequests: PaymentRequest[] = [];
  for (const offer of offers) {
    if (!shouldMintPaymentRequests(offer)) continue;
    for (const receivable of offer.receivables) {
      const next = paymentRequestForReceivable(
        offer,
        receivable.n,
        rentReceivingAddressFor(offer, cryptoConfig),
      );
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
              receivingAddress: next.receivingAddress || previous.receivingAddress,
              status: next.status === "confirmed" ? "confirmed" : previous.status,
              confirmedAt: previous.confirmedAt ?? next.confirmedAt,
              transactionId: previous.transactionId ?? next.transactionId,
              txHash: acceptedLiveTxHash(previous.txHash),
              opaquePaymentId: previous.opaquePaymentId ?? null,
            }
          : next,
      );
    }
  }

  const existingDist = new Map((book.distributions ?? []).map((row) => [row.distributionId, row]));
  const distributions = offers.flatMap((offer) =>
    distributionsForOffer(offer).map((row) => {
      const existing = existingDist.get(row.distributionId);
      if (!existing) return row;
      return {
        ...row,
        ...existing,
        status: existing.status === "claimed" ? ("claimed" as const) : ("claimable" as const),
        claimedAt: existing.status === "claimed" ? existing.claimedAt ?? row.createdAt : null,
        txHash: acceptedLiveTxHash(existing.txHash),
      };
    }),
  );

  const existingTx = new Map((book.ledgerTransactions ?? []).map((row) => [row.transactionId, row]));
  const ledgerTransactions: LedgerTransaction[] = [];
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
      fromLabel: "Renter wallet",
      toLabel: "Merkado rent offer contract",
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
      status: distribution.status === "claimed" ? "confirmed" : "pending",
      createdAt: distribution.createdAt,
      confirmedAt: distribution.claimedAt,
      txHash: distribution.txHash,
      fromLabel: "Merkado rent offer contract",
      toLabel: "Current NFT owner",
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
      return existing
        ? {
            ...row,
            ...existing,
            settlementTransactionId: null,
            externalTokenId: row.externalTokenId ?? existing.externalTokenId,
          }
        : row;
    });

  for (const offer of offers) {
    const holder = offer.holders[0];
    if (!holder) continue;
    holder.receivedCents = distributions
      .filter((row) => row.offerReference === offer.reference && row.status === "claimed")
      .reduce((sum, row) => sum + row.amountCents, 0);
  }

  return {
    ...book,
    offers,
    actors: ACTORS,
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

function upsertLedger(book: DemoBook, row: LedgerTransaction) {
  const list = book.ledgerTransactions ?? [];
  const index = list.findIndex((item) => item.transactionId === row.transactionId);
  if (index === -1) book.ledgerTransactions = [row, ...list];
  else list[index] = { ...list[index], ...row };
}

/**
 * Apply a verified rent deposit (RentDeposited event) to the book exactly
 * once. Marks the request confirmed, the receivable received, one collection,
 * and one claimable distribution. Idempotent: re-verifying the same request
 * does nothing.
 */
export function applyVerifiedRentDeposit(
  book: DemoBook,
  paymentRequestId: string,
  facts: VerifiedRentDepositFacts,
  at = new Date().toISOString(),
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const request = next.paymentRequests?.find((row) => row.paymentRequestId === paymentRequestId);
  if (!request) throw new Error("Payment request not found.");
  if (request.status === "confirmed") return next;
  if (request.status === "expired") throw new Error("This payment link has expired.");

  const offer = next.offers.find((row) => row.reference === request.offerReference);
  if (!offer) throw new Error("Offer not found.");
  if (offer.status === "draft" || offer.status === "under_review") {
    throw new Error("This offer is not live, so rent cannot be collected yet.");
  }
  const earlier = earlierOpenPaymentRequest(next, paymentRequestId);
  if (earlier) {
    throw new Error(`Pay ${earlier.periodLabel} first.`);
  }

  const expectedAtomic = BigInt(request.amountUsdcAtomic);
  const actualAtomic = toBigInt(facts.amountAtomic);
  if (actualAtomic !== expectedAtomic) {
    throw new Error("Rent amount on the receipt does not match the request.");
  }

  const day = at.slice(0, 10);
  request.status = "confirmed";
  request.initiatedAt = request.initiatedAt ?? at;
  request.confirmedAt = at;
  request.transactionId = paymentTxIdFor(paymentRequestId);
  request.txHash = acceptedLiveTxHash(facts.txHash);
  request.opaquePaymentId = request.opaquePaymentId ?? facts.opaquePaymentId;

  const collection = ensureCollection(offer, request.receivableN, day);
  collection.status = "reconciled";
  const distributionId = distributionIdFor(offer.reference, request.receivableN);
  const existingDistribution = next.distributions?.find((row) => row.distributionId === distributionId);
  const distribution: DistributionRecord = existingDistribution ?? {
    distributionId,
    collectionId: collection.id,
    positionId: positionIdFor(offer.reference),
    offerId: request.offerId,
    offerReference: offer.reference,
    amountCents: collection.amountCents,
    status: "claimable",
    createdAt: at,
    claimedAt: null,
    transactionId: distributionTxIdFor(offer.reference, request.receivableN),
    txHash: null,
  };
  if (!existingDistribution) {
    next.distributions = [distribution, ...(next.distributions ?? [])];
  } else if (existingDistribution.status !== "claimed") {
    existingDistribution.status = "claimable";
    existingDistribution.amountCents = collection.amountCents;
  }

  const onchain = mergeOnchain(offer.onchain);
  offer.onchain = {
    ...onchain,
    claimableRentCents: onchain.claimableRentCents + collection.amountCents,
  };

  upsertLedger(next, {
    transactionId: request.transactionId,
    kind: "rent_payment",
    offerId: request.offerId,
    offerReference: offer.reference,
    paymentRequestId,
    collectionId: collection.id,
    distributionId,
    amountXcgCents: request.amountXcgCents,
    amountUsdcAtomic: request.amountUsdcAtomic,
    status: "confirmed",
    createdAt: request.initiatedAt ?? at,
    confirmedAt: at,
    txHash: request.txHash,
    fromLabel: "Renter wallet",
    toLabel: "Merkado rent offer contract",
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
    status: "pending",
    createdAt: at,
    confirmedAt: null,
    txHash: null,
    fromLabel: "Merkado rent offer contract",
    toLabel: "Current NFT owner",
  });

  if (offer.status === "live") offer.status = "collecting";
  offer.nextAction = "Rent collected · the NFT owner claims it from Portfolio";
  offer.events = [
    {
      id: `ev-${offer.reference}-pay-${request.receivableN}`,
      at,
      title: `Collection received · month ${request.receivableN}`,
      detail:
        "Rent arrived on the offer contract. The current NFT owner claims it from Portfolio. It is not paid back to the landlord.",
      actor: "System",
    },
    ...offer.events.filter((row) => row.id !== `ev-${offer.reference}-pay-${request.receivableN}`),
  ];

  return next;
}

/**
 * Apply a verified rent claim (RentClaimed event) to the book exactly once.
 * Claimable distributions become claimed; a repeat claim does nothing.
 */
export function applyVerifiedRentClaim(
  book: DemoBook,
  reference: string,
  facts: VerifiedRentClaimFacts,
  at = new Date().toISOString(),
  distributionId?: string | null,
): DemoBook {
  const next = normalizeBook(structuredClone(book));
  const offer = next.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId != null && toBigInt(facts.tokenId) !== BigInt(onchain.tokenId)) {
    throw new Error("Token id on the claim does not match this listing.");
  }
  const pending = (next.distributions ?? []).filter(
    (row) =>
      row.offerReference === reference &&
      row.status === "claimable" &&
      (!distributionId || row.distributionId === distributionId),
  );
  if (pending.length === 0) {
    return next;
  }

  let claimedCents = 0;
  for (const distribution of pending) {
    distribution.status = "claimed";
    distribution.claimedAt = at;
    distribution.txHash = acceptedLiveTxHash(facts.txHash) ?? distribution.txHash;
    claimedCents += distribution.amountCents;
    const ledger = next.ledgerTransactions?.find(
      (row) => row.transactionId === distribution.transactionId,
    );
    if (ledger) {
      ledger.status = "confirmed";
      ledger.confirmedAt = at;
      ledger.txHash = distribution.txHash;
    }
  }

  offer.onchain = {
    ...onchain,
    claimableRentCents: Math.max(0, onchain.claimableRentCents - claimedCents),
    claimedRentCents: onchain.claimedRentCents + claimedCents,
  };

  const holder = offer.holders[0];
  if (holder) {
    holder.receivedCents = (next.distributions ?? [])
      .filter((row) => row.offerReference === reference && row.status === "claimed")
      .reduce((sum, row) => sum + row.amountCents, 0);
  }
  offer.nextAction = "Rent claimed by the current NFT owner";
  offer.events = [
    {
      id: `ev-${reference}-claim-${at}`,
      at,
      title: "Rent claimed from the offer",
      detail: "The current NFT owner claimed pooled rent from the offer contract.",
      actor: "System",
    },
    ...offer.events.filter((row) => !row.id.startsWith(`ev-${reference}-claim-`)),
  ];
  return next;
}

/** Ops fallback: record a collection that arrived outside Merkado Pay. */
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
    request.status = "confirmed";
    request.initiatedAt = request.initiatedAt ?? at;
    request.confirmedAt = request.confirmedAt ?? at;
    request.transactionId = request.transactionId ?? paymentTxIdFor(request.paymentRequestId);
    request.txHash = acceptedLiveTxHash(request.txHash);
    upsertLedger(next, {
      transactionId: request.transactionId,
      kind: "rent_payment",
      offerId: request.offerId,
      offerReference: offer.reference,
      paymentRequestId: request.paymentRequestId,
      collectionId: collection.id,
      distributionId: distributionIdFor(offer.reference, receivableN),
      amountXcgCents: request.amountXcgCents,
      amountUsdcAtomic: request.amountUsdcAtomic,
      status: "confirmed",
      createdAt: request.initiatedAt,
      confirmedAt: request.confirmedAt,
      txHash: request.txHash,
      fromLabel: "Operations",
      toLabel: "Merkado rent offer contract",
    });
  }
  const distributionId = distributionIdFor(offer.reference, receivableN);
  if (!next.distributions?.some((row) => row.distributionId === distributionId)) {
    next.distributions = [
      {
        distributionId,
        collectionId: collection.id,
        positionId: positionIdFor(offer.reference),
        offerId: offer.offerId ?? offerIdFromReference(offer.reference),
        offerReference: offer.reference,
        amountCents: collection.amountCents,
        status: "claimable",
        createdAt: at,
        claimedAt: null,
        transactionId: distributionTxIdFor(offer.reference, receivableN),
        txHash: null,
      },
      ...(next.distributions ?? []),
    ];
  }
  const onchain = mergeOnchain(offer.onchain);
  offer.onchain = {
    ...onchain,
    claimableRentCents: onchain.claimableRentCents + collection.amountCents,
  };
  if (offer.status === "live") offer.status = "collecting";
  offer.nextAction = "Rent collected · the NFT owner claims it from Portfolio";
  offer.events = [
    {
      id: `ev-${offer.reference}-ops-${receivableN}`,
      at,
      title: `Collection received · month ${receivableN}`,
      detail:
        "Rent was recorded by operations. The current NFT owner claims it from Portfolio.",
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
