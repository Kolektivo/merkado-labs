import type {
  GeographicQualitySummary,
  ListingFilters,
  ListingSort,
  MapListingMarker,
  PropertyListing,
} from "@/lib/domain/types";
import { resolveEffectiveNeighbourhood } from "@/lib/domain/effective-neighbourhood";
import { listingHasNeighbourhoodSearchGap } from "@/lib/domain/location-gaps";
import { neighbourhoodKeysMatch } from "@/lib/domain/neighbourhood-aliases";
import {
  ASSIGNMENT_STATUS_LABELS,
  COORDINATE_QUALITY_LABELS,
  hasMappableCoordinates,
  type NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";
import { matchesSynonymSearch } from "@/lib/search/synonyms";

function listingCanonicalNeighbourhood(listing: {
  neighbourhoodName?: string | null;
  neighbourhood?: { id: string; name: string } | null;
  inferredNeighbourhoodName?: string | null;
  sourceNeighbourhoodText?: string | null;
  inferredNeighbourhood?: { name: string } | null;
}): string | null {
  return resolveEffectiveNeighbourhood({
    sourceName:
      listing.sourceNeighbourhoodText ??
      listing.neighbourhood?.name ??
      listing.neighbourhoodName ??
      null,
    mapName:
      listing.inferredNeighbourhood?.name ??
      listing.inferredNeighbourhoodName ??
      null,
  }).name;
}

function markerCanonicalNeighbourhood(marker: MapListingMarker): string | null {
  return resolveEffectiveNeighbourhood({
    sourceName: marker.sourceNeighbourhoodText ?? marker.neighbourhoodName,
    mapName: marker.inferredNeighbourhoodName,
  }).name;
}

export function parseListingFilters(
  params: Record<string, string | string[] | undefined>,
): ListingFilters {
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  };
  const number = (key: string) => {
    const raw = value(key).trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const allowedSorts: ListingSort[] = [
    "recent",
    "oldest",
    "price-asc",
    "price-desc",
    "title",
  ];
  const requestedSort = value("sort") as ListingSort;

  return {
    query: value("q").trim(),
    source: value("source"),
    neighbourhood: value("neighbourhood"),
    listingType: value("type"),
    currency: value("currency"),
    realtor: value("realtor"),
    amenity: value("amenity"),
    attribution: value("attribution"),
    enrichmentStatus: value("enrichment"),
    lifecycle: value("lifecycle"),
    minPrice: number("minPrice"),
    maxPrice: number("maxPrice"),
    coordinateQuality: value("coordQuality"),
    assignmentStatus: value("assignment"),
    locationGap: value("locationGap"),
    publicEligible: value("publicEligible"),
    exclusionReason: value("exclusion"),
    priceAvailability: value("priceAvailability"),
    sort: allowedSorts.includes(requestedSort) ? requestedSort : "recent",
    page: Math.max(1, Math.floor(number("page") ?? 1)),
  };
}

function matchesSharedFilters(
  listing: {
    title: string | null;
    externalId?: string;
    neighbourhoodName?: string | null;
    neighbourhood?: { id: string; name: string } | null;
    inferredNeighbourhoodName?: string | null;
    listingType: string | null;
    currency: string | null;
    currentPrice: number | null;
    originalPrice?: number | null;
    coordinateQuality: string;
    neighbourhoodAssignmentStatus: string;
    sourceNeighbourhoodText?: string | null;
    inferredNeighbourhood?: { name: string } | null;
    originalRealtorName?: string | null;
    amenities?: { label: string | null }[];
    attributionMethod?: string | null;
    unresolvedConflictCount?: number;
    enrichmentStatus?: string | null;
    status?: string | null;
    firstObservedSoldAt?: string | null;
    firstObservedRentedAt?: string | null;
    firstObservedUnderContractAt?: string | null;
    publicEligible?: boolean;
    publicExclusionReason?: string | null;
    sourceKey?: string | null;
  },
  filters: ListingFilters,
) {
  const query = filters.query;
  const neighbourhoodName =
    listing.neighbourhood?.name ?? listing.neighbourhoodName ?? "";
  const inferredName = listing.inferredNeighbourhoodName ?? "";
  const realtorName = listing.originalRealtorName ?? "";
  // Synonym-aware text match so Dutch queries (e.g. gemeubileerd) hit English copy.
  const matchesQuery =
    !query ||
    matchesSynonymSearch(
      [
        listing.title,
        listing.externalId,
        neighbourhoodName,
        inferredName,
        realtorName,
        listing.listingType,
        listing.sourceKey,
      ],
      query,
    );
  const matchesNeighbourhood =
    !filters.neighbourhood ||
    neighbourhoodKeysMatch(
      listingCanonicalNeighbourhood(listing),
      filters.neighbourhood,
    );
  const matchesType =
    !filters.listingType || listing.listingType === filters.listingType;
  const matchesSource =
    !filters.source || listing.sourceKey === filters.source;
  const matchesCurrency =
    !filters.currency || listing.currency === filters.currency;
  const matchesRealtor =
    !filters.realtor || listing.originalRealtorName === filters.realtor;
  const matchesAmenity =
    !filters.amenity ||
    (listing.amenities ?? []).some(
      (amenity) => amenity.label === filters.amenity,
    );
  const matchesAttribution =
    !filters.attribution ||
    (filters.attribution === "attributed" &&
      Boolean(listing.originalRealtorName)) ||
    (filters.attribution === "missing" && !listing.originalRealtorName) ||
    (filters.attribution === "conflicts" &&
      (listing.unresolvedConflictCount ?? 0) > 0);
  const enrichment = listing.enrichmentStatus ?? "not_run";
  const matchesEnrichment =
    !filters.enrichmentStatus || enrichment === filters.enrichmentStatus;
  const matchesLifecycle =
    !filters.lifecycle || listing.status === filters.lifecycle;
  const canApplyPrice =
    filters.minPrice === null && filters.maxPrice === null
      ? true
      : Boolean(filters.currency && listing.currency === filters.currency);
  const matchesMin =
    filters.minPrice === null ||
    (listing.currentPrice !== null &&
      listing.currentPrice >= filters.minPrice);
  const matchesMax =
    filters.maxPrice === null ||
    (listing.currentPrice !== null &&
      listing.currentPrice <= filters.maxPrice);
  const matchesCoordQuality =
    !filters.coordinateQuality ||
    listing.coordinateQuality === filters.coordinateQuality;
  const matchesAssignment =
    !filters.assignmentStatus ||
    listing.neighbourhoodAssignmentStatus === filters.assignmentStatus;
  const matchesLocationGap =
    !filters.locationGap ||
    (filters.locationGap === "missing_neighbourhood" &&
      listingHasNeighbourhoodSearchGap({
        latitude: null,
        longitude: null,
        sourceNeighbourhoodText:
          listing.sourceNeighbourhoodText ?? neighbourhoodName,
        inferredNeighbourhood:
          listing.inferredNeighbourhood ??
          (inferredName ? { name: inferredName } : null),
      }));
  const matchesPublicEligible =
    !filters.publicEligible ||
    (filters.publicEligible === "eligible" && listing.publicEligible === true) ||
    (filters.publicEligible === "excluded" && listing.publicEligible === false);
  const matchesExclusionReason =
    !filters.exclusionReason ||
    listing.publicExclusionReason === filters.exclusionReason;
  const usablePrice = listing.originalPrice ?? listing.currentPrice ?? 0;
  const matchesPriceAvailability =
    !filters.priceAvailability ||
    (filters.priceAvailability === "missing" && usablePrice <= 0) ||
    (filters.priceAvailability === "available" && usablePrice > 0);

  return (
    matchesQuery &&
    matchesNeighbourhood &&
    matchesType &&
    matchesSource &&
    matchesCurrency &&
    matchesRealtor &&
    matchesAmenity &&
    matchesAttribution &&
    matchesEnrichment &&
    matchesLifecycle &&
    canApplyPrice &&
    matchesMin &&
    matchesMax &&
    matchesCoordQuality &&
    matchesAssignment &&
    matchesLocationGap &&
    matchesPublicEligible &&
    matchesExclusionReason &&
    matchesPriceAvailability
  );
}

export function filterAndSortListings(
  listings: PropertyListing[],
  filters: ListingFilters,
) {
  const filtered = listings.filter((listing) =>
    matchesSharedFilters(
      { ...listing, sourceKey: listing.source.sourceKey },
      filters,
    ),
  );
  const sortPrice = (listing: PropertyListing) =>
    filters.currency ? listing.currentPrice : listing.benchmarkPriceXcg;

  return filtered.sort((a, b) => {
    if (filters.sort === "oldest") {
      return a.lastSeenAt.localeCompare(b.lastSeenAt);
    }
    if (filters.sort === "price-asc") {
      return (
        (sortPrice(a) ?? Number.POSITIVE_INFINITY) -
        (sortPrice(b) ?? Number.POSITIVE_INFINITY)
      );
    }
    if (filters.sort === "price-desc") {
      return (
        (sortPrice(b) ?? Number.NEGATIVE_INFINITY) -
        (sortPrice(a) ?? Number.NEGATIVE_INFINITY)
      );
    }
    if (filters.sort === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "");
    }
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

export function filterMapMarkers(
  markers: MapListingMarker[],
  filters: ListingFilters,
) {
  return markers
    .filter((marker) =>
      matchesSharedFilters(
        {
          title: marker.title,
          neighbourhoodName: marker.neighbourhoodName,
          inferredNeighbourhoodName: marker.inferredNeighbourhoodName,
          listingType: marker.listingType,
          currency: marker.currency,
          currentPrice: marker.currentPrice,
          coordinateQuality: marker.coordinateQuality,
          neighbourhoodAssignmentStatus: marker.neighbourhoodAssignmentStatus,
          sourceKey: marker.sourceKey,
        },
        {
          ...filters,
          neighbourhood: "",
        },
      ),
    )
    .filter((marker) => {
      if (!filters.neighbourhood) return true;
      return neighbourhoodKeysMatch(
        markerCanonicalNeighbourhood(marker),
        filters.neighbourhood,
      );
    });
}

export function listingFilterOptions(listings: PropertyListing[]) {
  return {
    sources: Array.from(
      new Map(
        listings
          .filter((item) => item.source.sourceKey)
          .map((item) => [
            item.source.sourceKey as string,
            item.source.displayName ?? item.source.name,
          ]),
      ),
    ).sort((a, b) => a[1].localeCompare(b[1])),
    neighbourhoods: Array.from(
      new Set(
        listings
          .map((item) => listingCanonicalNeighbourhood(item))
          .filter((value): value is string => Boolean(value)),
      ),
    )
      .sort((a, b) => a.localeCompare(b))
      .map((name) => [name, name] as [string, string]),
    listingTypes: Array.from(
      new Set(listings.flatMap((item) => item.listingType ?? [])),
    ).sort(),
    currencies: Array.from(
      new Set(listings.flatMap((item) => item.currency ?? [])),
    ).sort(),
    realtors: Array.from(
      new Set(
        listings
          .map((item) => item.originalRealtorName)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    amenities: Array.from(
      new Set(
        listings.flatMap((item) =>
          item.amenities
            .map((amenity) => amenity.label)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    exclusionReasons: Array.from(
      new Set(
        listings
          .filter((item) => !item.publicEligible)
          .map((item) => item.publicExclusionReason ?? "not_classified"),
      ),
    ).sort(),
    coordinateQualities: Array.from(
      new Set(listings.map((item) => item.coordinateQuality)),
    )
      .sort()
      .map((value) => [value, COORDINATE_QUALITY_LABELS[value]] as const),
    assignmentStatuses: Array.from(
      new Set(listings.map((item) => item.neighbourhoodAssignmentStatus)),
    )
      .sort()
      .map(
        (value) =>
          [
            value,
            ASSIGNMENT_STATUS_LABELS[value as NeighbourhoodAssignmentStatus],
          ] as const,
      ),
  };
}

export function mapFilterOptions(markers: MapListingMarker[]) {
  const neighbourhoodNames = Array.from(
    new Set(
      markers
        .map((marker) => markerCanonicalNeighbourhood(marker))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return {
    neighbourhoods: neighbourhoodNames.map(
      (name) => [name, name] as [string, string],
    ),
    listingTypes: Array.from(
      new Set(markers.flatMap((item) => item.listingType ?? [])),
    ).sort(),
    currencies: Array.from(
      new Set(markers.flatMap((item) => item.currency ?? [])),
    ).sort(),
    coordinateQualities: Array.from(
      new Set(markers.map((item) => item.coordinateQuality)),
    )
      .sort()
      .map((value) => [value, COORDINATE_QUALITY_LABELS[value]] as const),
    assignmentStatuses: Array.from(
      new Set(markers.map((item) => item.neighbourhoodAssignmentStatus)),
    )
      .sort()
      .map(
        (value) =>
          [
            value,
            ASSIGNMENT_STATUS_LABELS[value as NeighbourhoodAssignmentStatus],
          ] as const,
      ),
  };
}

export function summarizeGeographicQuality(
  listings: PropertyListing[],
): GeographicQualitySummary {
  return {
    totalListings: listings.length,
    missingCoords: listings.filter(
      (item) => item.coordinateQuality === "missing_coords",
    ).length,
    invalidCoords: listings.filter(
      (item) => item.coordinateQuality === "invalid_coords",
    ).length,
    outsideCuracao: listings.filter(
      (item) => item.coordinateQuality === "outside_curacao",
    ).length,
    validCoords: listings.filter((item) =>
      hasMappableCoordinates(item.latitude, item.longitude),
    ).length,
    missingNeighbourhoodSearch: listings.filter(
      listingHasNeighbourhoodSearchGap,
    ).length,
    sourceNeighbourhood: listings.filter((item) => item.neighbourhood).length,
    geographicallyInferred: listings.filter(
      (item) => item.neighbourhoodAssignmentStatus === "inferred",
    ).length,
    sourceGeographyConflict: listings.filter(
      (item) => item.neighbourhoodAssignmentStatus === "conflict",
    ).length,
    outsideKnownPolygons: listings.filter(
      (item) => item.neighbourhoodAssignmentStatus === "outside_polygons",
    ).length,
    matchedSourceAndGeography: listings.filter(
      (item) => item.neighbourhoodAssignmentStatus === "matched",
    ).length,
  };
}

