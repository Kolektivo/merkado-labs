import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  SOURCE_READINESS,
  type PipelineStage,
} from "@/lib/domain/source-readiness";
import { COST_ESTIMATE_LABEL, formatUsd, parseTokenUsage } from "@/lib/enrichment/cost";
import type {
  PipelineItemRow,
  PipelineRunRow,
  PipelineStageRow,
} from "@/lib/data/operations";
import { formatDateTime, formatDuration } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { PipelineRunControl } from "@/components/pipeline-run-control";
import { jobStatusLabel, jobStatusTone } from "@/lib/ui-labels";

const ITEM_STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting",
  fetching: "Fetching",
  parsed: "Parsed",
  imported: "Imported",
  enriching: "Enriching",
  complete: "Complete",
  complete_with_warnings: "Complete with warnings",
  failed: "Failed",
  skipped_unchanged: "Skipped unchanged",
  blocked: "Blocked",
};

function elapsedLabel(run: PipelineRunRow) {
  if (!run.startedAt) return "—";
  const end = run.completedAt ? new Date(run.completedAt) : new Date();
  const start = new Date(run.startedAt);
  const ms = Math.max(0, end.getTime() - start.getTime());
  return formatDuration(ms);
}

export function PipelineRunProgress({
  run,
  stages,
  items,
}: {
  run: PipelineRunRow;
  stages: PipelineStageRow[];
  items: PipelineItemRow[];
}) {
  const byStage = new Map(stages.map((stage) => [`${stage.sourceKey}:${stage.stage}`, stage]));
  const sourceKeys = run.sourceKeys;
  const aiCost = Number(
    (run.costSummary.ai_enrichment as { gross_estimated_cost_usd?: number } | undefined)
      ?.gross_estimated_cost_usd ?? 0,
  );
  const tokenUsage = parseTokenUsage(
    (run.costSummary.ai_enrichment as Record<string, unknown> | undefined) ?? {},
  );
  const completedStages = stages.filter((stage) =>
    ["completed", "completed_with_warnings", "skipped"].includes(stage.status),
  ).length;
  const stageTotal = Math.max(PIPELINE_STAGES.length * sourceKeys.length, 1);
  const overallPercent = Math.round((completedStages / stageTotal) * 100);
  const totalWarnings = stages.reduce(
    (sum, stage) => sum + stage.warningCount,
    0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Current run</CardTitle>
              <CardDescription>
                {run.status === "queued"
                  ? "Queued — waiting for worker"
                  : run.currentStage
                    ? PIPELINE_STAGE_LABELS[run.currentStage as PipelineStage] ??
                      run.currentStage
                    : "Preparing the next stage"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={jobStatusTone(run.status)}>
                {jobStatusLabel(run.status)}
              </StatusBadge>
              <PipelineRunControl runId={run.id} status={run.status} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Overall progress</span>
              <span>{overallPercent}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Overall run progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallPercent}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage) => {
              const matching = stages.filter((row) => row.stage === stage);
              const status = matching.some((row) => row.status === "running")
                ? "running"
                : matching.length > 0 &&
                    matching.every((row) =>
                      ["completed", "completed_with_warnings", "skipped"].includes(
                        row.status,
                      ),
                    )
                  ? "done"
                  : matching.some((row) => row.status === "failed")
                    ? "failed"
                    : "waiting";
              return (
                <StatusBadge
                  key={stage}
                  tone={
                    status === "done"
                      ? "success"
                      : status === "running"
                        ? "info"
                        : status === "failed"
                          ? "error"
                          : "neutral"
                  }
                  showDot={status !== "waiting"}
                >
                  {PIPELINE_STAGE_LABELS[stage as PipelineStage]}
                </StatusBadge>
              );
            })}
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Elapsed</dt>
              <dd>{elapsedLabel(run)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Completed stages</dt>
              <dd>
                {completedStages}/{stageTotal}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Warnings</dt>
              <dd>{totalWarnings}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estimated AI cost</dt>
              <dd>{formatUsd(aiCost)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {sourceKeys.map((sourceKey) => {
        const sourceStages = PIPELINE_STAGES.map(
          (stage) => byStage.get(`${sourceKey}:${stage}`),
        ).filter(Boolean) as PipelineStageRow[];
        const current =
          sourceStages.find((stage) => stage.status === "running") ??
          sourceStages[sourceStages.length - 1];
        return (
          <Card key={sourceKey}>
            <CardHeader>
              <CardTitle className="text-base">
                {SOURCE_READINESS.find((source) => source.sourceKey === sourceKey)
                  ?.displayName ?? sourceKey}
              </CardTitle>
              <CardDescription>
                {current
                  ? PIPELINE_STAGE_LABELS[current.stage as PipelineStage] ??
                    current.stage
                  : "Waiting"}{" "}
                ·{" "}
                {current
                  ? `${current.processedCount}/${current.totalCount}`
                  : "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Succeeded</dt>
                  <dd>{current?.succeededCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Failed</dt>
                  <dd>{current?.failedCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Skipped unchanged</dt>
                  <dd>{current?.skippedUnchangedCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Warnings</dt>
                  <dd>{current?.warningCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">AI tokens</dt>
                  <dd>
                    {tokenUsage.inputTokens + tokenUsage.outputTokens || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Estimated AI cost</dt>
                  <dd>{formatUsd(aiCost)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        );
      })}

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Listing progress ({items.length})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Parse</TableHead>
                <TableHead>Import</TableHead>
                <TableHead>AI</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 100).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">
                      {item.externalId ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.title ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>{item.currentStage ?? "—"}</TableCell>
                  <TableCell>
                    {ITEM_STATUS_LABELS[item.status] ?? item.status}
                  </TableCell>
                  <TableCell>{item.parseResult ?? "—"}</TableCell>
                  <TableCell>{item.importResult ?? "—"}</TableCell>
                  <TableCell>{item.aiResult ?? "—"}</TableCell>
                  <TableCell>{formatUsd(item.estimatedAiCostUsd)}</TableCell>
                  <TableCell className="max-w-48 truncate">
                    {item.errorSummary ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Technical run details
        </summary>
        <dl className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt>Run ID</dt>
            <dd className="break-all font-mono text-foreground">{run.id}</dd>
          </div>
          <div>
            <dt>Correlation ID</dt>
            <dd className="break-all font-mono text-foreground">
              {run.correlationId}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd className="text-foreground">{formatDateTime(run.createdAt)}</dd>
          </div>
          <div>
            <dt>HTTP requests</dt>
            <dd className="text-foreground">
              {stages.reduce((sum, stage) => sum + stage.httpRequestCount, 0)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          External API cost: USD 0 · Infrastructure runtime not estimated ·{" "}
          {COST_ESTIMATE_LABEL}
        </p>
      </details>
    </div>
  );
}
