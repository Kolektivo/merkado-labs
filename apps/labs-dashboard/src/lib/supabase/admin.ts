import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  DashboardConfigurationError,
  getSupabaseConfig,
  LABS_PROJECT_REF,
  LABS_URL,
} from "@/lib/supabase/config";

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("placeholder") ||
    normalized.includes("replace-me") ||
    normalized.includes("your-") ||
    normalized === "changeme"
  );
}

/**
 * Server-only Labs service-role client.
 * Refuses any URL that is not the merkado-labs project.
 */
export function createLabsAdminClient(): SupabaseClient {
  const { url } = getSupabaseConfig();

  if (url !== LABS_URL) {
    throw new DashboardConfigurationError(
      `Refusing service-role access: URL must be Labs project ${LABS_PROJECT_REF}.`,
    );
  }

  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secretKey) {
    throw new DashboardConfigurationError(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for admin operations.",
    );
  }

  if (isPlaceholder(secretKey)) {
    throw new DashboardConfigurationError(
      "Supabase secret key still contains a placeholder value.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
