import type { Metadata } from "next";
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
import { getPropertySources } from "@/lib/data/queries";
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
  try {
    sources = await getPropertySources();
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
  const freshest = sources
    .map((source) => source.lastSeenAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sources"
        description="The listing websites merkado-labs reads from, plus the automatic jobs that keep data fresh."
        icon={Radio}
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Websites"
          value={formatNumber(sources.length)}
          hint="Listing sites we currently import"
          icon={Radio}
          tip="Each source is one website (for example CaribbeanHouseHunt). New sources appear here after the first successful import."
        />
        <MetricCard
          label="Listings from them"
          value={formatNumber(totalListings)}
          hint="Total properties across all sources"
          icon={Workflow}
        />
        <MetricCard
          label="Auto-updates"
          value={formatNumber(activeJobs.length)}
          hint="Jobs that run on a timer"
          icon={CalendarClock}
          tipLabel="auto-updates"
          tip="These jobs run on GitHub every day (or on another schedule). You can also start them by hand from the Actions tab."
        />
        <MetricCard
          label="Last fresh data"
          value={freshest ? formatRelativeTime(freshest) : "—"}
          hint={freshest ? formatDateTime(freshest) : "Nothing imported yet"}
          icon={TimerReset}
          tipLabel="last fresh data"
          tip="Based on the most recent “last seen” time across listings — a quick signal that a harvest recently succeeded."
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
                <TableHead>Listings</TableHead>
                <TableHead>Still active</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Update schedule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => {
                const jobs = harvestJobsForSource(source.name);
                return (
                  <TableRow key={source.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{source.name}</div>
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
                              {job.schedule}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No automatic job yet
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
            Automatic update jobs
            <HelpTip label="automatic update jobs">
              Also called harvests or cron jobs. GitHub Actions wakes up on a
              schedule, downloads fresh listings, saves a snapshot, then loads
              them into the merkado-labs database.
            </HelpTip>
          </CardTitle>
          <CardDescription>
            When each job runs and what it does. Open GitHub Actions to see past
            runs or failures.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {HARVEST_JOBS.map((job) => {
            const linkedSource = sources.find(
              (source) => source.name === job.sourceName,
            );
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
                      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                        Runs on
                        <HelpTip label="GitHub Actions">
                          GitHub&apos;s free automation for this repo. It runs
                          the Python harvest scripts in the cloud on a schedule.
                        </HelpTip>
                      </dt>
                      <dd className="font-medium">{job.runner}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">When</dt>
                      <dd className="font-medium">{job.schedule}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                        Cron expression
                        <HelpTip label="cron">
                          A short code that means “when to run”.{" "}
                          <span className="font-mono">0 3 * * *</span> means
                          every day at 03:00 UTC.
                        </HelpTip>
                      </dt>
                      <dd className="font-mono text-xs">
                        {job.cron ?? "—"}
                      </dd>
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
                  {job.workflowPath ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {job.workflowPath}
                    </p>
                  ) : null}
                  {linkedSource?.lastSeenAt ? (
                    <p className="text-xs text-muted-foreground">
                      Newest listing seen:{" "}
                      <span className="text-foreground">
                        {formatRelativeTime(linkedSource.lastSeenAt)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
