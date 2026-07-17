import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { DataError } from "@/components/data-error";
import { GeographicQualityPanel } from "@/components/geographic-quality-panel";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getQualitySummary } from "@/lib/data/quality";
import { formatNumber, titleCase } from "@/lib/format";

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
          description="Understand whether the imported property data is usable."
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
        description="Eligibility, lifecycle, missing fields, evidence, and location checks in one place."
        icon={ShieldAlert}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Publicly visible"
          value={formatNumber(quality.publicEligible)}
          hint={`of ${formatNumber(quality.totalListings)} listings`}
          icon={ShieldAlert}
        />
        <MetricCard
          label="Missing price"
          value={formatNumber(quality.missingPrice)}
          hint="Cannot be publicly visible"
          icon={ShieldAlert}
        />
        <MetricCard
          label="Missing coordinates"
          value={formatNumber(quality.missingCoordinates)}
          hint="No map pin"
          icon={ShieldAlert}
        />
        <MetricCard
          label="Unresolved conflicts"
          value={formatNumber(quality.unresolvedConflicts)}
          hint="Field-level review items"
          icon={ShieldAlert}
        />
      </section>

      <Tabs defaultValue="eligibility">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="fields">Missing fields</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
        </TabsList>
        <TabsContent value="eligibility">
          <Card>
            <CardHeader><CardTitle>Public eligibility</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {quality.exclusionCounts.map(([reason, count]) => (
                  <Badge key={reason} variant="outline">
                    {titleCase(reason.replaceAll("_", " "))}: {formatNumber(count)}
                  </Badge>
                ))}
              </div>
              <Link href="/listings?publicEligible=excluded" className="text-sm underline underline-offset-2">
                Inspect excluded listings
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="lifecycle">
          <Card>
            <CardHeader><CardTitle>Lifecycle states</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {quality.lifecycleCounts.map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {titleCase(status)}: {formatNumber(count)}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fields">
          <Card>
            <CardHeader><CardTitle>Important missing fields</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{formatNumber(quality.missingPrice)} listings have no usable asking price.</p>
              <p>{formatNumber(quality.missingCoordinates)} listings have no usable coordinates.</p>
              <p>{formatNumber(quality.unresolvedConflicts)} field conflicts remain unresolved.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="location">
          <GeographicQualityPanel summary={quality.geographic} />
        </TabsContent>
        <TabsContent value="evidence">
          <Card>
            <CardHeader><CardTitle>Evidence availability</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                {formatNumber(
                  quality.totalListings - quality.missingEvidenceChecksum,
                )}{" "}
                listings have a stored source-description checksum.
              </p>
              <p className="text-muted-foreground">
                Raw HTML remains private and is never included in public queries.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
