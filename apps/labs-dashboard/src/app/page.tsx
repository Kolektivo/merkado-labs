import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, Eye, Radio, Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOverviewData } from "@/lib/data/overview";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  adapterStatusLabel,
  adapterStatusTone,
  runOutcomeLabel,
  runOutcomeTone,
  TIPS,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Overview" };

export default async function Home() {
  let overview;
  try {
    overview = await getOverviewData();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Overview"
          description="A simple snapshot of how healthy the property data looks right now."
          icon={Radio}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="How many properties we have, which websites feed them, and what still needs a human look."
        icon={Radio}
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="All properties"
          value={formatNumber(overview.totalInventory)}
          hint={`${formatNumber(overview.activeInventory)} still listed as active`}
          icon={Building2}
          tip={TIPS.totalInventory.tip}
          tipLabel={TIPS.totalInventory.label}
          href="/listings"
        />
        <MetricCard
          label="OK to show publicly"
          value={formatNumber(overview.publicEligibleInventory)}
          hint="Active, priced, and realtor named"
          icon={Eye}
          tip={TIPS.publiclyVisible.tip}
          tipLabel={TIPS.publiclyVisible.label}
          href="/listings?publicEligible=eligible"
        />
        <MetricCard
          label="Realtor websites"
          value={formatNumber(overview.sourceSummaries.length)}
          hint="Automatic updates are currently off"
          icon={Radio}
          tip={TIPS.sources.tip}
          tipLabel={TIPS.sources.label}
          href="/sources"
        />
        <MetricCard
          label="AI waiting for review"
          value={formatNumber(overview.proposalsNeedingReview)}
          hint="Suggestions only — not source facts"
          icon={Sparkles}
          tip={TIPS.aiNeedsReview.tip}
          tipLabel={TIPS.aiNeedsReview.label}
          href="/enrichment"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Website health</CardTitle>
          <CardDescription>
            Listing counts and the latest import for each approved realtor
            website.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {overview.sourceSummaries.map((source) => (
            <Link
              key={source.id}
              href={`/sources/${source.sourceKey}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {source.displayName ?? source.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(source.listingCount)} listings ·{" "}
                  {formatNumber(source.publicEligibleCount)} OK to show publicly
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={adapterStatusTone(source.adapterStatus)}>
                  {adapterStatusLabel(source.adapterStatus)}
                </StatusBadge>
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
                    No import recorded yet
                  </span>
                )}
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4" />
            Needs attention
          </CardTitle>
          <CardDescription>
            Things a person should look at before trusting the data in public
            browse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.warnings.length ? (
            overview.warnings.map((warning) => (
              <p key={warning.sourceKey} className="text-sm">
                {warning.message}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No active website warnings.
            </p>
          )}
          {overview.proposalsNeedingReview > 0 ? (
            <Link
              href="/enrichment"
              className="block text-sm font-medium underline underline-offset-2"
            >
              Review {formatNumber(overview.proposalsNeedingReview)} AI
              suggestions
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
