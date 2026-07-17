import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { DataError } from "@/components/data-error";
import { GeographicQualityPanel } from "@/components/geographic-quality-panel";
import { HelpTip } from "@/components/help-tip";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getQualitySummary } from "@/lib/data/quality";
import { formatNumber } from "@/lib/format";
import {
  exclusionReasonLabel,
  lifecycleLabel,
  TIPS,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quality" };

export default async function QualityPage() {
  let quality;
  try {
    quality = await getQualitySummary();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Quality"
          description="A plain check of whether the imported property data is usable."
          icon={ShieldAlert}
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
        title="Quality"
        description="See which listings are ready to show publicly, what’s missing, and where location data needs attention."
        icon={ShieldAlert}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="OK to show publicly"
          value={formatNumber(quality.publicEligible)}
          hint={`of ${formatNumber(quality.totalListings)} total listings`}
          icon={ShieldAlert}
          tip={TIPS.publiclyVisible.tip}
          tipLabel={TIPS.publiclyVisible.label}
          href="/listings?publicEligible=eligible"
        />
        <MetricCard
          label="Missing price"
          value={formatNumber(quality.missingPrice)}
          hint="Cannot be shown publicly"
          icon={ShieldAlert}
          tip={TIPS.missingPrice.tip}
          tipLabel={TIPS.missingPrice.label}
          href="/listings?publicEligible=excluded"
        />
        <MetricCard
          label="Missing map pin"
          value={formatNumber(quality.missingCoordinates)}
          hint="Cannot appear on the map"
          icon={ShieldAlert}
          tip={TIPS.missingCoordinates.tip}
          tipLabel={TIPS.missingCoordinates.label}
          href="/listings?coordQuality=missing_coords"
        />
        <MetricCard
          label="Conflicts to review"
          value={formatNumber(quality.unresolvedConflicts)}
          hint="Disagreements waiting for a person"
          icon={ShieldAlert}
          tip={TIPS.unresolvedConflicts.tip}
          tipLabel={TIPS.unresolvedConflicts.label}
          href="/listings?attribution=conflicts"
        />
      </section>

      <Tabs defaultValue="eligibility">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="eligibility">Public readiness</TabsTrigger>
          <TabsTrigger value="lifecycle">Market status</TabsTrigger>
          <TabsTrigger value="fields">Missing info</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
        </TabsList>
        <TabsContent value="eligibility">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Why listings are hidden from public
                <HelpTip label={TIPS.publicEligibility.label}>
                  {TIPS.publicEligibility.tip}
                </HelpTip>
              </CardTitle>
              <CardDescription>
                Each reason below explains why a listing is not ready for public
                browse yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {quality.exclusionCounts.map(([reason, count]) => (
                  <Badge key={reason} variant="outline">
                    {exclusionReasonLabel(reason)}: {formatNumber(count)}
                  </Badge>
                ))}
              </div>
              <Link
                href="/listings?publicEligible=excluded"
                className="text-sm underline underline-offset-2"
              >
                Browse hidden listings
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="lifecycle">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Market status
                <HelpTip label={TIPS.lifecycle.label}>{TIPS.lifecycle.tip}</HelpTip>
              </CardTitle>
              <CardDescription>
                Where listings are in their life on the market.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {quality.lifecycleCounts.map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {lifecycleLabel(status)}: {formatNumber(count)}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fields">
          <Card>
            <CardHeader>
              <CardTitle>Important missing information</CardTitle>
              <CardDescription>
                Gaps that make listings harder to trust or show.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                {formatNumber(quality.missingPrice)} listings have no usable
                asking price.
              </p>
              <p>
                {formatNumber(quality.missingCoordinates)} listings have no map
                pin.
              </p>
              <p>
                {formatNumber(quality.unresolvedConflicts)} information conflicts
                still need a human decision.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="location">
          <GeographicQualityPanel summary={quality.geographic} />
        </TabsContent>
        <TabsContent value="evidence">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Proof we kept from the original ad
                <HelpTip label={TIPS.evidenceChecksum.label}>
                  {TIPS.evidenceChecksum.tip}
                </HelpTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                {formatNumber(
                  quality.totalListings - quality.missingEvidenceChecksum,
                )}{" "}
                listings have a stored fingerprint of the original ad text.
              </p>
              <p className="text-muted-foreground">
                The original website HTML stays private and is never included in
                public browse queries.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
