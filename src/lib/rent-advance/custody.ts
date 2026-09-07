import { encodeFunctionData, getAddress, type Hex } from "viem";

import { MERKADO_OFFER_ABI } from "@/lib/onchain/abi";
import { DEMO_LANDLORD_EOA } from "@/lib/rent-advance/ids";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import { hasPendingPurchaseAttempt } from "@/lib/rent-advance/purchase-attempts";
import type {
  CryptoConfig,
  DemoAccount,
  DemoBook,
  LandlordPayout,
  Offer,
  OnchainOfferState,
} from "@/lib/rent-advance/types";

/** Empty verified on-chain state. Every field is null/zero until a receipt is verified. */
export function emptyOnchainState(): OnchainOfferState {
  return {
    tokenId: null,
    offerKey: null,
    contractAddress: null,
    epochId: null,
    mintTxHash: null,
    mintBlockNumber: null,
    purchased: false,
    purchaseTxHash: null,
    purchaserAddress: null,
    payoutAddress: null,
    landlordPaid: false,
    claimableRentCents: 0,
    claimedRentCents: 0,
  };
}

/**
 * Normalize a partial on-chain state with defaults so older JSON payloads
 * never crash. Legacy mock custody fields are not carried over.
 */
export function mergeOnchain(raw?: Partial<OnchainOfferState> | null): OnchainOfferState {
  return {
    ...emptyOnchainState(),
    ...raw,
    tokenId: typeof raw?.tokenId === "number" && raw.tokenId > 0 ? raw.tokenId : null,
    mintBlockNumber: raw?.mintBlockNumber ?? null,
    claimableRentCents: Math.max(0, raw?.claimableRentCents ?? 0),
    claimedRentCents: Math.max(0, raw?.claimedRentCents ?? 0),
  };
}

export type MintState = "not_minted" | "minted" | "purchased";

export function mintState(offer: Offer): MintState {
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.purchased) return "purchased";
  if (onchain.tokenId != null && onchain.mintTxHash) return "minted";
  return "not_minted";
}

export function isApprovedOfferStatus(status: Offer["status"]): boolean {
  return status !== "draft" && status !== "under_review";
}

export function isOfferFilled(offer: Offer): boolean {
  return offer.offeringCents > 0 && offer.fundedCents >= offer.offeringCents;
}

/** Accepts a real checksummed 20-byte 0x address (viem getAddress). */
export function isValidPayoutAddress(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  try {
    return getAddress(trimmed) === trimmed;
  } catch {
    return false;
  }
}

/** Returns the checksummed address, or throws when invalid. */
export function normalizePayoutAddress(value: string): string {
  return getAddress(value.trim());
}

export function defaultLandlordPayout(
  incoming?: Partial<LandlordPayout> | null,
): LandlordPayout {
  const cryptoAddress = isValidPayoutAddress(incoming?.cryptoAddress)
    ? normalizePayoutAddress(incoming?.cryptoAddress ?? "")
    : null;
  return {
    method: incoming?.method === "bank" ? "bank" : "crypto",
    cryptoAddress,
    fiatCurrency: "XCG",
    partner: "Girasol",
    bankFeeRate: 0.015,
    bankAvailability: "coming_soon",
  };
}

/** The payout destination that will be locked at mint. Null until a valid address is saved. */
export function payoutAddressLocked(offer: Offer): string | null {
  const onchain = mergeOnchain(offer.onchain);
  if (isValidPayoutAddress(onchain.payoutAddress)) {
    return normalizePayoutAddress(onchain.payoutAddress ?? "");
  }
  if (offer.payout?.method === "crypto" && isValidPayoutAddress(offer.payout.cryptoAddress)) {
    return normalizePayoutAddress(offer.payout.cryptoAddress ?? "");
  }
  return null;
}

/** The contract receives pooled USDC rent; returns the deployed address or null. */
export function rentReceivingAddressFor(offer: Offer, config: CryptoConfig): string | null {
  const onchain = mergeOnchain(offer.onchain);
  return (
    onchain.contractAddress ??
    config.offerNftContract ??
    config.companySafeAddress ??
    config.safeAddress ??
    null
  );
}

export function purchasePriceAtomicFor(offer: Offer): bigint {
  return BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents));
}

export function rentInstallmentAtomicFor(offer: Offer): bigint {
  return BigInt(usdcAtomicFromUsdCents(offer.monthlyRentCents));
}

/**
 * Mint terms for the backend operator key.
 * No signing, no execution, no private key.
 */
export function mintCalldata(offer: Offer): {
  offerKey: string;
  payoutAddress: string;
  purchasePriceAtomic: bigint;
  rentInstallmentAtomic: bigint;
  calldata: `0x${string}`;
} | null {
  const onchain = mergeOnchain(offer.onchain);
  const payoutAddress = payoutAddressLocked(offer);
  if (!onchain.offerKey || !payoutAddress) return null;
  const purchasePriceAtomic = purchasePriceAtomicFor(offer);
  const rentInstallmentAtomic = rentInstallmentAtomicFor(offer);
  const calldata = encodeFunctionData({
    abi: MERKADO_OFFER_ABI,
    functionName: "mintOffer",
    args: [
      onchain.offerKey as Hex,
      payoutAddress as Hex,
      purchasePriceAtomic,
      rentInstallmentAtomic,
    ],
  });
  return {
    offerKey: onchain.offerKey,
    payoutAddress,
    purchasePriceAtomic,
    rentInstallmentAtomic,
    calldata,
  };
}

export type ProceedsPresentation = {
  minted: boolean;
  purchased: boolean;
  landlordPaid: boolean;
  /** True when a purchase was submitted but not yet verified (Processing). */
  processing: boolean;
  payoutAddress: string | null;
  purchaseTxHash: string | null;
  purchasePriceCents: number;
  feeCents: number;
};

export function proceedsPresentation(offer: Offer): ProceedsPresentation {
  const onchain = mergeOnchain(offer.onchain);
  return {
    minted: onchain.tokenId != null && Boolean(onchain.mintTxHash),
    purchased: onchain.purchased,
    landlordPaid: onchain.landlordPaid,
    processing: hasPendingPurchaseAttempt(onchain) && !onchain.purchased,
    payoutAddress: payoutAddressLocked(offer),
    purchaseTxHash: onchain.purchaseTxHash,
    purchasePriceCents: offer.purchasePriceCents,
    feeCents: offer.feeCents,
  };
}

export function defaultCryptoConfigAddresses(incoming?: Partial<CryptoConfig> | null) {
  const company =
    incoming?.companySafeAddress?.trim() || incoming?.safeAddress?.trim() || "";
  const companySafeAddress = company || "";
  return {
    companySafeAddress,
    offerNftContract: incoming?.offerNftContract?.trim() || null,
    safeAddress: companySafeAddress || null,
  };
}

export function withPayoutDefaults(account: DemoAccount): DemoAccount {
  const payoutAddress = isValidPayoutAddress(account.payoutAddress)
    ? normalizePayoutAddress(account.payoutAddress ?? "")
    : null;
  return {
    ...account,
    payoutAddress,
    payoutAddressUpdatedAt: payoutAddress
      ? account.payoutAddressUpdatedAt ?? null
      : null,
  };
}

export function applyPayoutAddress(
  book: DemoBook,
  address: string,
  at = new Date().toISOString(),
): DemoBook {
  const next = structuredClone(book);
  const trimmed = normalizePayoutAddress(address);
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

export { DEMO_LANDLORD_EOA };
