import "server-only";

import { createLabsAdminClient } from "@/lib/supabase/admin";

export type LinkedWallet = {
  accountId: string;
  walletAddress: string;
  chainId: number;
  linkedAt: string;
};

/** Returns the account's active linked wallet for a chain, or null. */
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
