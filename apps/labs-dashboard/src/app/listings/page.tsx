import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, SearchX } from "lucide-react";

import { DataError } from "@/components/data-error";
import { ListingFilters } from "@/components/listing-filters";
import { ListingTable } from "@/components/listing-table";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  filterAndSortListings,
  listingFilterOptions,
  parseListingFilters,
} from "@/lib/data/analytics";
import { getAllListings } from "@/lib/data/queries";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listings" };

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  let listings;
  try {
    listings = await getAllListings();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Listings"
          description="Browse every property we have collected."
          icon={Building2}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const filters = parseListingFilters(params);
  const filtered = filterAndSortListings(listings, filters);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(filters.page, totalPages);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const options = listingFilterOptions(listings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listings"
        description="Search and filter properties. Price filters only work when one currency is selected, so numbers stay comparable."
        icon={Building2}
      />
      <Suspense>
        <ListingFilters options={options} />
      </Suspense>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground">
            {formatNumber(filtered.length)}
          </span>{" "}
          of {formatNumber(listings.length)} listings
        </p>
      </div>
      <Card className="gap-0 py-0">
        {pageRows.length ? (
          <>
            <CardContent className="px-0">
              <ListingTable listings={pageRows} />
            </CardContent>
            <Pagination page={page} totalPages={totalPages} params={params} />
          </>
        ) : (
          <CardContent className="py-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No listings match</EmptyTitle>
                <EmptyDescription>
                  Try clearing filters or widening the search.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" asChild>
                  <Link href="/listings">Clear filters</Link>
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
