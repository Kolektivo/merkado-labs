import { createPublicClient, http } from "viem";
import { baseSepolia, optimismSepolia, type Chain } from "viem/chains";
import { LIVE_CONFIRMATION_BLOCKS } from "@/lib/pay/live-provider";
import { PAY_NETWORKS, resolvePayNetworkKey } from "@/lib/pay/networks";
import type { CryptoConfig, PaymentRequest } from "@/lib/rent-advance/types";
import { isExplorableTxHash } from "@/lib/rent-advance/ids";

export type LiveVerifyResult = {
  verified: boolean;
  status: "pending" | "confirmed" | "failed";
  reason?: string;
  /** Block number the receipt was mined in. */
  blockNumber?: bigint;
  /** Confirmations counted at verification time. */
  confirmations?: number;
  /** The exact Transfer log index that matched. */
  logIndex?: number;
  /** Sender of the matched transfer. */
  sender?: string;
};

export type TransferLogLike = {
  address: string;
  topics?: readonly (string | null)[] | null;
  data: string;
  logIndex: number | null;
};

/**
 * Find exactly one USDC Transfer to `recipient` for `expectedAmount` in the
 * receipt's logs. The transfer must come from a sender that is not the
 * recipient (no self-transfer). Pure and side-effect free so the exact-match
 * rule is unit-testable without an RPC call.
 */
export function matchExpectedUsdcTransfer(
  logs: readonly TransferLogLike[],
  usdcContract: string,
  recipient: string,
  expectedAmount: bigint,
): { logIndex: number; sender: string } | null {
  const recipientLower = recipient.toLowerCase();
  const usdcContractLower = usdcContract.toLowerCase();
  const matches = logs.filter((log) => {
    if (log.address.toLowerCase() !== usdcContractLower) return false;
    if (!log.topics || log.topics.length < 3) return false;
    const to = (log.topics[2] as string).toLowerCase();
    if (to !== recipientLower) return false;
    if (BigInt(log.data) !== expectedAmount) return false;
    const from = (log.topics[1] as string).toLowerCase();
    if (from === recipientLower) return false;
    return true;
  });

  if (matches.length !== 1) return null;
  const matched = matches[0];
  if (matched.logIndex == null) return null;
  return { logIndex: matched.logIndex, sender: (matched.topics![1] as string).toLowerCase() };
}

function chainForNetworkKey(networkKey: string | null | undefined): Chain {
  const resolved = resolvePayNetworkKey({ networkKey });
  switch (resolved) {
    case "base-sepolia":
      return baseSepolia;
    case "op-sepolia":
      return optimismSepolia;
    default:
      throw new Error("This payment requires a test network.");
  }
}

function rpcUrl(networkKey: string | null | undefined): string {
  const resolved = resolvePayNetworkKey({ networkKey });
  const catalog = PAY_NETWORKS[resolved];
  // TODO: replace with the Product Lead-provided RPC when supplied.
  return catalog.publicRpcUrl;
}

/**
 * Server-side verification of a live USDC payment. Loads authoritative
 * payment facts from the request, then verifies the on-chain receipt and
 * the expected ERC-20 Transfer before anything is confirmed.
 */
export async function verifyLivePayment({
  txHash,
  config,
  request,
}: {
  txHash: string;
  config: CryptoConfig;
  request: PaymentRequest;
}): Promise<LiveVerifyResult> {
  if (!isExplorableTxHash(txHash)) {
    return { verified: false, status: "failed", reason: "Invalid transaction hash." };
  }
  const networkKey = resolvePayNetworkKey(config);
  if (networkKey === "op-mainnet" || networkKey === "base-mainnet") {
    return { verified: false, status: "failed", reason: "Mainnet payments are not enabled yet." };
  }
  const chain = chainForNetworkKey(networkKey);
  const usdcContract = config.usdcContract;
  const recipient = config.safeAddress;
  if (!usdcContract || !recipient) {
    return { verified: false, status: "failed", reason: "Payment configuration is incomplete." };
  }
  if (request.receivingAddress !== recipient) {
    return { verified: false, status: "failed", reason: "Receiving address mismatch." };
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl(networkKey)) });
  const hash = txHash as `0x${string}`;

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch {
    return { verified: false, status: "pending", reason: "Transaction not found yet." };
  }
  if (!receipt) {
    return { verified: false, status: "pending", reason: "Waiting for the transaction." };
  }
  if (receipt.status === "reverted") {
    return { verified: false, status: "failed", reason: "The transaction reverted." };
  }
  if (receipt.to?.toLowerCase() !== usdcContract.toLowerCase()) {
    return { verified: false, status: "failed", reason: "Wrong token contract." };
  }

  const expectedAmount = BigInt(request.amountUsdcAtomic);
  const matched = matchExpectedUsdcTransfer(
    receipt.logs ?? [],
    usdcContract,
    recipient,
    expectedAmount,
  );
  if (!matched) {
    return {
      verified: false,
      status: "failed",
      reason: "Expected exactly one matching USDC transfer to the receiving Safe.",
    };
  }

  const blockNumber = await client.getBlockNumber();
  const confirmations = Number(blockNumber - receipt.blockNumber);
  if (confirmations < LIVE_CONFIRMATION_BLOCKS) {
    return {
      verified: false,
      status: "pending",
      reason: `Waiting for confirmations (${confirmations}/${LIVE_CONFIRMATION_BLOCKS}).`,
    };
  }

  return {
    verified: true,
    status: "confirmed",
    blockNumber: receipt.blockNumber,
    confirmations,
    logIndex: matched.logIndex,
    sender: matched.sender,
  };
}
