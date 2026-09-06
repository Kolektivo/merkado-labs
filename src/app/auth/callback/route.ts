import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { safeReturnPath } from "@/lib/demo-gate";
import { createClient } from "@/lib/supabase/server-client";

type SupportedOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

const supportedOtpTypes = new Set<SupportedOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

type EnterError =
  | "auth_failed"
  | "sign_in_cancelled"
  | "sign_in_incomplete"
  | "verification_link_invalid";

function getSupportedOtpType(value: string | null): SupportedOtpType | null {
  if (!value || !supportedOtpTypes.has(value as SupportedOtpType)) {
    return null;
  }

  return value as SupportedOtpType;
}

function buildEnterRedirect(
  requestUrl: URL,
  nextPath: string | null,
  error: EnterError,
  options?: { email?: string | null },
) {
  const enter = new URL("/enter", requestUrl.origin);
  if (nextPath && nextPath !== "/") {
    enter.searchParams.set("next", nextPath);
  }
  enter.searchParams.set("error", error);
  if (options?.email) {
    enter.searchParams.set("email", options.email);
  }
  return NextResponse.redirect(enter);
}

function getCallbackErrorCode(
  error: string | null,
  errorCode: string | null,
  errorDescription: string | null,
): EnterError {
  const values = [error, errorCode, errorDescription]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());

  const looksLikeEmailLinkFailure = values.some(
    (value) =>
      value.includes("otp_expired") ||
      value.includes("otp_disabled") ||
      value.includes("flow_state") ||
      value.includes("email link is invalid") ||
      value.includes("token has expired") ||
      value.includes("token is expired") ||
      value.includes("already been used") ||
      value.includes("invalid or has expired"),
  );

  if (looksLikeEmailLinkFailure) {
    return "verification_link_invalid";
  }

  const looksLikeCancel = values.some(
    (value) =>
      value.includes("user_canceled") ||
      value.includes("user_cancelled") ||
      value === "canceled" ||
      value === "cancelled" ||
      value.includes("user closed"),
  );

  if (looksLikeCancel) {
    return "sign_in_cancelled";
  }

  return "auth_failed";
}

function getAuthResultUser(data: unknown): User | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const authData = data as {
    user?: User | null;
    session?: {
      user?: User | null;
    } | null;
  };

  return authData.user ?? authData.session?.user ?? null;
}

function createPostAuthRedirect(requestUrl: URL, destination: string) {
  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}

async function getAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function createHashFallbackResponse(
  requestUrl: URL,
  nextPath: string | null,
  email: string | null,
) {
  const completeUrl = new URL("/auth/complete", requestUrl.origin);
  if (nextPath && nextPath !== "/") {
    completeUrl.searchParams.set("next", nextPath);
  }
  if (email) {
    completeUrl.searchParams.set("email", email);
  }

  const enterFallbackUrl = buildEnterRedirect(
    requestUrl,
    nextPath,
    "auth_failed",
    { email },
  ).url;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Completing authentication...</title>
  </head>
  <body>
    <script>
      const hash = window.location.hash || ''
      const completeUrl = ${JSON.stringify(completeUrl.toString())}
      const fallbackUrl = ${JSON.stringify(enterFallbackUrl)}

      if (hash) {
        window.location.replace(completeUrl + hash)
      } else {
        window.location.replace(fallbackUrl)
      }
    </script>
    <p>Completing authentication...</p>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = getSupportedOtpType(requestUrl.searchParams.get("type"));
  const authError = requestUrl.searchParams.get("error");
  const authErrorCode = requestUrl.searchParams.get("error_code");
  const authErrorDescription = requestUrl.searchParams.get("error_description");
  const nextPath = safeReturnPath(requestUrl.searchParams.get("next"));
  const email = requestUrl.searchParams.get("email");

  try {
    const supabase = await createClient();
    const callbackErrorCode = getCallbackErrorCode(
      authError,
      authErrorCode,
      authErrorDescription,
    );

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      const user =
        getAuthResultUser(data) ?? (error ? null : await getAuthenticatedUser(supabase));

      if (user) {
        return createPostAuthRedirect(requestUrl, nextPath || "/");
      }

      return buildEnterRedirect(
        requestUrl,
        nextPath,
        authError || authErrorCode || authErrorDescription
          ? callbackErrorCode
          : "sign_in_incomplete",
        { email },
      );
    }

    if (tokenHash && otpType) {
      const { data, error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });
      const user =
        getAuthResultUser(data) ?? (error ? null : await getAuthenticatedUser(supabase));

      if (user) {
        return createPostAuthRedirect(requestUrl, nextPath || "/");
      }

      return buildEnterRedirect(requestUrl, nextPath, "verification_link_invalid", {
        email,
      });
    }

    if (authError || authErrorCode || authErrorDescription) {
      return buildEnterRedirect(requestUrl, nextPath, callbackErrorCode, { email });
    }

    return createHashFallbackResponse(requestUrl, nextPath, email);
  } catch (error) {
    console.error("Auth callback failed", error);
    return buildEnterRedirect(requestUrl, nextPath, "auth_failed");
  }
}