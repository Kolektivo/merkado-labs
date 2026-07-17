import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, List, MapPinned, SearchX } from "lucide-react";

import { DataError } from "@/components/data-error";
import { ListingFilters } from "@/components/listing-filters";
import { ListingTable } from "@/components/listing-table";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { PropertyMap } from "@/components/property-map";
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
  filterMapMarkers,
  listingFilterOptions,
  parseListingFilters,
} from "@/lib/data/analytics";
import { getAllListings, getMapListingMarkers } from "@/lib/data/queries";
import { formatNumber } from "@/lib/format";
import { getMapBasemapConfig } from "@/lib/geo/basemap";

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
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = requestedView === "map" ? "map" : "list";
  let listings;
  let markers;
  try {
    [listings, markers] = await Promise.all([
      getAllListings(),
      view === "map" ? getMapListingMarkers() : Promise.resolve([]),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Listings"
          description="Browse properties collected from approved realtor websites."
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
  const filteredMarkers = filterMapMarkers(markers, filters);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(filters.page, totalPages);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const options = listingFilterOptions(listings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listings"
        description="Search properties collected from approved realtor websites. Use the ? icons on filters for plain-language explanations."
        icon={Building2}
      />
      <Suspense>
        <ListingFilters key={JSON.stringify(params)} options={options} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground">
            {formatNumber(filtered.length)}
          </span>{" "}
          of {formatNumber(listings.length)} listings
        </p>
        <div className="inline-flex rounded-lg border p-0.5">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href="/listings" aria-current={view === "list" ? "page" : undefined}>
              <List className="size-4" />
              List
            </Link>
          </Button>
          <Button
            variant={view === "map" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link
              href="/listings?view=map"
              aria-current={view === "map" ? "page" : undefined}
            >
              <MapPinned className="size-4" />
              Map
            </Link>
          </Button>
        </div>
      </div>
      {view === "map" ? (
        filteredMarkers.length ? (
          <PropertyMap
            markers={filteredMarkers}
            styleUrl={getMapBasemapConfig().styleUrl}
            attribution={getMapBasemapConfig().attribution}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No listings with usable Curaçao coordinates match these filters.
            </CardContent>
          </Card>
        )
      ) : (
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
                <EmptyTitle>
                  {listings.length === 0
                    ? "No listings imported yet"
                    : "No listings match"}
                </EmptyTitle>
                <EmptyDescription>
                  {listings.length === 0
                    ? "Approved realtor websites are registered. Listings will appear here after the first successful import."
                    : "Try clearing filters or widening the search."}
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
      )}
    </div>
  );
}
