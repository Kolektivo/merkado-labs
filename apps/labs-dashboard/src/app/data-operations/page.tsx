import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { PipelineRefreshControls } from "@/components/pipeline-refresh-controls";
import { PipelineRunProgress } from "@/components/pipeline-run-progress";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
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
import {
  AUTOMATIC_REFRESH_ENABLED,
  DAILY_CRON_UTC,
} from "@/lib/pipeline/schedule";
import { getConfigurationHealth } from "@/lib/system/health";
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
          description="Dispatch and review Labs property refreshes."
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
  const health = getConfigurationHealth();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Data operations"
        description="Dispatch a safe Labs refresh, follow its progress, and review recent outcomes."
        icon={RefreshCw}
      />

      <SummaryStrip
        className="xl:grid-cols-3"
        items={[
          {
            label: "Automatic refresh",
            value: AUTOMATIC_REFRESH_ENABLED ? "On" : "Off",
            helper: AUTOMATIC_REFRESH_ENABLED
              ? `Configured · 00:00 Curaçao / 04:00 UTC · 06:00 Amsterdam (CEST) / 05:00 Amsterdam (CET) · cron ${DAILY_CRON_UTC} · begins on default branch`
              : "No scheduled runs · intended 00:00 Curaçao when re-enabled",
            tip: AUTOMATIC_REFRESH_ENABLED
              ? "Daily automation is configured On. Scheduled execution begins once the workflow is on the default branch; Run now can still dispatch manually."
              : "Automatic refresh is currently off. Only an explicit manual dispatch can start a new refresh.",
            tipLabel: "automatic refresh",
            icon: RefreshCw,
          },
          {
            label: "Manual dispatch",
            value: health.githubDispatchConfigured ? "Ready" : "Setup needed",
            helper: health.githubDispatchConfigured
              ? "Run now can dispatch the Labs workflow"
              : "Server-only GitHub credentials are missing",
            tip: "Run now starts the approved Labs-only GitHub workflow. It does not deploy the dashboard or access production.",
            tipLabel: "manual dispatch",
            icon: RefreshCw,
          },
          {
            label: "AI guardrails",
            value: "25 / day",
            helper: "USD 2 / day · USD 25 / month · overflow deferred",
            tip: "At most 25 changed listings can use AI in a day, subject to the daily and monthly cost limits.",
            tipLabel: "AI guardrails",
            icon: RefreshCw,
          },
        ]}
      />

      {!health.githubDispatchConfigured ? (
        <div className="rounded-xl border border-dashed px-4 py-4 text-sm">
          <p className="font-medium">Manual Run now dispatch needs setup</p>
          <p className="mt-1 text-muted-foreground">
            Set server-only{" "}
            <code className="text-xs">GITHUB_REPOSITORY=Kolektivo/merkado-labs</code>{" "}
            and a dedicated fine-grained{" "}
            <code className="text-xs">GITHUB_TOKEN</code> with Actions workflow
            dispatch permission. Daily cron does not require this credential.
            {!health.githubRepositoryConfigured
              ? " Repository variable is missing."
              : " Token is missing or not loaded on this host."}
          </p>
        </div>
      ) : null}

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
