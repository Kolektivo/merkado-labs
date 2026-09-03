"use server";

import { cookies, headers } from "next/headers";
import type { Hex } from "viem";

import {
  createWalletChallenge,
  createWalletSessionCookie,
  readWalletSessionCookie,
  verifyWalletChallenge,
  type WalletIdentity,
} from "@/lib/wallet/identity";
import { WALLET_SESSION_COOKIE } from "@/lib/wallet/session-cookie";

export type WalletActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function requestDomain(value: string | null): string {
  const domain = value?.trim().toLowerCase();
  if (!domain || domain.includes("/") || domain.includes("\\")) {
    throw new Error("Wallet identity is unavailable for this request.");
  }
  return domain;
}

async function currentRequestDomain(): Promise<string> {
  return requestDomain((await headers()).get("host"));
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Wallet identity could not be completed.";
}

export async function requestWalletChallengeAction(
  address: string,
): Promise<WalletActionResult<Pick<Awaited<ReturnType<typeof createWalletChallenge>>, "nonce" | "message" | "expiresAt" | "chainId">>> {
  try {
    const challenge = await createWalletChallenge({ address, domain: await currentRequestDomain() });
    return { ok: true, data: challenge };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function verifyWalletChallengeAction(input: {
  address: string;
  nonce: string;
  signature: Hex;
}): Promise<WalletActionResult<WalletIdentity>> {
  try {
    const identity = await verifyWalletChallenge({
      address: input.address,
      domain: await currentRequestDomain(),
      nonce: input.nonce,
      signature: input.signature,
    });
    const cookie = createWalletSessionCookie(identity);
    (await cookies()).set({ name: cookie.name, value: cookie.value, ...cookie.options });
    return { ok: true, data: identity };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function getWalletSessionAction(): Promise<WalletActionResult<WalletIdentity | null>> {
  try {
    const value = (await cookies()).get(WALLET_SESSION_COOKIE)?.value;
    return { ok: true, data: readWalletSessionCookie(value, await currentRequestDomain()) };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function signOutWalletAction(): Promise<WalletActionResult<null>> {
  try {
    (await cookies()).delete(WALLET_SESSION_COOKIE);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}
