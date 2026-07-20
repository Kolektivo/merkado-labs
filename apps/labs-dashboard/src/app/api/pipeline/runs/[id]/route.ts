import { NextResponse } from "next/server";

import {
  AdminAuthError,
  assertLabsAdminSession,
} from "@/lib/admin/auth";
import { getPipelineRunDetail } from "@/lib/data/operations";
import {
  cancelQueuedPipelineRun,
  requestStopPipelineRun,
} from "@/lib/pipeline/enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  try {
    assertLabsAdminSession(_request);
    const { id } = await context.params;
    const detail = await getPipelineRunDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Pipeline run not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load run" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: { params: Params }) {
  try {
    assertLabsAdminSession(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      action?: "cancel" | "stop";
    } | null;
    if (body?.action === "cancel") {
      const updated = await cancelQueuedPipelineRun(id);
      return NextResponse.json({ ok: true, run: updated });
    }
    if (body?.action === "stop") {
      const updated = await requestStopPipelineRun(id);
      return NextResponse.json({ ok: true, run: updated });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update run" },
      { status: 400 },
    );
  }
}
