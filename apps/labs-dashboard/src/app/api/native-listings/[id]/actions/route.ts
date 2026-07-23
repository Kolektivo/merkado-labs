import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import { runNativeListingAction } from "@/lib/native-listings/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

const ACTIONS = new Set([
  "publish",
  "unpublish",
  "mark_sold",
  "mark_rented",
  "republish",
]);

export async function POST(
  request: Request,
  context: { params: Params },
) {
  try {
    assertLabsAdminSession(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = typeof body.action === "string" ? body.action : "";
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
    const result = await runNativeListingAction(
      id,
      action as
        | "publish"
        | "unpublish"
        | "mark_sold"
        | "mark_rented"
        | "republish",
    );
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update listing.",
      },
      { status },
    );
  }
}
