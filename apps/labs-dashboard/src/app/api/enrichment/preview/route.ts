import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdminSession,
} from "@/lib/admin/auth";
import {
  previewEnrichmentScope,
  type EnrichmentJobRequest,
  type EnrichmentScope,
} from "@/lib/enrichment/scope";
import { DashboardConfigurationError } from "@/lib/supabase/config";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES: EnrichmentScope[] = [
  "listing",
  "listings",
  "source",
  "new_or_changed",
  "failed",
  "manual_selection",
];

function parseBody(body: Record<string, unknown>): EnrichmentJobRequest {
  const scope = String(body.scope ?? "") as EnrichmentScope;
  if (!SCOPES.includes(scope)) {
    throw new Error(
      `Invalid scope. Expected one of: ${SCOPES.join(", ")}`,
    );
  }

  const listingIds = Array.isArray(body.listingIds)
    ? body.listingIds.map(String)
    : Array.isArray(body.listing_ids)
      ? body.listing_ids.map(String)
      : undefined;

  const maxCountRaw = body.maxCount ?? body.max_count;
  const maxCount =
    typeof maxCountRaw === "number"
      ? maxCountRaw
      : typeof maxCountRaw === "string" && maxCountRaw.trim()
        ? Number(maxCountRaw)
        : undefined;

  return {
    scope,
    listingIds,
    sourceKey:
      typeof body.sourceKey === "string"
        ? body.sourceKey
        : typeof body.source_key === "string"
          ? body.source_key
          : undefined,
    maxCount: Number.isFinite(maxCount) ? maxCount : undefined,
    force: Boolean(body.force),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    assertLabsAdminSession(request);

    const jobRequest = parseBody(body);
    const admin = createLabsAdminClient();
    const preview = await previewEnrichmentScope(admin, jobRequest);

    return NextResponse.json(preview);
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
          error instanceof Error ? error.message : "Unable to preview scope.",
      },
      { status: 400 },
    );
  }
}
