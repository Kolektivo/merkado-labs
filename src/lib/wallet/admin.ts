import "server-only";

import { redirect } from "next/navigation";

import { createLabsAdminClient } from "@/lib/supabase/admin";
import { getCurrentWalletIdentity, type WalletIdentity } from "@/lib/wallet/identity";

export type AdminWallet = {
  wallet_address: string;
  active: boolean;
  created_at: string;
};

export async function isAdminWallet(address: string | null | undefined) {
  if (!address) return false;
  const { data, error } = await createLabsAdminClient()
    .from("ra_admin_wallets")
    .select("wallet_address")
    .eq("wallet_address", address.toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function getCurrentAdminWallet(): Promise<WalletIdentity | null> {
  const identity = await getCurrentWalletIdentity();
  return identity && (await isAdminWallet(identity.address)) ? identity : null;
}

export async function requireAdminWallet() {
  const identity = await getCurrentWalletIdentity();
  if (!identity || !(await isAdminWallet(identity.address))) {
    throw new Error("This wallet is not authorized for Admin access.");
  }
  return identity;
}

export async function redirectIfNotAdmin() {
  if (!(await getCurrentAdminWallet())) redirect("/");
}

export async function listAdminWallets(): Promise<AdminWallet[]> {
  const { data, error } = await createLabsAdminClient()
    .from("ra_admin_wallets")
    .select("wallet_address, active, created_at")
    .order("wallet_address");

  if (error) throw new Error("Unable to load Admin wallets.");
  return (data ?? []) as AdminWallet[];
}
