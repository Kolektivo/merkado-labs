import type { Metadata } from "next";
import { Building2, Clock3, Eye, MapPinned, TrendingUp } from "lucide-react";

import { DataError } from "@/components/data-error";
import { NeighbourhoodChart } from "@/components/dashboard-charts";
import { ListingTable } from "@/components/listing-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PriceDistributionPanel } from "@/components/price-distribution-panel";
import { SampleNotice } from "@/components/sample-notice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listingsByNeighbourhood,
  xcgPriceDistributionByType,
} from "@/lib/data/analytics";
import {
  getAllListings,
  getPriceObservationCount,
} from "@/lib/data/queries";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Overview" };

export default async function Home() {
  let listings;
  let priceObservationCount;
  try {
    [listings, priceObservationCount] = await Promise.all([
      getAllListings(),
      getPriceObservationCount(),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="A simple snapshot of Curaçao property listings collected in merkado-labs."
          icon={TrendingUp}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const representedNeighbourhoods = new Set(
    listings.flatMap((item) => item.neighbourhood?.id ?? []),
  ).size;
  const multiObservationListings = listings.filter(
    (item) => item.observationCount > 1,
  ).length;
  const neighbourhoodData = listingsByNeighbourhood(listings);
  const distribution = xcgPriceDistributionByType(listings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="See how many properties we have, where they are, and how prices look — all from public listing sites."
        icon={TrendingUp}
      />
      <SampleNotice listingCount={listings.length} />

      <section className="grid min-w-0 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Properties"
          value={formatNumber(listings.length)}
          hint="Ads collected so far"
          icon={Building2}
          tip="Each row is one property advertisement cleaned into a shared format so we can compare sources fairly."
        />
        <MetricCard
          label="Neighbourhoods"
          value={formatNumber(representedNeighbourhoods)}
          hint="Areas present in the data"
          icon={MapPinned}
          tip="Count of distinct neighbourhood names attached to at least one listing."
        />
        <MetricCard
          label="Price checks"
          value={formatNumber(priceObservationCount)}
          hint="Times a price was recorded"
          icon={Clock3}
          tipLabel="price checks"
          tip="Every time a harvest sees a listing, we can store its price. Repeating this over days builds a price history without changing the original ad."
        />
        <MetricCard
          label="Seen again"
          value={formatNumber(multiObservationListings)}
          hint="Found on more than one harvest"
          icon={Eye}
          tip="Useful for spotting listings that stay on the market. One harvest = one pass over the website."
        />
      </section>

      <section className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
        <Card className="flex h-full min-w-0 flex-col">
          <CardHeader>
            <CardTitle>Where listings are</CardTitle>
            <CardDescription>
              Neighbourhoods with the most ads. Smaller areas are grouped as
              “Other”.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
            <NeighbourhoodChart data={neighbourhoodData} />
          </CardContent>
        </Card>
        <div className="min-w-0">
          <PriceDistributionPanel
            sale={distribution.sale}
            rent={distribution.rent}
          />
        </div>
      </section>

      <Card className="min-w-0 gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b">
          <CardTitle>Recently seen</CardTitle>
          <CardDescription>
            The latest properties our harvest picked up, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ListingTable listings={listings.slice(0, 8)} />
        </CardContent>
      </Card>
    </div>
  );
}
