import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
type Params = Promise<{ id: string }>;

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    assertLabsAdminSession(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Request name is required." },
        { status: 400 },
      );
    }
    const minPrice = optionalNumber(body.minPrice);
    const maxPrice = optionalNumber(body.maxPrice);
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      return NextResponse.json(
        { error: "Minimum budget cannot be greater than maximum budget." },
        { status: 400 },
      );
    }
    const transactionType = ["sale", "rent", "either"].includes(
      String(body.transactionType),
    )
      ? String(body.transactionType)
      : "either";
    const preferredNeighbourhoods = Array.isArray(body.preferredNeighbourhoods)
      ? body.preferredNeighbourhoods.map(String).map((item) => item.trim()).filter(Boolean)
      : [];
    const { data, error } = await createLabsAdminClient()
      .from("property_search_requests")
      .update({
        title,
        transaction_type: transactionType,
        min_price: minPrice,
        max_price: maxPrice,
        price_currency: "XCG",
        min_bedrooms: optionalNumber(body.minBedrooms),
        preferred_neighbourhoods: preferredNeighbourhoods,
        renovation_willingness:
          typeof body.renovationWillingness === "string"
            ? body.renovationWillingness
            : "unknown",
        notes:
          typeof body.notes === "string" ? body.notes.trim() || null : null,
        // Material criteria edits require explicit confirmation again.
        status: "draft",
        confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (await params).id)
      .in("status", ["draft", "confirmed"])
      .select("id,status")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Editable search request not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ id: data.id, status: data.status });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update request.",
      },
      { status },
    );
  }
}
