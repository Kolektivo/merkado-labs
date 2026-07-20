import "server-only";

import { cache } from "react";

import type {
  AiEnrichmentJob,
  AiEnrichmentProposal,
  EnrichmentObservation,
  ListingAmenity,
  ListingActivityEvent,
  MapListingMarker,
  PriceObservation,
  PropertyListing,
  PropertySearchRequest,
  PropertySourceSummary,
  SourceRunSummary,
  MatchReport,
  MerkadoAgentEntitlement,
} from "@/lib/domain/types";
import {
  coordinateQuality,
  hasMappableCoordinates,
  type NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";
import { createLabsAdminClient } from "@/lib/supabase/admin";

/** Internal Labs reads use service-role; anon cannot SELECT property_listings. */
function createInternalDataClient() {
  return createLabsAdminClient();
}

const SOURCE_EMBED =
  "source:property_sources!inner(id,name,base_url,source_key,display_name,enabled,adapter_status)";

const LISTING_SELECT = [
  "id",
  "property_asset_id",
  "external_id",
  "external_id_status",
  "source_url",
  "original_realtor_url",
  "original_realtor_name",
  "original_realtor_domain",
  "original_realtor_external_id",
  "attribution_method",
  "attribution_observed_at",
  "listing_type",
  "source_listing_status",
  "property_type",
  "title",
  "current_price",
  "currency",
  "original_price",
  "original_currency",
  "benchmark_price_xcg",
  "conversion_method",
  "conversion_rate",
  "conversion_provider",
  "conversion_rate_at",
  "currency_inferred",
  "public_eligible",
  "public_exclusion_reason",
  "source_listed_at",
  "last_successfully_seen_at",
  "missing_since",
  "sold_at",
  "removed_at",
  "first_observed_sold_at",
  "first_observed_rented_at",
  "first_observed_under_contract_at",
  "source_status_date",
  "enrichment_status",
  "enrichment_last_input_checksum",
  "enrichment_last_run_at",
  "source_description_checksum",
  "bedrooms",
  "bathrooms",
  "floor_area_m2",
  "lot_area_value",
  "lot_area_unit",
  "latitude",
  "longitude",
  "coordinates_source",
  "primary_image_url",
  "image_urls",
  "description",
  "street",
  "house_number",
  "resort",
  "source_neighbourhood_text",
  "amenities",
  "data_completeness_score",
  "status",
  "observation_count",
  "price_observation_count",
  "first_seen_at",
  "last_seen_at",
  "neighbourhood_assignment_status",
  "neighbourhood_assignment_method",
  "neighbourhood_assigned_at",
  "neighbourhood_assignment_confidence",
  SOURCE_EMBED,
  "neighbourhood:neighbourhoods!property_listings_neighbourhood_id_fkey(id,name,slug)",
  "inferred_neighbourhood:neighbourhoods!property_listings_inferred_neighbourhood_id_fkey(id,name,slug)",
].join(",");

const MAP_MARKER_SELECT = [
  "id",
  "title",
  "latitude",
  "longitude",
  "listing_type",
  "current_price",
  "currency",
  "bedrooms",
  "floor_area_m2",
  "primary_image_url",
  "source_url",
  "original_realtor_url",
  "original_realtor_name",
  "neighbourhood_assignment_status",
  SOURCE_EMBED,
  "neighbourhood:neighbourhoods!property_listings_neighbourhood_id_fkey(name)",
  "inferred_neighbourhood:neighbourhoods!property_listings_inferred_neighbourhood_id_fkey(name)",
].join(",");

type RawRelation = Record<string, unknown> | Record<string, unknown>[] | null;
type RawListing = Record<string, unknown> & {
  source: RawRelation;
  neighbourhood: RawRelation;
  inferred_neighbourhood?: RawRelation;
};

function publicReadError(context: string, message: string) {
  if (/invalid api key|invalid jwt|jwt expired|unauthorized|authentication/i.test(message)) {
    return new Error(
      "Supabase rejected the configured publishable key. Confirm it belongs to the merkado-labs project and is an anon or publishable key.",
    );
  }
  return new Error(`${context}: ${message}`);
}

function oneRelation(value: RawRelation): Record<string, unknown> | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNeighbourhood(value: RawRelation) {
  const neighbourhood = oneRelation(value);
  if (!neighbourhood) return null;
  return {
    id: String(neighbourhood.id),
    name: String(neighbourhood.name),
    slug: String(neighbourhood.slug),
  };
}

function normalizeAssignmentStatus(value: unknown): NeighbourhoodAssignmentStatus {
  const allowed: NeighbourhoodAssignmentStatus[] = [
    "unprocessed",
    "missing_coords",
    "invalid_coords",
    "outside_curacao",
    "outside_polygons",
    "inferred",
    "matched",
    "conflict",
    "source_only",
  ];
  const status = String(value ?? "unprocessed") as NeighbourhoodAssignmentStatus;
  return allowed.includes(status) ? status : "unprocessed";
}

function normalizeAmenities(value: unknown): ListingAmenity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const code = Number(row.code);
    if (!Number.isFinite(code)) return [];
    return [
      {
        code,
        label: row.label ? String(row.label) : null,
        labelStatus: row.label_status ? String(row.label_status) : "unlabeled",
      },
    ];
  });
}

function extractKeyedAmenityValue(value: unknown, key: string): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (String(row.key) !== key) continue;
    if (row.value === null || row.value === undefined) return null;
    return String(row.value);
  }
  return null;
}

function isActiveSource(source: Record<string, unknown> | null): boolean {
  if (!source) return false;
  const enabled =
    source.enabled === undefined || source.enabled === null
      ? true
      : Boolean(source.enabled);
  const adapterStatus = source.adapter_status
    ? String(source.adapter_status)
    : null;
  return enabled && adapterStatus !== "retired";
}

function applyActiveSourceListingFilter<T>(query: T): T {
  const withEnabled = (query as { eq: (column: string, value: unknown) => T }).eq(
    "source.enabled",
    true,
  );
  return (withEnabled as { neq: (column: string, value: unknown) => T }).neq(
    "source.adapter_status",
    "retired",
  );
}

function normalizeListing(
  row: RawListing,
  conflictCounts: Map<string, number> = new Map(),
): PropertyListing {
  const source = oneRelation(row.source);
  const neighbourhood = normalizeNeighbourhood(row.neighbourhood);
  const inferredNeighbourhood = normalizeNeighbourhood(
    row.inferred_neighbourhood ?? null,
  );
  const latitude = optionalNumber(row.latitude);
  const longitude = optionalNumber(row.longitude);

  if (!source) {
    throw new Error(`Listing ${String(row.id)} is missing its public source.`);
  }

  return {
    id: String(row.id),
    propertyAssetId: row.property_asset_id
      ? String(row.property_asset_id)
      : null,
    externalId: String(row.external_id),
    externalIdStatus: String(
      row.external_id_status,
    ) as PropertyListing["externalIdStatus"],
    sourceUrl: String(row.source_url),
    originalRealtorUrl: row.original_realtor_url
      ? String(row.original_realtor_url)
      : null,
    originalRealtorName: row.original_realtor_name
      ? String(row.original_realtor_name)
      : null,
    originalRealtorDomain: row.original_realtor_domain
      ? String(row.original_realtor_domain)
      : null,
    originalRealtorExternalId: row.original_realtor_external_id
      ? String(row.original_realtor_external_id)
      : null,
    attributionMethod: row.attribution_method
      ? String(row.attribution_method)
      : null,
    attributionObservedAt: row.attribution_observed_at
      ? String(row.attribution_observed_at)
      : null,
    listingType: row.listing_type ? String(row.listing_type) : null,
    sourceListingStatus: row.source_listing_status
      ? String(row.source_listing_status)
      : null,
    propertyType: row.property_type ? String(row.property_type) : null,
    title: row.title ? String(row.title) : null,
    currentPrice: optionalNumber(row.current_price),
    currency: row.currency ? String(row.currency) : null,
    originalPrice: optionalNumber(row.original_price ?? row.current_price),
    originalCurrency: row.original_currency
      ? String(row.original_currency)
      : row.currency
        ? String(row.currency)
        : null,
    benchmarkPriceXcg: optionalNumber(row.benchmark_price_xcg),
    conversionMethod: row.conversion_method
      ? (String(row.conversion_method) as PropertyListing["conversionMethod"])
      : null,
    conversionRate: optionalNumber(row.conversion_rate),
    conversionProvider: row.conversion_provider
      ? String(row.conversion_provider)
      : null,
    conversionRateAt: row.conversion_rate_at
      ? String(row.conversion_rate_at)
      : null,
    currencyInferred: Boolean(row.currency_inferred),
    publicEligible: Boolean(row.public_eligible),
    publicExclusionReason: row.public_exclusion_reason
      ? String(row.public_exclusion_reason)
      : null,
    sourceListedAt: row.source_listed_at ? String(row.source_listed_at) : null,
    lastSuccessfullySeenAt: row.last_successfully_seen_at
      ? String(row.last_successfully_seen_at)
      : null,
    missingSince: row.missing_since ? String(row.missing_since) : null,
    soldAt: row.sold_at ? String(row.sold_at) : null,
    removedAt: row.removed_at ? String(row.removed_at) : null,
    firstObservedSoldAt: row.first_observed_sold_at
      ? String(row.first_observed_sold_at)
      : null,
    firstObservedRentedAt: row.first_observed_rented_at
      ? String(row.first_observed_rented_at)
      : null,
    firstObservedUnderContractAt: row.first_observed_under_contract_at
      ? String(row.first_observed_under_contract_at)
      : null,
    sourceStatusDate: row.source_status_date
      ? String(row.source_status_date)
      : null,
    enrichmentStatus: row.enrichment_status
      ? (String(row.enrichment_status) as PropertyListing["enrichmentStatus"])
      : "not_run",
    enrichmentLastInputChecksum: row.enrichment_last_input_checksum
      ? String(row.enrichment_last_input_checksum)
      : null,
    enrichmentLastRunAt: row.enrichment_last_run_at
      ? String(row.enrichment_last_run_at)
      : null,
    sourceDescriptionChecksum: row.source_description_checksum
      ? String(row.source_description_checksum)
      : null,
    bedrooms: optionalNumber(row.bedrooms),
    bathrooms: optionalNumber(row.bathrooms),
    pricePeriod: extractKeyedAmenityValue(row.amenities, "price_period"),
    floorAreaM2: optionalNumber(row.floor_area_m2),
    lotAreaValue: optionalNumber(row.lot_area_value),
    lotAreaUnit: row.lot_area_unit ? String(row.lot_area_unit) : null,
    latitude,
    longitude,
    coordinatesSource: row.coordinates_source
      ? String(row.coordinates_source)
      : null,
    primaryImageUrl: row.primary_image_url
      ? String(row.primary_image_url)
      : null,
    imageUrls: (() => {
      const urls: string[] = [];
      if (Array.isArray(row.image_urls)) {
        for (const item of row.image_urls) {
          if (typeof item === "string" && item.trim()) urls.push(item.trim());
        }
      }
      if (!urls.length && row.primary_image_url) {
        urls.push(String(row.primary_image_url));
      }
      return [...new Set(urls)];
    })(),
    description: row.description ? String(row.description) : null,
    street: row.street ? String(row.street) : null,
    houseNumber: row.house_number ? String(row.house_number) : null,
    resort: row.resort ? String(row.resort) : null,
    amenities: normalizeAmenities(row.amenities),
    dataCompletenessScore: optionalNumber(row.data_completeness_score),
    unresolvedConflictCount: conflictCounts.get(String(row.id)) ?? 0,
    status: String(row.status) as PropertyListing["status"],
    observationCount: Number(row.observation_count),
    priceObservationCount: Number(row.price_observation_count),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    source: {
      id: String(source.id),
      name: String(source.name),
      baseUrl: String(source.base_url),
      sourceKey: source.source_key ? String(source.source_key) : null,
      displayName: source.display_name ? String(source.display_name) : null,
      enabled:
        source.enabled === undefined || source.enabled === null
          ? true
          : Boolean(source.enabled),
      adapterStatus: source.adapter_status
        ? String(source.adapter_status)
        : null,
    },
    sourceNeighbourhoodText: row.source_neighbourhood_text
      ? String(row.source_neighbourhood_text)
      : null,
    neighbourhood,
    inferredNeighbourhood,
    neighbourhoodAssignmentStatus: normalizeAssignmentStatus(
      row.neighbourhood_assignment_status,
    ),
    neighbourhoodAssignmentMethod: row.neighbourhood_assignment_method
      ? String(row.neighbourhood_assignment_method)
      : null,
    neighbourhoodAssignedAt: row.neighbourhood_assigned_at
      ? String(row.neighbourhood_assigned_at)
      : null,
    neighbourhoodAssignmentConfidence: optionalNumber(
      row.neighbourhood_assignment_confidence,
    ),
    coordinateQuality: coordinateQuality(latitude, longitude),
  };
}

function normalizeMapMarker(row: RawListing): MapListingMarker | null {
  const latitude = optionalNumber(row.latitude);
  const longitude = optionalNumber(row.longitude);
  if (!hasMappableCoordinates(latitude, longitude)) return null;
  const source = oneRelation(row.source);
  if (!isActiveSource(source)) return null;
  const neighbourhood = oneRelation(row.neighbourhood);
  const inferred = oneRelation(row.inferred_neighbourhood ?? null);

  return {
    id: String(row.id),
    title: row.title ? String(row.title) : null,
    latitude: latitude as number,
    longitude: longitude as number,
    listingType: row.listing_type ? String(row.listing_type) : null,
    currentPrice: optionalNumber(row.current_price),
    currency: row.currency ? String(row.currency) : null,
    bedrooms: optionalNumber(row.bedrooms),
    floorAreaM2: optionalNumber(row.floor_area_m2),
    primaryImageUrl: row.primary_image_url
      ? String(row.primary_image_url)
      : null,
    sourceName: source?.display_name
      ? String(source.display_name)
      : source?.name
        ? String(source.name)
        : "Unknown",
    sourceKey: source?.source_key ? String(source.source_key) : null,
    sourceUrl: String(row.source_url),
    originalRealtorUrl: row.original_realtor_url
      ? String(row.original_realtor_url)
      : null,
    originalRealtorName: row.original_realtor_name
      ? String(row.original_realtor_name)
      : null,
    neighbourhoodName: neighbourhood?.name
      ? String(neighbourhood.name)
      : null,
    inferredNeighbourhoodName: inferred?.name ? String(inferred.name) : null,
    neighbourhoodAssignmentStatus: normalizeAssignmentStatus(
      row.neighbourhood_assignment_status,
    ),
    coordinateQuality: coordinateQuality(latitude, longitude),
  };
}

async function loadUnresolvedConflictCounts(): Promise<Map<string, number>> {
  const client = createInternalDataClient();
  const counts = new Map<string, number>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("listing_field_conflicts")
      .select("property_listing_id")
      .eq("resolution_status", "unresolved")
      .range(from, from + pageSize - 1);
    if (error) {
      if (/does not exist|permission denied|schema cache/i.test(error.message)) {
        return counts;
      }
      throw publicReadError("Unable to load source conflicts", error.message);
    }
    const page = data ?? [];
    for (const row of page) {
      const listingId = String(row.property_listing_id);
      counts.set(listingId, (counts.get(listingId) ?? 0) + 1);
    }
    if (page.length < pageSize) break;
  }
  return counts;
}

export const getAllListings = cache(async (): Promise<PropertyListing[]> => {
  const client = createInternalDataClient();
  const pageSize = 1000;
  const rows: RawListing[] = [];
  const conflictCounts = await loadUnresolvedConflictCounts();

  for (let from = 0; ; from += pageSize) {
    const filtered = applyActiveSourceListingFilter(
      client
        .from("property_listings")
        .select(LISTING_SELECT)
        .order("last_seen_at", { ascending: false })
        .range(from, from + pageSize - 1),
    );
    const { data, error } = await filtered;

    if (error) throw publicReadError("Unable to load listings", error.message);
    const page = (data ?? []) as unknown as RawListing[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows
    .map((row) => normalizeListing(row, conflictCounts))
    .filter((listing) => listing.source.enabled !== false && listing.source.adapterStatus !== "retired");
});

export const getMapListingMarkers = cache(
  async (): Promise<MapListingMarker[]> => {
    const client = createInternalDataClient();
    const pageSize = 1000;
    const markers: MapListingMarker[] = [];

    for (let from = 0; ; from += pageSize) {
      const filtered = applyActiveSourceListingFilter(
        client
          .from("property_listings")
          .select(MAP_MARKER_SELECT)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("last_seen_at", { ascending: false })
          .range(from, from + pageSize - 1),
      );
      const { data, error } = await filtered;

      if (error) {
        throw publicReadError("Unable to load map markers", error.message);
      }
      const page = (data ?? []) as unknown as RawListing[];
      for (const row of page) {
        const marker = normalizeMapMarker(row);
        if (marker) markers.push(marker);
      }
      if (page.length < pageSize) break;
    }

    return markers;
  },
);

export const getListingById = cache(async (id: string) => {
  const listings = await getAllListings();
  return listings.find((listing) => listing.id === id) ?? null;
});

export const getPriceObservations = cache(
  async (
    listingId: string,
    options: { collapseUnchanged?: boolean } = {},
  ): Promise<PriceObservation[]> => {
    const listing = await getListingById(listingId);
    if (!listing) return [];

    const client = createInternalDataClient();
    const { data, error } = await client
      .from("price_observations")
      .select(
        "id,property_listing_id,observed_at,price,currency,original_price,original_currency,benchmark_price_xcg,conversion_method,conversion_provider,conversion_rate,conversion_rate_at",
      )
      .eq("property_listing_id", listingId)
      .order("observed_at", { ascending: true });

    if (error) {
      throw publicReadError("Unable to load price history", error.message);
    }

    const { collapseUnchangedPriceObservations } = await import(
      "@/lib/data/price-observations"
    );

    const rows = (data ?? []).map((row) => ({
      id: String(row.id),
      propertyListingId: String(row.property_listing_id),
      observedAt: String(row.observed_at),
      price: Number(row.price),
      currency: String(row.currency),
      originalPrice:
        row.original_price !== null && row.original_price !== undefined
          ? Number(row.original_price)
          : null,
      originalCurrency: row.original_currency
        ? String(row.original_currency)
        : null,
      benchmarkPriceXcg:
        row.benchmark_price_xcg !== null && row.benchmark_price_xcg !== undefined
          ? Number(row.benchmark_price_xcg)
          : null,
      conversionMethod: row.conversion_method
        ? (String(row.conversion_method) as PriceObservation["conversionMethod"])
        : null,
      conversionProvider: row.conversion_provider
        ? String(row.conversion_provider)
        : null,
      conversionRate:
        row.conversion_rate !== null && row.conversion_rate !== undefined
          ? Number(row.conversion_rate)
          : null,
      conversionRateAt: row.conversion_rate_at
        ? String(row.conversion_rate_at)
        : null,
    }));

    // Default UI path collapses identical consecutive asking amounts so
    // pre-fix duplicate immutable rows do not appear as fake price changes.
    if (options.collapseUnchanged === false) {
      return rows;
    }
    return collapseUnchangedPriceObservations(rows) as PriceObservation[];
  },
);

export const getPriceObservationCount = cache(async (): Promise<number> => {
  const listings = await getAllListings();
  return listings.reduce((sum, listing) => sum + listing.priceObservationCount, 0);
});

export const getPropertySources = cache(
  async (): Promise<PropertySourceSummary[]> => {
    const client = createInternalDataClient();
    const [{ data: sources, error: sourcesError }, listingStats] =
      await Promise.all([
        client
          .from("property_sources")
          .select(
            "id,name,base_url,created_at,source_key,display_name,enabled,adapter_status",
          )
          .eq("enabled", true)
          .neq("adapter_status", "retired")
          .order("name", { ascending: true }),
        loadListingStatsBySource(),
      ]);

    if (sourcesError) {
      throw publicReadError("Unable to load sources", sourcesError.message);
    }

    return (sources ?? []).map((row) => {
      const stats = listingStats.get(String(row.id));
      return {
        id: String(row.id),
        name: String(row.name),
        baseUrl: String(row.base_url),
        sourceKey: row.source_key ? String(row.source_key) : null,
        displayName: row.display_name ? String(row.display_name) : null,
        enabled: Boolean(row.enabled),
        adapterStatus: row.adapter_status ? String(row.adapter_status) : null,
        createdAt: String(row.created_at),
        listingCount: stats?.listingCount ?? 0,
        activeCount: stats?.activeCount ?? 0,
        firstSeenAt: stats?.firstSeenAt ?? null,
        lastSeenAt: stats?.lastSeenAt ?? null,
      };
    });
  },
);

async function loadListingStatsBySource() {
  const listings = await getAllListings();
  const bySourceId = new Map<
    string,
    {
      listingCount: number;
      activeCount: number;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
    }
  >();

  for (const listing of listings) {
    const sourceId = listing.source.id;
    const current = bySourceId.get(sourceId) ?? {
      listingCount: 0,
      activeCount: 0,
      firstSeenAt: null as string | null,
      lastSeenAt: null as string | null,
    };
    current.listingCount += 1;
    if (listing.status === "active") current.activeCount += 1;
    if (!current.firstSeenAt || listing.firstSeenAt < current.firstSeenAt) {
      current.firstSeenAt = listing.firstSeenAt;
    }
    if (!current.lastSeenAt || listing.lastSeenAt > current.lastSeenAt) {
      current.lastSeenAt = listing.lastSeenAt;
    }
    bySourceId.set(sourceId, current);
  }

  return bySourceId;
}

export const getSourceRuns = cache(async (): Promise<SourceRunSummary[]> => {
  const client = createInternalDataClient();
  const { data, error } = await client
    .from("property_source_runs")
    .select(
      [
        "id",
        "source_key",
        "adapter_name",
        "adapter_version",
        "started_at",
        "completed_at",
        "outcome",
        "discovered_count",
        "parsed_count",
        "imported_count",
        "updated_count",
        "excluded_no_price_count",
        "warning_count",
        "error_count",
        "metadata",
      ].join(","),
    )
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    throw publicReadError("Unable to load source runs", error.message);
  }

  return (data ?? []).map((row) => {
    const record = row as unknown as Record<string, unknown>;
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : {};
    const completeCatalog =
      typeof metadata.complete_catalog === "boolean"
        ? metadata.complete_catalog
        : null;
    const duplicateRaw = metadata.duplicate_external_ids;
    const duplicateCount =
      typeof duplicateRaw === "number"
        ? duplicateRaw
        : duplicateRaw != null
          ? Number(duplicateRaw)
          : null;
    return {
      id: String(record.id),
      sourceKey: String(record.source_key),
      adapterName: String(record.adapter_name),
      adapterVersion: String(record.adapter_version),
      startedAt: String(record.started_at),
      completedAt: record.completed_at ? String(record.completed_at) : null,
      outcome: String(record.outcome) as SourceRunSummary["outcome"],
      discoveredCount: Number(record.discovered_count ?? 0),
      parsedCount: Number(record.parsed_count ?? 0),
      importedCount: Number(record.imported_count ?? 0),
      updatedCount: Number(record.updated_count ?? 0),
      excludedNoPriceCount: Number(record.excluded_no_price_count ?? 0),
      warningCount: Number(record.warning_count ?? 0),
      errorCount: Number(record.error_count ?? 0),
      completeCatalog,
      duplicateCount:
        duplicateCount != null && Number.isFinite(duplicateCount)
          ? duplicateCount
          : null,
    };
  });
});

export const getListingActivityEvents = cache(
  async (listingId: string): Promise<ListingActivityEvent[]> => {
    const listing = await getListingById(listingId);
    if (!listing) return [];

    const client = createInternalDataClient();
    const { data, error } = await client
      .from("listing_activity_events")
      .select(
        "id,property_listing_id,event_type,event_at,previous_value,new_value,derivation_type,notes",
      )
      .eq("property_listing_id", listingId)
      .order("event_at", { ascending: false })
      .limit(100);

    if (error) {
      throw publicReadError("Unable to load activity events", error.message);
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      propertyListingId: String(row.property_listing_id),
      eventType: String(row.event_type),
      eventAt: String(row.event_at),
      previousValue: row.previous_value,
      newValue: row.new_value,
      derivationType: String(row.derivation_type),
      notes: row.notes ? String(row.notes) : null,
    }));
  },
);

export const getInventorySummary = cache(async () => {
  const [sources, listings, runs] = await Promise.all([
    getPropertySources(),
    getAllListings(),
    getSourceRuns(),
  ]);
  const planned = sources.filter((source) => source.adapterStatus === "recon" || source.adapterStatus === "planned").length;
  const manual = sources.filter((source) => source.adapterStatus === "manual").length;
  const eligible = listings.filter((listing) => listing.publicEligible).length;
  const pricedActive = listings.filter(
    (listing) =>
      listing.status === "active" &&
      (listing.originalPrice ?? listing.currentPrice ?? 0) > 0,
  ).length;
  const saleCount = listings.filter(
    (listing) => listing.listingType === "sale",
  ).length;
  const rentCount = listings.filter(
    (listing) => listing.listingType === "rent",
  ).length;
  const noPriceCount = listings.filter(
    (listing) =>
      listing.publicExclusionReason === "missing_price" ||
      ((listing.originalPrice ?? listing.currentPrice ?? 0) <= 0 &&
        listing.status === "active"),
  ).length;
  return {
    approvedSourceCount: sources.length,
    plannedSourceCount: planned,
    manualSourceCount: manual,
    listingCount: listings.length,
    saleCount,
    rentCount,
    noPriceCount,
    pricedActiveCount: pricedActive,
    publicEligibleCount: eligible,
    excludedCount: Math.max(listings.length - eligible, 0),
    sourceRunCount: runs.length,
    latestSourceRun: runs[0] ?? null,
  };
});

export const getEnrichmentObservations = cache(
  async (): Promise<EnrichmentObservation[]> => {
    // Legacy enrichment rows are retired-source era; default views stay empty
    // until direct-source field comparisons are rebuilt.
    return [];
  },
);

function mapAiEnrichmentProposal(row: Record<string, unknown>): AiEnrichmentProposal {
  return {
    id: String(row.id),
    propertyListingId: String(row.property_listing_id),
    enrichmentJobId: row.enrichment_job_id
      ? String(row.enrichment_job_id)
      : null,
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    schemaVersion: String(row.schema_version),
    inputChecksum: String(row.input_checksum),
    status: String(row.status),
    proposal:
      row.proposal && typeof row.proposal === "object"
        ? (row.proposal as Record<string, unknown>)
        : {},
    confidence: optionalNumber(row.confidence),
    supportingEvidence: row.supporting_evidence,
    warnings: row.warnings,
    tokenUsage: row.token_usage,
    apiRequestId: row.api_request_id ? String(row.api_request_id) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    generatedAt: String(row.generated_at),
    reviewStatus: (row.review_status
      ? String(row.review_status)
      : "unreviewed") as AiEnrichmentProposal["reviewStatus"],
    reviewNotes: row.review_notes ? String(row.review_notes) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
  };
}

const AI_PROPOSAL_SELECT = [
  "id",
  "property_listing_id",
  "enrichment_job_id",
  "model",
  "prompt_version",
  "schema_version",
  "input_checksum",
  "status",
  "proposal",
  "confidence",
  "supporting_evidence",
  "warnings",
  "token_usage",
  "api_request_id",
  "error_message",
  "generated_at",
  "review_status",
  "review_notes",
  "reviewed_at",
  "reviewed_by",
].join(",");

export const getLatestAiEnrichmentProposal = cache(
  async (listingId: string): Promise<AiEnrichmentProposal | null> => {
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("ai_enrichment_proposals")
      .select(AI_PROPOSAL_SELECT)
      .eq("property_listing_id", listingId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw publicReadError("Unable to load AI enrichment proposal", error.message);
    }
    if (!data) return null;

    return mapAiEnrichmentProposal(data as unknown as Record<string, unknown>);
  },
);

export const getAiEnrichmentProposalsForListing = cache(
  async (listingId: string, limit = 12): Promise<AiEnrichmentProposal[]> => {
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("ai_enrichment_proposals")
      .select(AI_PROPOSAL_SELECT)
      .eq("property_listing_id", listingId)
      .order("generated_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw publicReadError("Unable to load AI enrichment history", error.message);
    }

    return (data ?? []).map((row) =>
      mapAiEnrichmentProposal(row as unknown as Record<string, unknown>),
    );
  },
);

export const getRecentAiEnrichmentJobs = cache(
  async (limit = 10): Promise<AiEnrichmentJob[]> => {
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("ai_enrichment_jobs")
      .select(
        [
          "id",
          "scope_type",
          "scope_filter",
          "property_source_id",
          "requested_by",
          "status",
          "model",
          "prompt_version",
          "schema_version",
          "total_listings",
          "processed_count",
          "succeeded_count",
          "skipped_unchanged_count",
          "failed_count",
          "current_batch",
          "current_listing_id",
          "token_usage",
          "errors",
          "summary",
          "created_at",
          "started_at",
          "completed_at",
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw publicReadError("Unable to load enrichment jobs", error.message);
    }

    return (data ?? []).map((row) => {
      const record = row as unknown as Record<string, unknown>;
      return {
        id: String(record.id),
        scopeType: String(record.scope_type),
        scopeFilter: record.scope_filter,
        propertySourceId: record.property_source_id
          ? String(record.property_source_id)
          : null,
        requestedBy: record.requested_by ? String(record.requested_by) : null,
        status: String(record.status),
        model: String(record.model),
        promptVersion: String(record.prompt_version),
        schemaVersion: String(record.schema_version),
        totalListings: Number(record.total_listings ?? 0),
        processedCount: Number(record.processed_count ?? 0),
        succeededCount: Number(record.succeeded_count ?? 0),
        skippedUnchangedCount: Number(record.skipped_unchanged_count ?? 0),
        failedCount: Number(record.failed_count ?? 0),
        currentBatch:
          record.current_batch !== null && record.current_batch !== undefined
            ? Number(record.current_batch)
            : null,
        currentListingId: record.current_listing_id
          ? String(record.current_listing_id)
          : null,
        tokenUsage: record.token_usage,
        errors: record.errors,
        summary: record.summary,
        createdAt: String(record.created_at),
        startedAt: record.started_at ? String(record.started_at) : null,
        completedAt: record.completed_at ? String(record.completed_at) : null,
      };
    });
  },
);

export const getPropertySearchRequests = cache(
  async (): Promise<PropertySearchRequest[]> => {
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("property_search_requests")
      .select("id,title,status,transaction_type,min_price,max_price,price_currency,min_bedrooms,preferred_neighbourhoods,renovation_willingness,notes,intake_source,created_at,updated_at,confirmed_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      throw new Error(`Unable to load search requests: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      title: row.title ? String(row.title) : null,
      status: String(row.status),
      transactionType: row.transaction_type ? String(row.transaction_type) as PropertySearchRequest["transactionType"] : null,
      minPrice: optionalNumber(row.min_price),
      maxPrice: optionalNumber(row.max_price),
      priceCurrency: row.price_currency ? String(row.price_currency) : null,
      minBedrooms: optionalNumber(row.min_bedrooms),
      preferredNeighbourhoods: Array.isArray(row.preferred_neighbourhoods) ? row.preferred_neighbourhoods.map(String) : [],
      renovationWillingness: row.renovation_willingness ? String(row.renovation_willingness) : null,
      notes: row.notes ? String(row.notes) : null,
      intakeSource: row.intake_source ? String(row.intake_source) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    }));
  },
);

export const getMatchReportsForRequest = cache(
  async (requestId: string): Promise<MatchReport[]> => {
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("listing_match_reports")
      .select("id,property_search_request_id,property_listing_id,match_score,hard_pass,match_reasons,trade_offs,scoring_version,generated_at,listing:property_listings(title)")
      .eq("property_search_request_id", requestId)
      .order("match_score", { ascending: false })
      .limit(100);
    if (error) {
      throw new Error(`Unable to load match reports: ${error.message}`);
    }
    return (data ?? []).map((row) => {
      const listing = oneRelation(row.listing as RawRelation);
      return {
        id: String(row.id),
        propertySearchRequestId: String(row.property_search_request_id),
        propertyListingId: String(row.property_listing_id),
        matchScore: optionalNumber(row.match_score),
        hardPass: Boolean(row.hard_pass),
        matchReasons: row.match_reasons,
        tradeOffs: row.trade_offs,
        scoringVersion: String(row.scoring_version),
        generatedAt: String(row.generated_at),
        listingTitle: listing?.title ? String(listing.title) : null,
      };
    });
  },
);

export const getAgentEntitlements = cache(
  async (): Promise<MerkadoAgentEntitlement[]> => {
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("merkado_agent_entitlements")
      .select("id,property_search_request_id,status,delivery_channel,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(`Unable to load agent entitlements: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      propertySearchRequestId: String(row.property_search_request_id),
      status: String(row.status),
      deliveryChannel: String(row.delivery_channel),
      createdAt: String(row.created_at),
    }));
  },
);
