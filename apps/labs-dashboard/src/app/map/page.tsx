import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPinned } from "lucide-react";

import { DataError } from "@/components/data-error";
import { GeographicQualityPanel } from "@/components/geographic-quality-panel";
import { ListingFilters } from "@/components/listing-filters";
import { PageHeader } from "@/components/page-header";
import { PropertyMap } from "@/components/property-map";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  filterMapMarkers,
  mapFilterOptions,
  parseListingFilters,
  summarizeGeographicQuality,
} from "@/lib/data/analytics";
import { getAllListings, getMapListingMarkers } from "@/lib/data/queries";
import { getMapBasemapConfig } from "@/lib/geo/basemap";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Map" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MapPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  let markers;
  let listings;
  try {
    [markers, listings] = await Promise.all([
      getMapListingMarkers(),
      getAllListings(),
    ]);
  } catch (error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Map"
          description="See listing locations on Curaçao."
          icon={MapPinned}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const filters = parseListingFilters(params);
  const filtered = filterMapMarkers(markers, filters);
  const options = mapFilterOptions(markers);
  const quality = summarizeGeographicQuality(listings);
  const basemap = getMapBasemapConfig();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Map"
        description="Only listings with a usable Curaçao pin appear here. Hover a cluster or pin for details."
        icon={MapPinned}
      />
      <GeographicQualityPanel summary={quality} />
      <Suspense>
        <ListingFilters options={options} basePath="/map" showSort={false} />
      </Suspense>
      {filtered.length ? (
        <PropertyMap
          markers={filtered}
          styleUrl={basemap.styleUrl}
          attribution={basemap.attribution}
        />
      ) : (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinned />
            </EmptyMedia>
            <EmptyTitle>Nothing to show on the map</EmptyTitle>
            <EmptyDescription>
              No listings with valid coordinates match your filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
