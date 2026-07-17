import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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
import {
  adapterStatusLabel,
  adapterStatusTone,
  runOutcomeLabel,
  runOutcomeTone,
  TIPS,
} from "@/lib/ui-labels";

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
        description="How healthy this realtor website looks in Labs — inventory, public readiness, and recent imports."
        icon={Radio}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="All listings"
          value={formatNumber(detail.listingCount)}
          hint={`${formatNumber(detail.activeCount)} still active`}
          icon={Radio}
          href={`/listings?source=${encodeURIComponent(source.sourceKey ?? "")}`}
        />
        <MetricCard
          label="OK to show publicly"
          value={formatNumber(detail.publicEligibleCount)}
          hint="Active, priced, realtor named"
          icon={Radio}
          tip={TIPS.publiclyVisible.tip}
          tipLabel={TIPS.publiclyVisible.label}
        />
        <MetricCard
          label="Missing prices"
          value={formatNumber(detail.missingPriceCount)}
          hint="Hidden from public browse"
          icon={Radio}
          tip={TIPS.missingPrice.tip}
          tipLabel={TIPS.missingPrice.label}
        />
        <MetricCard
          label="Import runs"
          value={formatNumber(runs.length)}
          hint={
            runs[0]
              ? `Latest: ${runOutcomeLabel(runs[0].outcome)}`
              : "No imports yet"
          }
          icon={Radio}
          tip={TIPS.sourceRuns.tip}
          tipLabel={TIPS.sourceRuns.label}
        />
      </section>

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Imports</TabsTrigger>
          <TabsTrigger value="quality">Data quality</TabsTrigger>
          <TabsTrigger value="configuration">Setup</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Health summary</CardTitle>
              <CardDescription>
                Automatic daily updates stay off until this website is explicitly
                approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={adapterStatusTone(source.adapterStatus)}>
                  {adapterStatusLabel(source.adapterStatus)}
                </StatusBadge>
                <Badge variant="secondary">Automatic schedule off</Badge>
              </div>
              <p>{job?.notes ?? "No setup notes are registered yet."}</p>
              <a
                href={source.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block underline underline-offset-2"
              >
                Open realtor website
              </a>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Recent imports</CardTitle>
              <CardDescription>
                Partial imports never mark listings as missing or removed.
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
                        {run.adapterName} v{run.adapterVersion}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(run.startedAt)} ·{" "}
                        {formatNumber(run.discoveredCount)} found ·{" "}
                        {formatNumber(run.parsedCount)} read
                      </p>
                    </div>
                    <StatusBadge tone={runOutcomeTone(run.outcome)}>
                      {runOutcomeLabel(run.outcome)}
                    </StatusBadge>
                  </div>
                ))
              ) : (
                <p className="px-6 py-8 text-sm text-muted-foreground">
                  No imports are recorded for this website yet.
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
              <p>
                {formatNumber(detail.publicEligibleCount)} listings are OK to
                show publicly.
              </p>
              <p>
                {formatNumber(detail.missingPriceCount)} listings are missing a
                usable asking price.
              </p>
              <Link
                href={`/listings?source=${encodeURIComponent(source.sourceKey ?? "")}`}
                className="inline-block underline underline-offset-2"
              >
                Browse this website in Listings
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="configuration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Technical setup
                <HelpTip label="technical setup">
                  Reference details for engineers. Do not start imports without
                  approval and a dry-run review.
                </HelpTip>
              </CardTitle>
              <CardDescription>
                Reference only — for people running imports carefully.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <strong>How it runs:</strong> {job?.runner ?? "Not implemented"}
              </p>
              <p>
                <strong>Schedule:</strong> {job?.schedule ?? "Not scheduled"}
              </p>
              <p>
                <strong>Internal ID:</strong> <code>{source.sourceKey}</code>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
