import type {
  CoordinateQuality,
  NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";

export type ListingLifecycleStatus =
  | "active"
  | "sold"
  | "missing"
  | "removed"
  | "inactive"
  | "unknown";

export type EnrichmentStatus =
  | "not_run"
  | "queued"
  | "running"
  | "succeeded"
  | "skipped_unchanged"
  | "failed"
  | "needs_review";

export type ConversionMethod =
  | "identity"
  | "legacy_1_to_1"
  | "usd_fixed_peg"
  | "eur_api";

export type PublicExclusionReason =
  | "eligible"
  | "missing_price"
  | "non_positive_price"
  | "not_active"
  | "source_disabled"
  | "missing_attribution"
  | "parser_error"
  | string;

export type ListingSource = {
  id: string;
  name: string;
  baseUrl: string;
  sourceKey?: string | null;
  displayName?: string | null;
  enabled?: boolean;
  adapterStatus?: string | null;
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
  originalPrice: number | null;
  originalCurrency: string | null;
  benchmarkPriceXcg: number | null;
  conversionMethod: ConversionMethod | null;
  conversionRate: number | null;
  conversionProvider: string | null;
  conversionRateAt: string | null;
  currencyInferred: boolean;
  publicEligible: boolean;
  publicExclusionReason: PublicExclusionReason | null;
  sourceListedAt: string | null;
  lastSuccessfullySeenAt: string | null;
  missingSince: string | null;
  soldAt: string | null;
  removedAt: string | null;
  firstObservedSoldAt: string | null;
  firstObservedRentedAt: string | null;
  firstObservedUnderContractAt: string | null;
  sourceStatusDate: string | null;
  enrichmentStatus: EnrichmentStatus | null;
  enrichmentLastInputChecksum: string | null;
  enrichmentLastRunAt: string | null;
  sourceDescriptionChecksum: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  pricePeriod: string | null;
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
  status: ListingLifecycleStatus;
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

export type PublicPropertyListing = {
  id: string;
  externalId: string;
  sourceUrl: string;
  originalRealtorUrl: string | null;
  listingType: string | null;
  sourceListingStatus: string | null;
  propertyType: string | null;
  title: string | null;
  originalPrice: number | null;
  originalCurrency: string | null;
  benchmarkPriceXcg: number | null;
  conversionMethod: ConversionMethod | null;
  conversionProvider: string | null;
  conversionRateAt: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floorAreaM2: number | null;
  lotAreaValue: number | null;
  lotAreaUnit: string | null;
  primaryImageUrl: string | null;
  description: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceListedAt: string | null;
  sourceKey: string;
  sourceDisplayName: string;
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
  priorSourceValue: unknown;
  observedAt: string;
  listingTitle: string | null;
  listingExternalId: string | null;
};

export type AiEnrichmentProposal = {
  id: string;
  propertyListingId: string;
  enrichmentJobId: string | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputChecksum: string;
  status: string;
  proposal: Record<string, unknown>;
  confidence: number | null;
  supportingEvidence: unknown;
  warnings: unknown;
  tokenUsage: unknown;
  apiRequestId: string | null;
  errorMessage: string | null;
  generatedAt: string;
  reviewStatus: AiProposalReviewStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type AiProposalReviewStatus =
  | "unreviewed"
  | "approved_for_research"
  | "rejected"
  | "needs_changes";

export type AiEnrichmentJob = {
  id: string;
  scopeType: string;
  scopeFilter: unknown;
  propertySourceId: string | null;
  requestedBy: string | null;
  status: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  totalListings: number;
  processedCount: number;
  succeededCount: number;
  skippedUnchangedCount: number;
  failedCount: number;
  currentBatch: number | null;
  currentListingId: string | null;
  tokenUsage: unknown;
  errors: unknown;
  summary: unknown;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ListingObservationEvidence = {
  id: string;
  propertyListingId: string;
  observedAt: string;
  sourceSnapshotId: string;
  sourceSha256: string;
  httpStatus: number | null;
  contentType: string | null;
  adapterVersion: string | null;
  evidenceStorageBucket: string | null;
  evidenceStoragePath: string | null;
  sourceDescriptionChecksum: string | null;
  fetchWarnings: unknown;
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
  sourceKey: string | null;
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
  originalPrice?: number | null;
  originalCurrency?: string | null;
  benchmarkPriceXcg?: number | null;
  conversionMethod?: ConversionMethod | null;
  conversionProvider?: string | null;
  conversionRate?: number | null;
  conversionRateAt?: string | null;
  /** How many consecutive identical raw rows were folded into this UI point. */
  suppressedDuplicateCount?: number;
};

export type SourceRunSummary = {
  id: string;
  sourceKey: string;
  adapterName: string;
  adapterVersion: string;
  startedAt: string;
  completedAt: string | null;
  outcome: "success" | "partial" | "failure";
  discoveredCount: number;
  parsedCount: number;
  importedCount: number;
  updatedCount: number;
  excludedNoPriceCount: number;
  warningCount: number;
  errorCount: number;
};

export type ListingActivityEvent = {
  id: string;
  propertyListingId: string;
  eventType: string;
  eventAt: string;
  previousValue: unknown;
  newValue: unknown;
  derivationType: "source_fact" | "system_calculated" | "inferred" | string;
  notes: string | null;
};

export type ListingFilters = {
  query: string;
  source: string;
  neighbourhood: string;
  listingType: string;
  currency: string;
  realtor: string;
  amenity: string;
  attribution: string;
  enrichmentStatus: string;
  lifecycle: string;
  minPrice: number | null;
  maxPrice: number | null;
  coordinateQuality: string;
  assignmentStatus: string;
  publicEligible: string;
  sort: ListingSort;
  page: number;
};

export type PropertySearchRequest = {
  id: string;
  title: string | null;
  status: "draft" | "confirmed" | "paused" | "cancelled" | "archived" | string;
  transactionType: "sale" | "rent" | "either" | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceCurrency: string | null;
  minBedrooms: number | null;
  preferredNeighbourhoods: string[];
  renovationWillingness: string | null;
  notes: string | null;
  intakeSource: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
};

export type MatchReport = {
  id: string;
  propertySearchRequestId: string;
  propertyListingId: string;
  matchScore: number | null;
  hardPass: boolean;
  matchReasons: unknown;
  tradeOffs: unknown;
  scoringVersion: string;
  generatedAt: string;
  listingTitle: string | null;
};

export type MerkadoAgentEntitlement = {
  id: string;
  propertySearchRequestId: string;
  status: string;
  deliveryChannel: string;
  createdAt: string;
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
