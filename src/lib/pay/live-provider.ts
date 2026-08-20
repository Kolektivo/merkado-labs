import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { optimismSepolia } from "viem/chains";
import type { ConnectedWallet } from "@privy-io/react-auth";
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

export type LiveWalletContext = {
  wallets: ConnectedWallet[];
  ready: boolean;
  authenticated: boolean;
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

function walletFrom(context: LiveWalletContext): ConnectedWallet {
  if (!context.ready || !context.authenticated || context.wallets.length === 0) {
    throw new Error("Connect a wallet first.");
  }
  const wallet = context.wallets[0];
  if (!wallet) throw new Error("No wallet connected.");
  return wallet;
}

export function createLivePaymentProvider(
  config: CryptoConfig | null | undefined,
  getContext: () => LiveWalletContext,
): PaymentProvider {
  return {
    async connect() {
      const context = getContext();
      if (!context.ready || !context.authenticated || context.wallets.length === 0) {
        throw new Error("Wallet connection is required.");
      }
      const wallet = context.wallets[0];
      return {
        address: wallet.address,
        connected: true,
        chainId: config?.chainId ?? optimismSepolia.id,
      };
    },
    async disconnect() {
      // Logout is handled by the Privy UI control.
    },
    session(): WalletSession {
      try {
        const wallet = walletFrom(getContext());
        return { address: wallet.address, connected: true, chainId: config?.chainId ?? null };
      } catch {
        return { address: "", connected: false, chainId: null };
      }
    },
    async submitPayment(input: PaymentSubmitInput): Promise<SubmittedPayment> {
      const context = getContext();
      const wallet = walletFrom(context);
      const chain = resolveChain(config);
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
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
        from: wallet.address,
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
