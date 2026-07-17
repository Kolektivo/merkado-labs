import "server-only";

import { DashboardConfigurationError } from "@/lib/supabase/config";

export class AdminAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

function configuredAdminSecret(): string {
  const secret = process.env.LABS_ADMIN_SECRET?.trim();
  if (!secret) {
    throw new DashboardConfigurationError(
      "LABS_ADMIN_SECRET is not configured on the server.",
    );
  }
  return secret;
}

/**
 * Verify Labs admin secret from `x-labs-admin-secret` header or form field.
 * Never log or return the secret value.
 */
export function assertLabsAdmin(
  request: Request,
  formField?: string | null,
): void {
  const expected = configuredAdminSecret();
  const header = request.headers.get("x-labs-admin-secret")?.trim() ?? "";
  const form = formField?.trim() ?? "";
  const provided = header || form;

  if (!provided || provided !== expected) {
    throw new AdminAuthError("Invalid or missing Labs admin secret.", 401);
  }
}

export function readAdminSecretFromBody(
  body: Record<string, unknown> | null | undefined,
): string | null {
  if (!body) return null;
  const value = body.adminSecret ?? body.admin_secret;
  return typeof value === "string" ? value : null;
}
