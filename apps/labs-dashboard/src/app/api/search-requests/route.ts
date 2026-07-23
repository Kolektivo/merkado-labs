import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import {
  criteriaFromBody,
  criteriaToInsertRow,
} from "@/lib/matching/criteria-from-body";
import { persistMatchReportsForRequest } from "@/lib/matching/persist-matches";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    assertLabsAdminSession(request);

    const criteria = criteriaFromBody(body);
    const intakeSource =
      body.intakeSource === "what_fits_me" ? "what_fits_me" : "direct";
    const confirm = body.confirm === true || body.status === "confirmed";
    const persistMatches = body.persistMatches === true || confirm;

    const insertRow = criteriaToInsertRow(
      criteria,
      intakeSource,
      confirm ? "confirmed" : "draft",
    );

    const { data, error } = await createLabsAdminClient()
      .from("property_search_requests")
      .insert(insertRow)
      .select("id,status")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let matchCount = 0;
    if (persistMatches) {
      const preview = await persistMatchReportsForRequest(data.id, criteria, {
        limit: 25,
      });
      matchCount = preview.matchCount;
    }

    return NextResponse.json(
      {
        id: data.id,
        status: data.status,
        matchCount,
      },
      { status: 201 },
    );
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create request.",
      },
      { status },
    );
  }
}
