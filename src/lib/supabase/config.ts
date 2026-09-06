import "server-only";

const ACTIVE_LABS_PROJECT_REF = "csaefdkpwukshtouyixg";
const LABS_PROJECT_REF = "ewoxmzznkavapcxdporm";
const WAVE6_FORK_PROJECT_REF = "ajbeqiwgpttpmzpqxepl";

const ACTIVE_LABS_URL = `https://${ACTIVE_LABS_PROJECT_REF}.supabase.co`;
const LABS_URL = `https://${LABS_PROJECT_REF}.supabase.co`;
const WAVE6_FORK_URL = `https://${WAVE6_FORK_PROJECT_REF}.supabase.co`;

const ALLOWED_PROJECTS = [
  { ref: ACTIVE_LABS_PROJECT_REF, url: ACTIVE_LABS_URL },
  { ref: LABS_PROJECT_REF, url: LABS_URL },
  { ref: WAVE6_FORK_PROJECT_REF, url: WAVE6_FORK_URL },
] as const;

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

  const project = ALLOWED_PROJECTS.find((candidate) => candidate.url === url);
  if (!project) {
    throw new DashboardConfigurationError(
      `Refusing Supabase access: URL is not an approved Labs project.`,
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

  return { url, publishableKey, projectRef: project.ref };
}

export {
  ALLOWED_PROJECTS,
  ACTIVE_LABS_PROJECT_REF,
  ACTIVE_LABS_URL,
  LABS_PROJECT_REF,
  LABS_URL,
  WAVE6_FORK_PROJECT_REF,
  WAVE6_FORK_URL,
};
