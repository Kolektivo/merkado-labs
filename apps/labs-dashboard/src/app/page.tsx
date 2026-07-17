import type { Metadata } from "next";
import { Building2, Clock3, Eye, Radio, TrendingUp } from "lucide-react";

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
  getInventorySummary,
} from "@/lib/data/queries";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Overview" };

export default async function Home() {
  let listings;
  let inventory;
  try {
    [listings, inventory] = await Promise.all([
      getAllListings(),
      getInventorySummary(),
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

  const neighbourhoodData = listingsByNeighbourhood(listings);
  const distribution = xcgPriceDistributionByType(listings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Direct-source property inventory for approved Curaçao realtor sites. Retired aggregator data is excluded."
        icon={TrendingUp}
      />
      <SampleNotice
        listingCount={inventory.listingCount}
        approvedSourceCount={inventory.approvedSourceCount}
        publicEligibleCount={inventory.publicEligibleCount}
        empty={inventory.listingCount === 0}
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Approved sources"
          value={formatNumber(inventory.approvedSourceCount)}
          hint={`${formatNumber(inventory.plannedSourceCount)} planned · ${formatNumber(inventory.manualSourceCount)} manual`}
          icon={Radio}
          tip="Enabled direct sources only. Retired sources are hidden from this dashboard."
        />
        <MetricCard
          label="Current listings"
          value={formatNumber(inventory.listingCount)}
          hint={`${formatNumber(inventory.saleCount)} sale · ${formatNumber(inventory.rentCount)} rent`}
          icon={Building2}
          tip="Listings imported from enabled direct sources, split by sale versus rent."
        />
        <MetricCard
          label="Public-eligible"
          value={formatNumber(inventory.publicEligibleCount)}
          hint={`${formatNumber(inventory.pricedActiveCount)} active priced · ${formatNumber(inventory.noPriceCount)} no-price`}
          icon={Eye}
          tip="Active listings with a positive original price on an enabled source."
        />
        <MetricCard
          label="Source runs"
          value={formatNumber(inventory.sourceRunCount)}
          hint={
            inventory.latestSourceRun
              ? `Latest: ${inventory.latestSourceRun.outcome}`
              : "No direct-source runs yet"
          }
          icon={Clock3}
          tip="Health records for manual adapter runs. Scheduling stays off until QA passes."
        />
      </section>

      {listings.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Direct-source ingestion is being rebuilt</CardTitle>
            <CardDescription>
              Approved sources are registered. RE/MAX is the first manual adapter.
              This dashboard will populate after the first successful complete import.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <PriceDistributionPanel {...distribution} />
            <Card>
              <CardHeader>
                <CardTitle>Neighbourhood coverage</CardTitle>
                <CardDescription>
                  Where current approved-source listings sit.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NeighbourhoodChart data={neighbourhoodData} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Recent listings</CardTitle>
            </CardHeader>
            <CardContent>
              <ListingTable listings={listings.slice(0, 10)} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
