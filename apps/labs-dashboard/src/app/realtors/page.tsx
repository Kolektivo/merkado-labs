import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Users } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeRealtors } from "@/lib/data/analytics";
import { getAllListings } from "@/lib/data/queries";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Realtors" };

export default async function RealtorsPage() {
  let listings;
  try {
    listings = await getAllListings();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Original realtors"
          description="Agencies behind CaribbeanHouseHunt aggregated listings."
          icon={Users}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const realtors = summarizeRealtors(listings);
  const attributed = listings.filter((item) => item.originalRealtorName).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Original realtors"
        description="CaribbeanHouseHunt is the aggregator. These names are the original agencies attributed on each listing."
        icon={Users}
      />
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <Badge variant="secondary">
          {formatNumber(realtors.length)} realtor groups
        </Badge>
        <Badge variant="outline">
          {formatNumber(attributed)} / {formatNumber(listings.length)} attributed
        </Badge>
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Realtor</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">Listings</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">With URL</TableHead>
                <TableHead className="text-right">Completeness</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {realtors.map((realtor) => (
                <TableRow key={realtor.name}>
                  <TableCell className="font-medium">{realtor.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {realtor.domain ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(realtor.listingCount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(realtor.activeCount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(realtor.withOriginalUrl)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {realtor.averageCompleteness !== null
                      ? `${realtor.averageCompleteness}%`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {realtor.name !== "Missing attribution" ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/listings?realtor=${encodeURIComponent(realtor.name)}`}
                        >
                          <Building2 className="size-3.5" />
                          Listings
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/listings?attribution=missing">
                          Review
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
