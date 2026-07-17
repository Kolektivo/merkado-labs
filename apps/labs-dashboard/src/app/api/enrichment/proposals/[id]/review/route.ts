import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdminSession,
} from "@/lib/admin/auth";
import { createLabsAdminClient } from "@/lib/supabase/admin";
import { DashboardConfigurationError } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES = [
  "unreviewed",
  "approved_for_research",
  "rejected",
  "needs_changes",
] as const;

type Params = Promise<{ id: string }>;

export async function POST(
  request: Request,
  { params }: { params: Params },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertLabsAdminSession(request);
    const reviewStatus = String(body.reviewStatus ?? "");
    if (!REVIEW_STATUSES.includes(reviewStatus as (typeof REVIEW_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
    }
    const reviewNotes =
      typeof body.reviewNotes === "string" && body.reviewNotes.trim()
        ? body.reviewNotes.trim()
        : null;
    const { id } = await params;
    const { data, error } = await createLabsAdminClient()
      .from("ai_enrichment_proposals")
      .update({
        review_status: reviewStatus,
        review_notes: reviewNotes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: "labs-dashboard-admin",
      })
      .eq("id", id)
      .select("id,review_status,review_notes,reviewed_at,reviewed_by")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: data.id,
      reviewStatus: data.review_status,
      reviewNotes: data.review_notes,
      reviewedAt: data.reviewed_at,
      reviewedBy: data.reviewed_by,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DashboardConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to review proposal." },
      { status: 400 },
    );
  }
}
