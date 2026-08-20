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
};

const ERC20_TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

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
  let matched = false;
  try {
    const logs = await client.getLogs({
      address: usdcContract as `0x${string}`,
      event: ERC20_TRANSFER_EVENT_ABI[0],
      args: { to: recipient as `0x${string}` },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    matched = logs.some(
      (log) =>
        log.args &&
        (log.args as { value?: bigint }).value !== undefined &&
        (log.args as { value: bigint }).value === expectedAmount,
    );
  } catch {
    matched = false;
  }
  if (!matched) {
    return { verified: false, status: "failed", reason: "Expected USDC transfer not found." };
  }

  const blockNumber = await client.getBlockNumber();
  const confirmations = blockNumber - receipt.blockNumber;
  if (confirmations < BigInt(LIVE_CONFIRMATION_BLOCKS)) {
    return {
      verified: false,
      status: "pending",
      reason: `Waiting for confirmations (${confirmations}/${LIVE_CONFIRMATION_BLOCKS}).`,
    };
  }

  return { verified: true, status: "confirmed" };
}
