import { createPublicClient, createWalletClient, custom, type EIP1193Provider } from "viem";
import { optimism } from "viem/chains";

import type { MerkadoWallet } from "@/hooks/use-merkado-wallet";
import {
  OP_MAINNET_CHAIN_ID,
  OP_MAINNET_NETWORK_LABEL,
  OP_MAINNET_USDC_CONTRACT,
} from "@/lib/pay/networks";

export const OP_MAINNET_CHAIN_ID_HEX = `0x${OP_MAINNET_CHAIN_ID.toString(16).toUpperCase()}`;

const MERKADO_CONTRACT_ENV = "NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS";

/** Functions the browser wallet calls. Mint is executed by operators, not here. */
export const MERKADO_ABI = [
  {
    name: "purchase",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "depositRent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "paymentId", type: "bytes32" },
      { name: "amountAtomic", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "claimRent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "claimableRent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type MerkadoTxResult = {
  hash: `0x${string}`;
  from: `0x${string}`;
};

const CONNECT_FIRST_MESSAGE = "Connect a wallet first.";
const USER_REJECTED_MESSAGE = "The transaction was cancelled in your wallet.";
const WALLET_RECEIPT_POLL_MS = 1_000;

function userSafeError(message: string): Error {
  return new Error(message);
}

function parseHexChainId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  if (!/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isUserRejectedRequest(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 6; depth += 1) {
    const value = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (value.code === 4001) return true;
    const name = value.name;
    if (typeof name === "string" && /(user.?rejected|action.?rejected)/i.test(name)) {
      return true;
    }
    current = value.cause;
  }
  return false;
}

function toUserSafeError(error: unknown): Error {
  if (isUserRejectedRequest(error)) {
    return userSafeError(USER_REJECTED_MESSAGE);
  }
  if (error instanceof Error) return error;
  return userSafeError("The wallet request failed. Try again.");
}

/** The Merkado contract address, read from env at runtime. Never hard-coded. */
export function merkadoContractAddress(): `0x${string}` {
  const value = process.env[MERKADO_CONTRACT_ENV]?.trim();
  if (!value) {
    throw userSafeError(
      `${MERKADO_CONTRACT_ENV} is not set. Configure it before using the Merkado contract.`,
    );
  }
  if (!/^0x[0-9a-f]{40}$/i.test(value)) {
    throw userSafeError(`${MERKADO_CONTRACT_ENV} must be a 20-byte 0x address.`);
  }
  return value as `0x${string}`;
}

/**
 * Resolve the active contract address. The address is a variable stored in
 * the demo book and updated after each redeploy, so the caller passes the
 * offer's configured address; this falls back to the env value when absent.
 */
export function resolveMerkadoContractAddress(
  contractAddress?: string | null,
): `0x${string}` {
  const raw = contractAddress?.trim();
  if (raw && /^0x[0-9a-fA-F]{40}$/i.test(raw)) {
    return raw as `0x${string}`;
  }
  return merkadoContractAddress();
}

function walletContext(wallet: MerkadoWallet) {
  if (!wallet.provider || !wallet.address) {
    throw userSafeError(CONNECT_FIRST_MESSAGE);
  }
  const provider: EIP1193Provider = wallet.provider;
  return {
    from: wallet.address,
    client: createWalletClient({
      account: wallet.address,
      chain: optimism,
      transport: custom(provider),
    }),
    publicClient: createPublicClient({
      chain: optimism,
      transport: custom(provider),
    }),
  };
}

export async function waitForSuccessfulWalletTransaction(
  provider: EIP1193Provider,
  hash: `0x${string}`,
  label: string,
): Promise<void> {
  while (true) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x1") return;
      throw userSafeError(`${label} failed on Optimism Mainnet.`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, WALLET_RECEIPT_POLL_MS));
  }
}

/**
 * Ensure the wallet is on Optimism Mainnet (10).
 * Throws a user-safe error when the chain is wrong. When `switchChain` is
 * true, first tries `wallet_switchEthereumChain` to Optimism Mainnet and
 * confirms the wallet actually switched.
 */
export async function ensureOptimismMainnet(
  wallet: MerkadoWallet,
  switchChain = false,
): Promise<void> {
  if (!wallet.provider) {
    throw userSafeError(CONNECT_FIRST_MESSAGE);
  }
  if (wallet.chainId === OP_MAINNET_CHAIN_ID) return;

  if (switchChain) {
    try {
      await wallet.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: OP_MAINNET_CHAIN_ID_HEX }],
      });
      const value = await wallet.provider.request({ method: "eth_chainId" });
      if (parseHexChainId(value) === OP_MAINNET_CHAIN_ID) return;
      throw userSafeError(`Wallet did not switch to ${OP_MAINNET_NETWORK_LABEL}.`);
    } catch (error) {
      if (isUserRejectedRequest(error)) {
        throw userSafeError("Network switch was rejected in your wallet.");
      }
      if (error instanceof Error && error.message.includes(OP_MAINNET_NETWORK_LABEL)) {
        throw error;
      }
      throw userSafeError(`Could not switch to ${OP_MAINNET_NETWORK_LABEL}.`);
    }
  }

  throw userSafeError(
    `Wallet is on the wrong network. Switch to ${OP_MAINNET_NETWORK_LABEL} (chain id ${OP_MAINNET_CHAIN_ID}).`,
  );
}

/** Approve the Merkado contract to spend exactly `amountAtomic` USDC. */
export async function approveUsdc(
  wallet: MerkadoWallet,
  amountAtomic: bigint,
  contractAddress?: string | null,
): Promise<MerkadoTxResult> {
  await ensureOptimismMainnet(wallet);
  const { client, from } = walletContext(wallet);
  try {
    const hash = await client.writeContract({
      address: OP_MAINNET_USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: "approve",
      args: [resolveMerkadoContractAddress(contractAddress), amountAtomic],
    });
    // Purchase/deposit gas estimation reads confirmed allowance. Do not send
    // the dependent transaction until the approval is actually mined.
    await waitForSuccessfulWalletTransaction(wallet.provider!, hash, "USDC approval");
    return { hash, from };
  } catch (error) {
    throw toUserSafeError(error);
  }
}

/** Buy the offer NFT for `tokenId`. */
export async function purchaseOffer(
  wallet: MerkadoWallet,
  tokenId: bigint,
  contractAddress?: string | null,
): Promise<MerkadoTxResult> {
  await ensureOptimismMainnet(wallet);
  const { client, from } = walletContext(wallet);
  try {
    const hash = await client.writeContract({
      address: resolveMerkadoContractAddress(contractAddress),
      abi: MERKADO_ABI,
      functionName: "purchase",
      args: [tokenId],
    });
    return { hash, from };
  } catch (error) {
    throw toUserSafeError(error);
  }
}

export type WalletReadinessResult = { ok: true } | { ok: false; error: string };

/**
 * Pre-sign checks that only need the wallet's own RPC: correct network and a
 * USDC balance that covers the exact purchase price. Runs before approval.
 */
export async function checkWalletPurchaseReadiness(
  wallet: MerkadoWallet,
  amountAtomic: bigint,
): Promise<WalletReadinessResult> {
  if (!wallet.provider || !wallet.address) {
    return { ok: false, error: CONNECT_FIRST_MESSAGE };
  }
  try {
    await ensureOptimismMainnet(wallet);
    const { publicClient, from } = walletContext(wallet);
    const usdcBalance = await publicClient.readContract({
      address: OP_MAINNET_USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [from],
    });
    if (usdcBalance < amountAtomic) {
      return {
        ok: false,
        error: "Your USDC balance is lower than the purchase price.",
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toUserSafeError(error).message };
  }
}

/**
 * Simulate `purchase(tokenId)` with the freshly approved allowance so a
 * reverted transaction is caught before broadcast. Runs after approval.
 */
export async function simulateWalletPurchase(
  wallet: MerkadoWallet,
  tokenId: bigint,
  contractAddress?: string | null,
): Promise<WalletReadinessResult> {
  if (!wallet.provider || !wallet.address) {
    return { ok: false, error: CONNECT_FIRST_MESSAGE };
  }
  try {
    await ensureOptimismMainnet(wallet);
    const { publicClient, from } = walletContext(wallet);
    await publicClient.simulateContract({
      address: resolveMerkadoContractAddress(contractAddress),
      abi: MERKADO_ABI,
      functionName: "purchase",
      args: [tokenId],
      account: from,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toUserSafeError(error).message };
  }
}

/** Record a rent payment for a token using the on-chain payment id. */
export async function depositRent(
  wallet: MerkadoWallet,
  input: { tokenId: bigint; paymentId: `0x${string}`; amountAtomic: bigint },
  contractAddress?: string | null,
): Promise<MerkadoTxResult> {
  await ensureOptimismMainnet(wallet);
  const { client, from } = walletContext(wallet);
  try {
    const hash = await client.writeContract({
      address: resolveMerkadoContractAddress(contractAddress),
      abi: MERKADO_ABI,
      functionName: "depositRent",
      args: [input.tokenId, input.paymentId, input.amountAtomic],
    });
    return { hash, from };
  } catch (error) {
    throw toUserSafeError(error);
  }
}

/** Claim accrued rent for `tokenId`. */
export async function claimRent(
  wallet: MerkadoWallet,
  tokenId: bigint,
  contractAddress?: string | null,
): Promise<MerkadoTxResult> {
  await ensureOptimismMainnet(wallet);
  const { client, publicClient, from } = walletContext(wallet);
  try {
    const address = resolveMerkadoContractAddress(contractAddress);
    const currentOwner = await publicClient.readContract({
      address,
      abi: MERKADO_ABI,
      functionName: "ownerOf",
      args: [tokenId],
    });
    if (currentOwner.toLowerCase() !== from.toLowerCase()) {
      throw userSafeError("This wallet is not the current holder of this offer.");
    }
    const claimable = await publicClient.readContract({
      address,
      abi: MERKADO_ABI,
      functionName: "claimableRent",
      args: [tokenId],
    });
    if (claimable === BigInt(0)) {
      throw userSafeError("There is no rent available to claim on Optimism Mainnet.");
    }
    const hash = await client.writeContract({
      address,
      abi: MERKADO_ABI,
      functionName: "claimRent",
      args: [tokenId],
    });
    return { hash, from };
  } catch (error) {
    throw toUserSafeError(error);
  }
}
