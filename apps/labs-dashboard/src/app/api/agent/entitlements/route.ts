import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdmin, readAdminSecretFromBody } from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertLabsAdmin(request, readAdminSecretFromBody(body));
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    if (!requestId) return NextResponse.json({ error: "Request id is required." }, { status: 400 });
    const admin = createLabsAdminClient();
    const { data: searchRequest, error: requestError } = await admin.from("property_search_requests").select("id,status").eq("id", requestId).maybeSingle();
    if (requestError || !searchRequest) return NextResponse.json({ error: "Search request not found." }, { status: 404 });
    if (searchRequest.status !== "confirmed") return NextResponse.json({ error: "Confirm the search request before creating an entitlement." }, { status: 400 });
    const { data, error } = await admin.from("merkado_agent_entitlements").upsert({ property_search_request_id: requestId, status: "test", delivery_channel: "labs_preview" }, { onConflict: "property_search_request_id" }).select("id,status").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create entitlement." }, { status });
  }
}
