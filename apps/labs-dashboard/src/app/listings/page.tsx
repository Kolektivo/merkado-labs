import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  listingFilterOptions,
  parseListingFilters,
} from "@/lib/data/analytics";
import { getAllListings, getMapListingMarkers } from "@/lib/data/queries";
import { formatNumber } from "@/lib/format";
import { getMapBasemapConfig } from "@/lib/geo/basemap";
import { listingsHref } from "@/lib/listings-url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listings" };

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function listingDetailContext(
  params: Record<string, string | string[] | undefined>,
  filters: ReturnType<typeof parseListingFilters>,
) {
  const rawFrom = Array.isArray(params.from) ? params.from[0] : params.from;
  const from =
    rawFrom === "quality" || rawFrom === "sources" ? rawFrom : undefined;
  return {
    from,
    fromId: from === "sources" ? filters.source || undefined : undefined,
    returnTo: listingsHref(params),
  };
}

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
  const filteredIds = new Set(filtered.map((listing) => listing.id));
  const filteredMarkers = markers.filter((marker) => filteredIds.has(marker.id));
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(filters.page, totalPages);
  if (page !== filters.page) {
    redirect(
      listingsHref(params, {
        page: page === 1 ? null : String(page),
      }),
    );
  }
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const options = listingFilterOptions(listings);
  const detailContext = listingDetailContext(params, filters);
  const hasActiveFilters = Boolean(
    filters.query ||
      filters.source ||
      filters.neighbourhood ||
      filters.listingType ||
      filters.currency ||
      filters.realtor ||
      filters.amenity ||
      filters.attribution ||
      filters.enrichmentStatus ||
      filters.lifecycle ||
      filters.minPrice !== null ||
      filters.maxPrice !== null ||
      filters.coordinateQuality ||
      filters.assignmentStatus ||
      filters.locationGap ||
      filters.publicEligible ||
      filters.exclusionReason ||
      filters.priceAvailability,
  );
  const listHref = listingsHref(params, { view: null, page: null });
  const mapHref = listingsHref(params, { view: "map", page: null });
  const visibleCount = view === "map" ? filteredMarkers.length : filtered.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Listings"
        description="Find a property, narrow the inventory, or focus on listings that need attention."
        icon={Building2}
      />
      <Suspense>
        <ListingFilters key={JSON.stringify(params)} options={options} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground">
            {formatNumber(visibleCount)}
          </span>{" "}
          {view === "map"
            ? `mapped properties · ${formatNumber(listings.length)} total`
            : `of ${formatNumber(listings.length)} properties`}
        </p>
        <div
          role="group"
          aria-label="Listings view"
          className="inline-flex rounded-lg border p-0.5"
        >
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href={listHref} aria-current={view === "list" ? "page" : undefined}>
              <List data-icon="inline-start" />
              List
            </Link>
          </Button>
          <Button
            variant={view === "map" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link
              href={mapHref}
              aria-current={view === "map" ? "page" : undefined}
            >
              <MapPinned data-icon="inline-start" />
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
            detailContext={detailContext}
          />
        ) : (
          <Card>
            <CardContent className="space-y-3 py-8">
              <p className="text-sm text-muted-foreground">
                No listings with usable Curaçao coordinates match these filters.
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/listings?view=map">Clear filters</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )
      ) : (
      <Card className="gap-0 overflow-hidden py-0">
        {pageRows.length ? (
          <>
            <CardContent className="px-0">
              <ListingTable
                listings={pageRows}
                detailContext={detailContext}
              />
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
                {listings.length === 0 ? (
                  <Button variant="outline" asChild>
                    <Link href="/sources">Open sources</Link>
                  </Button>
                ) : hasActiveFilters ? (
                  <Button variant="outline" asChild>
                    <Link href="/listings">Clear filters</Link>
                  </Button>
                ) : null}
              </EmptyContent>
            </Empty>
          </CardContent>
        )}
      </Card>
      )}
    </div>
  );
}
