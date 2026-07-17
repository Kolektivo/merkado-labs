import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdminSession,
} from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertLabsAdminSession(request);
    return NextResponse.json(
      {
        error:
          "AI execution is disabled. Existing proposals remain available for review.",
      },
      { status: 403 },
    );
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to verify the Labs admin session." },
      { status: 500 },
    );
  }
}
