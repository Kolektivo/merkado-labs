import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  DEMO_GATE_COOKIE,
  DEMO_GATE_PATH,
  getDemoGateState,
  isValidGateCookie,
  safeReturnPath,
  shouldAllowUngatedPath,
} from "@/lib/demo-gate";
import { shouldClearAuthCookiesOnSessionError } from "@/lib/supabase/auth-errors";
import {
  applyRememberSessionCookieOptions,
  isRememberSessionEnabled,
  REMEMBER_SESSION_COOKIE,
} from "@/lib/supabase/remember-session";

const LABS_URL = "https://ewoxmzznkavapcxdporm.supabase.co";
const WAVE6_FORK_URL = "https://ajbeqiwgpttpmzpqxepl.supabase.co";

function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return Boolean(url && (url === LABS_URL || url === WAVE6_FORK_URL) && key);
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  const authCookieNames = request.cookies
    .getAll()
    .map(({ name }) => name)
    .filter(
      (name) =>
        name.startsWith("sb-") &&
        name.includes("-auth-token") &&
        !name.includes("-auth-token-code-verifier"),
    );

  for (const name of authCookieNames) {
    response.cookies.set({
      name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }

  response.cookies.set({
    name: REMEMBER_SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (shouldAllowUngatedPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next();

  let hasAuthSession = false;
  if (hasSupabaseConfig()) {
    const remember = isRememberSessionEnabled(
      request.cookies.get(REMEMBER_SESSION_COOKIE)?.value,
    );

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }

            response = NextResponse.next();

            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(
                name,
                value,
                applyRememberSessionCookieOptions(options ?? {}, remember),
              );
            }
          },
        },
      },
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    hasAuthSession = Boolean(user);

    if (shouldClearAuthCookiesOnSessionError(error)) {
      clearSupabaseAuthCookies(request, response);
    }
  }

  const state = getDemoGateState();
  if (!state.active) {
    return response;
  }

  const gatePassed =
    !state.active ||
    isValidGateCookie(request.cookies.get(DEMO_GATE_COOKIE)?.value, state.password);
  if (hasAuthSession && gatePassed) {
    return response;
  }

  const enter = request.nextUrl.clone();
  enter.pathname = DEMO_GATE_PATH;
  enter.search = "";
  const nextPath = safeReturnPath(`${pathname}${search}`);
  if (nextPath && nextPath !== "/") {
    enter.searchParams.set("next", nextPath);
  }

  const redirectResponse = NextResponse.redirect(enter);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
