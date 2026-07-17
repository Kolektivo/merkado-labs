import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdmin, readAdminSecretFromBody } from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertLabsAdmin(request, readAdminSecretFromBody(body));
    const preferredNeighbourhoods = Array.isArray(body.preferredNeighbourhoods)
      ? body.preferredNeighbourhoods.map(String).filter(Boolean)
      : [];
    const { data, error } = await createLabsAdminClient()
      .from("property_search_requests")
      .insert({
        title: typeof body.title === "string" ? body.title.trim() || null : null,
        status: "draft",
        transaction_type: ["sale", "rent", "either"].includes(String(body.transactionType)) ? body.transactionType : "either",
        min_price: Number.isFinite(Number(body.minPrice)) ? Number(body.minPrice) : null,
        max_price: Number.isFinite(Number(body.maxPrice)) ? Number(body.maxPrice) : null,
        price_currency: typeof body.priceCurrency === "string" ? body.priceCurrency : "XCG",
        min_bedrooms: Number.isFinite(Number(body.minBedrooms)) ? Number(body.minBedrooms) : null,
        preferred_neighbourhoods: preferredNeighbourhoods,
        renovation_willingness: typeof body.renovationWillingness === "string" ? body.renovationWillingness : "unknown",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        intake_source: body.intakeSource === "what_fits_me" ? "what_fits_me" : "direct",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create request." }, { status });
  }
}
