import "server-only";

import { cache } from "react";

import type {
  EnrichmentObservation,
  ListingAmenity,
  MapListingMarker,
  PriceObservation,
  PropertyListing,
  PropertySourceSummary,
} from "@/lib/domain/types";
import {
  coordinateQuality,
  hasMappableCoordinates,
  type NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";
import { createReadOnlySupabaseClient } from "@/lib/supabase/client";

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
  "bedrooms",
  "floor_area_m2",
  "lot_area_value",
  "lot_area_unit",
  "latitude",
  "longitude",
  "coordinates_source",
  "primary_image_url",
  "description",
  "street",
  "house_number",
  "resort",
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
  "source:property_sources(id,name,base_url)",
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
  "source:property_sources(name)",
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
    bedrooms: optionalNumber(row.bedrooms),
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
    },
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
  if (!hasMappableCoordinates(latitude, longitude) || longitude === null) {
    return null;
  }
  const source = oneRelation(row.source);
  const neighbourhood = oneRelation(row.neighbourhood);
  const inferred = oneRelation(row.inferred_neighbourhood ?? null);
  return {
    id: String(row.id),
    title: row.title ? String(row.title) : null,
    latitude,
    longitude,
    listingType: row.listing_type ? String(row.listing_type) : null,
    currentPrice: optionalNumber(row.current_price),
    currency: row.currency ? String(row.currency) : null,
    bedrooms: optionalNumber(row.bedrooms),
    floorAreaM2: optionalNumber(row.floor_area_m2),
    primaryImageUrl: row.primary_image_url
      ? String(row.primary_image_url)
      : null,
    sourceName: source?.name ? String(source.name) : "Unknown source",
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
  const client = createReadOnlySupabaseClient();
  const counts = new Map<string, number>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("listing_field_conflicts")
      .select("property_listing_id")
      .eq("resolution_status", "unresolved")
      .range(from, from + pageSize - 1);
    if (error) {
      // Table may be empty or temporarily unavailable; listings still render.
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
  const client = createReadOnlySupabaseClient();
  const pageSize = 1000;
  const rows: RawListing[] = [];
  const conflictCounts = await loadUnresolvedConflictCounts();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("property_listings")
      .select(LISTING_SELECT)
      .order("last_seen_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw publicReadError("Unable to load listings", error.message);
    const page = (data ?? []) as unknown as RawListing[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows.map((row) => normalizeListing(row, conflictCounts));
});

export const getMapListingMarkers = cache(
  async (): Promise<MapListingMarker[]> => {
    const client = createReadOnlySupabaseClient();
    const pageSize = 1000;
    const markers: MapListingMarker[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await client
        .from("property_listings")
        .select(MAP_MARKER_SELECT)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("last_seen_at", { ascending: false })
        .range(from, from + pageSize - 1);

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
  async (listingId: string): Promise<PriceObservation[]> => {
    const client = createReadOnlySupabaseClient();
    const { data, error } = await client
      .from("price_observations")
      .select("id,property_listing_id,observed_at,price,currency")
      .eq("property_listing_id", listingId)
      .order("observed_at", { ascending: true });

    if (error) {
      throw publicReadError("Unable to load price history", error.message);
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      propertyListingId: String(row.property_listing_id),
      observedAt: String(row.observed_at),
      price: Number(row.price),
      currency: String(row.currency),
    }));
  },
);

export const getPriceObservationCount = cache(async (): Promise<number> => {
  const client = createReadOnlySupabaseClient();
  const { count, error } = await client
    .from("price_observations")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw publicReadError(
      "Unable to count price observations",
      error.message,
    );
  }

  return count ?? 0;
});

export const getPropertySources = cache(
  async (): Promise<PropertySourceSummary[]> => {
    const client = createReadOnlySupabaseClient();
    const [{ data: sources, error: sourcesError }, listingStats] =
      await Promise.all([
        client
          .from("property_sources")
          .select("id,name,base_url,created_at")
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
  const client = createReadOnlySupabaseClient();
  const pageSize = 1000;
  const bySourceId = new Map<
    string,
    {
      listingCount: number;
      activeCount: number;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
    }
  >();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("property_listings")
      .select("property_source_id,status,first_seen_at,last_seen_at")
      .range(from, from + pageSize - 1);

    if (error) {
      throw publicReadError("Unable to load source listing stats", error.message);
    }

    const page = data ?? [];
    for (const row of page) {
      const sourceId = String(row.property_source_id);
      const current = bySourceId.get(sourceId) ?? {
        listingCount: 0,
        activeCount: 0,
        firstSeenAt: null as string | null,
        lastSeenAt: null as string | null,
      };
      current.listingCount += 1;
      if (String(row.status) === "active") current.activeCount += 1;
      const firstSeen = row.first_seen_at ? String(row.first_seen_at) : null;
      const lastSeen = row.last_seen_at ? String(row.last_seen_at) : null;
      if (firstSeen && (!current.firstSeenAt || firstSeen < current.firstSeenAt)) {
        current.firstSeenAt = firstSeen;
      }
      if (lastSeen && (!current.lastSeenAt || lastSeen > current.lastSeenAt)) {
        current.lastSeenAt = lastSeen;
      }
      bySourceId.set(sourceId, current);
    }

    if (page.length < pageSize) break;
  }

  return bySourceId;
}

export const getEnrichmentObservations = cache(
  async (): Promise<EnrichmentObservation[]> => {
    const client = createReadOnlySupabaseClient();
    const { data, error } = await client
      .from("listing_enrichment_observations")
      .select(
        [
          "id",
          "property_listing_id",
          "adapter_name",
          "adapter_version",
          "source_domain",
          "original_url",
          "field_name",
          "raw_value",
          "normalized_value",
          "extraction_method",
          "evidence_selector",
          "evidence_snippet",
          "comparison_status",
          "chh_value",
          "observed_at",
          "listing:property_listings(title,external_id)",
        ].join(","),
      )
      .order("observed_at", { ascending: false })
      .limit(500);

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return [];
      }
      throw publicReadError(
        "Unable to load enrichment observations",
        error.message,
      );
    }

    return (data ?? []).map((row) => {
      const record = row as unknown as Record<string, unknown> & {
        listing?: RawRelation;
      };
      const listing = oneRelation(record.listing ?? null);
      return {
        id: String(record.id),
        propertyListingId: String(record.property_listing_id),
        adapterName: String(record.adapter_name),
        adapterVersion: String(record.adapter_version),
        sourceDomain: String(record.source_domain),
        originalUrl: String(record.original_url),
        fieldName: String(record.field_name),
        rawValue: record.raw_value ? String(record.raw_value) : null,
        normalizedValue: record.normalized_value,
        extractionMethod: String(record.extraction_method),
        evidenceSelector: record.evidence_selector
          ? String(record.evidence_selector)
          : null,
        evidenceSnippet: record.evidence_snippet
          ? String(record.evidence_snippet)
          : null,
        comparisonStatus: String(
          record.comparison_status,
        ) as EnrichmentObservation["comparisonStatus"],
        chhValue: record.chh_value,
        observedAt: String(record.observed_at),
        listingTitle: listing?.title ? String(listing.title) : null,
        listingExternalId: listing?.external_id
          ? String(listing.external_id)
          : null,
      };
    });
  },
);

