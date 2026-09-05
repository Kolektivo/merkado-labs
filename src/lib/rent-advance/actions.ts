"use server";

import { revalidatePath } from "next/cache";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { requireAdminUser, requireUser } from "@/lib/auth/session";
import {
  canPersistPayNetwork,
  isSelectablePayNetwork,
  parseExactPayNetworkKey,
} from "@/lib/pay/networks";
import { assertDemoUnlocked } from "@/lib/demo-gate-server";
import { getLinkedWalletForAccount } from "@/lib/rent-advance/accounts";
import { independentApproverById } from "@/lib/rent-advance/actors";
import { assertReleasesDistinct } from "@/lib/rent-advance/dual-control";
import {
  AutoMintResult,
  mintOfferFor,
  runPendingMintSweep,
} from "@/lib/rent-advance/mint-sweep-run";
import {
  buildScheduledReceivables,
  canRecordCollection,
} from "@/lib/rent-advance/helpers";
import {
  applyPayoutAddress,
  isValidPayoutAddress,
  mergeOnchain,
  normalizePayoutAddress,
  payoutAddressLocked,
  purchasePriceAtomicFor,
} from "@/lib/rent-advance/custody";
import {
  isExplorableTxHash,
} from "@/lib/rent-advance/ids";
import { sanitizeOfferInput } from "@/lib/rent-advance/offer-input";
import {
  applyOpsCollection,
  applyVerifiedPurchase,
  applyVerifiedRentClaim,
  applyVerifiedRentDeposit,
  cryptoConfigFor,
  type VerifiedPurchaseFacts,
  type VerifiedRentClaimFacts,
  type VerifiedRentDepositFacts,
} from "@/lib/rent-advance/payment-apply";
import { priceOrBlock } from "@/lib/rent-advance/pricing";
import { getSeedBook } from "@/lib/rent-advance/seed";
import {
  loadBook,
  resetAllBooks,
  saveBook,
  updateOffer,
} from "@/lib/rent-advance/store";
import type { Offer, OfferStatus } from "@/lib/rent-advance/types";
import {
  MERKADO_CHAIN_ID,
  merkadoRpcUrl,
} from "@/lib/onchain/config";
import { opaquePaymentId } from "@/lib/onchain/ids";
import {
  ensureActiveEpoch,
  markOfferPurchased,
  createPaymentAttempt,
  recordChainEvent,
  recordClaimVerification,
  recordDepositVerification,
} from "@/lib/onchain/chain-store";
import {
  verifyOfferPurchased,
  verifyRentClaimed,
  verifyRentDeposit,
  MERKADO_CONFIRMATION_BLOCKS,
  confirmationsReady,
} from "@/lib/onchain/verify";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";

function refresh() {
  revalidatePath("/", "layout");
}

const txPublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(merkadoRpcUrl()),
});

/** The book is only confirmed after the approved on-chain confirmation depth. */
function confirmationDepthPending(result: {
  confirmations?: bigint | null;
}): string | null {
  if (confirmationsReady(result.confirmations)) return null;
  return `Waiting for confirmations (${result.confirmations ?? 0}/${MERKADO_CONFIRMATION_BLOCKS}).`;
}

function assertPayoutReady(offer: Offer) {
  if (
    offer.payout.method !== "crypto" ||
    !isValidPayoutAddress(offer.payout.cryptoAddress)
  ) {
    throw new Error(
      "Add a Base Sepolia payout address before submitting. Girasol bank payout is coming soon.",
    );
  }
}

/**
 * The authoritative transaction sender from a verified receipt. For
 * depositRent, claimRent, and purchase the caller (msg.sender) is the payer /
 * owner / buyer emitted in the event, so the receipt sender is a chain fact
 * and is never taken from the client. Returns null only when the receipt is
 * not yet indexed.
 */
async function deriveTxSender(txHash: string): Promise<string | null> {
  try {
    const receipt = await txPublicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    return receipt.from ?? null;
  } catch {
    return null;
  }
}

/**
 * Rejects when the account has a linked wallet (Phase 4 integration point)
 * that does not match the sender derived from the chain receipt. When no
 * linked wallet exists, account-level binding is the only enforcement until
 * the wallet-linking service lands. Returns the chain-derived sender, which is
 * the authoritative value recorded for payer / buyer / owner.
 */
async function assertSenderMatchesLinkedWallet(
  accountId: string,
  chainId: number,
  derivedSender: string | null,
): Promise<string> {
  if (!derivedSender) {
    throw new Error("The transaction sender could not be verified yet.");
  }
  const linked = await getLinkedWalletForAccount(accountId, chainId);
  if (!linked) {
    throw new Error("Link a wallet to this account before continuing.");
  }
  if (derivedSender.toLowerCase() !== linked.walletAddress.toLowerCase()) {
    throw new Error(
      "The sender of this transaction does not match the wallet linked to this account.",
    );
  }
  return derivedSender;
}

async function assertAccountHasLinkedWallet(
  accountId: string,
  chainId: number,
): Promise<void> {
  const linked = await getLinkedWalletForAccount(accountId, chainId);
  if (!linked) {
    throw new Error("Link a wallet to this account before continuing.");
  }
}

/** Compare-and-set guard: the first valid submitted hash wins; a conflicting
 *  unverified hash is rejected. A verified/confirmed state must be rejected by
 *  the caller before this runs. */
function pendingHashAllowed(
  currentHash: string | null | undefined,
  incomingHash: string,
): void {
  if (!isExplorableTxHash(incomingHash)) {
    throw new Error("A transaction hash must be a 0x-prefixed 64-hex value.");
  }
  if (currentHash && currentHash !== incomingHash) {
    throw new Error(
      "A different transaction was already recorded for this request.",
    );
  }
}

export async function resetDemoAction() {
  await requireAdminUser();
  await resetAllBooks();
  // Seed the fresh approved offers on the env deployment immediately, so the
  // tokens are minted even if the Admin page is closed before the sweep/cron
  // would otherwise run. Idempotent: already-minted offers are skipped.
  await runPendingMintSweep();
  refresh();
}

export async function setPayNetworkAction(networkKey: string) {
  await requireAdminUser();
  const key = parseExactPayNetworkKey(networkKey);
  if (!key || !isSelectablePayNetwork(key) || !canPersistPayNetwork(key)) {
    throw new Error("That payment network is not available.");
  }
  const book = await loadBook();
  book.cryptoConfig = cryptoConfigFor(key, book.cryptoConfig);
  await saveBook(book);
  refresh();
}

export async function setOfferStatusAction(reference: string, status: OfferStatus) {
  await requireAdminUser();
  if (status === "funding") {
    throw new Error("Use independent approval to move an offer into mint pending.");
  }
  await updateOffer(reference, (offer) => ({
    ...offer,
    status,
    events: [
      {
        id: `ev-${reference}-${Date.now()}`,
        at: new Date().toISOString(),
        title: `Status set to ${status.replaceAll("_", " ")}`,
        detail: "Operations action",
        actor: "D. Martina",
      },
      ...offer.events,
    ],
  }));
  refresh();
}

export async function approveOfferAction(reference: string, actorId: string) {
  await requireAdminUser();
  const approver = independentApproverById(actorId);
  if (!approver) {
    throw new Error("Select Enrique or Luuk as the independent approver.");
  }
  const at = new Date().toISOString();
  await updateOffer(reference, (offer) => {
    if (offer.status !== "under_review") {
      throw new Error("Only an offer under review can be approved.");
    }
    assertPayoutReady(offer);
    const publishedAt = at;
    return {
      ...offer,
      status: "funding" as const,
      publishedAt,
      expiresAt: null,
      nextAction: "Minting automatically after approval",
      events: [
        {
          id: `ev-${reference}-approve-${Date.now()}`,
          at,
          title: "Approved",
          detail: `${approver.name} · independent approver. The offer will open on Marketplace shortly.`,
          actor: approver.name,
        },
        ...offer.events,
      ],
    };
  });
  refresh();
}

export async function savePayoutAddressAction(address: string) {
  await requireUser();
  const book = await loadBook();
  await saveBook(applyPayoutAddress(book, normalizePayoutAddress(address)));
  refresh();
}

export async function recordCollectionAction(
  reference: string,
  receivableN: number,
) {
  await requireAdminUser();
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId != null && onchain.purchased) {
    throw new Error(
      "Sold listings collect rent on-chain through Merkado Pay (depositRent). Off-chain collection recording is disabled for on-chain offers.",
    );
  }
  if (!canRecordCollection(offer.status)) {
    throw new Error(
      "Collections can be recorded only on live, collecting, or defaulted offers.",
    );
  }
  await saveBook(applyOpsCollection(book, reference, receivableN));
  refresh();
}

export async function closeChecklistItemAction(id: string, evidence: string) {
  await requireAdminUser();
  const book = await loadBook();
  book.checklist = book.checklist.map((item) =>
    item.id === id ? { ...item, state: "closed", evidence } : item,
  );
  await saveBook(book);
  refresh();
}

export async function submitOfferForReviewAction(reference: string) {
  await requireUser();
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  if (offer.status !== "draft") {
    throw new Error("Only a draft can be submitted for review.");
  }
  if (offer.months !== 6) {
    throw new Error("Only the six-month term is approved for origination.");
  }
  if (!isValidPayoutAddress(offer.renterWalletAddress)) {
    throw new Error("Enter a valid checksummed 0x wallet address for the rent payer.");
  }
  assertPayoutReady(offer);
  priceOrBlock({
    monthlyRentCents: offer.monthlyRentCents,
    months: offer.months,
    feeRate: offer.feeRate,
    relatedParty: offer.relatedParty,
  });
  await updateOffer(reference, (current) => ({
    ...current,
    status: "under_review",
    nextAction: "Independent approval",
    events: [
      {
        id: `ev-${reference}-submit-${Date.now()}`,
        at: new Date().toISOString(),
        title: "Offer request submitted",
        detail: "Requested from the Merkado account. No wallet was needed.",
        actor: "D. Martina",
      },
      ...current.events,
    ],
  }));
  refresh();
}

/** Prepare a mint: generate the opaque offer key and store expected terms. Throws when not configured. */
export type { AutoMintResult, PendingMintResult } from "@/lib/rent-advance/mint-sweep-run";

export async function autoMintAction(reference: string): Promise<AutoMintResult> {
  const user = await requireAdminUser();
  return mintOfferFor(reference, user.id);
}

/** Mints every approved offer that still needs minting (idempotent). */
export async function sweepPendingMintsAction() {
  await requireAdminUser();
  assertDemoUnlocked();
  return runPendingMintSweep();
}

/** Create the opaque on-chain payment id for a rent deposit. Returns the existing id when present. */
export async function createRentPaymentAttemptAction(paymentRequestId: string) {
  const { id: accountId } = await requireUser();
  await assertAccountHasLinkedWallet(accountId, MERKADO_CHAIN_ID);
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== accountId) {
    throw new Error("Payment request not found.");
  }
  const offer = book.offers.find((row) => row.reference === request.offerReference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This listing is not ready for payment yet.");
  }
  const contractAddress = onchain.contractAddress;
  if (request.opaquePaymentId) {
    return { opaquePaymentId: request.opaquePaymentId };
  }
  const epoch = await ensureActiveEpoch();
  const id = opaquePaymentId({
    chainId: MERKADO_CHAIN_ID,
    contractAddress,
    epochId: epoch.id,
  });
  await createPaymentAttempt({
    epochId: epoch.id,
    chainId: MERKADO_CHAIN_ID,
    contractAddress,
    tokenId: onchain.tokenId,
    paymentRequestId,
    opaquePaymentId: id,
    expectedAmount: request.amountUsdcAtomic,
    status: "pending",
  });
  await saveBook({
    ...book,
    paymentRequests: (book.paymentRequests ?? []).map((row) =>
      row.paymentRequestId === paymentRequestId
        ? { ...row, opaquePaymentId: id }
        : row,
    ),
  });
  refresh();
  return { opaquePaymentId: id };
}

type RentDepositVerifiedResult = {
  status: "pending" | "confirmed";
  reason?: string;
};

/** Persist the submitted deposit tx so a pending payment can be re-verified later. */
export async function attachSubmittedTxAction(
  paymentRequestId: string,
  txHash: string,
  payerAddress: string,
) {
  const { id: accountId } = await requireUser();
  await assertAccountHasLinkedWallet(accountId, MERKADO_CHAIN_ID);
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== accountId) {
    throw new Error("Payment request not found.");
  }
  if (request.status === "confirmed") {
    throw new Error("This payment is already confirmed and cannot be replaced.");
  }
  const offer = book.offers.find((row) => row.reference === request.offerReference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This listing is not ready for payment yet.");
  }
  pendingHashAllowed(request.submittedTxHash, txHash);
  await saveBook({
    ...book,
    paymentRequests: (book.paymentRequests ?? []).map((row) =>
      row.paymentRequestId === paymentRequestId
        ? { ...row, submittedTxHash: txHash, submittedPayer: payerAddress }
        : row,
    ),
  });
}

/** Re-verify a previously submitted deposit using the persisted hash. */
export async function checkPendingPaymentAction(
  paymentRequestId: string,
): Promise<RentDepositVerifiedResult> {
  const { id: accountId } = await requireUser();
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== accountId) {
    throw new Error("Payment request not found.");
  }
  if (request.status === "confirmed") return { status: "confirmed" };
  if (!request.submittedTxHash || !request.submittedPayer) {
    return { status: "pending", reason: "No submitted transaction was recorded yet." };
  }
  return verifyRentPaymentAction(
    paymentRequestId,
    request.submittedTxHash,
    request.submittedPayer,
  );
}

/** Verify a rent deposit receipt and update the book exactly once. */
export async function verifyRentPaymentAction(
  paymentRequestId: string,
  txHash: string,
  payerAddress: string,
): Promise<RentDepositVerifiedResult> {
  const { id: accountId } = await requireUser();
  if (!isExplorableTxHash(txHash)) {
    throw new Error("A transaction hash must be a 0x-prefixed 64-hex value.");
  }
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== accountId) {
    throw new Error("Payment request not found.");
  }
  if (request.status === "confirmed") return { status: "confirmed" };
  if (request.submittedTxHash && request.submittedTxHash !== txHash) {
    throw new Error("A different transaction was already recorded for this request.");
  }
  const offer = book.offers.find((row) => row.reference === request.offerReference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This listing is not ready for payment yet.");
  }
  const opaque = request.opaquePaymentId;
  if (!opaque) {
    throw new Error("Start the payment first to create the on-chain payment id.");
  }
  const expectedAmount = BigInt(request.amountUsdcAtomic);
  // The payer is derived from the verified receipt sender, never trusted from
  // the client. The client-supplied address is only a fallback while the
  // receipt is still pending.
  const derivedSender = await deriveTxSender(txHash);
  const result = await verifyRentDeposit(txHash, {
    contractAddress: onchain.contractAddress,
    tokenId: BigInt(onchain.tokenId),
    paymentId: opaque,
    payer: derivedSender ?? payerAddress,
    amount: expectedAmount,
  });
  if (result.status === "pending") {
    return { status: "pending", reason: result.reason };
  }
  if (!result.verified) {
    throw new Error(result.reason ?? "The rent deposit could not be verified.");
  }
  const depthPending = confirmationDepthPending(result);
  if (depthPending) {
    return { status: "pending", reason: depthPending };
  }
  const payer = await assertSenderMatchesLinkedWallet(
    accountId,
    MERKADO_CHAIN_ID,
    derivedSender,
  );
  const epochId = onchain.epochId ?? (await ensureActiveEpoch()).id;
  const logIndex = result.logIndex;
  if (logIndex == null || result.blockNumber == null) {
    return { status: "pending", reason: "Receipt details are not indexed yet." };
  }
  await recordDepositVerification({
    chainId: MERKADO_CHAIN_ID,
    txHash,
    logIndex,
    blockNumber: Number(result.blockNumber),
    tokenId: onchain.tokenId,
    opaquePaymentId: opaque,
    amount: expectedAmount,
    payerAddress: payer,
    paymentRequestId,
    epochId,
  });
  await recordChainEvent({
    epochId,
    chainId: MERKADO_CHAIN_ID,
    contractAddress: onchain.contractAddress,
    txHash,
    logIndex,
    blockNumber: Number(result.blockNumber),
    blockHash: result.blockHash ?? "",
    eventName: "RentDeposited",
    eventArgs: {
      tokenId: String(onchain.tokenId),
      paymentId: opaque,
      payer,
      amount: expectedAmount.toString(),
    },
  });
  // Apply the book even when the verification row already exists (a prior
  // write may have succeeded before the book save). The helper is idempotent.
  const facts: VerifiedRentDepositFacts = {
    tokenId: onchain.tokenId,
    opaquePaymentId: opaque,
    payerAddress: payer,
    amountAtomic: expectedAmount,
    txHash,
    blockNumber: result.blockNumber,
  };
  await saveBook(
    applyVerifiedRentDeposit(book, paymentRequestId, facts, new Date().toISOString()),
  );
  refresh();
  return { status: "confirmed" };
}

type PurchaseVerifiedResult = {
  status: "pending" | "confirmed";
  reason?: string;
};

/** Persist the submitted purchase tx so a pending purchase can be re-verified later. */
export async function attachSubmittedPurchaseTxAction(
  reference: string,
  txHash: string,
  buyerAddress: string,
) {
  const { id: accountId } = await requireUser();
  await assertAccountHasLinkedWallet(accountId, MERKADO_CHAIN_ID);
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This offer is not available yet.");
  }
  if (onchain.purchased) {
    throw new Error("This offer is already purchased and cannot be replaced.");
  }
  pendingHashAllowed(onchain.submittedPurchaseTxHash, txHash);
  await updateOffer(reference, (current) => ({
    ...current,
    onchain: {
      ...mergeOnchain(current.onchain),
      submittedPurchaseTxHash: txHash,
      submittedPurchaseBuyer: buyerAddress,
    },
  }));
}

/** Re-verify a previously submitted purchase using the persisted hash. */
export async function checkPendingPurchaseAction(
  reference: string,
): Promise<PurchaseVerifiedResult> {
  await requireUser();
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.purchased) return { status: "confirmed", reason: "Already purchased" };
  if (!onchain.submittedPurchaseTxHash || !onchain.submittedPurchaseBuyer) {
    return { status: "pending", reason: "No submitted purchase transaction was recorded yet." };
  }
  return verifyPurchaseAction(
    reference,
    onchain.submittedPurchaseTxHash,
    onchain.submittedPurchaseBuyer,
  );
}

/** Verify a whole-offer purchase receipt and update the book exactly once. */
export async function verifyPurchaseAction(
  reference: string,
  txHash: string,
  buyerAddress: string,
): Promise<PurchaseVerifiedResult> {
  const { id: accountId } = await requireUser();
  if (!isExplorableTxHash(txHash)) {
    throw new Error("A transaction hash must be a 0x-prefixed 64-hex value.");
  }
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This offer is not available yet.");
  }
  if (onchain.purchased) {
    return { status: "confirmed", reason: "Already purchased" };
  }
  if (onchain.submittedPurchaseTxHash && onchain.submittedPurchaseTxHash !== txHash) {
    throw new Error("A different transaction was already recorded for this offer.");
  }
  const payoutAddress = payoutAddressLocked(offer);
  if (!payoutAddress) {
    throw new Error("This offer has no locked payout address.");
  }
  const purchasePrice = purchasePriceAtomicFor(offer);
  // The buyer is derived from the verified receipt sender, never trusted from
  // the client. The client-supplied address is only a fallback while pending.
  const derivedSender = await deriveTxSender(txHash);
  const result = await verifyOfferPurchased(txHash, {
    contractAddress: onchain.contractAddress,
    tokenId: BigInt(onchain.tokenId),
    buyer: derivedSender ?? buyerAddress,
    payoutAddress,
    purchasePrice,
  });
  if (result.status === "pending") {
    return { status: "pending", reason: result.reason };
  }
  if (!result.verified) {
    throw new Error(result.reason ?? "The purchase receipt could not be verified.");
  }
  const depthPending = confirmationDepthPending(result);
  if (depthPending) {
    return { status: "pending", reason: depthPending };
  }
  const buyer = await assertSenderMatchesLinkedWallet(
    accountId,
    MERKADO_CHAIN_ID,
    derivedSender,
  );
  const epochId = onchain.epochId ?? (await ensureActiveEpoch()).id;
  const logIndex = result.logIndex;
  if (logIndex == null || result.blockNumber == null) {
    return { status: "pending", reason: "Receipt details are not indexed yet." };
  }
  await markOfferPurchased({
    chainId: MERKADO_CHAIN_ID,
    contractAddress: onchain.contractAddress,
    tokenId: onchain.tokenId,
    purchaseTxHash: txHash,
    purchaseBlockNumber: Number(result.blockNumber),
    purchaserAddress: buyer,
  });
  await recordChainEvent({
    epochId,
    chainId: MERKADO_CHAIN_ID,
    contractAddress: onchain.contractAddress,
    txHash,
    logIndex,
    blockNumber: Number(result.blockNumber),
    blockHash: result.blockHash ?? "",
    eventName: "OfferPurchased",
    eventArgs: {
      tokenId: String(onchain.tokenId),
      buyer,
      payoutAddress,
      purchasePrice: purchasePrice.toString(),
    },
  });
  const facts: VerifiedPurchaseFacts = {
    tokenId: onchain.tokenId,
    purchaserAddress: buyer,
    txHash,
    blockNumber: result.blockNumber,
    payoutAddress,
    purchasePriceAtomic: purchasePrice,
  };
  await saveBook(applyVerifiedPurchase(book, reference, facts, new Date().toISOString()));
  refresh();
  return { status: "confirmed" };
}

type RentClaimVerifiedResult = {
  status: "pending" | "confirmed";
  reason?: string;
};

/** Verify a rent claim receipt and update the book exactly once. */
export async function verifyRentClaimAction(
  reference: string,
  txHash: string,
  ownerAddress: string,
): Promise<RentClaimVerifiedResult> {
  const { id: accountId } = await requireUser();
  if (!isExplorableTxHash(txHash)) {
    throw new Error("A transaction hash must be a 0x-prefixed 64-hex value.");
  }
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This listing is not ready for payment yet.");
  }
  if (onchain.claimedRentCents > 0 && onchain.claimableRentCents === 0) {
    return { status: "confirmed" };
  }
  if (onchain.submittedClaimTxHash && onchain.submittedClaimTxHash !== txHash) {
    throw new Error("A different transaction was already recorded for this claim.");
  }
  const claimableCents = (book.distributions ?? [])
    .filter((row) => row.offerReference === reference && row.status === "claimable")
    .reduce((sum, row) => sum + row.amountCents, 0);
  if (claimableCents <= 0) {
    throw new Error("There is no rent waiting to be claimed from this listing.");
  }
  const expectedAmount = BigInt(usdcAtomicFromUsdCents(claimableCents));
  // The owner is derived from the verified receipt sender, never trusted from
  // the client. The client-supplied address is only a fallback while pending.
  const derivedSender = await deriveTxSender(txHash);
  const result = await verifyRentClaimed(txHash, {
    contractAddress: onchain.contractAddress,
    tokenId: BigInt(onchain.tokenId),
    owner: derivedSender ?? ownerAddress,
    amount: expectedAmount,
  });
  if (result.status === "pending") {
    return { status: "pending", reason: result.reason };
  }
  if (!result.verified) {
    throw new Error(result.reason ?? "The rent claim could not be verified.");
  }
  const depthPending = confirmationDepthPending(result);
  if (depthPending) {
    return { status: "pending", reason: depthPending };
  }
  const owner = await assertSenderMatchesLinkedWallet(
    accountId,
    MERKADO_CHAIN_ID,
    derivedSender,
  );
  const epochId = onchain.epochId ?? (await ensureActiveEpoch()).id;
  const logIndex = result.logIndex;
  if (logIndex == null || result.blockNumber == null) {
    return { status: "pending", reason: "Receipt details are not indexed yet." };
  }
  await recordClaimVerification({
    chainId: MERKADO_CHAIN_ID,
    txHash,
    logIndex,
    blockNumber: Number(result.blockNumber),
    contractAddress: onchain.contractAddress,
    tokenId: onchain.tokenId,
    ownerAddress: owner,
    amount: expectedAmount,
    epochId,
  });
  await recordChainEvent({
    epochId,
    chainId: MERKADO_CHAIN_ID,
    contractAddress: onchain.contractAddress,
    txHash,
    logIndex,
    blockNumber: Number(result.blockNumber),
    blockHash: result.blockHash ?? "",
    eventName: "RentClaimed",
    eventArgs: {
      tokenId: String(onchain.tokenId),
      owner,
      amount: expectedAmount.toString(),
    },
  });
  const facts: VerifiedRentClaimFacts = {
    tokenId: onchain.tokenId,
    ownerAddress: owner,
    amountAtomic: expectedAmount,
    txHash,
    blockNumber: result.blockNumber,
  };
  await saveBook(
    applyVerifiedRentClaim(book, reference, facts, new Date().toISOString()),
  );
  refresh();
  return { status: "confirmed" };
}


/** Persist the submitted claim tx so a pending claim can be re-verified later. */
export async function attachSubmittedClaimTxAction(
  reference: string,
  txHash: string,
  ownerAddress: string,
) {
  const { id: accountId } = await requireUser();
  await assertAccountHasLinkedWallet(accountId, MERKADO_CHAIN_ID);
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId == null || !onchain.contractAddress) {
    throw new Error("This listing is not ready for payment yet.");
  }
  if (onchain.claimedRentCents > 0 && onchain.claimableRentCents === 0) {
    throw new Error("This claim is already confirmed and cannot be replaced.");
  }
  pendingHashAllowed(onchain.submittedClaimTxHash, txHash);
  await updateOffer(reference, (current) => ({
    ...current,
    onchain: {
      ...mergeOnchain(current.onchain),
      submittedClaimTxHash: txHash,
      submittedClaimOwner: ownerAddress,
    },
  }));
}

/** Re-verify a previously submitted claim using the persisted hash. */
export async function checkPendingClaimAction(
  reference: string,
): Promise<RentClaimVerifiedResult> {
  await requireUser();
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.claimedRentCents > 0 && onchain.claimableRentCents === 0) {
    return { status: "confirmed" };
  }
  if (!onchain.submittedClaimTxHash || !onchain.submittedClaimOwner) {
    return { status: "pending", reason: "No submitted claim transaction was recorded yet." };
  }
  return verifyRentClaimAction(
    reference,
    onchain.submittedClaimTxHash,
    onchain.submittedClaimOwner,
  );
}

export async function submitNewOfferAction(offer: Offer) {
  await requireUser();
  offer = sanitizeOfferInput(offer);
  if (offer.reference === "MRA-001") {
    throw new Error("MRA-001 is the locked reference deal. Create a new offer instead.");
  }
  if (offer.months !== 6) {
    throw new Error("Only the six-month term is approved for origination.");
  }
  if (!isValidPayoutAddress(offer.renterWalletAddress)) {
    throw new Error("Enter a valid checksummed 0x wallet address for the rent payer.");
  }
  assertPayoutReady(offer);
  const priced = priceOrBlock({
    monthlyRentCents: offer.monthlyRentCents,
    months: offer.months,
    passportScore: offer.passport.total,
    payerScore: offer.tenant.scores.total,
    relatedParty: false,
  });
  assertReleasesDistinct(offer.releases);
  const book = await loadBook();
  const toSave: Offer = {
    ...offer,
    monthlyRentCents: priced.monthlyRentCents,
    months: priced.months,
    feeRate: priced.feeRate,
    baseFeeRate: priced.baseFeeRate,
    relatedPartyPremiumBps: 0,
    feeCents: priced.feeCents,
    purchasePriceCents: priced.purchasePriceCents,
    advanceRate: priced.advanceRate,
    monthlyIrr: priced.monthlyIrr,
    nominalAnnualised: priced.nominalAnnualised,
    effectiveAnnualised: priced.effectiveAnnualised,
    status: "under_review",
    nextAction: "Independent approval",
    relatedParty: false,
    relatedPartyNote: null,
    fundedCents: 0,
    offeringCents: priced.purchasePriceCents,
    subscriptionPriceCents: priced.purchasePriceCents,
    unitsIssued: 1,
    originationSpreadCents: 0,
    holders: [],
    publishedAt: null,
    expiresAt: null,
    onchain: mergeOnchain(undefined),
    events: [
      {
        id: `ev-${offer.reference}-submit-${Date.now()}`,
        at: new Date().toISOString(),
        title: "Offer request submitted",
        detail:
          "Requested from the Merkado account. No wallet was needed. Merkado prepares the offer for listing after approval.",
        actor: "D. Martina",
      },
      ...offer.events.filter((row) => row.id !== `ev-${offer.reference}-submit`),
    ],
  };
  const index = book.offers.findIndex((row) => row.reference === toSave.reference);
  if (index === -1) book.offers.unshift(toSave);
  else book.offers[index] = toSave;
  if (toSave.tenant.id && !book.assignedTenancies.includes(toSave.tenant.id)) {
    book.assignedTenancies.push(toSave.tenant.id);
  }
  await saveBook(book);
  refresh();
}

export async function saveDraftOfferAction(offer: Offer) {
  await requireUser();
  offer = sanitizeOfferInput(offer);
  if (offer.reference === "MRA-001") {
    throw new Error("MRA-001 is the locked reference deal. Create a new draft instead.");
  }
  if (offer.months !== 6) {
    throw new Error("Only the six-month term is approved for origination.");
  }
  // Drafts are not priced or cap-blocked: an in-progress draft may be
  // incomplete or above the cap. Submission re-prices and blocks later.
  assertReleasesDistinct(offer.releases);
  const book = await loadBook();
  const toSave = { ...offer, status: "draft" as const, onchain: mergeOnchain(undefined) };
  const index = book.offers.findIndex((row) => row.reference === toSave.reference);
  if (index === -1) book.offers.unshift(toSave);
  else book.offers[index] = toSave;
  if (toSave.tenant.id && !book.assignedTenancies.includes(toSave.tenant.id)) {
    book.assignedTenancies.push(toSave.tenant.id);
  }
  await saveBook(book);
  refresh();
}

export async function nextDraftReference(): Promise<string> {
  await requireUser();
  const book = await loadBook();
  const numbers = book.offers.map((offer) => Number(offer.reference.replace("MRA-", "")));
  const next = Math.max(0, ...numbers) + 1;
  return `MRA-${String(next).padStart(3, "0")}`;
}

export async function seedOfferTemplate(): Promise<Offer> {
  await requireUser();
  await assertDemoUnlocked();
  const book = getSeedBook();
  const canonical = book.offers[0];
  const reference = await nextDraftReference();
  return {
    ...structuredClone(canonical),
    offerId: `offer-${reference.toLowerCase()}`,
    settlementTransactionId: null,
    onchain: mergeOnchain(undefined),
    reference,
    status: "draft",
    fundedCents: 0,
    collections: [],
    releases: [],
    publishedAt: null,
    relatedParty: false,
    relatedPartyNote: null,
    holders: [],
    tenant: {
      ...canonical.tenant,
      id: `tn-${reference.toLowerCase()}`,
    },
    receivables: buildScheduledReceivables(
      reference,
      canonical.monthlyRentCents,
      canonical.months,
    ),
    nextAction: "Finish draft",
    events: [
      {
        id: `ev-${reference}-new`,
        at: new Date().toISOString(),
        title: "Draft created",
        detail: "Draft started from the current quote",
        actor: "D. Martina",
      },
    ],
  };
}
