import { type NextRequest, NextResponse } from "next/server";

import {
  labsAdminCookieName,
  verifyLabsAdminSessionToken,
} from "@/lib/admin/auth";

const PUBLIC_ROUTES = ["/login", "/browse"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    isPublicRoute(pathname) ||
    pathname === "/api/admin/login" ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  try {
    const session = request.cookies.get(labsAdminCookieName())?.value;
    if (verifyLabsAdminSessionToken(session)) {
      return NextResponse.next();
    }
  } catch {
    // Missing admin configuration is explained by the login/settings UI.
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|cw-logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
