import "server-only";

import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { MerkadoConfigurationError } from "@/lib/onchain/config";

const MERKADO_MINTER_PRIVATE_KEY_ENV = "MERKADO_MINTER_PRIVATE_KEY";

function normalizePrivateKey(raw: string): `0x${string}` {
  const trimmed = raw.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
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

/**
 * The server-held Optimism Mainnet key used for explicitly approved offer
 * mints. Server-only: never expose this key to browser code.
 */
export function merkadoMinterAccount(): PrivateKeyAccount {
  const raw = process.env[MERKADO_MINTER_PRIVATE_KEY_ENV]?.trim();
  if (!raw || isPlaceholder(raw)) {
    throw new MerkadoConfigurationError(
      `${MERKADO_MINTER_PRIVATE_KEY_ENV} is missing or still contains a placeholder value.`,
    );
  }
  return privateKeyToAccount(normalizePrivateKey(raw));
}

/** Checksummed public address of the server mint key (safe to display). */
export function merkadoMinterAddress(): string {
  return merkadoMinterAccount().address;
}

/** Checksummed minter address, or null when the server key is not configured. */
export function merkadoMinterAddressOrNull(): string | null {
  const raw = process.env.MERKADO_MINTER_PRIVATE_KEY?.trim();
  if (!raw || isPlaceholder(raw)) return null;
  try {
    return privateKeyToAccount(normalizePrivateKey(raw)).address;
  } catch {
    return null;
  }
}
