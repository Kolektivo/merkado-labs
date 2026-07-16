import type {
  GeographicQualitySummary,
  ListingFilters,
  ListingSort,
  MapListingMarker,
  NeighbourhoodSummary,
  PropertyListing,
} from "@/lib/domain/types";
import {
  ASSIGNMENT_STATUS_LABELS,
  COORDINATE_QUALITY_LABELS,
  hasMappableCoordinates,
  type NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
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
    neighbourhood: value("neighbourhood"),
    listingType: value("type"),
    currency: value("currency"),
    realtor: value("realtor"),
    amenity: value("amenity"),
    attribution: value("attribution"),
    minPrice: number("minPrice"),
    maxPrice: number("maxPrice"),
    coordinateQuality: value("coordQuality"),
    assignmentStatus: value("assignment"),
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
    coordinateQuality: string;
    neighbourhoodAssignmentStatus: string;
    originalRealtorName?: string | null;
    amenities?: { label: string | null }[];
    attributionMethod?: string | null;
    unresolvedConflictCount?: number;
  },
  filters: ListingFilters,
) {
  const query = filters.query.toLocaleLowerCase();
  const neighbourhoodName =
    listing.neighbourhood?.name ?? listing.neighbourhoodName ?? "";
  const inferredName = listing.inferredNeighbourhoodName ?? "";
  const realtorName = listing.originalRealtorName ?? "";
  const matchesQuery =
    !query ||
    listing.title?.toLocaleLowerCase().includes(query) ||
    listing.externalId?.toLocaleLowerCase().includes(query) ||
    neighbourhoodName.toLocaleLowerCase().includes(query) ||
    inferredName.toLocaleLowerCase().includes(query) ||
    realtorName.toLocaleLowerCase().includes(query);
  const matchesNeighbourhood =
    !filters.neighbourhood ||
    listing.neighbourhood?.id === filters.neighbourhood;
  const matchesType =
    !filters.listingType || listing.listingType === filters.listingType;
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

  return (
    matchesQuery &&
    matchesNeighbourhood &&
    matchesType &&
    matchesCurrency &&
    matchesRealtor &&
    matchesAmenity &&
    matchesAttribution &&
    canApplyPrice &&
    matchesMin &&
    matchesMax &&
    matchesCoordQuality &&
    matchesAssignment
  );
}

export function filterAndSortListings(
  listings: PropertyListing[],
  filters: ListingFilters,
) {
  const filtered = listings.filter((listing) =>
    matchesSharedFilters(listing, filters),
  );

  return filtered.sort((a, b) => {
    if (filters.sort === "oldest") {
      return a.lastSeenAt.localeCompare(b.lastSeenAt);
    }
    if (filters.sort === "price-asc") {
      return (
        (a.currentPrice ?? Number.POSITIVE_INFINITY) -
        (b.currentPrice ?? Number.POSITIVE_INFINITY)
      );
    }
    if (filters.sort === "price-desc") {
      return (
        (b.currentPrice ?? Number.NEGATIVE_INFINITY) -
        (a.currentPrice ?? Number.NEGATIVE_INFINITY)
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
        },
        {
          ...filters,
          neighbourhood: "",
        },
      ),
    )
    .filter((marker) => {
      if (!filters.neighbourhood) return true;
      return (
        marker.neighbourhoodName === filters.neighbourhood ||
        marker.inferredNeighbourhoodName === filters.neighbourhood
      );
    });
}

export function listingFilterOptions(listings: PropertyListing[]) {
  return {
    neighbourhoods: Array.from(
      new Map(
        listings
          .filter((item) => item.neighbourhood)
          .map((item) => [item.neighbourhood!.id, item.neighbourhood!.name]),
      ),
    ).sort((a, b) => a[1].localeCompare(b[1])),
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

export function summarizeRealtors(listings: PropertyListing[]) {
  const byName = new Map<
    string,
    {
      name: string;
      domain: string | null;
      externalId: string | null;
      listingCount: number;
      activeCount: number;
      withOriginalUrl: number;
      completenessTotal: number;
      completenessSamples: number;
      missingAttributionCount: number;
    }
  >();

  for (const listing of listings) {
    const name = listing.originalRealtorName?.trim() || "Missing attribution";
    const current = byName.get(name) ?? {
      name,
      domain: listing.originalRealtorDomain,
      externalId: listing.originalRealtorExternalId,
      listingCount: 0,
      activeCount: 0,
      withOriginalUrl: 0,
      completenessTotal: 0,
      completenessSamples: 0,
      missingAttributionCount: 0,
    };
    current.listingCount += 1;
    if (listing.status === "active") current.activeCount += 1;
    if (listing.originalRealtorUrl) current.withOriginalUrl += 1;
    if (!listing.originalRealtorName) current.missingAttributionCount += 1;
    if (listing.dataCompletenessScore !== null) {
      current.completenessTotal += listing.dataCompletenessScore;
      current.completenessSamples += 1;
    }
    if (!current.domain && listing.originalRealtorDomain) {
      current.domain = listing.originalRealtorDomain;
    }
    if (!current.externalId && listing.originalRealtorExternalId) {
      current.externalId = listing.originalRealtorExternalId;
    }
    byName.set(name, current);
  }

  return Array.from(byName.values())
    .map((row) => ({
      name: row.name,
      domain: row.domain,
      externalId: row.externalId,
      listingCount: row.listingCount,
      activeCount: row.activeCount,
      withOriginalUrl: row.withOriginalUrl,
      averageCompleteness:
        row.completenessSamples > 0
          ? Math.round(row.completenessTotal / row.completenessSamples)
          : null,
      missingAttributionCount: row.missingAttributionCount,
    }))
    .sort((a, b) => b.listingCount - a.listingCount || a.name.localeCompare(b.name));
}

export function mapFilterOptions(markers: MapListingMarker[]) {
  const neighbourhoodNames = Array.from(
    new Set(
      markers.flatMap((marker) =>
        [marker.neighbourhoodName, marker.inferredNeighbourhoodName].filter(
          (value): value is string => Boolean(value),
        ),
      ),
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

export function listingsByNeighbourhood(listings: PropertyListing[]) {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    const name = listing.neighbourhood?.name ?? "Unspecified";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count,
  );
  const top = sorted.slice(0, 9);
  const remainder = sorted.slice(9).reduce((sum, item) => sum + item.count, 0);
  return remainder ? [...top, { name: "Other", count: remainder }] : top;
}

const RENT_XCG_BUCKETS = [
  { label: "< 1K", maxExclusive: 1_000 },
  { label: "1K–2K", maxExclusive: 2_000 },
  { label: "2K–3K", maxExclusive: 3_000 },
  { label: "3K–5K", maxExclusive: 5_000 },
  { label: "5K–10K", maxExclusive: 10_000 },
  { label: "10K–15K", maxExclusive: 15_000 },
  { label: "15K+", maxExclusive: null },
] as const;

const SALE_XCG_BUCKETS = [
  { label: "100K–250K", maxExclusive: 250_000 },
  { label: "250K–500K", maxExclusive: 500_000 },
  { label: "500K–750K", maxExclusive: 750_000 },
  { label: "750K–1M", maxExclusive: 1_000_000 },
  { label: "1M–2M", maxExclusive: 2_000_000 },
  { label: "2M–5M", maxExclusive: 5_000_000 },
  { label: "5M+", maxExclusive: null },
] as const;

type PriceBucketDefinition = {
  label: string;
  maxExclusive: number | null;
};

function priceDistribution(
  listings: PropertyListing[],
  listingType: string,
  bucketDefinitions: readonly PriceBucketDefinition[],
) {
  const prices = listings
    .filter(
      (item) =>
        item.listingType === listingType &&
        item.currency === "XCG" &&
        item.currentPrice !== null &&
        item.currentPrice > 0,
    )
    .map((item) => item.currentPrice as number);
  if (!prices.length) return { sampleSize: 0, buckets: [] };

  const buckets = bucketDefinitions.map(({ label }) => ({ label, count: 0 }));
  for (const price of prices) {
    const index = bucketDefinitions.findIndex(
      ({ maxExclusive }) => maxExclusive === null || price < maxExclusive,
    );
    buckets[index >= 0 ? index : buckets.length - 1].count += 1;
  }
  return { sampleSize: prices.length, buckets };
}

export function xcgPriceDistributionByType(listings: PropertyListing[]) {
  return {
    rent: priceDistribution(listings, "rent", RENT_XCG_BUCKETS),
    sale: priceDistribution(listings, "sale", SALE_XCG_BUCKETS),
  };
}

export function summarizeNeighbourhoods(
  listings: PropertyListing[],
): NeighbourhoodSummary[] {
  const groups = new Map<string, PropertyListing[]>();
  for (const listing of listings) {
    if (!listing.neighbourhood) continue;
    const group = groups.get(listing.neighbourhood.id) ?? [];
    group.push(listing);
    groups.set(listing.neighbourhood.id, group);
  }

  return Array.from(groups, ([id, rows]) => {
    const currencyCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.currency && row.currentPrice !== null && row.currentPrice > 0) {
        currencyCounts.set(
          row.currency,
          (currencyCounts.get(row.currency) ?? 0) + 1,
        );
      }
    }
    const currency =
      (currencyCounts.has("XCG") && "XCG") ||
      Array.from(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      null;
    const pricedRows = currency
      ? rows.filter(
          (row) =>
            row.currency === currency &&
            row.currentPrice !== null &&
            row.currentPrice > 0,
        )
      : [];
    const prices = pricedRows.map((row) => row.currentPrice as number);
    const perM2 = pricedRows
      .filter((row) => row.floorAreaM2 !== null && row.floorAreaM2 > 0)
      .map((row) => (row.currentPrice as number) / (row.floorAreaM2 as number));

    return {
      id,
      name: rows[0].neighbourhood!.name,
      listingCount: rows.length,
      pricedCount: prices.length,
      currency,
      averagePrice: prices.length
        ? prices.reduce((sum, price) => sum + price, 0) / prices.length
        : null,
      medianPrice: prices.length >= 3 ? median(prices) : null,
      averagePricePerM2:
        perM2.length >= 2
          ? perM2.reduce((sum, value) => sum + value, 0) / perM2.length
          : null,
      pricePerM2SampleSize: perM2.length,
      hasMixedCurrencies: currencyCounts.size > 1,
      isSmallSample: prices.length < 3,
    };
  }).sort((a, b) => b.listingCount - a.listingCount);
}
