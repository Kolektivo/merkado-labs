import type {
  CoordinateQuality,
  NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";

export type ListingSource = {
  id: string;
  name: string;
  baseUrl: string;
};

export type PropertySourceSummary = ListingSource & {
  createdAt: string;
  listingCount: number;
  activeCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type HarvestJobStatus = "active" | "manual" | "planned";

export type HarvestJob = {
  id: string;
  name: string;
  sourceName: string;
  schedule: string;
  cron: string | null;
  timezone: string;
  runner: string;
  workflowPath: string | null;
  pipeline: string[];
  status: HarvestJobStatus;
  notes: string;
};

export type Neighbourhood = {
  id: string;
  name: string;
  slug: string;
};

export type ListingAmenity = {
  code: number;
  label: string | null;
  labelStatus: "mapped" | "unlabeled" | string;
};

export type PropertyListing = {
  id: string;
  propertyAssetId: string | null;
  externalId: string;
  externalIdStatus: "provisional" | "verified" | "rejected";
  sourceUrl: string;
  originalRealtorUrl: string | null;
  originalRealtorName: string | null;
  originalRealtorDomain: string | null;
  originalRealtorExternalId: string | null;
  attributionMethod: string | null;
  attributionObservedAt: string | null;
  listingType: string | null;
  sourceListingStatus: string | null;
  propertyType: string | null;
  title: string | null;
  currentPrice: number | null;
  currency: string | null;
  bedrooms: number | null;
  floorAreaM2: number | null;
  lotAreaValue: number | null;
  lotAreaUnit: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinatesSource: string | null;
  primaryImageUrl: string | null;
  description: string | null;
  street: string | null;
  houseNumber: string | null;
  resort: string | null;
  amenities: ListingAmenity[];
  dataCompletenessScore: number | null;
  unresolvedConflictCount: number;
  status: "active" | "inactive" | "removed" | "unknown";
  observationCount: number;
  priceObservationCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  source: ListingSource;
  neighbourhood: Neighbourhood | null;
  inferredNeighbourhood: Neighbourhood | null;
  neighbourhoodAssignmentStatus: NeighbourhoodAssignmentStatus;
  neighbourhoodAssignmentMethod: string | null;
  neighbourhoodAssignedAt: string | null;
  neighbourhoodAssignmentConfidence: number | null;
  coordinateQuality: CoordinateQuality;
};

export type EnrichmentComparisonStatus =
  | "match"
  | "enrichment"
  | "conflict"
  | "realtor_only"
  | "skipped";

export type EnrichmentObservation = {
  id: string;
  propertyListingId: string;
  adapterName: string;
  adapterVersion: string;
  sourceDomain: string;
  originalUrl: string;
  fieldName: string;
  rawValue: string | null;
  normalizedValue: unknown;
  extractionMethod: string;
  evidenceSelector: string | null;
  evidenceSnippet: string | null;
  comparisonStatus: EnrichmentComparisonStatus;
  chhValue: unknown;
  observedAt: string;
  listingTitle: string | null;
  listingExternalId: string | null;
};

export type RealtorSummary = {
  name: string;
  domain: string | null;
  externalId: string | null;
  listingCount: number;
  activeCount: number;
  withOriginalUrl: number;
  averageCompleteness: number | null;
  missingAttributionCount: number;
};

export type MapListingMarker = {
  id: string;
  title: string | null;
  latitude: number;
  longitude: number;
  listingType: string | null;
  currentPrice: number | null;
  currency: string | null;
  bedrooms: number | null;
  floorAreaM2: number | null;
  primaryImageUrl: string | null;
  sourceName: string;
  sourceUrl: string;
  originalRealtorUrl: string | null;
  originalRealtorName: string | null;
  neighbourhoodName: string | null;
  inferredNeighbourhoodName: string | null;
  neighbourhoodAssignmentStatus: NeighbourhoodAssignmentStatus;
  coordinateQuality: CoordinateQuality;
};

export type PriceObservation = {
  id: string;
  propertyListingId: string;
  observedAt: string;
  price: number;
  currency: string;
};

export type ListingFilters = {
  query: string;
  neighbourhood: string;
  listingType: string;
  currency: string;
  realtor: string;
  amenity: string;
  attribution: string;
  minPrice: number | null;
  maxPrice: number | null;
  coordinateQuality: string;
  assignmentStatus: string;
  sort: ListingSort;
  page: number;
};

export type ListingSort =
  | "recent"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "title";

export type NeighbourhoodSummary = {
  id: string;
  name: string;
  listingCount: number;
  pricedCount: number;
  currency: string | null;
  averagePrice: number | null;
  medianPrice: number | null;
  averagePricePerM2: number | null;
  pricePerM2SampleSize: number;
  hasMixedCurrencies: boolean;
  isSmallSample: boolean;
};

export type GeographicQualitySummary = {
  totalListings: number;
  missingCoords: number;
  invalidCoords: number;
  outsideCuracao: number;
  validCoords: number;
  sourceNeighbourhood: number;
  geographicallyInferred: number;
  sourceGeographyConflict: number;
  outsideKnownPolygons: number;
  matchedSourceAndGeography: number;
};
