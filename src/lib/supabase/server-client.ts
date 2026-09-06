import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import {
  isRecoverableAuthSessionError,
  isSupabaseAuthConfigurationError,
  SupabaseAuthConfigurationError,
} from "@/lib/supabase/auth-errors";
import {
  applyRememberSessionCookieOptions,
  isRememberSessionEnabled,
  REMEMBER_SESSION_COOKIE,
} from "@/lib/supabase/remember-session";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const createClient = cache(async function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  const cookieStore = await cookies();
  const remember = isRememberSessionEnabled(
    cookieStore.get(REMEMBER_SESSION_COOKIE)?.value,
  );

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(
              name,
              value,
              applyRememberSessionCookieOptions(options ?? {}, remember),
            ),
          );
        } catch {
          // Ignored in Server Components when called from the render flow
        }
      },
    },
  });
});

export const getOptionalUser = cache(async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error) {
    return user;
  }

  if (isRecoverableAuthSessionError(error)) {
    return null;
  }

  if (isSupabaseAuthConfigurationError(error)) {
    throw new SupabaseAuthConfigurationError();
  }

  throw error;
});
