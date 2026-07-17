import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdmin } from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";
import { DashboardConfigurationError } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(
  request: Request,
  { params }: { params: Params },
) {
  try {
    assertLabsAdmin(request);
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing job id." }, { status: 400 });
    }

    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("ai_enrichment_jobs")
      .select(
        [
          "id",
          "scope_type",
          "scope_filter",
          "property_source_id",
          "requested_by",
          "status",
          "model",
          "prompt_version",
          "schema_version",
          "total_listings",
          "processed_count",
          "succeeded_count",
          "skipped_unchanged_count",
          "failed_count",
          "current_batch",
          "current_listing_id",
          "token_usage",
          "errors",
          "summary",
          "created_at",
          "started_at",
          "completed_at",
        ].join(","),
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const row = data as unknown as Record<string, unknown>;

    return NextResponse.json({
      id: row.id,
      scopeType: row.scope_type,
      scopeFilter: row.scope_filter,
      propertySourceId: row.property_source_id,
      requestedBy: row.requested_by,
      status: row.status,
      model: row.model,
      promptVersion: row.prompt_version,
      schemaVersion: row.schema_version,
      totalListings: row.total_listings,
      processedCount: row.processed_count,
      succeededCount: row.succeeded_count,
      skippedUnchangedCount: row.skipped_unchanged_count,
      failedCount: row.failed_count,
      currentBatch: row.current_batch,
      currentListingId: row.current_listing_id,
      tokenUsage: row.token_usage,
      errors: row.errors,
      summary: row.summary,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
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
          error instanceof Error ? error.message : "Unable to load job.",
      },
      { status: 500 },
    );
  }
}
