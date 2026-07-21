import type {
  GeographicQualitySummary,
  ListingFilters,
  ListingSort,
  MapListingMarker,
  NeighbourhoodSummary,
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
