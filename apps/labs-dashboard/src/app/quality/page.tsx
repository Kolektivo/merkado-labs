import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, ShieldAlert, TriangleAlert } from "lucide-react";

import { DataError } from "@/components/data-error";
import { GeographicQualityPanel } from "@/components/geographic-quality-panel";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getQualitySummary } from "@/lib/data/quality";
import { formatNumber } from "@/lib/format";
import { exclusionReasonLabel, lifecycleLabel, TIPS } from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data quality" };

type Issue = {
  title: string;
  count: number;
  impact: string;
  action: string;
  href: string;
};

function IssueGroup({
  title,
  description,
  issues,
  icon: Icon,
}: {
  title: string;
  description: string;
  issues: Issue[];
  icon: typeof ShieldAlert;
}) {
  return (
    <section aria-labelledby={`quality-${title.toLowerCase()}-heading`}>
      <div className="mb-3 flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <h2
            id={`quality-${title.toLowerCase()}-heading`}
            className="text-lg font-semibold"
          >
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="divide-y px-0">
          {issues.map((issue) => (
            <div
              key={issue.title}
              className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-medium">{issue.title}</h3>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatNumber(issue.count)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {issue.impact}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={issue.href}>
                  {issue.action}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export default async function QualityPage() {
  let quality;
  try {
    quality = await getQualitySummary();
  } catch (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Data quality"
          description="Issues that affect public data, search quality, or operator trust."
          icon={ShieldAlert}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const hiddenCount = Math.max(
    0,
    quality.totalListings - quality.publicEligible,
  );

  const critical: Issue[] = [
    {
      title: "No usable asking price",
      count: quality.missingPrice,
      impact:
        "These listings cannot be shown publicly and may mislead price-based searches.",
      action: "View affected listings",
      href: "/listings?priceAvailability=missing&from=quality",
    },
    {
      title: "Conflicting property information",
      count: quality.unresolvedConflicts,
      impact: `${formatNumber(
        quality.unresolvedConflictRows,
      )} field disagreements need a person before the data can be trusted.`,
      action: "Review conflicts",
      href: "/listings?attribution=conflicts&from=quality",
    },
  ].filter((issue) => issue.count > 0);

  const important: Issue[] = [
    {
      title: "Missing map coordinates",
      count: quality.missingCoordinates,
      impact:
        "No latitude/longitude — these listings cannot appear on the map. They may still be findable by neighbourhood filter when source or map area text exists.",
      action: "View map gaps",
      href: "/listings?coordQuality=missing_coords&from=quality",
    },
    {
      title: "Missing neighbourhood for search",
      count: quality.missingNeighbourhoodSearch,
      impact:
        "No usable neighbourhood could be found from either the website or the map pin, so filters and search cannot place these listings.",
      action: "View search gaps",
      href: "/listings?locationGap=missing_neighbourhood&from=quality",
    },
  ].filter((issue) => issue.count > 0);

  const informational: Issue[] = [
    {
      title: "Not visible in public preview",
      count: hiddenCount,
      impact:
        "This includes sold, inactive, incomplete, and otherwise intentionally hidden listings. Many require no action.",
      action: "See visibility reasons",
      href: "/listings?publicEligible=excluded&from=quality",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Data quality"
        description="Prioritized issues that affect public data, search quality, or operator trust."
        icon={ShieldAlert}
      />

      <SummaryStrip
        items={[
          {
            label: "Public-ready",
            value: formatNumber(quality.publicEligible),
            helper: `of ${formatNumber(quality.totalListings)} listings`,
            tip: TIPS.publicEligibility.tip,
            tipLabel: TIPS.publicEligibility.label,
            href: "/listings?publicEligible=eligible&from=quality",
            icon: ShieldAlert,
          },
          {
            label: "Critical issues",
            value: formatNumber(
              quality.missingPrice + quality.unresolvedConflicts,
            ),
            helper: "Can affect trust or public display",
            tip: "Listings with no usable asking price or unresolved conflicting information.",
            tipLabel: "critical issues",
            icon: TriangleAlert,
          },
          {
            label: "Map location gaps",
            value: formatNumber(quality.missingCoordinates),
            helper: "Missing lat/lng — cannot appear on the map",
            tip: TIPS.missingCoordinates.tip,
            tipLabel: TIPS.missingCoordinates.label,
            href: "/listings?coordQuality=missing_coords&from=quality",
            icon: Info,
          },
          {
            label: "Neighbourhood search gaps",
            value: formatNumber(quality.missingNeighbourhoodSearch),
            helper: "No canonical area for filter/search",
            tip: TIPS.missingNeighbourhoodSearch.tip,
            tipLabel: TIPS.missingNeighbourhoodSearch.label,
            href: "/listings?locationGap=missing_neighbourhood&from=quality",
            icon: Info,
          },
        ]}
        className="xl:grid-cols-4"
      />

      {critical.length ? (
        <IssueGroup
          title="Critical"
          description="Problems that can affect public data or operator trust."
          issues={critical}
          icon={TriangleAlert}
        />
      ) : null}

      {important.length ? (
        <IssueGroup
          title="Important"
          description="Gaps that reduce search and listing quality."
          issues={important}
          icon={ShieldAlert}
        />
      ) : null}

      <IssueGroup
        title="Informational"
        description="Expected source limitations and normal lifecycle states."
        issues={informational}
        icon={Info}
      />

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          Advanced quality details
        </summary>
        <div className="mt-5 flex flex-col gap-6">
          <section>
            <h3 className="font-medium">Public visibility reasons</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {quality.exclusionCounts.map(([reason, count]) => (
                <Badge key={reason} variant="outline" asChild>
                  <Link
                    href={`/listings?exclusion=${encodeURIComponent(
                      reason,
                    )}&from=quality`}
                  >
                    {exclusionReasonLabel(reason)}: {formatNumber(count)}
                  </Link>
                </Badge>
              ))}
            </div>
          </section>
          <section>
            <h3 className="font-medium">Market status</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {quality.lifecycleCounts.map(([status, count]) => (
                <Badge key={status} variant="outline" asChild>
                  <Link
                    href={`/listings?lifecycle=${encodeURIComponent(
                      status,
                    )}&from=quality`}
                  >
                    {lifecycleLabel(status)}: {formatNumber(count)}
                  </Link>
                </Badge>
              ))}
            </div>
          </section>
          <GeographicQualityPanel summary={quality.geographic} />
          <section className="rounded-lg bg-muted/35 p-4 text-sm">
            <h3 className="font-medium">Source evidence</h3>
            <p className="mt-1 text-muted-foreground">
              {formatNumber(
                quality.totalListings - quality.missingEvidenceChecksum,
              )}{" "}
              listings have a stored fingerprint of the original ad text. Raw
              website HTML remains private.
            </p>
          </section>
        </div>
      </details>
    </div>
  );
}
