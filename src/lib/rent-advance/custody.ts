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
  Offer,
  OfferCustody,
} from "@/lib/rent-advance/types";

const DEMO_ADDRESS = /^0xDEMO[a-zA-Z0-9]{1,36}$/;

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
  if (!isOfferFilled(offer) || custody.saleProceedsStatus === "claimed") {
    return {
      ...offer,
      custody: {
        ...custody,
        nftOwner: custody.nftTokenId ? "holder" : custody.nftOwner,
      },
    };
  }
  if (custody.saleProceedsStatus === "claimable" || custody.saleProceedsStatus === "held") {
    return {
      ...offer,
      custody: {
        ...custody,
        nftOwner: "holder",
        transferredAt: custody.transferredAt ?? at,
      },
    };
  }

  const feeCents = companyFeeFromSaleCents(offer);
  const netCents = landlordNetCents(offer);
  return {
    ...offer,
    custody: {
      ...custody,
      nftOwner: "holder",
      transferredAt: at,
      saleProceedsStatus: "claimable",
      saleGrossCents: saleGrossCents(offer),
      companyFeeCents: feeCents,
      landlordClaimableCents: netCents,
      landlordClaimedCents: 0,
      feeTransferredAt: feeCents > 0 ? at : null,
      feeTransferTxHash: null,
      saleProceedsTxHash: null,
    },
    events: [
      {
        id: `ev-${offer.reference}-sale-split`,
        at,
        title: "Sale proceeds held",
        detail:
          feeCents > 0
            ? "The purchase is in. Merkado’s fee is set aside. The landlord can claim the rest."
            : "The purchase is in. The landlord can claim the net amount.",
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

export function applyLandlordClaim(
  book: DemoBook,
  reference: string,
  toAddress: string,
  at = new Date().toISOString(),
): DemoBook {
  const next = structuredClone(book);
  const offer = next.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const custody = mergeCustody(offer.custody);
  if (custody.saleProceedsStatus !== "claimable" || custody.landlordClaimableCents <= 0) {
    throw new Error("There is nothing to claim on this offer.");
  }
  const address = normalizePayoutAddress(toAddress);
  if (!isClaimableAddress(address)) {
    throw new Error(
      "Enter a fictional demo address beginning with 0xDEMO.",
    );
  }

  offer.custody = {
    ...custody,
    saleProceedsStatus: "claimed",
    landlordClaimableCents: 0,
    landlordClaimedCents: custody.landlordClaimableCents,
    landlordClaimToAddress: address,
    landlordClaimedAt: at,
    landlordClaimTxHash: null,
  };
  offer.events = [
    {
      id: `ev-${reference}-claim`,
      at,
      title: "Landlord proceeds claimed",
      detail:
        "The demo claim was marked paid. No wallet ownership was verified and no transfer was sent.",
      actor: "System",
    },
    ...offer.events.filter((row) => row.id !== `ev-${reference}-claim`),
  ];
  offer.nextAction = "Waiting for the next rent payment";
  return next;
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
    mergeCustody(offer.custody).saleProceedsStatus === "claimable"
      ? "Landlord can claim sale proceeds"
      : "Waiting for the next rent payment";
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
  else if (custody.saleProceedsStatus === "claimable") status = "available";
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
    lockedAddress: custody.landlordClaimToAddress,
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
