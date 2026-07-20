import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdminSession,
} from "@/lib/admin/auth";
import { enqueuePipelineRun } from "@/lib/pipeline/enqueue";
import {
  assertPipelinePostAllowed,
  PipelineRequestGuardError,
} from "@/lib/pipeline/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enqueue a manual Data refresh. Never scrapes or calls OpenAI in-request.
 */
export async function POST(request: Request) {
  try {
    assertPipelinePostAllowed(request);
    assertLabsAdminSession(request);
    const body = (await request.json().catch(() => null)) as {
      sourceKeys?: string[];
      source_keys?: string[];
      triggerMode?: "single_source" | "run_all_ready" | "resume" | "retry_items";
      trigger_mode?: "single_source" | "run_all_ready" | "resume" | "retry_items";
      expectedAiListingCount?: number;
      confirm?: boolean;
    } | null;

    if (!body?.confirm) {
      return NextResponse.json(
        { error: "Confirmation required before enqueue." },
        { status: 400 },
      );
    }

    const triggerMode = body.triggerMode ?? body.trigger_mode ?? "single_source";
    const sourceKeys = body.sourceKeys ?? body.source_keys ?? [];
    const result = await enqueuePipelineRun({
      sourceKeys,
      triggerMode,
      expectedAiListingCount: body.expectedAiListingCount ?? 0,
      requestedBy: "labs_admin",
      triggerType: "manual",
    });

    return NextResponse.json({
      ok: true,
      run: result,
      workerHint: "Queued for the Labs workflow_dispatch automation.",
    });
  } catch (error) {
    if (error instanceof PipelineRequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unable to enqueue";
    const status =
      message.includes("blocked") ||
      message.includes("partial") ||
      message.includes("forbidden") ||
      message.includes("Production")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
