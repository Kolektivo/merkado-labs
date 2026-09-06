import "server-only";

import { getAddress } from "viem";

export const MERKADO_CHAIN_ID = 10;
export const MERKADO_NETWORK_KEY = "op-mainnet";
export const MERKADO_USDC_ADDRESS = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
export const MERKADO_EXPLORER_BASE_URL = "https://optimistic.etherscan.io";

export const DEFAULT_MERKADO_COMPANY_SAFE =
  "0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5";

const MERKADO_CONTRACT_ADDRESS_ENV = "NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS";
const MERKADO_COMPANY_SAFE_ENV = "NEXT_PUBLIC_MERKADO_COMPANY_SAFE";
const DEFAULT_MERKADO_RPC_URL = "https://mainnet.optimism.io";

export class MerkadoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerkadoConfigurationError";
  }
}

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

function resolveCompanySafe(): string {
  const raw = process.env[MERKADO_COMPANY_SAFE_ENV]?.trim();
  if (!raw || isPlaceholder(raw)) return DEFAULT_MERKADO_COMPANY_SAFE;
  try {
    return getAddress(raw);
  } catch {
    return DEFAULT_MERKADO_COMPANY_SAFE;
  }
}

/** Company receiving Safe, from env (trimmed) or the verified default. */
export const MERKADO_COMPANY_SAFE = resolveCompanySafe();

/**
 * The deployed NFT offer contract address. Validated and checksummed with
 * viem `getAddress`. Throws when missing, placeholder, or invalid.
 */
export function merkadoContractAddress(): string {
  const raw = process.env[MERKADO_CONTRACT_ADDRESS_ENV]?.trim();
  if (!raw || isPlaceholder(raw)) {
    throw new MerkadoConfigurationError(
      `${MERKADO_CONTRACT_ADDRESS_ENV} is missing or still contains a placeholder value.`,
    );
  }
  try {
    return getAddress(raw);
  } catch {
    throw new MerkadoConfigurationError(
      `${MERKADO_CONTRACT_ADDRESS_ENV} is not a valid address.`,
    );
  }
}

/** Server-only RPC URL, or the public Optimism Mainnet RPC by default. */
export function merkadoRpcUrl(): string {
  return process.env.MERKADO_RPC_URL?.trim() || DEFAULT_MERKADO_RPC_URL;
}

export function isMerkadoConfigured(): boolean {
  try {
    merkadoContractAddress();
    return true;
  } catch {
    return false;
  }
}

export function assertMerkadoConfigured(): void {
  merkadoContractAddress();
}
