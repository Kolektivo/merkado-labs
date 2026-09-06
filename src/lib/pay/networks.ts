/** The only supported payment network for this deployment. */

import { getAddress } from "viem";

import type { CryptoConfig, PublicCryptoConfig } from "@/lib/rent-advance/types";

/** The server-held operator EOA used by the deployed contract. */
export const MERKADO_COMPANY_SAFE_ADDRESS =
  "0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5";

const MERKADO_CONTRACT_ENV = "NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS";
const MERKADO_COMPANY_SAFE_ENV = "NEXT_PUBLIC_MERKADO_COMPANY_SAFE";

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("placeholder") ||
    normalized.includes("replace-me") ||
    normalized.includes("your-") ||
    normalized === "changeme"
  );
}

/** The configured deployed Merkado contract, or null when absent/invalid. */
export function merkadoContractAddressOrNull(): `0x${string}` | null {
  const raw = process.env[MERKADO_CONTRACT_ENV]?.trim();
  if (!raw || isPlaceholder(raw)) return null;
  try {
    return getAddress(raw) as `0x${string}`;
  } catch {
    return null;
  }
}

export function normalizeContractAddress(
  value: string | null | undefined,
): `0x${string}` | null {
  const raw = value?.trim();
  if (!raw || isPlaceholder(raw)) return null;
  try {
    return getAddress(raw) as `0x${string}`;
  } catch {
    return null;
  }
}

/** The deployed operator address, overridable only for display configuration. */
export function resolvedCompanySafe(): `0x${string}` {
  const raw = process.env[MERKADO_COMPANY_SAFE_ENV]?.trim();
  if (raw && !isPlaceholder(raw)) {
    try {
      return getAddress(raw) as `0x${string}`;
    } catch {
      // Fall through to the address verified in the deployed contract.
    }
  }
  return MERKADO_COMPANY_SAFE_ADDRESS as `0x${string}`;
}

export const OP_MAINNET_NETWORK_KEY = "op-mainnet" as const;
export const DEFAULT_PAY_NETWORK_KEY = OP_MAINNET_NETWORK_KEY;
export const DEFAULT_PAY_NETWORK_FAMILY = "optimism" as const;
export const OP_MAINNET_CHAIN_ID = 10;
export const OP_MAINNET_NETWORK_LABEL = "Optimism Mainnet";
export const OP_MAINNET_EXPLORER_BASE_URL = "https://optimistic.etherscan.io";
export const OP_MAINNET_USDC_CONTRACT =
  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";

export type PayNetworkFamily = "optimism";
export type PayNetworkKey = typeof OP_MAINNET_NETWORK_KEY;

export type PayNetwork = {
  key: PayNetworkKey;
  aliases: readonly [];
  chainId: number;
  networkLabel: string;
  usdcContract: string;
  usdcDecimals: 6;
  explorerBaseUrl: string;
  publicRpcUrl: string;
  isTestnet: false;
  family: PayNetworkFamily;
};

export const PAY_NETWORKS: Record<PayNetworkKey, PayNetwork> = {
  [OP_MAINNET_NETWORK_KEY]: {
    key: OP_MAINNET_NETWORK_KEY,
    aliases: [],
    chainId: OP_MAINNET_CHAIN_ID,
    networkLabel: OP_MAINNET_NETWORK_LABEL,
    usdcContract: OP_MAINNET_USDC_CONTRACT,
    usdcDecimals: 6,
    explorerBaseUrl: OP_MAINNET_EXPLORER_BASE_URL,
    publicRpcUrl: "https://mainnet.optimism.io",
    isTestnet: false,
    family: "optimism",
  },
};

export const PAY_NETWORK_LIST = Object.values(PAY_NETWORKS);

export function isPayNetworkKey(value: string | null | undefined): value is PayNetworkKey {
  return value?.trim().toLowerCase() === OP_MAINNET_NETWORK_KEY;
}

export function parsePayNetworkKey(value: string | null | undefined): PayNetworkKey | null {
  return isPayNetworkKey(value) ? OP_MAINNET_NETWORK_KEY : null;
}

export function parseExactPayNetworkKey(value: string | null | undefined): PayNetworkKey | null {
  return parsePayNetworkKey(value);
}

export function envPayNetworkKey(): PayNetworkKey {
  return OP_MAINNET_NETWORK_KEY;
}

export function defaultPayNetworkKey(): PayNetworkKey {
  return OP_MAINNET_NETWORK_KEY;
}

export function preferredPayNetworkFamily(): PayNetworkFamily {
  return "optimism";
}

export function visiblePayNetworks(): PayNetwork[] {
  return PAY_NETWORK_LIST;
}

export function isSelectablePayNetwork(key: PayNetworkKey): boolean {
  return key === OP_MAINNET_NETWORK_KEY;
}

export function canPersistPayNetwork(key: PayNetworkKey): boolean {
  return key === OP_MAINNET_NETWORK_KEY;
}

export function persistablePayNetworkKey(key: PayNetworkKey): PayNetworkKey {
  return key;
}

export function payNetworkByChainId(chainId: number | null | undefined): PayNetwork | null {
  return chainId === OP_MAINNET_CHAIN_ID ? PAY_NETWORKS[OP_MAINNET_NETWORK_KEY] : null;
}

/** Resolve all legacy or missing stored configuration to the active deployment. */
export function resolvePayNetworkKey(_input?: {
  networkKey?: string | null;
  chainId?: number | null;
} | null): PayNetworkKey {
  void _input;
  return OP_MAINNET_NETWORK_KEY;
}

export function getPayNetwork(key: PayNetworkKey = OP_MAINNET_NETWORK_KEY): PayNetwork {
  return PAY_NETWORKS[key];
}

export function officialExplorerBaseUrls(): string[] {
  return [OP_MAINNET_EXPLORER_BASE_URL];
}

export function normalizeExplorerBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export function isOfficialExplorerBaseUrl(value: string | null | undefined): boolean {
  return Boolean(value && officialExplorerBaseUrls().includes(normalizeExplorerBaseUrl(value)));
}

export function isTestnetConfig(): false {
  return false;
}

export function toPublicCryptoConfig(
  config?: CryptoConfig | null,
): PublicCryptoConfig | null {
  if (!config) return null;
  return {
    networkKey: config.networkKey,
    chainId: config.chainId,
    networkLabel: config.networkLabel,
    usdcContract: config.usdcContract,
    usdcDecimals: config.usdcDecimals,
    explorerBaseUrl: config.explorerBaseUrl,
  };
}
