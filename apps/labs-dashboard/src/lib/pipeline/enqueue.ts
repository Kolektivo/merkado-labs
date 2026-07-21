import "server-only";

import { randomUUID } from "node:crypto";

import {
  SOURCE_READINESS,
  readySourceKeys,
  type SourceReadinessConfig,
} from "@/lib/domain/source-readiness";
import { dispatchPropertyPipelineWorkflow } from "@/lib/pipeline/dispatch-github";
import { AUTOMATIC_REFRESH_ENABLED, DAILY_CRON_UTC } from "@/lib/pipeline/schedule";
import { createLabsAdminClient } from "@/lib/supabase/admin";
import { LABS_PROJECT_REF, getSupabaseConfig } from "@/lib/supabase/config";

/** Default daily AI budget; the Python worker also enforces monthly/listing limits. */
export const PIPELINE_AI_COST_CEILING_USD = 2;

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
  const candidates = new Set(
    sourceKeys?.length
      ? sourceKeys
      : SOURCE_READINESS.map((item) => item.sourceKey),
  );
  return readySourceKeys().filter((key) => candidates.has(key));
}

export type EnqueueInput = {
  sourceKeys: string[];
  triggerMode: "single_source" | "run_all_ready" | "resume" | "retry_items";
  expectedAiListingCount?: number;
  requestedBy?: string;
  triggerType?: "scheduled" | "manual" | "local" | "dry_run";
};

/**
 * Enqueue only — never scrapes, imports, or calls OpenAI inside the HTTP path.
 */
export async function enqueuePipelineRun(input: EnqueueInput) {
  const { url } = getSupabaseConfig();
  if (!url.includes(LABS_PROJECT_REF)) {
    throw new Error("Production project is forbidden");
  }

  const requestedKeys = input.sourceKeys.map((key) => key.trim()).filter(Boolean);
  if (input.triggerMode !== "run_all_ready") {
    for (const key of requestedKeys) assertCanEnqueueFullRefresh(key);
  }
  const requested = new Set(requestedKeys);
  let keys =
    input.triggerMode === "run_all_ready"
      ? filterRunAllReady(requestedKeys)
      : readySourceKeys().filter((key) => requested.has(key));

  if (input.triggerMode === "run_all_ready" && keys.length === 0) {
    throw new Error("No ready sources available for Run all ready sources");
  }
  if (keys.length === 0) {
    throw new Error("At least one source_key is required");
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
    trigger_type: input.triggerType ?? "manual",
    sources_included: sourcesIncluded,
    expected_request_scope: "manual_refresh_and_enrich",
    import_will_occur: sourcesIncluded.some((item) => item.import_will_occur),
    expected_ai_listing_count: expectedAi,
    estimated_ai_ceiling_usd: ceiling,
    lifecycle_risk_summary:
      "Missing/removed transitions only when a source completes a full successful catalog. Partial or failed catalogs never mark absence.",
    cost_disclaimer:
      "Estimated from recorded token usage and configured model pricing.",
    schedule: AUTOMATIC_REFRESH_ENABLED ? "on" : "off",
    schedule_metadata: {
      automatic_refresh: AUTOMATIC_REFRESH_ENABLED ? "On" : "Off",
      intended_local_time: "00:00",
      timezone: "America/Curacao",
      documented_cron_utc: DAILY_CRON_UTC,
      enabled: AUTOMATIC_REFRESH_ENABLED,
    },
    ready_source_keys: readySourceKeys(),
  };

  const { data: inserted, error } = await client
    .from("property_pipeline_runs")
    .insert({
      correlation_id: correlationId,
      trigger_mode: input.triggerMode,
      trigger_type: input.triggerType ?? "manual",
      status: "queued",
      dispatch_status: "pending",
      automatic_refresh_enabled: AUTOMATIC_REFRESH_ENABLED,
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

  let dispatchStatus: "dispatched" | "failed" = "dispatched";
  let message = "Queued and dispatched to the Labs workflow";
  try {
    const dispatch = await dispatchPropertyPipelineWorkflow({
      pipelineRunId: String(inserted.id),
      sourceKeys: keys,
      dryRun: input.triggerType === "dry_run",
    });
    await client
      .from("property_pipeline_runs")
      .update({
        dispatch_status: dispatch.dispatchStatus,
        github_workflow_ref: dispatch.workflowRef,
      })
      .eq("id", inserted.id);
  } catch (dispatchError) {
    dispatchStatus = "failed";
    message = "Queued — GitHub dispatch failed; safe to retry dispatch";
    const detail =
      dispatchError instanceof Error ? dispatchError.message : "Unknown dispatch error";
    await client
      .from("property_pipeline_runs")
      .update({ dispatch_status: "failed" })
      .eq("id", inserted.id);
    await client.from("property_pipeline_events").insert({
      pipeline_run_id: inserted.id,
      correlation_id: correlationId,
      event_type: "dispatch_failed",
      message,
      details: { error: detail },
    });
  }

  return {
    id: String(inserted.id),
    correlationId,
    status: "queued",
    sourceKeys: keys,
    message,
    dispatchStatus,
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
