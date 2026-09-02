import "server-only";

import {
  emailOnAdminAllowlist,
  parseAdminEmails,
  passesAdminEmailGateWithConfig,
} from "@/lib/auth/admin-access";

export { parseAdminEmails };

function isProductionDeployment() {
  return process.env.VERCEL_ENV === "production";
}

/** True when the email is on the configured ADMIN_EMAILS allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return emailOnAdminAllowlist(email, parseAdminEmails(process.env.ADMIN_EMAILS));
}

/**
 * Second admin gate.
 * When ADMIN_EMAILS is set, the email must match (fail closed).
 * When unset, the gate passes and relies on the caller's own authorization.
 * In production, an unset ADMIN_EMAILS is reported so defense in depth is
 * never silently missing.
 */
export function passesAdminEmailGate(email: string | null | undefined): boolean {
  const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);
  const isProduction = isProductionDeployment();

  if (allowlist.length === 0 && isProduction) {
    console.error(
      "[admin] ADMIN_EMAILS is unset in production. Set it on Vercel for defense in depth.",
    );
  }

  return passesAdminEmailGateWithConfig({
    email,
    allowlist,
    isProduction,
  });
}