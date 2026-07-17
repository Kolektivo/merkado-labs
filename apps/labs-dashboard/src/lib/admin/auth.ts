import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { DashboardConfigurationError } from "@/lib/supabase/config";

export class AdminAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

const COOKIE_NAME = "labs_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

function configuredAdminSecret(): string {
  const secret = process.env.LABS_ADMIN_SECRET?.trim();
  if (!secret) {
    throw new DashboardConfigurationError(
      "LABS_ADMIN_SECRET is not configured on the server.",
    );
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", configuredAdminSecret())
    .update(payload)
    .digest("base64url");
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encodeSession(expiresAt: number): string {
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifyLabsAdminSessionToken(
  token: string | undefined | null,
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const payload = `v1.${expiresRaw}`;
  const expected = signPayload(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function labsAdminCookieName() {
  return COOKIE_NAME;
}

export function buildLabsAdminSessionCookieValue(): {
  name: string;
  value: string;
  maxAge: number;
} {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  return {
    name: COOKIE_NAME,
    value: encodeSession(expiresAt),
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function hasLabsAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return verifyLabsAdminSessionToken(jar.get(COOKIE_NAME)?.value);
}

/**
 * Verify Labs admin via signed httpOnly session cookie, or one-time header/form
 * secret for API login bootstrap. Secret values are never returned.
 */
export function assertLabsAdmin(
  request: Request,
  formField?: string | null,
): void {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  if (match && verifyLabsAdminSessionToken(decodeURIComponent(match[1]))) {
    return;
  }

  const expected = configuredAdminSecret();
  const header = request.headers.get("x-labs-admin-secret")?.trim() ?? "";
  const form = formField?.trim() ?? "";
  const provided = header || form;
  if (!provided || !secretsEqual(provided, expected)) {
    throw new AdminAuthError("Labs admin session required.", 401);
  }
}

export function assertLabsAdminSession(request: Request): void {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  if (
    !match ||
    !verifyLabsAdminSessionToken(decodeURIComponent(match[1]))
  ) {
    throw new AdminAuthError("Labs admin session required.", 401);
  }
}

export async function assertLabsAdminPage(): Promise<void> {
  if (!(await hasLabsAdminSession())) {
    throw new AdminAuthError("Labs admin session required.", 401);
  }
}

export function readAdminSecretFromBody(
  body: Record<string, unknown> | null | undefined,
): string | null {
  if (!body) return null;
  const value = body.adminSecret ?? body.admin_secret;
  return typeof value === "string" ? value : null;
}
