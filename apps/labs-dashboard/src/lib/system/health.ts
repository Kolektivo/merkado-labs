import "server-only";

import {
  getSupabaseConfig,
  LABS_URL,
} from "@/lib/supabase/config";

export type ConfigurationHealth = {
  supabaseConfigured: boolean;
  correctLabsProject: boolean;
  serviceCredentialsConfigured: boolean;
  openAiConfigured: boolean;
  adminAuthConfigured: boolean;
};

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getConfigurationHealth(): ConfigurationHealth {
  let supabaseConfigured = false;
  let correctLabsProject = false;

  try {
    const config = getSupabaseConfig();
    supabaseConfigured = true;
    correctLabsProject = config.url === LABS_URL;
  } catch {
    // Health reports booleans only; detailed safe errors remain on data pages.
  }

  return {
    supabaseConfigured,
    correctLabsProject,
    serviceCredentialsConfigured:
      configured(process.env.SUPABASE_SECRET_KEY) ||
      configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openAiConfigured:
      configured(process.env.OPENAI_API_KEY) &&
      configured(process.env.OPENAI_ENRICHMENT_MODEL),
    adminAuthConfigured: configured(process.env.LABS_ADMIN_SECRET),
  };
}
