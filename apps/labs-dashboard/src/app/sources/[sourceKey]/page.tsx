import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Radio } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSourceDetail } from "@/lib/data/sources";
import {
  SOURCE_READINESS,
  displayReadiness,
} from "@/lib/domain/source-readiness";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import { runOutcomeLabel, runOutcomeTone } from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
type Params = Promise<{ sourceKey: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const detail = await getSourceDetail((await params).sourceKey).catch(
    () => null,
  );
  return { title: detail?.source.displayName ?? "Source detail" };
}

function readinessTone(readiness: string): StatusTone {
  if (readiness === "Ready") return "success";
  if (readiness === "Partial") return "warning";
  if (readiness === "Blocked" || readiness === "Failed") return "error";
  if (readiness === "Running" || readiness === "Queued") return "info";
  return "neutral";
}

function coveragePercent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

export default async function SourceDetailPage({
  params,
}: {
  params: Params;
}) {
  const { sourceKey } = await params;
  const detail = await getSourceDetail(sourceKey);
  if (!detail) notFound();

  const { source, job, runs } = detail;
  const latestRun = runs[0] ?? null;
  const latestSuccessfulRun =
    runs.find((run) => run.outcome === "success") ?? null;
  const readiness = SOURCE_READINESS.find(
    (config) => config.sourceKey === sourceKey,
  );
  const uiReadiness = readiness
    ? displayReadiness(readiness.readiness)
    : "Partial";
  const catalogLabel =
    latestRun?.completeCatalog === true
      ? "Complete catalog"
      : latestRun
        ? "Incomplete refresh"
        : "No refresh yet";
  const coverage = [
    ["Prices", detail.coverage.prices],
    ["Descriptions", detail.coverage.descriptions],
    ["Location", detail.coverage.locations],
    ["Coordinates", detail.coverage.coordinates],
    ["Neighbourhoods", detail.coverage.neighbourhoods],
    ["Images", detail.coverage.images],
    ["AI details", detail.coverage.enrichment],
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <Button variant="ghost" asChild className="w-fit">
        <Link href="/sources">
          <ArrowLeft data-icon="inline-start" />
          Back to sources
        </Link>
      </Button>

      <PageHeader
        title={source.displayName ?? source.name}
        description="Current source health, data coverage, and recent refresh outcomes."
        icon={Radio}
        actions={
          <Button asChild>
            <Link
              href={`/listings?source=${encodeURIComponent(sourceKey)}&from=sources`}
            >
              View listings
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />

      <SummaryStrip
        items={[
          {
            label: "Status",
            value: (
              <StatusBadge tone={readinessTone(uiReadiness)}>
                {uiReadiness}
              </StatusBadge>
            ),
            helper: catalogLabel,
            icon: Radio,
          },
          {
            label: "Listings",
            value: formatNumber(detail.listingCount),
            helper: `${formatNumber(detail.activeCount)} currently active`,
            href: `/listings?source=${encodeURIComponent(
              sourceKey,
            )}&from=sources`,
            icon: Radio,
          },
          {
            label: "Public-ready",
            value: formatNumber(detail.publicEligibleCount),
            helper: `${formatNumber(detail.missingPriceCount)} without a usable price`,
            href: `/listings?source=${encodeURIComponent(
              sourceKey,
            )}&publicEligible=eligible&from=sources`,
            icon: Radio,
          },
          {
            label: "Latest successful refresh",
            value: latestSuccessfulRun
              ? formatRelativeTime(latestSuccessfulRun.startedAt)
              : "None",
            helper: latestSuccessfulRun
              ? formatDateTime(latestSuccessfulRun.startedAt)
              : "No successful run recorded",
            icon: Radio,
          },
        ]}
      />

      <section aria-labelledby="source-overview-heading">
        <div className="mb-3">
          <h2 id="source-overview-heading" className="text-lg font-semibold">
            Overview
          </h2>
          <p className="text-sm text-muted-foreground">
            Current blocker or next safe action.
          </p>
        </div>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="font-medium">
                {readiness?.currentIssue
                  ? "This source needs context before the next action."
                  : "No current source issue."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {readiness?.currentIssue ??
                  job?.notes ??
                  "The latest recorded state is ready for normal operator use."}
              </p>
            </div>
            <StatusBadge tone={readinessTone(uiReadiness)}>
              Next: {readiness?.primaryAction ?? "Review"}
            </StatusBadge>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="source-coverage-heading">
        <div className="mb-3">
          <h2 id="source-coverage-heading" className="text-lg font-semibold">
            Data coverage
          </h2>
          <p className="text-sm text-muted-foreground">
            Share of this source&apos;s listings with each useful detail.
          </p>
        </div>
        <Card>
          <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {coverage.map(([label, count]) => {
              const percent = coveragePercent(count, detail.listingCount);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground">
                      {percent}% · {formatNumber(count)}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${label} coverage`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="source-runs-heading">
        <div className="mb-3">
          <h2 id="source-runs-heading" className="text-lg font-semibold">
            Recent runs
          </h2>
          <p className="text-sm text-muted-foreground">
            Recent source refresh history.
          </p>
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="divide-y px-0">
            {runs.length ? (
              runs.slice(0, 8).map((run) => (
                <div
                  key={run.id}
                  className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
                >
                  <div>
                    <p className="font-medium">
                      {run.completeCatalog === true
                        ? "Complete source refresh"
                        : "Incomplete source refresh"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(run.startedAt)} ·{" "}
                      {formatNumber(run.discoveredCount)} found ·{" "}
                      {formatNumber(run.importedCount)} new ·{" "}
                      {formatNumber(run.updatedCount)} updated
                    </p>
                  </div>
                  <StatusBadge tone={runOutcomeTone(run.outcome)}>
                    {runOutcomeLabel(run.outcome)}
                  </StatusBadge>
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No source runs are recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          Technical details
        </summary>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Internal source key</dt>
            <dd className="font-mono">{sourceKey}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Adapter version</dt>
            <dd>{latestRun?.adapterVersion ?? readiness?.adapterVersion ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Collection method</dt>
            <dd>{job?.runner ?? "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd>{job?.schedule ?? "Manual only"}</dd>
          </div>
        </dl>
        <Button variant="outline" size="sm" asChild className="mt-4">
          <a href={source.baseUrl} target="_blank" rel="noreferrer">
            Open source website
            <ExternalLink data-icon="inline-end" />
          </a>
        </Button>
      </details>
    </div>
  );
}
