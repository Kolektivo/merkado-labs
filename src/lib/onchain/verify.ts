import "server-only";

import {
  createPublicClient,
  decodeEventLog,
  http,
  TransactionReceiptNotFoundError,
  type Hex,
} from "viem";
import { optimism } from "viem/chains";

import { MERKADO_OFFER_ABI } from "@/lib/onchain/abi";
import {
  MERKADO_CHAIN_ID,
  MERKADO_USDC_ADDRESS,
  merkadoRpcUrl,
} from "@/lib/onchain/config";

/** Conservative confirmation depth for Optimism Mainnet verification. */
export const MERKADO_CONFIRMATION_BLOCKS = 5;

/** True only when the receipt has reached the approved confirmation depth. */
export function confirmationsReady(confirmations: bigint | null | undefined): boolean {
  return confirmations != null && confirmations >= BigInt(MERKADO_CONFIRMATION_BLOCKS);
}

export type OnchainVerifyStatus = "pending" | "confirmed" | "failed";

export type LiveVerifyResult = {
  verified: boolean;
  status: OnchainVerifyStatus;
  reason?: string;
  chainId: number;
  contractAddress: string;
  txHash: string;
  blockNumber?: bigint | null;
  blockHash?: string | null;
  confirmations?: bigint | null;
  logIndex?: number | null;
  tokenId?: bigint | null;
};

export type LogLike = {
  address: string;
  topics?: readonly (string | null)[] | null;
  data?: string;
  logIndex?: number | null;
};

export type ReceiptLike = {
  chainId?: number | null;
  status?: string | null;
  transactionHash?: string | null;
  blockNumber?: bigint | null;
  blockHash?: string | null;
  logs?: readonly LogLike[] | null;
};

export type OfferMintedExpected = {
  contractAddress: string;
  tokenId: bigint;
  offerKey: string;
  payoutAddress: string;
  purchasePrice: bigint;
  rentInstallmentAmount: bigint;
  chainId?: number | null;
};

export type OfferPurchasedExpected = {
  contractAddress: string;
  tokenId: bigint;
  buyer: string;
  payoutAddress: string;
  purchasePrice: bigint;
  chainId?: number | null;
};

export type RentDepositExpected = {
  contractAddress: string;
  tokenId: bigint;
  paymentId: string;
  payer: string;
  amount: bigint;
  usdcAddress?: string;
  chainId?: number | null;
};

export type RentClaimedExpected = {
  contractAddress: string;
  tokenId: bigint;
  owner: string;
  amount: bigint;
  chainId?: number | null;
};

const publicClient = createPublicClient({
  chain: optimism,
  transport: http(merkadoRpcUrl()),
});

export function confirmationsFor(blockNumber: bigint, currentBlock: bigint): bigint {
  return currentBlock - blockNumber + BigInt(1);
}

/** Read the current ERC-721 owner for server-side Portfolio scoping. */
export async function readCurrentOfferOwner(
  contractAddress: string,
  tokenId: number,
): Promise<string | null> {
  try {
    return await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: MERKADO_OFFER_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
  } catch {
    return null;
  }
}

/** Read the live claimable USDC balance for a token. */
export async function readCurrentOfferClaimable(
  contractAddress: string,
  tokenId: number,
): Promise<bigint | null> {
  try {
    return await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: MERKADO_OFFER_ABI,
      functionName: "claimableRent",
      args: [BigInt(tokenId)],
    });
  } catch {
    return null;
  }
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

type OfferMintedArgs = {
  tokenId: bigint;
  offerKey: string;
  payoutAddress: string;
  purchasePrice: bigint;
  rentInstallmentAmount: bigint;
};

type OfferPurchasedArgs = {
  tokenId: bigint;
  buyer: string;
  payoutAddress: string;
  purchasePrice: bigint;
};

type RentDepositedArgs = {
  tokenId: bigint;
  paymentId: string;
  payer: string;
  amount: bigint;
};

type RentClaimedArgs = {
  tokenId: bigint;
  owner: string;
  amount: bigint;
};

/** Decode one receipt log against the pinned ABI. Never throws. */
export function decodeOfferLog(
  log: LogLike,
): { eventName: string; args: Record<string, unknown> } | null {
  const topics = log.topics;
  if (!topics || topics.length === 0) return null;
  const cleanTopics = topics.filter(
    (topic): topic is string => typeof topic === "string",
  );
  if (cleanTopics.length === 0) return null;
  try {
    const decoded = decodeEventLog({
      abi: MERKADO_OFFER_ABI,
      data: (log.data ?? "0x") as Hex,
      topics: cleanTopics as unknown as [Hex, ...Hex[]],
    });
    return { eventName: decoded.eventName, args: decoded.args as Record<string, unknown> };
  } catch {
    return null;
  }
}

type EventMatch<T> = {
  match: { args: T; log: LogLike } | null;
  wrongContract: boolean;
};

function matchEvent<T extends Record<string, unknown>>(
  logs: readonly LogLike[],
  contractAddress: string,
  eventName: string,
  predicate: (args: T, log: LogLike) => boolean,
): EventMatch<T> {
  let wrongContract = false;
  for (const log of logs) {
    const decoded = decodeOfferLog(log);
    if (!decoded || decoded.eventName !== eventName) continue;
    if (!sameAddress(log.address, contractAddress)) {
      wrongContract = true;
      continue;
    }
    if (predicate(decoded.args as T, log)) {
      return { match: { args: decoded.args as T, log }, wrongContract: false };
    }
  }
  return { match: null, wrongContract };
}

function checkReceipt(
  receipt: ReceiptLike,
  expectedChainId?: number | null,
): { ok: true } | { ok: false; reason: string } {
  const chainId = receipt.chainId ?? expectedChainId ?? MERKADO_CHAIN_ID;
  if (chainId !== MERKADO_CHAIN_ID) {
    return {
      ok: false,
      reason: `wrong chain: expected chain id ${MERKADO_CHAIN_ID}, got ${chainId}`,
    };
  }
  if (receipt.status === "reverted" || receipt.status === "0x0") {
    return { ok: false, reason: "transaction reverted" };
  }
  return { ok: true };
}

function baseFailureResult(
  txHash: string,
  contractAddress: string,
  reason: string,
  tokenId?: bigint | null,
): LiveVerifyResult {
  return {
    verified: false,
    status: "failed",
    reason,
    chainId: MERKADO_CHAIN_ID,
    contractAddress,
    txHash,
    blockNumber: null,
    tokenId: tokenId ?? null,
  };
}

function confirmedResult(
  receipt: ReceiptLike,
  txHash: string,
  contractAddress: string,
  tokenId: bigint,
  log: LogLike,
): LiveVerifyResult {
  return {
    verified: true,
    status: "confirmed",
    chainId: MERKADO_CHAIN_ID,
    contractAddress,
    txHash,
    blockNumber: receipt.blockNumber ?? null,
    blockHash: receipt.blockHash ?? null,
    logIndex: log.logIndex ?? null,
    tokenId,
  };
}

export function verifyOfferMintedReceipt(
  receipt: ReceiptLike,
  expected: OfferMintedExpected,
): LiveVerifyResult {
  const txHash = receipt.transactionHash ?? "";
  const checked = checkReceipt(receipt, expected.chainId);
  if (!checked.ok) {
    return baseFailureResult(txHash, expected.contractAddress, checked.reason);
  }
  const { match, wrongContract } = matchEvent<OfferMintedArgs>(
    receipt.logs ?? [],
    expected.contractAddress,
    "OfferMinted",
    (args) =>
      args.tokenId === expected.tokenId &&
      args.offerKey.toLowerCase() === expected.offerKey.toLowerCase() &&
      sameAddress(args.payoutAddress, expected.payoutAddress) &&
      args.purchasePrice === expected.purchasePrice &&
      args.rentInstallmentAmount === expected.rentInstallmentAmount,
  );
  if (!match) {
    return baseFailureResult(
      txHash,
      expected.contractAddress,
      wrongContract
        ? "wrong contract: OfferMinted was emitted by a different contract address"
        : "missing event: no matching OfferMinted event in the receipt logs",
      expected.tokenId,
    );
  }
  return confirmedResult(receipt, txHash, expected.contractAddress, expected.tokenId, match.log);
}

export function verifyOfferPurchasedReceipt(
  receipt: ReceiptLike,
  expected: OfferPurchasedExpected,
): LiveVerifyResult {
  const txHash = receipt.transactionHash ?? "";
  const checked = checkReceipt(receipt, expected.chainId);
  if (!checked.ok) {
    return baseFailureResult(txHash, expected.contractAddress, checked.reason);
  }
  const { match, wrongContract } = matchEvent<OfferPurchasedArgs>(
    receipt.logs ?? [],
    expected.contractAddress,
    "OfferPurchased",
    (args) =>
      args.tokenId === expected.tokenId &&
      sameAddress(args.buyer, expected.buyer) &&
      sameAddress(args.payoutAddress, expected.payoutAddress) &&
      args.purchasePrice === expected.purchasePrice,
  );
  if (!match) {
    return baseFailureResult(
      txHash,
      expected.contractAddress,
      wrongContract
        ? "wrong contract: OfferPurchased was emitted by a different contract address"
        : "missing event: no matching OfferPurchased event in the receipt logs",
      expected.tokenId,
    );
  }
  return confirmedResult(receipt, txHash, expected.contractAddress, expected.tokenId, match.log);
}

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topicAddress(topic: string): string {
  return `0x${topic.slice(26).toLowerCase()}`;
}

/**
 * True when a Transfer log sends funds to the offer contract from a USDC
 * contract that is not the expected one. Padded indexed topics are decoded
 * from the last 20 bytes of each 32-byte word.
 */
export function findWrongUsdcTransfer(
  logs: readonly LogLike[],
  usdcAddress: string,
  contractAddress: string,
): boolean {
  for (const log of logs) {
    const topic0 = log.topics?.[0];
    if (!topic0 || topic0.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    const to = log.topics?.[2];
    if (!to) continue;
    if (!sameAddress(topicAddress(to), contractAddress)) continue;
    if (!sameAddress(log.address, usdcAddress)) return true;
  }
  return false;
}

export function verifyRentDepositReceipt(
  receipt: ReceiptLike,
  expected: RentDepositExpected,
): LiveVerifyResult {
  const txHash = receipt.transactionHash ?? "";
  const checked = checkReceipt(receipt, expected.chainId);
  if (!checked.ok) {
    return baseFailureResult(txHash, expected.contractAddress, checked.reason);
  }
  const { match, wrongContract } = matchEvent<RentDepositedArgs>(
    receipt.logs ?? [],
    expected.contractAddress,
    "RentDeposited",
    (args) =>
      args.tokenId === expected.tokenId &&
      args.paymentId.toLowerCase() === expected.paymentId.toLowerCase() &&
      sameAddress(args.payer, expected.payer) &&
      args.amount === expected.amount,
  );
  if (!match) {
    return baseFailureResult(
      txHash,
      expected.contractAddress,
      wrongContract
        ? "wrong contract: RentDeposited was emitted by a different contract address"
        : "missing event: no matching RentDeposited event in the receipt logs",
      expected.tokenId,
    );
  }
  const usdcAddress = expected.usdcAddress ?? MERKADO_USDC_ADDRESS;
  if (findWrongUsdcTransfer(receipt.logs ?? [], usdcAddress, expected.contractAddress)) {
    return baseFailureResult(
      txHash,
      expected.contractAddress,
      "wrong USDC: a transfer to the offer contract used a different token contract",
      expected.tokenId,
    );
  }
  return confirmedResult(receipt, txHash, expected.contractAddress, expected.tokenId, match.log);
}

export function verifyRentClaimedReceipt(
  receipt: ReceiptLike,
  expected: RentClaimedExpected,
): LiveVerifyResult {
  const txHash = receipt.transactionHash ?? "";
  const checked = checkReceipt(receipt, expected.chainId);
  if (!checked.ok) {
    return baseFailureResult(txHash, expected.contractAddress, checked.reason);
  }
  const { match, wrongContract } = matchEvent<RentClaimedArgs>(
    receipt.logs ?? [],
    expected.contractAddress,
    "RentClaimed",
    (args) =>
      args.tokenId === expected.tokenId &&
      sameAddress(args.owner, expected.owner) &&
      args.amount === expected.amount,
  );
  if (!match) {
    return baseFailureResult(
      txHash,
      expected.contractAddress,
      wrongContract
        ? "wrong contract: RentClaimed was emitted by a different contract address"
        : "missing event: no matching RentClaimed event in the receipt logs",
      expected.tokenId,
    );
  }
  return confirmedResult(receipt, txHash, expected.contractAddress, expected.tokenId, match.log);
}

async function receiptOrPending(
  txHash: Hex,
): Promise<{ receipt: ReceiptLike } | { pending: true }> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    return { receipt: receipt as ReceiptLike };
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return { pending: true };
    throw error;
  }
}

/** Result shape when the transaction is not indexed yet. */
export function pendingVerificationResult(
  txHash: string,
  contractAddress: string,
): LiveVerifyResult {
  return {
    verified: false,
    status: "pending",
    reason: "Transaction not found yet",
    chainId: MERKADO_CHAIN_ID,
    contractAddress,
    txHash,
    blockNumber: null,
    tokenId: null,
  };
}

async function attachConfirmations(result: LiveVerifyResult): Promise<LiveVerifyResult> {
  if (result.status !== "confirmed" || result.blockNumber == null) return result;
  try {
    const current = await publicClient.getBlockNumber();
    return {
      ...result,
      confirmations: confirmationsFor(result.blockNumber, current),
    };
  } catch {
    return result;
  }
}

export async function verifyOfferMinted(
  txHash: string,
  expected: OfferMintedExpected,
): Promise<LiveVerifyResult> {
  const fetched = await receiptOrPending(txHash as Hex);
  if ("pending" in fetched) return pendingVerificationResult(txHash, expected.contractAddress);
  return attachConfirmations(verifyOfferMintedReceipt(fetched.receipt, expected));
}

export async function verifyOfferPurchased(
  txHash: string,
  expected: OfferPurchasedExpected,
): Promise<LiveVerifyResult> {
  const fetched = await receiptOrPending(txHash as Hex);
  if ("pending" in fetched) return pendingVerificationResult(txHash, expected.contractAddress);
  return attachConfirmations(verifyOfferPurchasedReceipt(fetched.receipt, expected));
}

export async function verifyRentDeposit(
  txHash: string,
  expected: RentDepositExpected,
): Promise<LiveVerifyResult> {
  const fetched = await receiptOrPending(txHash as Hex);
  if ("pending" in fetched) return pendingVerificationResult(txHash, expected.contractAddress);
  return attachConfirmations(verifyRentDepositReceipt(fetched.receipt, expected));
}

export async function verifyRentClaimed(
  txHash: string,
  expected: RentClaimedExpected,
): Promise<LiveVerifyResult> {
  const fetched = await receiptOrPending(txHash as Hex);
  if ("pending" in fetched) return pendingVerificationResult(txHash, expected.contractAddress);
  return attachConfirmations(verifyRentClaimedReceipt(fetched.receipt, expected));
}
