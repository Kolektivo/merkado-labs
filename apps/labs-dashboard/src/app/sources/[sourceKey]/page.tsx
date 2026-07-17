import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getSourceDetail } from "@/lib/data/sources";
import { formatDateTime, formatNumber } from "@/lib/format";

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

export default async function SourceDetailPage({
  params,
}: {
  params: Params;
}) {
  const detail = await getSourceDetail((await params).sourceKey);
  if (!detail) notFound();

  const { source, job, runs } = detail;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/sources">
          <ArrowLeft className="size-4" />
          Back to sources
        </Link>
      </Button>
      <PageHeader
        title={source.displayName ?? source.name}
        description="Adapter maturity, inventory, run history, and known limits for this source."
        icon={Radio}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Inventory"
          value={formatNumber(detail.listingCount)}
          hint={`${formatNumber(detail.activeCount)} active`}
          icon={Radio}
        />
        <MetricCard
          label="Publicly visible"
          value={formatNumber(detail.publicEligibleCount)}
          hint="Eligible safe projection"
          icon={Radio}
        />
        <MetricCard
          label="Missing prices"
          value={formatNumber(detail.missingPriceCount)}
          hint="Excluded from public browse"
          icon={Radio}
        />
        <MetricCard
          label="Recorded runs"
          value={formatNumber(runs.length)}
          hint={runs[0] ? `Latest: ${runs[0].outcome}` : "No runs"}
          icon={Radio}
        />
      </section>

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="quality">Data quality</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Health summary</CardTitle>
              <CardDescription>
                Scheduling is disabled for every source until manual QA is
                explicitly approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {source.adapterStatus ?? "unknown maturity"}
                </Badge>
                <Badge variant="secondary">Schedule disabled</Badge>
              </div>
              <p>{job?.notes ?? "No adapter notes are registered."}</p>
              <a
                href={source.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block underline underline-offset-2"
              >
                Open source website
              </a>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Recent source runs</CardTitle>
              <CardDescription>
                Partial runs never create missing or removed lifecycle events.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y px-0">
              {runs.length ? (
                runs.map((run) => (
                  <div
                    key={run.id}
                    className="grid gap-2 px-6 py-4 text-sm sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium">
                        {run.adapterName}@{run.adapterVersion}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(run.startedAt)} ·{" "}
                        {formatNumber(run.discoveredCount)} discovered ·{" "}
                        {formatNumber(run.parsedCount)} parsed
                      </p>
                    </div>
                    <Badge variant="outline">{run.outcome}</Badge>
                  </div>
                ))
              ) : (
                <p className="px-6 py-8 text-sm text-muted-foreground">
                  No runs are recorded for this source.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="quality">
          <Card>
            <CardHeader>
              <CardTitle>Data quality</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{formatNumber(detail.publicEligibleCount)} listings pass the public eligibility rules.</p>
              <p>{formatNumber(detail.missingPriceCount)} listings are missing a usable asking price.</p>
              <Link
                href={`/listings?source=${encodeURIComponent(source.sourceKey ?? "")}`}
                className="inline-block underline underline-offset-2"
              >
                Inspect this source in Listings
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="configuration">
          <Card>
            <CardHeader>
              <CardTitle>Manual adapter configuration</CardTitle>
              <CardDescription>
                Reference only. Do not run imports without approval and dry-run
                review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Runner:</strong> {job?.runner ?? "Not implemented"}</p>
              <p><strong>Schedule:</strong> {job?.schedule ?? "Not scheduled"}</p>
              <p><strong>Source key:</strong> <code>{source.sourceKey}</code></p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
