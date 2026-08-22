import "server-only";

const LABS_PROJECT_REF = "ewoxmzznkavapcxdporm";
const LABS_URL = `https://${LABS_PROJECT_REF}.supabase.co`;

export class DashboardConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardConfigurationError";
  }
}

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

export function getSupabaseConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const url = rawUrl?.replace(/\/+$/, "");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new DashboardConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL is missing.",
    );
  }

  if (isPlaceholder(url)) {
    throw new DashboardConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL still contains a placeholder value.",
    );
  }

  if (url !== LABS_URL) {
    throw new DashboardConfigurationError(
      `Refusing Supabase access: the URL must target merkado-labs project ${LABS_PROJECT_REF}.`,
    );
  }

  if (!publishableKey) {
    throw new DashboardConfigurationError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.",
    );
  }

  if (isPlaceholder(publishableKey)) {
    throw new DashboardConfigurationError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY still contains a placeholder value.",
    );
  }

  return { url, publishableKey };
}

export { LABS_PROJECT_REF, LABS_URL };
