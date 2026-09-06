export type AuthProfile = {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

/**
 * Presentational profile for the real authenticated user. Identity providers
 * may store `full_name` / `name` and `avatar_url` / `picture` in user_metadata.
 * The fictional "Luuk Weber" seed remains a separate fallback where used.
 */
export function profileFromUser(
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null | undefined,
): AuthProfile {
  if (!user) return { name: null, email: null, avatarUrl: null };

  const meta = user.user_metadata ?? {};
  const firstString = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  return {
    name: firstString("full_name", "name"),
    email: user.email?.trim() ? user.email.trim() : null,
    avatarUrl: firstString("avatar_url", "picture"),
  };
}
