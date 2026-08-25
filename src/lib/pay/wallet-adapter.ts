import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { baseSepolia } from "viem/chains";

import type { MerkadoWallet } from "@/hooks/use-merkado-wallet";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_NETWORK_LABEL,
  BASE_SEPOLIA_USDC_CONTRACT,
} from "@/lib/pay/networks";

export const BASE_SEPOLIA_CHAIN_ID_HEX = `0x${BASE_SEPOLIA_CHAIN_ID.toString(16).toUpperCase()}`;

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
] as const;

export type MerkadoTxResult = {
  hash: `0x${string}`;
  from: `0x${string}`;
};

const CONNECT_FIRST_MESSAGE = "Connect a wallet first.";
const USER_REJECTED_MESSAGE = "The transaction was cancelled in your wallet.";
const WALLET_RECEIPT_TIMEOUT_MS = 90_000;
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
      chain: baseSepolia,
      transport: custom(provider),
    }),
  };
}

async function waitForSuccessfulWalletTransaction(
  provider: EIP1193Provider,
  hash: `0x${string}`,
  label: string,
): Promise<void> {
  const deadline = Date.now() + WALLET_RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x1") return;
      throw userSafeError(`${label} failed on Base Sepolia.`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, WALLET_RECEIPT_POLL_MS));
  }
  throw userSafeError(`${label} is still pending. Wait for it to confirm before trying again.`);
}

/**
 * Ensure the wallet is on Base Sepolia (84532).
 * Throws a user-safe error when the chain is wrong. When `switchChain` is
 * true, first tries `wallet_switchEthereumChain` to Base Sepolia and
 * confirms the wallet actually switched.
 */
export async function ensureBaseSepolia(
  wallet: MerkadoWallet,
  switchChain = false,
): Promise<void> {
  if (!wallet.provider) {
    throw userSafeError(CONNECT_FIRST_MESSAGE);
  }
  if (wallet.chainId === BASE_SEPOLIA_CHAIN_ID) return;

  if (switchChain) {
    try {
      await wallet.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
      });
      const value = await wallet.provider.request({ method: "eth_chainId" });
      if (parseHexChainId(value) === BASE_SEPOLIA_CHAIN_ID) return;
      throw userSafeError(`Wallet did not switch to ${BASE_SEPOLIA_NETWORK_LABEL}.`);
    } catch (error) {
      if (isUserRejectedRequest(error)) {
        throw userSafeError("Network switch was rejected in your wallet.");
      }
      if (error instanceof Error && error.message.includes(BASE_SEPOLIA_NETWORK_LABEL)) {
        throw error;
      }
      throw userSafeError(`Could not switch to ${BASE_SEPOLIA_NETWORK_LABEL}.`);
    }
  }

  throw userSafeError(
    `Wallet is on the wrong network. Switch to ${BASE_SEPOLIA_NETWORK_LABEL} (chain id ${BASE_SEPOLIA_CHAIN_ID}).`,
  );
}

/** Approve the Merkado contract to spend exactly `amountAtomic` USDC. */
export async function approveUsdc(
  wallet: MerkadoWallet,
  amountAtomic: bigint,
  contractAddress?: string | null,
): Promise<MerkadoTxResult> {
  await ensureBaseSepolia(wallet);
  const { client, from } = walletContext(wallet);
  try {
    const hash = await client.writeContract({
      address: BASE_SEPOLIA_USDC_CONTRACT,
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
  await ensureBaseSepolia(wallet);
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

/** Record a rent payment for a token using the on-chain payment id. */
export async function depositRent(
  wallet: MerkadoWallet,
  input: { tokenId: bigint; paymentId: `0x${string}`; amountAtomic: bigint },
  contractAddress?: string | null,
): Promise<MerkadoTxResult> {
  await ensureBaseSepolia(wallet);
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
  await ensureBaseSepolia(wallet);
  const { client, from } = walletContext(wallet);
  try {
    const hash = await client.writeContract({
      address: resolveMerkadoContractAddress(contractAddress),
      abi: MERKADO_ABI,
      functionName: "claimRent",
      args: [tokenId],
    });
    return { hash, from };
  } catch (error) {
    throw toUserSafeError(error);
  }
}
