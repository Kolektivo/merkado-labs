import { createBrowserClient } from "@supabase/ssr";

import {
  applyRememberSessionCookieOptions,
  getRememberSessionPreference,
  parseBrowserCookies,
  serializeBrowserCookie,
} from "@/lib/supabase/remember-session";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local and restart the dev server.",
    );
  }

  if (!publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add it to .env.local and restart the dev server.",
    );
  }

  return createBrowserClient(url, publishableKey, {
    cookies: {
      getAll() {
        if (typeof document === "undefined") {
          return [];
        }

        return parseBrowserCookies(document.cookie);
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") {
          return;
        }

        const remember = getRememberSessionPreference();

        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serializeBrowserCookie(
            name,
            value,
            applyRememberSessionCookieOptions(options ?? {}, remember),
          );
        }
      },
    },
  });
}