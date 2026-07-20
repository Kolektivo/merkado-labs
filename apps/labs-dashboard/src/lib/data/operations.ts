import "server-only";

import {
  SOURCE_READINESS,
  displayReadiness,
  type SourceReadinessConfig,
  type UiReadiness,
} from "@/lib/domain/source-readiness";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export type SourceOperationsCard = SourceReadinessConfig & {
  listingCount: number;
  publicCount: number;
  aiCoveragePercent: number | null;
  latestSuccessfulRefresh: string | null;
  latestCatalogVerdict: string | null;
  uiReadiness: UiReadiness;
  activeRunId: string | null;
  activeRunStatus: string | null;
  activeStage: string | null;
};

export type PipelineRunRow = {
  id: string;
  correlationId: string;
  status: string;
  triggerMode: string;
  triggerType: string;
  sourceKeys: string[];
  currentSourceKey: string | null;
  currentStage: string | null;
  progress: Record<string, unknown>;
  preflight: Record<string, unknown>;
  costSummary: Record<string, unknown>;
  errorSummary: unknown[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type PipelineStageRow = {
  id: string;
  pipelineRunId: string;
  sourceKey: string;
  stage: string;
  status: string;
  processedCount: number;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  skippedUnchangedCount: number;
  warningCount: number;
  httpRequestCount: number;
  cacheHitCount: number;
  tokenUsage: Record<string, unknown>;
  estimatedAiCostUsd: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type PipelineItemRow = {
  id: string;
  sourceKey: string;
  externalId: string | null;
  title: string | null;
  currentStage: string | null;
  status: string;
  parseResult: string | null;
  importResult: string | null;
  aiResult: string | null;
  tokenUsage: Record<string, unknown>;
  estimatedAiCostUsd: number | null;
  errorSummary: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function getSourceOperationsCards(): Promise<SourceOperationsCard[]> {
  const client = createLabsAdminClient();
  const [sources, listings, runs, pipelineRuns] = await Promise.all([
    client
      .from("property_sources")
      .select("id,source_key,name,adapter_status,enabled")
      .in(
        "source_key",
        SOURCE_READINESS.map((item) => item.sourceKey),
      ),
    client
      .from("property_listings")
      .select("id,property_source_id,public_eligible,enrichment_status"),
    client
      .from("property_source_runs")
      .select("property_source_id,source_key,outcome,completed_at,started_at")
      .order("started_at", { ascending: false })
      .limit(100),
    client
      .from("property_pipeline_runs")
      .select("id,status,source_keys,current_stage,current_source_key")
      .in("status", ["queued", "running", "stopping"])
      .limit(20),
  ]);

  if (sources.error) throw new Error(sources.error.message);
  if (listings.error) throw new Error(listings.error.message);
  if (runs.error) throw new Error(runs.error.message);
  if (pipelineRuns.error) throw new Error(pipelineRuns.error.message);

  const sourceIdByKey = new Map(
    (sources.data ?? []).map((row) => [String(row.source_key), String(row.id)]),
  );

  return SOURCE_READINESS.map((config) => {
    const sourceId = sourceIdByKey.get(config.sourceKey);
    const sourceListings = (listings.data ?? []).filter(
      (row) => String(row.property_source_id) === sourceId,
    );
    const enriched = sourceListings.filter((row) =>
      ["succeeded", "needs_review", "skipped_unchanged"].includes(
        String(row.enrichment_status ?? ""),
      ),
    );
    const sourceRuns = (runs.data ?? []).filter(
      (row) => String(row.source_key) === config.sourceKey,
    );
    const success = sourceRuns.find((row) => row.outcome === "success");
    const latest = sourceRuns[0];
    const active = (pipelineRuns.data ?? []).find((row) =>
      ((row.source_keys as string[] | null) ?? []).includes(config.sourceKey),
    );

    return {
      ...config,
      listingCount: sourceListings.length,
      publicCount: sourceListings.filter((row) => row.public_eligible).length,
      aiCoveragePercent:
        sourceListings.length === 0
          ? null
          : Math.round((enriched.length / sourceListings.length) * 1000) / 10,
      latestSuccessfulRefresh: success?.completed_at
        ? String(success.completed_at)
        : null,
      latestCatalogVerdict: latest?.outcome ? String(latest.outcome) : null,
      uiReadiness: displayReadiness(config.readiness, active?.status ?? null),
      activeRunId: active?.id ? String(active.id) : null,
      activeRunStatus: active?.status ? String(active.status) : null,
      activeStage: active?.current_stage ? String(active.current_stage) : null,
    };
  });
}

export async function getLatestPipelineRuns(limit = 10): Promise<PipelineRunRow[]> {
  const client = createLabsAdminClient();
  const { data, error } = await client
    .from("property_pipeline_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    correlationId: String(row.correlation_id),
    status: String(row.status),
    triggerMode: String(row.trigger_mode),
    triggerType: String(row.trigger_type ?? "manual"),
    sourceKeys: (row.source_keys as string[] | null) ?? [],
    currentSourceKey: row.current_source_key
      ? String(row.current_source_key)
      : null,
    currentStage: row.current_stage ? String(row.current_stage) : null,
    progress: asRecord(row.progress),
    preflight: asRecord(row.preflight),
    costSummary: asRecord(row.cost_summary),
    errorSummary: Array.isArray(row.error_summary) ? row.error_summary : [],
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  }));
}

export async function getPipelineRunDetail(runId: string): Promise<{
  run: PipelineRunRow;
  stages: PipelineStageRow[];
  items: PipelineItemRow[];
} | null> {
  const client = createLabsAdminClient();
  const [runRes, stagesRes, itemsRes] = await Promise.all([
    client.from("property_pipeline_runs").select("*").eq("id", runId).maybeSingle(),
    client
      .from("property_pipeline_source_stages")
      .select("*")
      .eq("pipeline_run_id", runId)
      .order("source_key")
      .order("created_at"),
    client
      .from("property_pipeline_items")
      .select("*")
      .eq("pipeline_run_id", runId)
      .order("external_id")
      .limit(500),
  ]);
  if (runRes.error) throw new Error(runRes.error.message);
  if (!runRes.data) return null;
  if (stagesRes.error) throw new Error(stagesRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const run = (await getLatestPipelineRuns(50)).find((item) => item.id === runId);
  if (!run) {
    const row = runRes.data;
    return {
      run: {
        id: String(row.id),
        correlationId: String(row.correlation_id),
        status: String(row.status),
        triggerMode: String(row.trigger_mode),
        triggerType: String(row.trigger_type ?? "manual"),
        sourceKeys: (row.source_keys as string[] | null) ?? [],
        currentSourceKey: row.current_source_key
          ? String(row.current_source_key)
          : null,
        currentStage: row.current_stage ? String(row.current_stage) : null,
        progress: asRecord(row.progress),
        preflight: asRecord(row.preflight),
        costSummary: asRecord(row.cost_summary),
        errorSummary: Array.isArray(row.error_summary) ? row.error_summary : [],
        createdAt: String(row.created_at),
        startedAt: row.started_at ? String(row.started_at) : null,
        completedAt: row.completed_at ? String(row.completed_at) : null,
      },
      stages: mapStages(stagesRes.data ?? []),
      items: mapItems(itemsRes.data ?? []),
    };
  }
  return {
    run,
    stages: mapStages(stagesRes.data ?? []),
    items: mapItems(itemsRes.data ?? []),
  };
}

function mapStages(rows: Record<string, unknown>[]): PipelineStageRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    pipelineRunId: String(row.pipeline_run_id),
    sourceKey: String(row.source_key),
    stage: String(row.stage),
    status: String(row.status),
    processedCount: Number(row.processed_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    succeededCount: Number(row.succeeded_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    skippedUnchangedCount: Number(row.skipped_unchanged_count ?? 0),
    warningCount: Number(row.warning_count ?? 0),
    httpRequestCount: Number(row.http_request_count ?? 0),
    cacheHitCount: Number(row.cache_hit_count ?? 0),
    tokenUsage: asRecord(row.token_usage),
    estimatedAiCostUsd:
      row.estimated_ai_cost_usd === null || row.estimated_ai_cost_usd === undefined
        ? null
        : Number(row.estimated_ai_cost_usd),
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  }));
}

function mapItems(rows: Record<string, unknown>[]): PipelineItemRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    sourceKey: String(row.source_key),
    externalId: row.external_id ? String(row.external_id) : null,
    title: row.title ? String(row.title) : null,
    currentStage: row.current_stage ? String(row.current_stage) : null,
    status: String(row.status),
    parseResult: row.parse_result ? String(row.parse_result) : null,
    importResult: row.import_result ? String(row.import_result) : null,
    aiResult: row.ai_result ? String(row.ai_result) : null,
    tokenUsage: asRecord(row.token_usage),
    estimatedAiCostUsd:
      row.estimated_ai_cost_usd === null || row.estimated_ai_cost_usd === undefined
        ? null
        : Number(row.estimated_ai_cost_usd),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
  }));
}
