import { createHmac, timingSafeEqual } from "node:crypto";

export const WALLET_SESSION_COOKIE = "merkado_wallet_session";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type SessionPayload = {
  address: string;
  domain: string;
  chainId: number;
  exp: number;
};

function secret(): string {
  const value = process.env.WALLET_SESSION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("WALLET_SESSION_SECRET must be at least 32 characters.");
  }
  return value;
}

function normalizedDomain(domain: string): string {
  const value = domain.trim().toLowerCase();
  if (!value || value.includes("/") || value.includes("\\")) {
    throw new Error("Wallet identity domain is invalid.");
  }
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSignedWalletSession(
  address: string,
  domain: string,
  now = new Date(),
): { value: string; maxAge: number } {
  const payload = Buffer.from(
    JSON.stringify({
      address: address.toLowerCase(),
      domain: normalizedDomain(domain),
      chainId: BASE_SEPOLIA_CHAIN_ID,
      exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
    }),
  ).toString("base64url");
  return { value: `${payload}.${signature(payload)}`, maxAge: SESSION_TTL_SECONDS };
}

export function readSignedWalletSession(
  value: string | undefined,
  expectedDomain: string,
  now = new Date(),
): SessionPayload | null {
  if (!value) return null;
  const [payload, suppliedSignature] = value.split(".");
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (
      parsed.domain !== normalizedDomain(expectedDomain) ||
      parsed.chainId !== BASE_SEPOLIA_CHAIN_ID ||
      parsed.exp <= Math.floor(now.getTime() / 1000) ||
      !/^0x[0-9a-f]{40}$/i.test(parsed.address)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
