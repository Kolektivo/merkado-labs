/** Demo network facts. Do not treat this as a live wallet or RPC setup. */

import { getAddress } from "viem";

import type {
  CryptoConfig,
  PublicCryptoConfig,
} from "@/lib/rent-advance/types";

/** Verified Base Sepolia company receiving Safe (matches onchain config). */
export const MERKADO_COMPANY_SAFE_ADDRESS =
  "0xfC6ec9718d89d4935594E7DB78399913071FcDc4";

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

/** The deployed Merkado contract address, or null until configured. */
export function merkadoContractAddressOrNull(): `0x${string}` | null {
  const raw = process.env[MERKADO_CONTRACT_ENV]?.trim();
  if (!raw || isPlaceholder(raw)) return null;
  try {
    return getAddress(raw) as `0x${string}`;
  } catch {
    return null;
  }
}

/**
 * Validate and checksum a contract address. Returns null when missing,
 * placeholder, or invalid. Used to resolve the stored (variable) contract
 * address from the demo book before falling back to the env value.
 */
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

/** Company receiving Safe, from env (trimmed) or the verified default. */
export function resolvedCompanySafe(): `0x${string}` {
  const raw = process.env[MERKADO_COMPANY_SAFE_ENV]?.trim();
  if (raw && !isPlaceholder(raw)) {
    try {
      return getAddress(raw) as `0x${string}`;
    } catch {
      return MERKADO_COMPANY_SAFE_ADDRESS as `0x${string}`;
    }
  }
  return MERKADO_COMPANY_SAFE_ADDRESS as `0x${string}`;
}

export const OP_SEPOLIA_NETWORK_KEY = "op-sepolia";
export const BASE_SEPOLIA_NETWORK_KEY = "base-sepolia";
export const OP_MAINNET_NETWORK_KEY = "op-mainnet";
export const BASE_MAINNET_NETWORK_KEY = "base-mainnet";

/** @deprecated Use OP_MAINNET_NETWORK_KEY. Stored "optimism" books rematch to the default testnet. */
export const LEGACY_OP_MAINNET_NETWORK_KEY = "optimism";

export const DEFAULT_PAY_NETWORK_KEY = BASE_SEPOLIA_NETWORK_KEY;
export const DEFAULT_PAY_NETWORK_FAMILY = "base" as const;
export const PAY_NETWORK_ENV = "NEXT_PUBLIC_PAY_NETWORK";

export const OP_SEPOLIA_CHAIN_ID = 11155420;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const OP_MAINNET_CHAIN_ID = 10;
export const BASE_MAINNET_CHAIN_ID = 8453;

export const OP_SEPOLIA_NETWORK_LABEL = "OP Sepolia";
export const BASE_SEPOLIA_NETWORK_LABEL = "Base Sepolia";
export const OP_MAINNET_NETWORK_LABEL = "OP Mainnet";
export const BASE_MAINNET_NETWORK_LABEL = "Base Mainnet";

export const OP_SEPOLIA_EXPLORER_BASE_URL = "https://sepolia-optimism.etherscan.io";
export const BASE_SEPOLIA_EXPLORER_BASE_URL = "https://sepolia.basescan.org";
export const OP_MAINNET_EXPLORER_BASE_URL = "https://optimistic.etherscan.io";
export const BASE_MAINNET_EXPLORER_BASE_URL = "https://basescan.org";

/** Circle native USDC. Not USDC.e / USDbC. */
export const OP_SEPOLIA_USDC_CONTRACT =
  "0x5fd84259d66Cd46123540766Be93DFE6D43130D7";
export const BASE_SEPOLIA_USDC_CONTRACT =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const OP_MAINNET_USDC_CONTRACT =
  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
export const BASE_MAINNET_USDC_CONTRACT =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export type PayNetworkFamily = "optimism" | "base";

export type PayNetworkKey =
  | typeof OP_SEPOLIA_NETWORK_KEY
  | typeof BASE_SEPOLIA_NETWORK_KEY
  | typeof OP_MAINNET_NETWORK_KEY
  | typeof BASE_MAINNET_NETWORK_KEY;

export type PayNetwork = {
  key: PayNetworkKey;
  aliases: readonly string[];
  chainId: number;
  networkLabel: string;
  usdcContract: string;
  usdcDecimals: 6;
  explorerBaseUrl: string;
  publicRpcUrl: string;
  isTestnet: boolean;
  family: PayNetworkFamily;
};

export const PAY_NETWORKS: Record<PayNetworkKey, PayNetwork> = {
  [OP_SEPOLIA_NETWORK_KEY]: {
    key: OP_SEPOLIA_NETWORK_KEY,
    aliases: ["optimism-sepolia", "op-testnet", "open-mainnet-testnet"],
    chainId: OP_SEPOLIA_CHAIN_ID,
    networkLabel: OP_SEPOLIA_NETWORK_LABEL,
    usdcContract: OP_SEPOLIA_USDC_CONTRACT,
    usdcDecimals: 6,
    explorerBaseUrl: OP_SEPOLIA_EXPLORER_BASE_URL,
    publicRpcUrl: "https://sepolia.optimism.io",
    isTestnet: true,
    family: "optimism",
  },
  [BASE_SEPOLIA_NETWORK_KEY]: {
    key: BASE_SEPOLIA_NETWORK_KEY,
    aliases: ["base-testnet"],
    chainId: BASE_SEPOLIA_CHAIN_ID,
    networkLabel: BASE_SEPOLIA_NETWORK_LABEL,
    usdcContract: BASE_SEPOLIA_USDC_CONTRACT,
    usdcDecimals: 6,
    explorerBaseUrl: BASE_SEPOLIA_EXPLORER_BASE_URL,
    publicRpcUrl: "https://sepolia.base.org",
    isTestnet: true,
    family: "base",
  },
  [OP_MAINNET_NETWORK_KEY]: {
    key: OP_MAINNET_NETWORK_KEY,
    aliases: ["optimism-mainnet"],
    chainId: OP_MAINNET_CHAIN_ID,
    networkLabel: OP_MAINNET_NETWORK_LABEL,
    usdcContract: OP_MAINNET_USDC_CONTRACT,
    usdcDecimals: 6,
    explorerBaseUrl: OP_MAINNET_EXPLORER_BASE_URL,
    publicRpcUrl: "https://mainnet.optimism.io",
    isTestnet: false,
    family: "optimism",
  },
  [BASE_MAINNET_NETWORK_KEY]: {
    key: BASE_MAINNET_NETWORK_KEY,
    aliases: [],
    chainId: BASE_MAINNET_CHAIN_ID,
    networkLabel: BASE_MAINNET_NETWORK_LABEL,
    usdcContract: BASE_MAINNET_USDC_CONTRACT,
    usdcDecimals: 6,
    explorerBaseUrl: BASE_MAINNET_EXPLORER_BASE_URL,
    publicRpcUrl: "https://mainnet.base.org",
    isTestnet: false,
    family: "base",
  },
};

export const PAY_NETWORK_LIST = Object.values(PAY_NETWORKS);

const NETWORK_BY_ALIAS = new Map<string, PayNetworkKey>();
for (const network of PAY_NETWORK_LIST) {
  NETWORK_BY_ALIAS.set(network.key, network.key);
  for (const alias of network.aliases) {
    NETWORK_BY_ALIAS.set(alias, network.key);
  }
}

export function isPayNetworkKey(value: string | null | undefined): value is PayNetworkKey {
  return Boolean(value && value in PAY_NETWORKS);
}

export function parsePayNetworkKey(value: string | null | undefined): PayNetworkKey | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  return NETWORK_BY_ALIAS.get(raw) ?? null;
}

/** Env and server actions accept only the four catalog keys, not short aliases. */
export function parseExactPayNetworkKey(value: string | null | undefined): PayNetworkKey | null {
  const raw = value?.trim().toLowerCase();
  return isPayNetworkKey(raw) ? raw : null;
}

export function envPayNetworkKey(): PayNetworkKey | null {
  return parseExactPayNetworkKey(process.env.NEXT_PUBLIC_PAY_NETWORK);
}

export function defaultPayNetworkKey(): PayNetworkKey {
  return envPayNetworkKey() ?? DEFAULT_PAY_NETWORK_KEY;
}

export function preferredPayNetworkFamily(): PayNetworkFamily {
  const env = envPayNetworkKey();
  return env ? PAY_NETWORKS[env].family : DEFAULT_PAY_NETWORK_FAMILY;
}

export function visiblePayNetworks(allowMainnet = mainnetSelectionAllowed()): PayNetwork[] {
  const family = preferredPayNetworkFamily();
  return PAY_NETWORK_LIST.filter(
    (network) => network.family === family && (network.isTestnet || allowMainnet),
  );
}

export function isSelectablePayNetwork(key: PayNetworkKey): boolean {
  return visiblePayNetworks().some((network) => network.key === key);
}

export function counterpartPayNetworkKey(
  key: PayNetworkKey,
  family: PayNetworkFamily,
): PayNetworkKey {
  const source = PAY_NETWORKS[key];
  if (source.family === family) return key;
  const match = PAY_NETWORK_LIST.find(
    (network) => network.family === family && network.isTestnet === source.isTestnet,
  );
  return match?.key ?? defaultPayNetworkKey();
}

export function mainnetSelectionAllowed(): boolean {
  const env = envPayNetworkKey();
  return Boolean(env && !PAY_NETWORKS[env].isTestnet);
}

export function canPersistPayNetwork(key: PayNetworkKey): boolean {
  return PAY_NETWORKS[key].isTestnet || mainnetSelectionAllowed();
}

export function persistablePayNetworkKey(key: PayNetworkKey): PayNetworkKey {
  return canPersistPayNetwork(key) ? key : defaultPayNetworkKey();
}

function finishPayNetworkKey(key: PayNetworkKey): PayNetworkKey {
  return persistablePayNetworkKey(
    counterpartPayNetworkKey(key, preferredPayNetworkFamily()),
  );
}

export function payNetworkByChainId(chainId: number | null | undefined): PayNetwork | null {
  if (chainId == null) return null;
  return PAY_NETWORK_LIST.find((network) => network.chainId === chainId) ?? null;
}

/**
 * Resolve the active demo network.
 * Product default is Base. Stored OP / `optimism` books rematch to the
 * matching Base network unless Luis opts into Optimism with env.
 */
export function resolvePayNetworkKey(input?: {
  networkKey?: string | null;
  chainId?: number | null;
} | null): PayNetworkKey {
  const raw = input?.networkKey?.trim().toLowerCase();
  if (raw === LEGACY_OP_MAINNET_NETWORK_KEY) {
    return defaultPayNetworkKey();
  }
  const fromKey = parsePayNetworkKey(raw);
  if (fromKey) return finishPayNetworkKey(fromKey);
  const fromChain = payNetworkByChainId(input?.chainId);
  if (fromChain) {
    if (!raw && fromChain.key === OP_MAINNET_NETWORK_KEY) {
      return defaultPayNetworkKey();
    }
    return finishPayNetworkKey(fromChain.key);
  }
  return defaultPayNetworkKey();
}

export function getPayNetwork(key: PayNetworkKey): PayNetwork {
  return PAY_NETWORKS[key];
}

export function officialExplorerBaseUrls(): string[] {
  return PAY_NETWORK_LIST.map((network) => normalizeExplorerBaseUrl(network.explorerBaseUrl));
}

export function normalizeExplorerBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export function isOfficialExplorerBaseUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return officialExplorerBaseUrls().includes(normalizeExplorerBaseUrl(value));
}

export function isTestnetConfig(input?: { networkKey?: string | null; chainId?: number | null } | null): boolean {
  return getPayNetwork(resolvePayNetworkKey(input)).isTestnet;
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
