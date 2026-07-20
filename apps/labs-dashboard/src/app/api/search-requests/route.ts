import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertLabsAdminSession(request);
    const preferredNeighbourhoods = Array.isArray(body.preferredNeighbourhoods)
      ? body.preferredNeighbourhoods.map(String).filter(Boolean)
      : [];
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Request name is required." }, { status: 400 });
    }
    const optionalNumber = (value: unknown) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const minPrice = optionalNumber(body.minPrice);
    const maxPrice = optionalNumber(body.maxPrice);
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      return NextResponse.json(
        { error: "Minimum budget cannot be greater than maximum budget." },
        { status: 400 },
      );
    }
    const { data, error } = await createLabsAdminClient()
      .from("property_search_requests")
      .insert({
        title,
        status: "draft",
        transaction_type: ["sale", "rent", "either"].includes(String(body.transactionType)) ? body.transactionType : "either",
        min_price: minPrice,
        max_price: maxPrice,
        price_currency: typeof body.priceCurrency === "string" ? body.priceCurrency : "XCG",
        min_bedrooms: optionalNumber(body.minBedrooms),
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
