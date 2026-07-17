import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, Eye, Radio, Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
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
import { getOverviewData } from "@/lib/data/overview";
import { formatDateTime, formatNumber } from "@/lib/format";

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
          description="See whether property data is healthy and what needs attention."
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
        description="Current Labs inventory, source health, and work waiting for review."
        icon={Radio}
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total inventory"
          value={formatNumber(overview.totalInventory)}
          hint={`${formatNumber(overview.activeInventory)} active`}
          icon={Building2}
        />
        <MetricCard
          label="Publicly visible"
          value={formatNumber(overview.publicEligibleInventory)}
          hint="Active, priced, attributable"
          icon={Eye}
        />
        <MetricCard
          label="Sources"
          value={formatNumber(overview.sourceSummaries.length)}
          hint="All schedules disabled"
          icon={Radio}
        />
        <MetricCard
          label="AI needs review"
          value={formatNumber(overview.proposalsNeedingReview)}
          hint="Suggestions, not source facts"
          icon={Sparkles}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Source health</CardTitle>
          <CardDescription>
            Inventory and latest recorded manual run for each approved source.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {overview.sourceSummaries.map((source) => (
            <Link
              key={source.id}
              href={`/sources/${source.sourceKey}`}
              className="grid gap-2 px-6 py-4 hover:bg-muted/30 sm:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <p className="font-medium">
                  {source.displayName ?? source.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(source.listingCount)} listings ·{" "}
                  {formatNumber(source.publicEligibleCount)} publicly visible
                </p>
              </div>
              <Badge variant="outline">
                {source.adapterStatus ?? "unknown"}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {source.latestRun
                  ? `${source.latestRun.outcome} · ${formatDateTime(source.latestRun.startedAt)}`
                  : "No recorded run"}
              </p>
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
            Current operational limits, not generic technical metrics.
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
              No active source warnings.
            </p>
          )}
          {overview.proposalsNeedingReview > 0 ? (
            <Link
              href="/enrichment"
              className="block text-sm font-medium underline underline-offset-2"
            >
              Review {formatNumber(overview.proposalsNeedingReview)} AI proposals
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
