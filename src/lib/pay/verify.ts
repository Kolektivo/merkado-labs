import { createPublicClient, http } from "viem";
import { optimismSepolia } from "viem/chains";
import { LIVE_CONFIRMATION_BLOCKS } from "@/lib/pay/live-provider";
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

function rpcUrl(): string {
  // TODO: replace with the Product Lead-provided RPC when supplied.
  return "https://sepolia.optimism.io";
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
  if (config.chainId !== optimismSepolia.id) {
    return { verified: false, status: "failed", reason: "This payment must settle on OP Sepolia." };
  }
  const usdcContract = config.usdcContract;
  const recipient = config.safeAddress;
  if (!usdcContract || !recipient) {
    return { verified: false, status: "failed", reason: "Payment configuration is incomplete." };
  }
  if (request.receivingAddress !== recipient) {
    return { verified: false, status: "failed", reason: "Receiving address mismatch." };
  }

  const client = createPublicClient({ chain: optimismSepolia, transport: http(rpcUrl()) });
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
