import {
  DEMO_COMPANY_SAFE,
  DEMO_NFT_CONTRACT,
  DEMO_SALES_PROCEEDS_SAFE,
  companyFeeTxIdFor,
  demoTxHash,
  isExplorableTxHash,
  landlordClaimTxIdFor,
  offerNftPaymentAddress,
  offerNftTokenId,
} from "@/lib/rent-advance/ids";
import type {
  CryptoConfig,
  DemoAccount,
  DemoBook,
  LandlordProceedsStatus,
  LedgerTransaction,
  LandlordPayout,
  Offer,
  OfferCustody,
} from "@/lib/rent-advance/types";

const DEMO_ADDRESS = /^0xDEMO[a-zA-Z0-9]{1,36}$/;
export const DEMO_LANDLORD_PAYOUT_ADDRESS = "0xDEMOLANDLORDPAYOUT0001";

export function defaultLandlordPayout(
  incoming?: Partial<LandlordPayout> | null,
): LandlordPayout {
  const cryptoAddress = isClaimableAddress(incoming?.cryptoAddress)
    ? normalizePayoutAddress(incoming?.cryptoAddress ?? "")
    : DEMO_LANDLORD_PAYOUT_ADDRESS;
  return {
    method: incoming?.method === "bank" ? "bank" : "crypto",
    cryptoAddress,
    fiatCurrency: "XCG",
    partner: "Girasol",
    bankFeeRate: 0.015,
    bankAvailability: "coming_soon",
  };
}

export function emptyCustody(): OfferCustody {
  return {
    nftTokenId: null,
    nftContractAddress: null,
    nftPaymentAddress: null,
    nftOwner: null,
    mintedAt: null,
    transferredAt: null,
    saleProceedsStatus: "none",
    saleGrossCents: 0,
    companyFeeCents: 0,
    landlordClaimableCents: 0,
    landlordClaimedCents: 0,
    landlordClaimToAddress: null,
    landlordClaimedAt: null,
    landlordClaimTxHash: null,
    feeTransferredAt: null,
    feeTransferTxHash: null,
    saleProceedsTxHash: null,
  };
}

export function mergeCustody(raw?: Partial<OfferCustody> | null): OfferCustody {
  return {
    ...emptyCustody(),
    ...raw,
    landlordClaimTxHash: isExplorableTxHash(raw?.landlordClaimTxHash)
      ? raw?.landlordClaimTxHash ?? null
      : null,
    feeTransferTxHash: isExplorableTxHash(raw?.feeTransferTxHash)
      ? raw?.feeTransferTxHash ?? null
      : null,
    saleProceedsTxHash: isExplorableTxHash(raw?.saleProceedsTxHash)
      ? raw?.saleProceedsTxHash ?? null
      : null,
  };
}

export function isApprovedOfferStatus(status: Offer["status"]): boolean {
  return status !== "draft" && status !== "under_review";
}

export function isOfferFilled(offer: Offer): boolean {
  return offer.offeringCents > 0 && offer.fundedCents >= offer.offeringCents;
}

export function saleGrossCents(offer: Offer): number {
  return Math.max(0, offer.fundedCents);
}

export function companyFeeFromSaleCents(offer: Offer): number {
  return Math.max(0, saleGrossCents(offer) - offer.purchasePriceCents);
}

export function landlordNetCents(offer: Offer): number {
  return Math.min(offer.purchasePriceCents, saleGrossCents(offer));
}

export function isClaimableAddress(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return DEMO_ADDRESS.test(trimmed);
}

export function normalizePayoutAddress(value: string): string {
  return value.trim();
}

export function rentReceivingAddressFor(offer: Offer, config: CryptoConfig): string {
  const custody = mergeCustody(offer.custody);
  if (isOfferFilled(offer) && custody.nftPaymentAddress) {
    return custody.nftPaymentAddress;
  }
  return (
    config.companySafeAddress ??
    config.safeAddress ??
    DEMO_COMPANY_SAFE
  );
}

export function savedPayoutAddress(book: DemoBook): string | null {
  const address = book.accounts?.[0]?.payoutAddress?.trim();
  return address && isClaimableAddress(address) ? address : null;
}

export function mintOfferNft(
  offer: Offer,
  config: CryptoConfig,
  at = new Date().toISOString(),
): Offer {
  const custody = mergeCustody(offer.custody);
  if (custody.nftTokenId) {
    return { ...offer, custody };
  }
  return {
    ...offer,
    custody: {
      ...custody,
      nftTokenId: offerNftTokenId(offer.reference),
      nftContractAddress: config.offerNftContract ?? DEMO_NFT_CONTRACT,
      nftPaymentAddress: offerNftPaymentAddress(offer.reference),
      nftOwner: "company_safe",
      mintedAt: at,
    },
    events: [
      {
        id: `ev-${offer.reference}-mint`,
        at,
        title: "Offer created by Merkado",
        detail:
          "Merkado created the offer after approval. The landlord did not connect a wallet.",
        actor: "System",
      },
      ...offer.events.filter((row) => row.id !== `ev-${offer.reference}-mint`),
    ],
  };
}

export function settleSoldOffer(offer: Offer, at = new Date().toISOString()): Offer {
  const custody = mergeCustody(offer.custody);
  const payout = defaultLandlordPayout(offer.payout);
  if (!isOfferFilled(offer) || custody.saleProceedsStatus === "claimed") {
    return {
      ...offer,
      payout,
      custody: {
        ...custody,
        nftOwner: custody.nftTokenId ? "holder" : custody.nftOwner,
      },
    };
  }
  const feeCents = companyFeeFromSaleCents(offer);
  const netCents = landlordNetCents(offer);
  const payoutAddress =
    payout.method === "crypto" && isClaimableAddress(payout.cryptoAddress)
      ? payout.cryptoAddress
      : null;
  return {
    ...offer,
    payout,
    nextAction: payoutAddress
      ? "Sale amount paid automatically"
      : "Automatic payout needs attention",
    custody: {
      ...custody,
      nftOwner: "holder",
      transferredAt: custody.transferredAt ?? at,
      saleProceedsStatus: payoutAddress ? "claimed" : "held",
      saleGrossCents: saleGrossCents(offer),
      companyFeeCents: feeCents,
      landlordClaimableCents: payoutAddress ? 0 : netCents,
      landlordClaimedCents: payoutAddress ? netCents : 0,
      landlordClaimToAddress: payoutAddress,
      landlordClaimedAt: payoutAddress ? at : null,
      landlordClaimTxHash: null,
      feeTransferredAt: feeCents > 0 ? at : null,
      feeTransferTxHash: null,
      saleProceedsTxHash: null,
    },
    events: [
      {
        id: `ev-${offer.reference}-sale-split`,
        at,
        title: payoutAddress
          ? "Sale amount paid automatically"
          : "Automatic payout needs attention",
        detail:
          payoutAddress
            ? "The whole offer was bought and the sale amount was marked paid to the payout address saved before submission."
            : "The whole offer was bought, but the saved payout method is not enabled.",
        actor: "System",
      },
      ...offer.events.filter((row) => row.id !== `ev-${offer.reference}-sale-split`),
    ],
  };
}

export function ensureOfferCustody(
  offer: Offer,
  config: CryptoConfig,
  at = offer.publishedAt ?? offer.createdAt,
): Offer {
  const incoming = mergeCustody(offer.custody);
  if (
    offer.reference === "MRA-001" &&
    isOfferFilled(offer) &&
    incoming.saleProceedsStatus === "none"
  ) {
    return { ...offer, custody: fundedSeedCustody(offer, at) };
  }

  let next: Offer = { ...offer, custody: incoming };
  if (isApprovedOfferStatus(next.status)) {
    next = mintOfferNft(next, config, next.custody?.mintedAt ?? at);
  }
  if (isOfferFilled(next) && next.custody?.nftTokenId) {
    next = settleSoldOffer(next, next.custody.transferredAt ?? at);
  }
  return next;
}

export function fundedSeedCustody(offer: Offer, at: string): OfferCustody {
  const minted = mintOfferNft(offer, {
    offerNftContract: DEMO_NFT_CONTRACT,
  } as CryptoConfig, at);
  const sold = settleSoldOffer(minted, at);
  return mergeCustody(sold.custody);
}

export function applyHolderCollect(
  book: DemoBook,
  reference: string,
  distributionId?: string | null,
  at = new Date().toISOString(),
): DemoBook {
  const next = structuredClone(book);
  const offer = next.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const pending = (next.distributions ?? []).filter(
    (row) =>
      row.offerReference === reference &&
      row.status === "pending" &&
      (!distributionId || row.distributionId === distributionId),
  );
  if (pending.length === 0) {
    throw new Error("There is no rent waiting to be claimed from this listing.");
  }

  for (const distribution of pending) {
    distribution.status = "distributed";
    distribution.distributedAt = at;
    distribution.txHash = distribution.txHash ?? demoTxHash(`collect${distribution.distributionId}`);
    const ledger = next.ledgerTransactions?.find(
      (row) => row.transactionId === distribution.transactionId,
    );
    if (ledger) {
      ledger.status = "confirmed";
      ledger.confirmedAt = at;
      ledger.txHash = distribution.txHash;
    }
  }

  const holder = offer.holders[0];
  if (holder) {
    holder.receivedCents = (next.distributions ?? [])
      .filter((row) => row.offerReference === reference && row.status === "distributed")
      .reduce((sum, row) => sum + row.amountCents, 0);
  }
  offer.nextAction =
    mergeCustody(offer.custody).saleProceedsStatus === "held"
      ? "Automatic payout needs attention"
      : "Sale amount paid automatically";
  offer.events = [
    {
      id: `ev-${reference}-collect-${pending[0]?.distributionId ?? "rent"}`,
      at,
      title: "Rent claimed from the listing",
      detail: "The holder claimed rent from this listing. It was not paid back to the landlord.",
      actor: "System",
    },
    ...offer.events.filter(
      (row) => !row.id.startsWith(`ev-${reference}-collect-`),
    ),
  ];
  return next;
}

export function applyPayoutAddress(
  book: DemoBook,
  address: string,
  at = new Date().toISOString(),
): DemoBook {
  const next = structuredClone(book);
  const trimmed = normalizePayoutAddress(address);
  if (!isClaimableAddress(trimmed)) {
    throw new Error("Enter a fictional demo address beginning with 0xDEMO.");
  }
  const accounts = next.accounts?.length ? next.accounts : [];
  if (!accounts[0]) {
    throw new Error("No Merkado account is available in this demo.");
  }
  accounts[0] = {
    ...accounts[0],
    payoutAddress: trimmed,
    payoutAddressUpdatedAt: at,
  };
  next.accounts = accounts;
  return next;
}

export type LandlordProceedsUiStatus =
  | "waiting"
  | "available"
  | "processing"
  | "failed"
  | "paid";

export function landlordProceedsLabel(status: LandlordProceedsStatus): string {
  switch (status) {
    case "claimable":
      return "Available";
    case "claimed":
      return "Paid";
    case "held":
      return "Processing";
    default:
      return "Waiting";
  }
}

export function landlordProceedsPresentation(offer: Offer) {
  const custody = mergeCustody(offer.custody);
  const filled = isOfferFilled(offer);
  let status: LandlordProceedsUiStatus = "waiting";
  if (custody.saleProceedsStatus === "claimed") status = "paid";
  else if (custody.saleProceedsStatus === "claimable") status = "processing";
  else if (custody.saleProceedsStatus === "held") status = "processing";
  else if (!filled) status = "waiting";

  return {
    status,
    purchasePriceCents: offer.purchasePriceCents,
    feeCents: offer.feeCents,
    amountCents:
      status === "paid"
        ? custody.landlordClaimedCents || offer.purchasePriceCents
        : custody.landlordClaimableCents || offer.purchasePriceCents,
    lockedAddress:
      custody.landlordClaimToAddress ??
      (offer.payout?.method === "crypto" ? offer.payout.cryptoAddress : null),
    fundingRecorded: filled,
  };
}

export function companyFeeLedger(offer: Offer): LedgerTransaction | null {
  const custody = mergeCustody(offer.custody);
  if (custody.companyFeeCents <= 0 || !custody.feeTransferTxHash) return null;
  return {
    transactionId: companyFeeTxIdFor(offer.reference),
    kind: "company_fee",
    offerId: offer.offerId ?? `offer-${offer.reference.toLowerCase()}`,
    offerReference: offer.reference,
    paymentRequestId: null,
    collectionId: null,
    distributionId: null,
    amountXcgCents: custody.companyFeeCents,
    amountUsdcAtomic: null,
    status: "confirmed",
    createdAt: custody.feeTransferredAt ?? offer.publishedAt ?? offer.createdAt,
    confirmedAt: custody.feeTransferredAt ?? offer.publishedAt ?? offer.createdAt,
    txHash: custody.feeTransferTxHash,
    fromLabel: "Sales proceeds Safe",
    toLabel: "Company Safe",
  };
}

export function landlordClaimLedger(offer: Offer): LedgerTransaction | null {
  const custody = mergeCustody(offer.custody);
  if (custody.saleProceedsStatus !== "claimed" || custody.landlordClaimedCents <= 0) {
    return null;
  }
  return {
    transactionId: landlordClaimTxIdFor(offer.reference),
    kind: "landlord_claim",
    offerId: offer.offerId ?? `offer-${offer.reference.toLowerCase()}`,
    offerReference: offer.reference,
    paymentRequestId: null,
    collectionId: null,
    distributionId: null,
    amountXcgCents: custody.landlordClaimedCents,
    amountUsdcAtomic: null,
    status: "confirmed",
    createdAt: custody.landlordClaimedAt ?? offer.publishedAt ?? offer.createdAt,
    confirmedAt: custody.landlordClaimedAt ?? offer.publishedAt ?? offer.createdAt,
    txHash: custody.landlordClaimTxHash,
    fromLabel: "Sales proceeds Safe",
    toLabel: "Landlord payout address",
  };
}

export function defaultCustodyAddresses(incoming?: Partial<CryptoConfig> | null) {
  const company =
    incoming?.companySafeAddress?.trim() ||
    incoming?.safeAddress?.trim() ||
    DEMO_COMPANY_SAFE;
  return {
    companySafeAddress: company,
    salesProceedsSafeAddress:
      incoming?.salesProceedsSafeAddress?.trim() || DEMO_SALES_PROCEEDS_SAFE,
    offerNftContract: incoming?.offerNftContract?.trim() || DEMO_NFT_CONTRACT,
    safeAddress: company,
  };
}

export function withPayoutDefaults(account: DemoAccount): DemoAccount {
  const payoutAddress = isClaimableAddress(account.payoutAddress)
    ? account.payoutAddress?.trim() ?? null
    : null;
  return {
    ...account,
    payoutAddress,
    payoutAddressUpdatedAt: payoutAddress
      ? account.payoutAddressUpdatedAt ?? null
      : null,
  };
}
