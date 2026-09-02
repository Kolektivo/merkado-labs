import "server-only";

import { requireUser } from "@/lib/auth/session";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export async function getAccountId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

export function ownerAccountIdFor(accountId: string): string {
  return accountId;
}

export type LinkedWallet = {
  accountId: string;
  walletAddress: string;
  chainId: number;
  linkedAt: string;
};

/**
 * Phase 4 integration point. Returns the account's currently active linked
 * wallet for a chain from `ra_account_wallets`, or null when none is linked.
 * Phase 4 owns the challenge/signature linking service; Phase 3 only reads the
 * linked-wallet record (when the migration is applied) and otherwise enforces
 * account-level binding. The wallet returned here is never taken from the
 * client — verification compares the chain-derived sender to this value.
 */
export async function getLinkedWalletForAccount(
  accountId: string,
  chainId?: number | null,
): Promise<LinkedWallet | null> {
  const supabase = createLabsAdminClient();
  try {
    let query = supabase
      .from("ra_account_wallets")
      .select("account_id,wallet_address,chain_id,linked_at")
      .eq("account_id", accountId)
      .is("replaced_at", null)
      .is("revoked_at", null);
    if (chainId != null) query = query.eq("chain_id", chainId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      accountId: data.account_id as string,
      walletAddress: data.wallet_address as string,
      chainId: data.chain_id as number,
      linkedAt: data.linked_at as string,
    };
  } catch (error) {
    // The wallet-linking table may not exist yet (migration not applied). The
    // configured flow must fail closed until the approved migration exists.
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "PGRST204") return null;
    throw error;
  }
}
