import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, Eye, Radio, RefreshCw } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOverviewData } from "@/lib/data/overview";
import {
  displayReadiness,
  SOURCE_READINESS,
  type UiReadiness,
} from "@/lib/domain/source-readiness";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  adapterStatusLabel,
  adapterStatusTone,
  jobStatusLabel,
  jobStatusTone,
  runOutcomeLabel,
  runOutcomeTone,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

function readinessTone(readiness: UiReadiness): StatusTone {
  if (readiness === "Ready") return "success";
  if (readiness === "Partial") return "warning";
  if (readiness === "Blocked" || readiness === "Failed") return "error";
  return "info";
}

export default async function Home() {
  let overview;
  try {
    overview = await getOverviewData();
  } catch (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Overview"
          description="The current state of the property dataset."
          icon={Radio}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const issueCount =
    overview.warnings.length +
    overview.failedPipelineCount +
    (overview.listingsNeedingAttention > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        description="The property dataset at a glance — what is usable, what is running, and what needs attention."
        icon={Radio}
      />

      <section aria-labelledby="current-state-heading">
        <h2 id="current-state-heading" className="sr-only">
          Current state
        </h2>
        <SummaryStrip
          items={[
            {
              label: "All listings",
              value: formatNumber(overview.totalInventory),
              helper: `${formatNumber(overview.activeInventory)} currently active`,
              href: "/listings",
              icon: Building2,
            },
            {
              label: "Public-ready",
              value: formatNumber(overview.publicEligibleInventory),
              helper: "Active, priced, and attributed",
              href: "/listings?publicEligible=eligible",
              icon: Eye,
            },
            {
              label: "Healthy sources",
              value: `${overview.healthySourceCount}/${overview.sourceSummaries.length}`,
              helper:
                overview.activePipelineCount > 0
                  ? `${overview.activePipelineCount} refresh running`
                  : "No refresh is running",
              href: "/sources",
              icon: Radio,
            },
            {
              label: "Needs attention",
              value: formatNumber(issueCount),
              helper: issueCount ? "Prioritized below" : "No meaningful issues",
              href: issueCount ? "#needs-attention" : undefined,
              icon: AlertTriangle,
            },
          ]}
        />
      </section>

      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section aria-labelledby="source-health-heading">
          <div className="mb-3">
            <h2 id="source-health-heading" className="text-lg font-semibold">
              Source health
            </h2>
            <p className="text-sm text-muted-foreground">
              Current coverage and the latest recorded refresh.
            </p>
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="divide-y px-0">
              {overview.sourceSummaries.map((source) => {
                const config = SOURCE_READINESS.find(
                  (item) => item.sourceKey === source.sourceKey,
                );
                const readiness = config
                  ? displayReadiness(config.readiness)
                  : null;
                return (
                  <Link
                    key={source.id}
                    href={`/sources/${source.sourceKey}`}
                    className="grid min-w-0 gap-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
                  >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {source.displayName ?? source.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(source.listingCount)} listings ·{" "}
                      {formatNumber(source.publicEligibleCount)} public-ready
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {readiness ? (
                      <StatusBadge tone={readinessTone(readiness)}>
                        {readiness}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone={adapterStatusTone(source.adapterStatus)}>
                        {adapterStatusLabel(source.adapterStatus)}
                      </StatusBadge>
                    )}
                    {source.latestRun ? (
                      <>
                        <StatusBadge tone={runOutcomeTone(source.latestRun.outcome)}>
                          {runOutcomeLabel(source.latestRun.outcome)}
                        </StatusBadge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(source.latestRun.startedAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No refresh recorded
                      </span>
                    )}
                  </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <div className="flex min-w-0 flex-col gap-8">
          <section id="needs-attention" aria-labelledby="attention-heading">
            <div className="mb-3">
              <h2 id="attention-heading" className="text-lg font-semibold">
                Needs attention
              </h2>
              <p className="text-sm text-muted-foreground">
                Exceptions that may need a person to act.
              </p>
            </div>
            <Card className="gap-0 py-0">
              <CardContent className="divide-y px-0">
                {overview.warnings.map((warning) => (
                  <Link
                    key={warning.sourceKey}
                    href={`/sources/${encodeURIComponent(warning.sourceKey)}`}
                    className="block px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                  >
                    <span className="font-medium">{warning.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Open source details
                    </span>
                  </Link>
                ))}
                {overview.failedPipelineCount > 0 ? (
                  <Link
                    href="/data-operations"
                    className="block px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                  >
                    <span className="font-medium">
                      {formatNumber(overview.failedPipelineCount)} recent refresh{" "}
                      {overview.failedPipelineCount === 1 ? "failed" : "runs failed"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Review Data Operations
                    </span>
                  </Link>
                ) : null}
                {overview.listingsNeedingAttention > 0 ? (
                  <Link
                    href="/enrichment?view=attention&filter=needs_attention"
                    className="block px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                  >
                    <span className="font-medium">
                      Review {formatNumber(overview.listingsNeedingAttention)}{" "}
                      listings with AI suggestions
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Open Needs attention
                    </span>
                  </Link>
                ) : null}
                {issueCount === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted-foreground">
                    Nothing currently requires attention.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="activity-heading">
            <div className="mb-3">
              <h2 id="activity-heading" className="text-lg font-semibold">
                Recent activity
              </h2>
              <p className="text-sm text-muted-foreground">
                Meaningful refresh outcomes only.
              </p>
            </div>
            <Card className="gap-0 py-0">
              <CardHeader className="sr-only">
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Recent property pipeline outcomes.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y px-0">
                {overview.recentPipelineRuns.slice(0, 4).map((run) => (
                  <Link
                    key={run.id}
                    href="/data-operations"
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {run.sourceKeys
                          .map(
                            (sourceKey) =>
                              overview.sourceSummaries.find(
                                (source) => source.sourceKey === sourceKey,
                              )?.displayName ?? sourceKey,
                          )
                          .join(", ") || "Property refresh"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(run.completedAt ?? run.createdAt)}
                      </span>
                    </span>
                    <StatusBadge tone={jobStatusTone(run.status)}>
                      {jobStatusLabel(run.status)}
                    </StatusBadge>
                  </Link>
                ))}
                {overview.recentPipelineRuns.length === 0 ? (
                  <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                    <RefreshCw className="size-4" aria-hidden />
                    No completed refresh activity yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
