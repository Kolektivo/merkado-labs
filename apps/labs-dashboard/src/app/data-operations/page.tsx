import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { PipelineRefreshControls } from "@/components/pipeline-refresh-controls";
import { PipelineRunProgress } from "@/components/pipeline-run-progress";
import { StatusBadge } from "@/components/status-badge";
import {
  getLatestPipelineRuns,
  getPipelineRunDetail,
  getSourceOperationsCards,
} from "@/lib/data/operations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd } from "@/lib/enrichment/cost";
import { formatDateTime } from "@/lib/format";
import { jobStatusLabel, jobStatusTone } from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data operations" };

export default async function DataOperationsPage() {
  let cards;
  let runs;
  try {
    [cards, runs] = await Promise.all([
      getSourceOperationsCards(),
      getLatestPipelineRuns(8),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Data operations"
          description="Labs property refresh automation. The daily schedule is not enabled."
          icon={RefreshCw}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const active = runs.find((run) =>
    ["queued", "running", "stopping"].includes(run.status),
  );
  const activeDetail = active ? await getPipelineRunDetail(active.id) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Data operations"
        description="Dispatch a safe Labs refresh, follow its progress, and review recent outcomes."
        icon={RefreshCw}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Automatic refresh</CardDescription>
            <CardTitle>Off</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            workflow_dispatch only
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Intended schedule</CardDescription>
            <CardTitle>06:00 Curaçao</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Pending a separate cron PR
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>AI budgets</CardDescription>
            <CardTitle>USD 2 / day</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            USD 25 monthly
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Daily listing limit</CardDescription>
            <CardTitle>25 listings</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Budget overflow is deferred
          </CardContent>
        </Card>
      </section>

      <section
        aria-labelledby="operations-sources-heading"
        className="flex flex-col gap-3"
      >
        <div>
          <h2 id="operations-sources-heading" className="text-lg font-semibold">
            Sources
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose one ready source, or refresh all ready sources together.
          </p>
        </div>
        <PipelineRefreshControls cards={cards} />
      </section>

      <section
        aria-labelledby="operations-activity-heading"
        className="flex flex-col gap-4"
      >
        <div>
          <h2 id="operations-activity-heading" className="text-lg font-semibold">
            Activity
          </h2>
          <p className="text-sm text-muted-foreground">
            What is running now and what finished recently.
          </p>
        </div>
        {activeDetail ? (
          <PipelineRunProgress
            run={activeDetail.run}
            stages={activeDetail.stages}
            items={activeDetail.items}
          />
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            Nothing is running or waiting. Source data remains unchanged until a
            refresh is queued and the local worker starts it.
          </div>
        )}

        <Card className="gap-0">
          <CardHeader className="border-b" data-testid="recent-runs-header">
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>
              Latest refresh outcomes and estimated AI use.
            </CardDescription>
          </CardHeader>
          <CardContent className="-mb-(--card-spacing) divide-y px-0 text-sm">
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-muted-foreground">
                No refresh runs are recorded yet.
              </p>
            ) : (
              runs.map((run) => {
                const ai = (run.costSummary.ai_enrichment ?? {}) as {
                  gross_estimated_cost_usd?: number;
                  billable_listings?: number;
                  skipped_unchanged?: number;
                };
                const sourceNames = run.sourceKeys
                  .map(
                    (sourceKey) =>
                      cards.find((card) => card.sourceKey === sourceKey)
                        ?.displayName ?? sourceKey,
                  )
                  .join(", ");
                return (
                  <div
                    key={run.id}
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {sourceNames || "Property refresh"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(run.createdAt)}
                        {" · "}
                        {run.triggerMode} / {run.triggerType}
                        {" · "}
                        AI processed {ai.billable_listings ?? 0}
                        {" · unchanged "}
                        {ai.skipped_unchanged ?? 0}
                        {" · "}
                        {formatUsd(ai.gross_estimated_cost_usd ?? null)}
                      </p>
                    </div>
                    <StatusBadge tone={jobStatusTone(run.status)}>
                      {jobStatusLabel(run.status)}
                    </StatusBadge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          Technical operation details
        </summary>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Queueing dispatches the Labs GitHub workflow. Partial and blocked
          sources cannot run a full refresh. AI is capped at USD 2 daily, USD 25
          monthly, and 25 changed listings per daily run.
        </p>
      </details>
    </div>
  );
}
