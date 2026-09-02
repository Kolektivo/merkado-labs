import "server-only";

import { randomUUID } from "node:crypto";

import { getPayNetwork, resolvePayNetworkKey } from "@/lib/pay/networks";
import { requireUser, type AuthUser } from "@/lib/auth/session";
import { createLabsAdminClient } from "@/lib/supabase/admin";

import {
  buildLinkMessage,
  linkStatement,
  LINK_CHALLENGE_TTL_MS,
} from "@/lib/wallet-link/message";
import {
  assertValidLinkSignature,
  expectedLinkDomain,
  WalletLinkError,
} from "@/lib/wallet-link/verify";

export type LinkChallenge = {
  nonce: string;
  domain: string;
  chainId: number;
  chainLabel: string;
  statement: string;
  message: string;
  expiresAt: string;
};

export { expectedLinkDomain, WalletLinkError };
export type { WalletLinkErrorCode } from "@/lib/wallet-link/verify";

type LinkChallengeRow = {
  nonce: string;
  account_id: string;
  domain: string;
  chain_id: number;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
  statement: string;
};

function currentChainId(): number {
  return getPayNetwork(resolvePayNetworkKey()).chainId;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "PGRST204") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("PGRST204");
}

async function requireAuthenticatedAccount(accountId: string): Promise<AuthUser> {
  const user = await requireUser();
  if (user.id !== accountId) {
    throw new WalletLinkError(
      "NOT_AUTHENTICATED",
      "This link request does not belong to your account.",
    );
  }
  return user;
}

/**
 * Issue a one-time wallet-linking challenge bound to the authenticated
 * account, the request domain, the configured chain, and a fresh nonce.
 * The challenge expires after 5 minutes and is stored server-side only.
 */
export async function issueChallenge(
  accountId: string,
  expectedDomain: string,
): Promise<LinkChallenge> {
  await requireAuthenticatedAccount(accountId);
  if (!expectedDomain) {
    throw new WalletLinkError("DOMAIN_MISMATCH", "Unable to confirm the request domain.");
  }

  const chainId = currentChainId();
  const network = getPayNetwork(resolvePayNetworkKey());
  const nonce = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + LINK_CHALLENGE_TTL_MS);
  const statement = linkStatement();
  const domain = expectedDomain;
  const message = buildLinkMessage({
    statement,
    accountId,
    domain,
    chainId,
    nonce,
  });

  const supabase = createLabsAdminClient();
  try {
    const { error } = await supabase.from("ra_link_challenges").insert({
      account_id: accountId,
      nonce,
      domain,
      chain_id: chainId,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      consumed_at: null,
      statement,
    });
    if (error) throw error;
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new WalletLinkError(
        "NOT_CONFIGURED",
        "Wallet linking is not configured yet.",
      );
    }
    throw new WalletLinkError("LINK_FAILED", "Could not prepare the wallet link. Try again.");
  }

  return {
    nonce,
    domain,
    chainId,
    chainLabel: network.networkLabel,
    statement,
    message,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Verify a signed challenge and write the active linked wallet.
 *
 * Security properties:
 * - only the authenticated account that owns the challenge may use it;
 * - the domain bound at issue time must match the request domain;
 * - the chain bound at issue time must match the configured chain;
 * - the signature must recover to the claimed wallet address;
 * - the nonce is consumed atomically (update where consumed_at is null), so
 *   replay of the same signature after a successful link is rejected;
 * - at most one active wallet per account (the prior active row is replaced).
 */
export async function verifyChallengeSignature(
  accountId: string,
  input: {
    nonce: string;
    signature: string;
    walletAddress: string;
    domain: string;
    chainId: number;
  },
  expectedDomain: string,
): Promise<string> {
  await requireAuthenticatedAccount(accountId);
  const expectedChainId = currentChainId();
  const supabase = createLabsAdminClient();

  let row: LinkChallengeRow | null = null;
  try {
    const { data, error } = await supabase
      .from("ra_link_challenges")
      .select("*")
      .eq("nonce", input.nonce)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    row = (data as LinkChallengeRow | null) ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new WalletLinkError(
        "NOT_CONFIGURED",
        "Wallet linking is not configured yet.",
      );
    }
    throw new WalletLinkError("LINK_FAILED", "Could not verify the wallet link. Try again.");
  }
  if (!row) {
    throw new WalletLinkError("INVALID_OR_EXPIRED", "This link request is not valid.");
  }

  if (input.domain !== row.domain) {
    throw new WalletLinkError(
      "DOMAIN_MISMATCH",
      "This link request is for a different website.",
    );
  }
  if (input.chainId !== row.chain_id) {
    throw new WalletLinkError(
      "WRONG_CHAIN",
      "This link request is for a different network.",
    );
  }

  const message = buildLinkMessage({
    statement: row.statement,
    accountId,
    domain: row.domain,
    chainId: row.chain_id,
    nonce: row.nonce,
  });

  const walletAddress = await assertValidLinkSignature({
    challenge: {
      domain: row.domain,
      chain_id: row.chain_id,
      expires_at: row.expires_at,
      consumed_at: row.consumed_at,
    },
    signature: input.signature,
    walletAddress: input.walletAddress,
    expectedDomain,
    expectedChainId,
    message,
  });

  // Atomic consume: only a challenge whose consumed_at is still null may be
  // finalized. A concurrent or replay attempt sees zero affected rows.
  let consumedRows: { id: string }[] | null = null;
  try {
    const { data, error } = await supabase
      .from("ra_link_challenges")
      .update({ consumed_at: nowIso() })
      .eq("nonce", row.nonce)
      .eq("account_id", accountId)
      .is("consumed_at", null)
      .select("id");
    if (error) throw error;
    consumedRows = (data as { id: string }[] | null) ?? [];
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new WalletLinkError(
        "NOT_CONFIGURED",
        "Wallet linking is not configured yet.",
      );
    }
    throw new WalletLinkError("LINK_FAILED", "Could not finalize the wallet link. Try again.");
  }
  if (!consumedRows || consumedRows.length === 0) {
    throw new WalletLinkError("INVALID_OR_EXPIRED", "This link request was already used.");
  }

  // Replace any prior active wallet so at most one active row stays per
  // account. The partial unique index enforces it as a second gate.
  try {
    const { error: replaceError } = await supabase
      .from("ra_account_wallets")
      .update({ replaced_at: nowIso() })
      .eq("account_id", accountId)
      .is("replaced_at", null)
      .is("revoked_at", null);
    if (replaceError) throw replaceError;

    const { error: insertError } = await supabase
      .from("ra_account_wallets")
      .insert({
        account_id: accountId,
        wallet_address: walletAddress,
        chain_id: expectedChainId,
      });
    if (insertError) throw insertError;
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new WalletLinkError(
        "NOT_CONFIGURED",
        "Wallet linking is not configured yet.",
      );
    }
    throw new WalletLinkError("LINK_FAILED", "Could not finalize the wallet link. Try again.");
  }

  return walletAddress;
}

/**
 * The current active linked wallet row for an account, or null.
 * Active = a row with no replaced_at and no revoked_at.
 */
export async function getActiveLinkedWalletRow(
  accountId: string,
): Promise<{ walletAddress: string; chainId: number } | null> {
  const supabase = createLabsAdminClient();
  try {
    const { data, error } = await supabase
      .from("ra_account_wallets")
      .select("wallet_address, chain_id")
      .eq("account_id", accountId)
      .is("replaced_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      walletAddress: data.wallet_address as string,
      chainId: data.chain_id as number,
    };
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

/**
 * The current active linked wallet address for an account, or null.
 */
export async function getActiveLinkedWallet(
  accountId: string,
): Promise<string | null> {
  const row = await getActiveLinkedWalletRow(accountId);
  return row?.walletAddress ?? null;
}

/** Revoke the account's active wallet (sets revoked_at). */
export async function unlinkWallet(accountId: string): Promise<void> {
  await requireAuthenticatedAccount(accountId);
  const supabase = createLabsAdminClient();
  try {
    const { error } = await supabase
      .from("ra_account_wallets")
      .update({ revoked_at: nowIso() })
      .eq("account_id", accountId)
      .is("replaced_at", null)
      .is("revoked_at", null);
    if (error) throw error;
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new WalletLinkError(
        "NOT_CONFIGURED",
        "Wallet linking is not configured yet.",
      );
    }
    throw new WalletLinkError("LINK_FAILED", "Could not unlink the wallet. Try again.");
  }
}
