import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import {
  criteriaFromBody,
  criteriaToInsertRow,
} from "@/lib/matching/criteria-from-body";
import { persistMatchReportsForRequest } from "@/lib/matching/persist-matches";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
type Params = Promise<{ id: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    assertLabsAdminSession(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const criteria = criteriaFromBody(body);
    const persistMatches = body.persistMatches === true;
    const row = criteriaToInsertRow(criteria, "direct", "draft");

    const { data, error } = await createLabsAdminClient()
      .from("property_search_requests")
      .update({
        title: row.title,
        transaction_type: row.transaction_type,
        min_price: row.min_price,
        max_price: row.max_price,
        price_currency: "XCG",
        min_bedrooms: row.min_bedrooms,
        min_bathrooms: row.min_bathrooms,
        min_floor_area_m2: row.min_floor_area_m2,
        property_types: row.property_types,
        preferred_neighbourhoods: row.preferred_neighbourhoods,
        excluded_neighbourhoods: row.excluded_neighbourhoods,
        must_haves: row.must_haves,
        preferences: row.preferences,
        dealbreakers: row.dealbreakers,
        renovation_willingness: row.renovation_willingness,
        notes: row.notes,
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

    if (persistMatches) {
      await persistMatchReportsForRequest(data.id, criteria, { limit: 25 });
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
