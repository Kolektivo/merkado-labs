import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdmin,
  buildLabsAdminSessionCookieValue,
  labsAdminCookieName,
  readAdminSecretFromBody,
} from "@/lib/admin/auth";
import { DashboardConfigurationError } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    // Bootstrap: accept secret once via header/body, then issue httpOnly cookie.
    assertLabsAdmin(request, readAdminSecretFromBody(body));
    const session = buildLabsAdminSessionCookieValue();
    const response = NextResponse.json({
      ok: true,
      message: "Labs admin session established.",
    });
    response.cookies.set({
      name: session.name,
      value: session.value,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.maxAge,
    });
    return response;
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DashboardConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: labsAdminCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
