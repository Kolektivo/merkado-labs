const RECOVERABLE_AUTH_ERROR_CODES = new Set([
  "bad_jwt",
  "invalid_refresh_token",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_not_found",
  "user_not_found",
]);

const AUTH_COOKIE_CLEAR_SKIP_CODES = new Set(["refresh_token_already_used"]);

export class SupabaseAuthConfigurationError extends Error {
  constructor() {
    super("Supabase Auth is not configured for this project.");
    this.name = "SupabaseAuthConfigurationError";
  }
}

export function isSupabaseAuthConfigurationError(
  error:
    | {
        code?: string;
        message?: string;
      }
    | null
    | undefined,
): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "invalid_api_key" || message.includes("invalid api key");
}

export function isRecoverableAuthSessionError(
  error:
    | {
        code?: string;
        message?: string;
        name?: string;
      }
    | null
    | undefined,
): boolean {
  if (!error) {
    return false;
  }

  if (error.code && RECOVERABLE_AUTH_ERROR_CODES.has(error.code)) {
    return true;
  }

  if (error.name === "AuthSessionMissingError") {
    return true;
  }

  const normalizedMessage = error.message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("refresh token") ||
    normalizedMessage.includes("auth session missing") ||
    normalizedMessage.includes("session missing") ||
    normalizedMessage.includes("sub claim in jwt does not exist") ||
    normalizedMessage.includes("user from sub claim")
  );
}

export function shouldClearAuthCookiesOnSessionError(
  error:
    | {
        code?: string;
        message?: string;
        name?: string;
      }
    | null
    | undefined,
): boolean {
  if (!isRecoverableAuthSessionError(error)) {
    return false;
  }

  if (error?.code && AUTH_COOKIE_CLEAR_SKIP_CODES.has(error.code)) {
    return false;
  }

  const normalizedMessage = error?.message?.toLowerCase() ?? "";
  if (normalizedMessage.includes("already used")) {
    return false;
  }

  return true;
}
