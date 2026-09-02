import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getAddress, bytesToHex, verifyMessage, type Hex } from "viem";

import { createLabsAdminClient } from "@/lib/supabase/admin";

export const WALLET_SESSION_COOKIE = "merkado_wallet_session";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
const CHALLENGE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type ChallengeRow = {
  address: string;
  domain: string;
  chain_id: number;
  nonce: string;
  message: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type ChallengeStore = {
  from(table: string): {
    insert(values: Record<string, unknown>): Promise<{ error: Error | null }>;
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: ChallengeRow | null; error: Error | null }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): {
        is(column: string, value: null): {
          gt(column: string, value: string): {
            select(columns: string): {
              maybeSingle(): Promise<{ data: ChallengeRow | null; error: Error | null }>;
            };
          };
        };
      };
    };
  };
};

export type WalletIdentity = {
  address: `0x${string}`;
  domain: string;
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
};

export type WalletSessionCookie = {
  name: typeof WALLET_SESSION_COOKIE;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    maxAge: number;
  };
};

function normalizedDomain(domain: string): string {
  const value = domain.trim().toLowerCase();
  if (!value || value.includes("://") || value.includes("/") || value.includes("\\")) {
    throw new Error("Wallet identity domain is invalid.");
  }
  return value;
}

function normalizedAddress(address: string): `0x${string}` {
  return getAddress(address) as `0x${string}`;
}

export function walletAddressMatches(left: string, right: string): boolean {
  try {
    return normalizedAddress(left).toLowerCase() === normalizedAddress(right).toLowerCase();
  } catch {
    return false;
  }
}

export function walletChallengeMessage(input: {
  address: string;
  domain: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  const address = normalizedAddress(input.address);
  const domain = normalizedDomain(input.domain);
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Merkado Labs.\n\nURI: https://${domain}\nVersion: 1\nChain ID: ${BASE_SEPOLIA_CHAIN_ID}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt}\nExpiration Time: ${input.expirationTime}`;
}

export async function createWalletChallenge(
  input: { address: string; domain: string; now?: Date },
  db: ChallengeStore = createLabsAdminClient() as unknown as ChallengeStore,
): Promise<{ nonce: string; message: string; expiresAt: string; chainId: typeof BASE_SEPOLIA_CHAIN_ID }> {
  const address = normalizedAddress(input.address);
  const domain = normalizedDomain(input.domain);
  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_SECONDS * 1000);
  const nonce = bytesToHex(randomBytes(16));
  const message = walletChallengeMessage({
    address,
    domain,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
  });
  const { error } = await db.from("wallet_identity_challenges").insert({
    address: address.toLowerCase(),
    domain,
    chain_id: BASE_SEPOLIA_CHAIN_ID,
    nonce,
    message,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error("Unable to create wallet identity challenge.");
  return { nonce, message, expiresAt: expiresAt.toISOString(), chainId: BASE_SEPOLIA_CHAIN_ID };
}

export async function verifyWalletChallenge(input: {
  address: string;
  domain: string;
  nonce: string;
  signature: Hex;
  now?: Date;
}, db: ChallengeStore = createLabsAdminClient() as unknown as ChallengeStore): Promise<WalletIdentity> {
  const address = normalizedAddress(input.address);
  const domain = normalizedDomain(input.domain);
  const now = input.now ?? new Date();
  const lookup = await db.from("wallet_identity_challenges").select("*").eq("nonce", input.nonce).maybeSingle();
  if (lookup.error || !lookup.data) throw new Error("Wallet identity challenge is invalid.");
  const row = lookup.data;
  if (
    row.address.toLowerCase() !== address.toLowerCase() ||
    row.domain !== domain ||
    row.chain_id !== BASE_SEPOLIA_CHAIN_ID ||
    row.consumed_at ||
    new Date(row.expires_at).getTime() <= now.getTime()
  ) {
    throw new Error("Wallet identity challenge is expired or already used.");
  }
  if (!(await verifyMessage({ address, message: row.message, signature: input.signature }))) {
    throw new Error("Wallet signature is invalid.");
  }
  const consumed = await db
    .from("wallet_identity_challenges")
    .update({ consumed_at: now.toISOString() })
    .eq("nonce", input.nonce)
    .is("consumed_at", null)
    .gt("expires_at", now.toISOString())
    .select("*")
    .maybeSingle();
  if (consumed.error || !consumed.data) throw new Error("Wallet identity challenge is expired or already used.");
  return { address, domain, chainId: BASE_SEPOLIA_CHAIN_ID };
}

function sessionSecret(): string {
  const secret = process.env.WALLET_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("WALLET_SESSION_SECRET must be at least 32 characters.");
  }
  return secret;
}

function signSession(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createWalletSessionCookie(
  identity: WalletIdentity,
  now = new Date(),
): WalletSessionCookie {
  const payload = Buffer.from(JSON.stringify({
    address: normalizedAddress(identity.address).toLowerCase(),
    domain: normalizedDomain(identity.domain),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
  })).toString("base64url");
  return {
    name: WALLET_SESSION_COOKIE,
    value: `${payload}.${signSession(payload)}`,
    options: {
      httpOnly: true,
      secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export function readWalletSessionCookie(
  value: string | undefined,
  expectedDomain: string,
  now = new Date(),
): WalletIdentity | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = signSession(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      address: string; domain: string; chainId: number; exp: number;
    };
    if (parsed.domain !== normalizedDomain(expectedDomain) || parsed.chainId !== BASE_SEPOLIA_CHAIN_ID || parsed.exp <= Math.floor(now.getTime() / 1000)) return null;
    return { address: normalizedAddress(parsed.address), domain: parsed.domain, chainId: BASE_SEPOLIA_CHAIN_ID };
  } catch {
    return null;
  }
}

export async function getCurrentWalletIdentity(): Promise<WalletIdentity | null> {
  const host = (await headers()).get("host")?.trim();
  if (!host) return null;
  const value = (await cookies()).get(WALLET_SESSION_COOKIE)?.value;
  return readWalletSessionCookie(value, host);
}

export async function requireWalletIdentity(): Promise<WalletIdentity> {
  const identity = await getCurrentWalletIdentity();
  if (!identity) {
    throw new Error("Connect and verify your wallet before continuing.");
  }
  return identity;
}
