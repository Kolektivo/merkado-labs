import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdmin,
  readAdminSecretFromBody,
} from "@/lib/admin/auth";
import {
  enrichmentMeta,
  resolveEnrichmentListingIds,
  type EnrichmentJobRequest,
  type EnrichmentScope,
} from "@/lib/enrichment/scope";
import { spawnEnrichmentJob } from "@/lib/enrichment/spawn";
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
    assertLabsAdmin(request, readAdminSecretFromBody(body));

    const jobRequest = parseBody(body);
    const admin = createLabsAdminClient();
    const { listingIds, propertySourceId } = await resolveEnrichmentListingIds(
      admin,
      jobRequest,
    );

    if (!listingIds.length) {
      return NextResponse.json(
        { error: "No listings matched the selected scope." },
        { status: 400 },
      );
    }

    const meta = enrichmentMeta();
    const { data, error } = await admin
      .from("ai_enrichment_jobs")
      .insert({
        scope_type: jobRequest.scope,
        scope_filter: {
          source_key: jobRequest.sourceKey ?? null,
          max_count: jobRequest.maxCount ?? null,
          force: Boolean(jobRequest.force),
        },
        property_source_id: propertySourceId,
        requested_by: "labs-dashboard",
        status: "queued",
        model: meta.model,
        prompt_version: meta.promptVersion,
        schema_version: meta.schemaVersion,
        total_listings: listingIds.length,
        summary: {
          listing_ids: listingIds,
          force: Boolean(jobRequest.force),
        },
      })
      .select("id,status,total_listings,created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create enrichment job." },
        { status: 500 },
      );
    }

    spawnEnrichmentJob(String(data.id), {
      force: Boolean(jobRequest.force),
      batchSize: 5,
    });

    return NextResponse.json({
      jobId: data.id,
      status: data.status,
      totalListings: data.total_listings,
      createdAt: data.created_at,
      spawned: true,
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
          error instanceof Error ? error.message : "Unable to create job.",
      },
      { status: 400 },
    );
  }
}
