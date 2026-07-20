import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";
import { DashboardConfigurationError } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function POST(
  request: Request,
  { params }: { params: Params },
) {
  try {
    assertLabsAdminSession(request);
    const { id } = await params;
    const admin = createLabsAdminClient();
    const { data: existing, error: readError } = await admin
      .from("property_search_requests")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Search request not found." }, { status: 404 });
    }
    if (existing.status !== "draft") {
      return NextResponse.json(
        {
          error:
            existing.status === "confirmed"
              ? "Search request is already confirmed."
              : `A ${existing.status} request cannot be confirmed.`,
        },
        { status: 409 },
      );
    }
    const { data, error } = await admin
      .from("property_search_requests")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "draft")
      .select("id,status,confirmed_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Search request not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: data.id,
      status: data.status,
      confirmedAt: data.confirmed_at,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DashboardConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to confirm request.",
      },
      { status: 400 },
    );
  }
}
