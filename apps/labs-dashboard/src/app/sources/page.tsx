import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  ExternalLink,
  Radio,
  TimerReset,
  Workflow,
} from "lucide-react";

import { DataError } from "@/components/data-error";
import { HelpTip } from "@/components/help-tip";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import {
  HARVEST_JOBS,
  harvestJobsForSource,
} from "@/lib/data/harvest-catalog";
import { getPropertySources, getSourceRuns } from "@/lib/data/queries";
import type { HarvestJobStatus } from "@/lib/domain/types";
import {
  formatDateTime,
  formatNumber,
  formatRelativeTime,
} from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sources" };

function statusBadgeVariant(
  status: HarvestJobStatus,
): "default" | "secondary" | "outline" {
  if (status === "active") return "default";
  if (status === "manual") return "secondary";
  return "outline";
}

function statusLabel(status: HarvestJobStatus) {
  if (status === "active") return "On schedule";
  if (status === "manual") return "Manual only";
  return "Planned";
}

export default async function SourcesPage() {
  let sources;
  let sourceRuns;
  try {
    [sources, sourceRuns] = await Promise.all([
      getPropertySources(),
      getSourceRuns(),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sources"
          description="Which websites we collect from, and when automatic updates run."
          icon={Radio}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const totalListings = sources.reduce(
    (sum, source) => sum + source.listingCount,
    0,
  );
  const activeJobs = HARVEST_JOBS.filter((job) => job.status === "active");
  const manualJobs = HARVEST_JOBS.filter((job) => job.status === "manual");
  const plannedJobs = HARVEST_JOBS.filter((job) => job.status === "planned");
  const freshest = sources
    .map((source) => source.lastSeenAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sources"
        description="Approved direct realtor sources and adapter run health. Retired sources are excluded."
        icon={Radio}
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Approved sources"
          value={formatNumber(sources.length)}
          hint="Enabled direct sources only"
          icon={Radio}
          tip="Each source is one approved realtor website. Disabled or retired sources are hidden."
        />
        <MetricCard
          label="Current listings"
          value={formatNumber(totalListings)}
          hint="Imported from approved sources"
          icon={Workflow}
        />
        <MetricCard
          label="Adapter jobs"
          value={formatNumber(manualJobs.length + plannedJobs.length)}
          hint={`${formatNumber(manualJobs.length)} manual · ${formatNumber(plannedJobs.length)} planned · ${formatNumber(activeJobs.length)} scheduled`}
          icon={CalendarClock}
          tipLabel="adapter jobs"
          tip="Scheduling stays disabled until each adapter passes QA. RE/MAX is manual-only today."
        />
        <MetricCard
          label="Source runs"
          value={formatNumber(sourceRuns.length)}
          hint={
            freshest
              ? `Last listing activity ${formatRelativeTime(freshest)}`
              : "No successful imports yet"
          }
          icon={TimerReset}
          tipLabel="source runs"
          tip="Health records for manual adapter runs. Empty until the first direct-source run is recorded."
        />
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-6">
          <CardTitle className="flex items-center gap-2">
            Listing websites
            <HelpTip label="listing websites">
              These are the public sites we scrape. Counts below come from the
              cleaned copy stored in merkado-labs — not from hitting the live
              website
              right now.
            </HelpTip>
          </CardTitle>
          <CardDescription>
            How many listings we have from each site, and when we last saw them.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Website</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Listings</TableHead>
                <TableHead>Still active</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Adapter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => {
                const jobs = harvestJobsForSource(
                  source.displayName ?? source.name,
                );
                return (
                  <TableRow key={source.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <Link
                          href={`/sources/${source.sourceKey}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {source.displayName ?? source.name}
                        </Link>
                        <a
                          href={source.baseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {source.baseUrl.replace(/^https?:\/\//, "")}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {source.sourceKey ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {source.adapterStatus ?? "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(source.listingCount)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(source.activeCount)}
                    </TableCell>
                    <TableCell>
                      {source.lastSeenAt ? (
                        <div className="space-y-0.5">
                          <div className="text-sm">
                            {formatRelativeTime(source.lastSeenAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(source.lastSeenAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {jobs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {jobs.map((job) => (
                            <Badge
                              key={job.id}
                              variant={statusBadgeVariant(job.status)}
                            >
                              {statusLabel(job.status)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Planned
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-6">
          <CardTitle className="flex items-center gap-2">
            Adapter catalog
            <HelpTip label="adapter catalog">
              Planned and manual direct-source adapters. Scheduling stays off
              until each source passes fixture and failed-run QA.
            </HelpTip>
          </CardTitle>
          <CardDescription>
            Status of each approved source adapter. No retired aggregator jobs remain.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {HARVEST_JOBS.map((job) => {
            const linkedSource = sources.find((source) => {
              const label = (source.displayName ?? source.name).toLowerCase();
              return (
                label === job.sourceName.toLowerCase() ||
                label.includes(job.sourceName.toLowerCase())
              );
            });
            return (
              <div
                key={job.id}
                className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{job.name}</h3>
                    <Badge variant={statusBadgeVariant(job.status)}>
                      {statusLabel(job.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{job.notes}</p>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Website</dt>
                      <dd className="font-medium">{job.sourceName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Runner</dt>
                      <dd className="font-medium">{job.runner}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">When</dt>
                      <dd className="font-medium">{job.schedule}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Cron</dt>
                      <dd className="font-mono text-xs">{job.cron ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Steps</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
                      {job.pipeline.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  {linkedSource ? (
                    <p className="text-xs text-muted-foreground">
                      Registry listings:{" "}
                      <span className="text-foreground">
                        {formatNumber(linkedSource.listingCount)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-6">
          <CardTitle>Source-run health</CardTitle>
          <CardDescription>
            Recent adapter runs. Complete successful runs become the lifecycle
            baseline; partial/bounded runs never drive removals.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {sourceRuns.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No source runs yet. After a RE/MAX complete import succeeds, outcomes
              and exclusion counts will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Adapter</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Discovered</TableHead>
                  <TableHead>Parsed</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>No-price</TableHead>
                  <TableHead>Warn/Err</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs">
                      {run.sourceKey}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {run.adapterName}@{run.adapterVersion}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{run.outcome}</Badge>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(run.discoveredCount)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(run.parsedCount)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(run.importedCount)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(run.updatedCount)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(run.excludedNoPriceCount)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {formatNumber(run.warningCount)}/{formatNumber(run.errorCount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(run.startedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
