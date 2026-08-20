import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain,
  type EIP1193Provider,
  type PublicClient,
} from "viem";
import { optimismSepolia } from "viem/chains";
import type {
  PaymentProvider,
  PaymentSubmitInput,
  SubmittedPayment,
  WalletSession,
} from "@/lib/pay/provider";
import type { CryptoConfig } from "@/lib/rent-advance/types";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";

/** Number of additional blocks after inclusion before a payment is confirmed. */
export const LIVE_CONFIRMATION_BLOCKS = 5;

/**
 * Library-agnostic wallet state. The Reown shell populates this from the
 * connected external wallet (address, active chain, and the EIP-1193
 * provider) and the hook passes it to the live adapter. No wallet SDK type
 * leaks through this boundary.
 */
export type LiveWalletContext = {
  /** EIP-1193 provider of the connected external wallet, if any. */
  provider: EIP1193Provider | null;
  /** Connected wallet address, if any. */
  address: string | null;
  /** Chain id currently active in the wallet, if known. */
  chainId: number | null;
  /** Whether wallet state has been initialised. */
  ready: boolean;
};

/** ERC-20 transfer ABI fragment. */
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "amount" },
    ],
    outputs: [{ type: "bool", name: "" }],
  },
] as const;

function resolveChain(config?: CryptoConfig | null): Chain {
  const chainId = config?.chainId;
  if (chainId !== optimismSepolia.id) {
    throw new Error("This payment requires the OP Sepolia network.");
  }
  return optimismSepolia;
}

function rpcUrl(config?: CryptoConfig | null): string {
  // TODO: replace with the Product Lead-provided RPC when supplied.
  return config?.networkKey === "op-sepolia"
    ? "https://sepolia.optimism.io"
    : "https://sepolia.optimism.io";
}

function publicClient(config?: CryptoConfig | null): PublicClient {
  return createPublicClient({ chain: resolveChain(config), transport: http(rpcUrl(config)) });
}

function walletFrom(context: LiveWalletContext): {
  provider: EIP1193Provider;
  address: string;
} {
  if (!context.ready || !context.address || !context.provider) {
    throw new Error("Connect a wallet first.");
  }
  return { provider: context.provider, address: context.address };
}

export function createLivePaymentProvider(
  config: CryptoConfig | null | undefined,
  getContext: () => LiveWalletContext,
): PaymentProvider {
  return {
    async connect() {
      const context = getContext();
      if (!context.ready || !context.address || !context.provider) {
        throw new Error("Wallet connection is required.");
      }
      return {
        address: context.address,
        connected: true,
        chainId: config?.chainId ?? optimismSepolia.id,
      };
    },
    async disconnect() {
      // Disconnect is handled by the Reown/AppKit modal control.
    },
    session(): WalletSession {
      try {
        const { address } = walletFrom(getContext());
        return { address, connected: true, chainId: config?.chainId ?? null };
      } catch {
        return { address: "", connected: false, chainId: null };
      }
    },
    async submitPayment(input: PaymentSubmitInput): Promise<SubmittedPayment> {
      const context = getContext();
      const { provider, address } = walletFrom(context);
      const chain = resolveChain(config);
      if (context.chainId != null && context.chainId !== chain.id) {
        throw new Error(
          `This payment must settle on ${chain.name}. Switch your wallet to ${chain.name} and try again.`,
        );
      }
      const walletClient = createWalletClient({
        account: address as `0x${string}`,
        chain,
        transport: custom(provider),
      });
      const amountBig = BigInt(input.expectedAtomicAmount);
      const usdcContract = config?.usdcContract;
      if (!usdcContract) throw new Error("USDC contract is not configured.");
      if (!input.recipient) throw new Error("Receiving address is missing.");

      const hash = await walletClient.writeContract({
        address: usdcContract as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [input.recipient as `0x${string}`, amountBig],
      });

      return {
        transactionId: input.paymentRequestId,
        txHash: hash,
        chainId: chain.id,
        from: address,
        to: input.recipient,
        tokenContract: usdcContract,
        atomicAmount: input.expectedAtomicAmount,
        status: "submitted",
      };
    },
    async reportExternalTransfer(): Promise<SubmittedPayment> {
      return {
        transactionId: "",
        txHash: null,
        chainId: null,
        from: "",
        to: "",
        tokenContract: null,
        atomicAmount: 0,
        status: "failed",
        errorCode: "external_not_supported",
        errorMessage: "Sending from your wallet is the supported way to pay in this demo.",
      };
    },
    async getStatus(txHash: string): Promise<SubmittedPayment | null> {
      const client = publicClient(config);
      const hash = txHash as `0x${string}`;
      const [receipt, blockNumber] = await Promise.all([
        client.getTransactionReceipt({ hash }),
        client.getBlockNumber(),
      ]);
      if (!receipt) return null;
      if (receipt.status === "reverted") {
        return { transactionId: "", txHash, chainId: config?.chainId ?? null, from: receipt.from, to: receipt.to ?? "", tokenContract: config?.usdcContract ?? null, atomicAmount: 0, status: "failed" };
      }
      const confirmations = blockNumber - receipt.blockNumber;
      return {
        transactionId: "",
        txHash,
        chainId: config?.chainId ?? null,
        from: receipt.from,
        to: receipt.to ?? "",
        tokenContract: config?.usdcContract ?? null,
        atomicAmount: 0,
        status: confirmations >= BigInt(LIVE_CONFIRMATION_BLOCKS) ? "confirmed" : "pending",
      };
    },
  };
}

export function liveReceivingAmountUsdcAtomic(usdCents: number): number {
  return usdcAtomicFromUsdCents(usdCents);
}
