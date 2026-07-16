import type { Metadata } from "next";
import { AlertTriangle, MapPinned } from "lucide-react";

import { DataError } from "@/components/data-error";
import { HelpTip } from "@/components/help-tip";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeNeighbourhoods } from "@/lib/data/analytics";
import { getAllListings } from "@/lib/data/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Neighbourhoods" };

export default async function NeighbourhoodsPage() {
  let listings;
  try {
    listings = await getAllListings();
  } catch (error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Neighbourhoods"
          description="Average prices and coverage by area."
          icon={MapPinned}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const summaries = summarizeNeighbourhoods(listings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Neighbourhoods"
        description="How many listings each area has, and typical prices when we have enough clean numbers to trust them."
        icon={MapPinned}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent>
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Areas with listings
              <HelpTip label="areas with listings">
                Neighbourhoods that appear on at least one property in
                merkado-labs.
              </HelpTip>
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
              {formatNumber(summaries.length)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Missing a neighbourhood
              <HelpTip label="missing a neighbourhood">
                The ad did not name an area, or we have not matched it yet.
              </HelpTip>
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
              {formatNumber(
                listings.filter((listing) => !listing.neighbourhood).length,
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden py-0">
        <CardContent className="min-w-0 px-0">
          <div className="min-w-0 overflow-x-auto">
            <Table className="min-w-[640px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[190px]">Neighbourhood</TableHead>
                  <TableHead className="text-right">Listings</TableHead>
                  <TableHead className="text-right">Average price</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      Median price
                      <HelpTip label="median price">
                        The middle price when listings are sorted — less skewed
                        by a few very expensive homes than a plain average.
                      </HelpTip>
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Average price / m²</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => (
                  <TableRow key={summary.id}>
                    <TableCell className="font-medium">
                      {summary.name}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(summary.listingCount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono">
                      {formatCurrency(
                        summary.averagePrice,
                        summary.currency,
                        true,
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono">
                      {formatCurrency(
                        summary.medianPrice,
                        summary.currency,
                        true,
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono">
                      {summary.averagePricePerM2 !== null
                        ? `${formatCurrency(
                            summary.averagePricePerM2,
                            summary.currency,
                          )}/m²`
                        : "Not enough data"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {summary.isSmallSample ? (
                          <Badge
                            variant="outline"
                            className="border-neutral-400/50 bg-neutral-100 text-neutral-700"
                          >
                            <AlertTriangle className="size-3" />
                            Small sample
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {formatNumber(summary.pricedCount)} with price
                          </Badge>
                        )}
                        {summary.hasMixedCurrencies ? (
                          <Badge variant="outline">
                            {summary.currency} only
                          </Badge>
                        ) : null}
                        {summary.pricePerM2SampleSize > 0 &&
                        summary.averagePricePerM2 === null ? (
                          <Badge variant="outline">
                            Need more size data
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
