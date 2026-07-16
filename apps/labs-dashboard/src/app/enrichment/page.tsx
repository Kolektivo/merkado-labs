import type { Metadata } from "next";
import Link from "next/link";
import { GitCompareArrows } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEnrichmentObservations } from "@/lib/data/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enrichment comparison" };

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  match: "secondary",
  enrichment: "default",
  conflict: "destructive",
  realtor_only: "outline",
  skipped: "outline",
};

export default async function EnrichmentComparisonPage() {
  let observations;
  try {
    observations = await getEnrichmentObservations();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Enrichment comparison"
          description="CHH aggregator values versus controlled original-realtor extraction."
          icon={GitCompareArrows}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const counts = observations.reduce(
    (acc, row) => {
      acc[row.comparisonStatus] = (acc[row.comparisonStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrichment comparison"
        description="Controlled RE/MAX BonBini sample. CaribbeanHouseHunt stays the aggregator; original realtor values are evidence only."
        icon={GitCompareArrows}
      />
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} variant={STATUS_VARIANT[status] ?? "outline"}>
            {status}: {count}
          </Badge>
        ))}
        {!observations.length ? (
          <Badge variant="outline">No enrichment rows yet</Badge>
        ) : null}
      </div>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Field comparisons</CardTitle>
          <CardDescription>
            Match / enrichment / conflict status with adapter version and evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {observations.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Listing</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>CHH</TableHead>
                  <TableHead>Original realtor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Observed</TableHead>
                  <TableHead>Adapter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {observations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-[180px]">
                      <Link
                        href={`/listings/${row.propertyListingId}`}
                        className="font-medium hover:underline"
                      >
                        {row.listingTitle ?? row.listingExternalId ?? row.propertyListingId}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        #{row.listingExternalId}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.fieldName}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">
                      {formatValue(row.chhValue)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {formatValue(row.normalizedValue)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.comparisonStatus] ?? "outline"}>
                        {row.comparisonStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {row.evidenceSnippet ?? row.extractionMethod}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(row.observedAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.adapterName}@{row.adapterVersion}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="space-y-3 p-6 text-sm text-muted-foreground">
              <p>
                Run the controlled sample with{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  --apply
                </code>{" "}
                to populate this view.
              </p>
              <Button variant="outline" asChild>
                <Link href="/realtors">Back to realtors</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
