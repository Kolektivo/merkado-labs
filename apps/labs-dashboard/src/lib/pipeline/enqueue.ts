import "server-only";

import { randomUUID } from "node:crypto";

import {
  SOURCE_READINESS,
  readySourceKeys,
  type SourceReadinessConfig,
} from "@/lib/domain/source-readiness";
import { createLabsAdminClient } from "@/lib/supabase/admin";
import { LABS_PROJECT_REF, getSupabaseConfig } from "@/lib/supabase/config";

/** Hard approved ceiling for a single manual Refresh & enrich run. */
export const PIPELINE_AI_COST_CEILING_USD = 0.75;

const STAGES = [
  "preflight",
  "scraping",
  "validation",
  "import",
  "location",
  "ai_enrichment",
  "verification",
] as const;

function configFor(sourceKey: string): SourceReadinessConfig {
  const found = SOURCE_READINESS.find((item) => item.sourceKey === sourceKey);
  if (!found) throw new Error(`Unknown source: ${sourceKey}`);
  return found;
}

export function assertCanEnqueueFullRefresh(sourceKey: string): SourceReadinessConfig {
  const info = configFor(sourceKey);
  if (info.readiness === "blocked") {
    throw new Error(`${info.displayName} is blocked: ${info.currentIssue}`);
  }
  if (info.readiness === "partial" || !info.allowsFullRefresh) {
    throw new Error(
      `${info.displayName} is partial — continue setup; full Refresh & enrich is not allowed until the catalog is proven.`,
    );
  }
  return info;
}

export function filterRunAllReady(sourceKeys?: string[]): string[] {
  const candidates = sourceKeys?.length
    ? sourceKeys
    : SOURCE_READINESS.map((item) => item.sourceKey);
  return candidates.filter((key) => {
    const info = configFor(key);
    return info.readiness === "ready" && info.allowsFullRefresh;
  });
}

export type EnqueueInput = {
  sourceKeys: string[];
  triggerMode: "single_source" | "run_all_ready" | "resume" | "retry_items";
  expectedAiListingCount?: number;
  requestedBy?: string;
};

/**
 * Enqueue only — never scrapes, imports, or calls OpenAI inside the HTTP path.
 */
export async function enqueuePipelineRun(input: EnqueueInput) {
  const { url } = getSupabaseConfig();
  if (!url.includes(LABS_PROJECT_REF)) {
    throw new Error("Production project is forbidden");
  }

  let keys =
    input.triggerMode === "run_all_ready"
      ? filterRunAllReady(input.sourceKeys)
      : input.sourceKeys.map((key) => key.trim()).filter(Boolean);

  if (input.triggerMode === "run_all_ready" && keys.length === 0) {
    throw new Error("No ready sources available for Run all ready sources");
  }
  if (keys.length === 0) {
    throw new Error("At least one source_key is required");
  }
  if (input.triggerMode !== "run_all_ready") {
    for (const key of keys) assertCanEnqueueFullRefresh(key);
  }

  // Defensive: never enqueue partial/blocked even if caller bypasses UI.
  keys = keys.filter((key) => {
    const info = configFor(key);
    return info.readiness === "ready" && info.allowsFullRefresh;
  });
  if (keys.length === 0) {
    throw new Error("No eligible ready sources to enqueue");
  }

  const client = createLabsAdminClient();
  const { data: active, error: activeError } = await client
    .from("property_pipeline_runs")
    .select("id,status,source_keys")
    .in("status", ["queued", "running", "stopping"]);
  if (activeError) throw new Error(activeError.message);

  const overlap = new Set(keys);
  for (const row of active ?? []) {
    const existing = new Set((row.source_keys as string[] | null) ?? []);
    const hit = [...existing].filter((key) => overlap.has(key));
    if (hit.length) {
      throw new Error(
        `Active pipeline run ${row.id} already covers ${hit.sort().join(", ")}`,
      );
    }
  }

  // Billable AI listing selection happens in the worker via checksum skip.
  // Store the approved hard ceiling, not a worst-case catalog-size estimate.
  const expectedAi = Math.max(0, input.expectedAiListingCount ?? 0);
  const ceiling = PIPELINE_AI_COST_CEILING_USD;

  const sourcesIncluded = keys.map((key) => {
    const info = configFor(key);
    return {
      source_key: info.sourceKey,
      display_name: info.displayName,
      readiness: info.readiness,
      adapter_version: info.adapterVersion,
      import_will_occur: info.allowsFullRefresh,
      lifecycle_absence_allowed: info.allowsFullRefresh,
      catalog_status: info.catalogStatus,
      current_issue: info.currentIssue,
    };
  });

  const correlationId = randomUUID();
  const preflight = {
    generated_at: new Date().toISOString(),
    project_ref: LABS_PROJECT_REF,
    trigger_mode: input.triggerMode,
    sources_included: sourcesIncluded,
    expected_request_scope: "manual_refresh_and_enrich",
    import_will_occur: sourcesIncluded.some((item) => item.import_will_occur),
    expected_ai_listing_count: expectedAi,
    estimated_ai_ceiling_usd: ceiling,
    lifecycle_risk_summary:
      "Missing/removed transitions only when a source completes a full successful catalog. Partial or failed catalogs never mark absence.",
    cost_disclaimer:
      "Estimated from recorded token usage and configured model pricing.",
    schedule: "manual_only",
    ready_source_keys: readySourceKeys(),
  };

  const { data: inserted, error } = await client
    .from("property_pipeline_runs")
    .insert({
      correlation_id: correlationId,
      trigger_mode: input.triggerMode,
      status: "queued",
      requested_by: input.requestedBy ?? "labs_admin",
      source_keys: keys,
      preflight,
      progress: {
        message: "Queued — waiting for worker",
        sources: Object.fromEntries(
          keys.map((key) => [key, { stage: null, status: "queued" }]),
        ),
      },
      cost_summary: {
        source_refresh: {
          http_requests: 0,
          external_api_cost_usd: 0,
          infrastructure_runtime: "not_estimated",
        },
        ai_enrichment: {
          model: "gpt-5.6-terra",
          estimated_ceiling_usd: ceiling,
          disclaimer:
            "Estimated from recorded token usage and configured model pricing.",
        },
      },
    })
    .select("*")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to enqueue pipeline run");
  }

  const stageRows = keys.flatMap((sourceKey) =>
    STAGES.map((stage) => ({
      pipeline_run_id: inserted.id,
      correlation_id: correlationId,
      source_key: sourceKey,
      stage,
      status: "waiting",
    })),
  );
  const { error: stageError } = await client
    .from("property_pipeline_source_stages")
    .insert(stageRows);
  if (stageError) throw new Error(stageError.message);

  const { error: eventError } = await client.from("property_pipeline_events").insert({
    pipeline_run_id: inserted.id,
    correlation_id: correlationId,
    event_type: "queued",
    message: "Queued — waiting for worker",
    details: { source_keys: keys, trigger_mode: input.triggerMode },
  });
  if (eventError) throw new Error(eventError.message);

  return {
    id: String(inserted.id),
    correlationId,
    status: "queued",
    sourceKeys: keys,
    message: "Queued — waiting for worker",
    preflight,
  };
}

export async function cancelQueuedPipelineRun(runId: string) {
  const client = createLabsAdminClient();
  const { data: run, error } = await client
    .from("property_pipeline_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) throw new Error("Pipeline run not found");
  if (run.status !== "queued") {
    throw new Error("Only queued runs can be cancelled");
  }
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await client
    .from("property_pipeline_runs")
    .update({
      status: "cancelled",
      // Check constraint requires started_at when completed_at is set.
      started_at: run.started_at ?? run.created_at ?? now,
      completed_at: now,
      progress: {
        ...(typeof run.progress === "object" && run.progress ? run.progress : {}),
        message: "Cancelled while queued",
      },
    })
    .eq("id", runId)
    .eq("status", "queued")
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return updated;
}

export async function requestStopPipelineRun(runId: string) {
  const client = createLabsAdminClient();
  const { data: run, error } = await client
    .from("property_pipeline_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) throw new Error("Pipeline run not found");
  if (run.status !== "running" && run.status !== "stopping") {
    throw new Error("Stop-after-current only applies to running jobs");
  }
  const { data: updated, error: updateError } = await client
    .from("property_pipeline_runs")
    .update({ status: "stopping", stop_after_current_item: true })
    .eq("id", runId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return updated;
}
