import { revalidatePath } from "next/cache";

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
} from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { baseSepolia } from "viem/chains";

import { MERKADO_OFFER_ABI } from "@/lib/onchain/abi";
import { MERKADO_CHAIN_ID, merkadoContractAddress, merkadoRpcUrl } from "@/lib/onchain/config";
import { randomOfferKey } from "@/lib/onchain/ids";
import { merkadoMinterAccount } from "@/lib/onchain/minter";
import { normalizeContractAddress } from "@/lib/pay/networks";
import {
  ensureActiveEpoch,
  recordChainEvent,
  recordOffer,
} from "@/lib/onchain/chain-store";
import {
  confirmationsReady,
  verifyOfferMinted,
} from "@/lib/onchain/verify";
import {
  mergeOnchain,
  payoutAddressLocked,
  purchasePriceAtomicFor,
  rentInstallmentAtomicFor,
} from "@/lib/rent-advance/custody";
import { isPendingMintOffer } from "@/lib/rent-advance/helpers";
import { loadBookForJob, updateOfferForJob } from "@/lib/rent-advance/store";

export type AutoMintResult = {
  status: "submitted" | "pending" | "confirmed";
  txHash?: string;
  tokenId?: number;
  reason?: string;
};

export type PendingMintResult = {
  reference: string;
  status: AutoMintResult["status"];
  txHash?: string;
  reason?: string;
};

/** The book is only confirmed after the approved on-chain confirmation depth. */
function confirmationDepthPending(result: {
  confirmations?: bigint | null;
}): string | null {
  if (confirmationsReady(result.confirmations)) return null;
  return `Waiting for confirmations (${result.confirmations ?? 0}/5).`;
}

function blockNumberValue(value: bigint | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

function revalidate() {
  revalidatePath("/", "layout");
}

/**
 * Mints a single approved offer from the server mint key. Idempotent: a retry
 * resumes an already-broadcast mint, and a reverted receipt clears the stored
 * hash so the next call broadcasts a fresh transaction.
 */
export async function mintOfferFor(reference: string): Promise<AutoMintResult> {
  const book = await loadBookForJob();
  // Mint on the active contract address: the stored (variable) address in the
  // demo book wins, with the env value as the first-run default.
  const contractAddress =
    normalizeContractAddress(book.cryptoConfig?.offerNftContract) ?? merkadoContractAddress();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer) throw new Error("Offer not found.");
  if (offer.status !== "funding") {
    throw new Error("Only an approved offer can be minted.");
  }
  const onchain = mergeOnchain(offer.onchain);
  if (onchain.tokenId != null && onchain.mintTxHash) {
    return { status: "confirmed", txHash: onchain.mintTxHash, tokenId: onchain.tokenId };
  }
  const payoutAddress = payoutAddressLocked(offer);
  if (!payoutAddress) {
    throw new Error("Add a payout address before minting.");
  }
  const purchasePrice = purchasePriceAtomicFor(offer);
  const rentInstallmentAmount = rentInstallmentAtomicFor(offer);
  const epoch = await ensureActiveEpoch();
  // A fresh random key avoids the contract's usedOfferKeys collision if the
  // demo book is ever reset; the key is persisted with the broadcast.
  const key = onchain.offerKey ?? randomOfferKey();

  let txHash = onchain.mintTxHash;
  if (!txHash) {
    const account = merkadoMinterAccount();
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(merkadoRpcUrl()),
    });
    txHash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: MERKADO_OFFER_ABI,
      functionName: "mintOffer",
      args: [
        key as `0x${string}`,
        payoutAddress as `0x${string}`,
        purchasePrice,
        rentInstallmentAmount,
      ],
    });
    await updateOfferForJob(reference, (current) => ({
      ...current,
      nextAction: "Listing being prepared",
      onchain: {
        ...mergeOnchain(current.onchain),
        offerKey: key,
        contractAddress,
        epochId: epoch.id,
        mintTxHash: txHash,
      },
      events: [
        {
          id: `ev-${reference}-mint-broadcast-${Date.now()}`,
          at: new Date().toISOString(),
          title: "Listing being prepared",
          detail: "Merkado is preparing this offer for Marketplace.",
          actor: "System",
        },
        ...current.events,
      ],
    }));
  }

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(merkadoRpcUrl()),
  });
  const receipt = await waitForTransactionReceipt(publicClient, {
    hash: txHash as `0x${string}`,
    timeout: 90_000,
  }).catch(() => null);
  if (!receipt) {
    return { status: "pending", txHash, reason: "Waiting for the mint transaction on chain." };
  }
  if (receipt.status !== "success") {
    await updateOfferForJob(reference, (current) => ({
      ...current,
      nextAction: "Listing needs attention",
      onchain: { ...mergeOnchain(current.onchain), mintTxHash: null },
      events: [
        {
          id: `ev-${reference}-mint-reverted-${Date.now()}`,
          at: new Date().toISOString(),
          title: "Could not prepare the listing",
          detail: "We could not prepare this listing yet. It will retry automatically.",
          actor: "System",
        },
        ...current.events,
      ],
    }));
    return { status: "pending", txHash, reason: "The mint transaction reverted. Press Mint now to retry." };
  }

  let mintedTokenId: bigint | null = onchain.tokenId != null ? BigInt(onchain.tokenId) : null;
  if (mintedTokenId == null) {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: MERKADO_OFFER_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "OfferMinted") {
          mintedTokenId = decoded.args.tokenId as bigint;
          break;
        }
      } catch {
        // Not one of our events; skip.
      }
    }
  }
  if (mintedTokenId == null) {
    return { status: "pending", txHash, reason: "OfferMinted event not found yet." };
  }

  const result = await verifyOfferMinted(txHash, {
    contractAddress,
    tokenId: mintedTokenId,
    offerKey: key,
    payoutAddress,
    purchasePrice,
    rentInstallmentAmount,
  });
  if (result.status === "pending") {
    return { status: "pending", txHash, tokenId: Number(mintedTokenId), reason: result.reason };
  }
  if (!result.verified) {
    throw new Error(result.reason ?? "The mint receipt could not be verified.");
  }
  const depthPending = confirmationDepthPending(result);
  if (depthPending) {
    return { status: "pending", txHash, tokenId: Number(mintedTokenId), reason: depthPending };
  }

  await recordOffer({
    offerKey: key,
    chainId: MERKADO_CHAIN_ID,
    contractAddress,
    tokenId: mintedTokenId,
    payoutAddress,
    purchasePrice,
    rentInstallmentAmount,
    mintTxHash: txHash,
    mintBlockNumber: blockNumberValue(result.blockNumber),
    epochId: epoch.id,
  });
  const logIndex = result.logIndex;
  if (logIndex != null && result.blockNumber != null) {
    await recordChainEvent({
      epochId: epoch.id,
      chainId: MERKADO_CHAIN_ID,
      contractAddress,
      txHash,
      logIndex,
      blockNumber: Number(result.blockNumber),
      blockHash: result.blockHash ?? "",
      eventName: "OfferMinted",
      eventArgs: { tokenId: mintedTokenId.toString(), offerKey: key },
    });
  }
  await updateOfferForJob(reference, (current) => ({
    ...current,
    status: "funding",
    nextAction: "Listed · available for 60 days",
    onchain: {
      ...mergeOnchain(current.onchain),
      tokenId: Number(mintedTokenId),
      offerKey: key,
      contractAddress,
      epochId: epoch.id,
      mintTxHash: txHash,
      mintBlockNumber: result.blockNumber ?? null,
      payoutAddress,
    },
    events: [
      {
        id: `ev-${reference}-mint-${Date.now()}`,
        at: new Date().toISOString(),
        title: "Listing ready",
        detail: "This offer is now listed on Marketplace.",
        actor: "System",
      },
      ...current.events,
    ],
  }));
  revalidate();
  return { status: "confirmed", txHash, tokenId: Number(mintedTokenId) };
}

/**
 * Mints every approved offer that still needs minting (including ones that
 * were broadcast but not yet verified). Safe to run from a scheduled job.
 */
export async function runPendingMintSweep(): Promise<{
  minted: number;
  results: PendingMintResult[];
}> {
  const book = await loadBookForJob();
  const pending = book.offers.filter(isPendingMintOffer);
  const results: PendingMintResult[] = [];
  for (const offer of pending) {
    try {
      const result = await mintOfferFor(offer.reference);
      results.push({
        reference: offer.reference,
        status: result.status,
        txHash: result.txHash,
        reason: result.reason,
      });
    } catch (err) {
      results.push({
        reference: offer.reference,
        status: "pending",
        reason: err instanceof Error ? err.message : "The mint could not be completed.",
      });
    }
  }
  revalidate();
  return { minted: results.filter((r) => r.status === "confirmed").length, results };
}
