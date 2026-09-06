"use server";

import { headers } from "next/headers";

import { requireUser } from "@/lib/auth/session";
import {
  expectedLinkDomain,
  getActiveLinkedWallet,
  issueChallenge,
  unlinkWallet,
  verifyChallengeSignature,
  WalletLinkError,
} from "@/lib/wallet-link/service";

function toErrorMessage(error: unknown): string {
  if (error instanceof WalletLinkError) {
    switch (error.code) {
      case "NOT_CONFIGURED":
        return "Wallet linking is not configured yet. It becomes available once the linking service is enabled.";
      case "NOT_AUTHENTICATED":
      case "DOMAIN_MISMATCH":
      case "WRONG_CHAIN":
      case "INVALID_OR_EXPIRED":
        return error.message;
      default:
        return error.message;
    }
  }
  return "Could not link the wallet. Try again.";
}

async function requestDomain(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  return expectedLinkDomain(host, process.env.NEXT_PUBLIC_SITE_URL);
}

export type LinkChallengeResult = {
  nonce: string;
  domain: string;
  chainId: number;
  chainLabel: string;
  statement: string;
  message: string;
  expiresAt: string;
};

export async function issueLinkChallengeAction(): Promise<
  { ok: true; challenge: LinkChallengeResult } | { ok: false; error: string }
> {
  const user = await requireUser();
  try {
    const challenge = await issueChallenge(user.id, await requestDomain());
    return { ok: true, challenge };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export type VerifyLinkChallengeInput = {
  nonce: string;
  signature: string;
  walletAddress: string;
  domain: string;
  chainId: number;
};

export async function verifyLinkChallengeAction(
  input: VerifyLinkChallengeInput,
): Promise<{ ok: true; linkedAddress: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const linkedAddress = await verifyChallengeSignature(
      user.id,
      input,
      await requestDomain(),
    );
    return { ok: true, linkedAddress };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function unlinkWalletAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const user = await requireUser();
  try {
    await unlinkWallet(user.id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function getLinkedWalletAction(): Promise<
  { ok: true; address: string | null } | { ok: false; error: string }
> {
  const user = await requireUser();
  try {
    return { ok: true, address: await getActiveLinkedWallet(user.id) };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
