import "server-only";

import { cache } from "react";

import { canonicalizeNeighbourhood } from "@/lib/domain/neighbourhood-aliases";
import {
  normalizePublicAttributes,
  PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS,
  type PublicNeighbourhoodProvenance,
} from "@/lib/domain/public-attributes";
import type {
  PublicDisplayDescription,
  PublicPropertyListing,
} from "@/lib/domain/types";
import { uniqueListingImages } from "@/lib/listing-gallery-urls";
import { createReadOnlySupabaseClient } from "@/lib/supabase/client";

const PUBLIC_SELECT = [
  "id",
  "external_id",
  "source_url",
  "original_realtor_url",
  "listing_type",
  "source_listing_status",
  "property_type",
  "title",
  // English presentation (optional until v5 public view migration).
  "display_title",
  "display_summary",
  "original_price",
  "original_currency",
  "benchmark_price_xcg",
  "conversion_method",
  "conversion_provider",
  "conversion_rate_at",
  "bedrooms",
  "bathrooms",
  "floor_area_m2",
  "lot_area_value",
  "lot_area_unit",
  "primary_image_url",
  "image_urls",
  "description",
  "first_seen_at",
  "last_seen_at",
  "source_listed_at",
  "source_key",
  "source_display_name",
  // Effective fields (optional during migration rollout — fail safe if absent).
  "effective_neighbourhood",
  "effective_neighbourhood_provenance",
  "effective_neighbourhood_provenance_label",
  "effective_property_type",
  "public_attributes",
  "effective_summary",
  "display_description",
  "display_description_nl",
].join(",");

/** English presentation without Dutch column (pre-bilingual view). */
const PUBLIC_SELECT_WITHOUT_NL = [
  "id",
  "external_id",
  "source_url",
  "original_realtor_url",
  "listing_type",
  "source_listing_status",
  "property_type",
  "title",
  "display_title",
  "display_summary",
  "original_price",
  "original_currency",
  "benchmark_price_xcg",
  "conversion_method",
  "conversion_provider",
  "conversion_rate_at",
  "bedrooms",
  "bathrooms",
  "floor_area_m2",
  "lot_area_value",
  "lot_area_unit",
  "primary_image_url",
  "image_urls",
  "description",
  "first_seen_at",
  "last_seen_at",
  "source_listed_at",
  "source_key",
  "source_display_name",
  "effective_neighbourhood",
  "effective_neighbourhood_provenance",
  "effective_neighbourhood_provenance_label",
  "effective_property_type",
  "public_attributes",
  "effective_summary",
  "display_description",
].join(",");

/** Effective fields without English presentation columns (pre-v5 view). */
const PUBLIC_SELECT_WITHOUT_PRESENTATION = [
  "id",
  "external_id",
  "source_url",
  "original_realtor_url",
  "listing_type",
  "source_listing_status",
  "property_type",
  "title",
  "original_price",
  "original_currency",
  "benchmark_price_xcg",
  "conversion_method",
  "conversion_provider",
  "conversion_rate_at",
  "bedrooms",
  "bathrooms",
  "floor_area_m2",
  "lot_area_value",
  "lot_area_unit",
  "primary_image_url",
  "image_urls",
  "description",
  "first_seen_at",
  "last_seen_at",
  "source_listed_at",
  "source_key",
  "source_display_name",
  "effective_neighbourhood",
  "effective_neighbourhood_provenance",
  "effective_neighbourhood_provenance_label",
  "effective_property_type",
  "public_attributes",
  "effective_summary",
  "display_description",
].join(",");

/** Narrower select used when the enriched view columns are not yet migrated. */
const PUBLIC_SELECT_BASIC = [
  "id",
  "external_id",
  "source_url",
  "original_realtor_url",
  "listing_type",
  "source_listing_status",
  "property_type",
  "title",
  "original_price",
  "original_currency",
  "benchmark_price_xcg",
  "conversion_method",
  "conversion_provider",
  "conversion_rate_at",
  "bedrooms",
  "bathrooms",
  "floor_area_m2",
  "lot_area_value",
  "lot_area_unit",
  "primary_image_url",
  "description",
  "first_seen_at",
  "last_seen_at",
  "source_listed_at",
  "source_key",
  "source_display_name",
].join(",");

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicQueryError(message: string) {
  if (/invalid api key|invalid jwt|jwt expired|unauthorized/i.test(message)) {
    return new Error(
      "Authentication failed: the public Labs key was rejected. Check the dashboard configuration.",
    );
  }
  if (/fetch failed|network|timeout|econn/i.test(message)) {
    return new Error(
      "Network error: the public Labs database could not be reached. Check the connection and retry.",
    );
  }
  return new Error(`Public listing query failed: ${message}`);
}

function isMissingNlColumnError(message: string): boolean {
  return /display_description_nl/i.test(message);
}

function isMissingPresentationColumnError(message: string): boolean {
  return /display_title|display_summary/i.test(message);
}

function isMissingEffectiveColumnError(message: string): boolean {
  return /effective_neighbourhood|public_attributes|effective_summary|effective_property_type|display_description_nl|display_description|display_title|display_summary|image_urls|column .* does not exist/i.test(
    message,
  );
}

function normalizeImageUrls(
  raw: unknown,
  primaryImageUrl: string | null,
): string[] {
  const urls: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) urls.push(item.trim());
    }
  }
  if (!urls.length && primaryImageUrl) urls.push(primaryImageUrl);
  return uniqueListingImages(urls);
}

function normalizeProvenance(raw: unknown): PublicNeighbourhoodProvenance {
  const value = String(raw ?? "unavailable");
  if (
    value === "source" ||
    value === "map" ||
    value === "ai_extracted" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "unavailable";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDisplayDescription(raw: unknown): PublicDisplayDescription | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const highlights = Array.isArray(value.highlights)
    ? value.highlights
        .map(textOrNull)
        .filter((highlight): highlight is string => Boolean(highlight))
    : [];
  const displayDescription = {
    language: textOrNull(value.language),
    overview: textOrNull(value.overview),
    layout: textOrNull(value.layout),
    location: textOrNull(value.location),
    highlights,
    practical: textOrNull(value.practical),
  };
  return Object.values(displayDescription).some((item) =>
    Array.isArray(item) ? item.length > 0 : Boolean(item),
  )
    ? displayDescription
    : null;
}

export function normalizePublicListing(
  row: Record<string, unknown>,
): PublicPropertyListing {
  const provenance = normalizeProvenance(
    row.effective_neighbourhood_provenance,
  );
  const rawNeighbourhood = row.effective_neighbourhood
    ? String(row.effective_neighbourhood).trim() || null
    : null;
  // Canonical display for cards/detail; DB/source evidence stays elsewhere.
  const neighbourhood = rawNeighbourhood
    ? canonicalizeNeighbourhood(rawNeighbourhood).canonicalDisplay
    : null;
  const provenanceLabel = row.effective_neighbourhood_provenance_label
    ? String(row.effective_neighbourhood_provenance_label)
    : neighbourhood
      ? PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS[provenance]
      : null;

  const effectivePropertyType = row.effective_property_type
    ? String(row.effective_property_type)
    : row.property_type
      ? String(row.property_type)
      : null;

  return {
    id: String(row.id),
    externalId: String(row.external_id),
    sourceUrl: String(row.source_url),
    originalRealtorUrl: row.original_realtor_url
      ? String(row.original_realtor_url)
      : null,
    listingType: row.listing_type ? String(row.listing_type) : null,
    sourceListingStatus: row.source_listing_status
      ? String(row.source_listing_status)
      : null,
    propertyType: row.property_type ? String(row.property_type) : null,
    title: row.title ? String(row.title) : null,
    // TODO(parallel-v5): populated once public_property_listings exposes columns.
    displayTitle: textOrNull(row.display_title),
    displaySummary: textOrNull(row.display_summary),
    originalPrice: numberOrNull(row.original_price),
    originalCurrency: row.original_currency
      ? String(row.original_currency)
      : null,
    benchmarkPriceXcg: numberOrNull(row.benchmark_price_xcg),
    conversionMethod: row.conversion_method
      ? (String(
          row.conversion_method,
        ) as PublicPropertyListing["conversionMethod"])
      : null,
    conversionProvider: row.conversion_provider
      ? String(row.conversion_provider)
      : null,
    conversionRateAt: row.conversion_rate_at
      ? String(row.conversion_rate_at)
      : null,
    bedrooms: numberOrNull(row.bedrooms),
    bathrooms: numberOrNull(row.bathrooms),
    floorAreaM2: numberOrNull(row.floor_area_m2),
    lotAreaValue: numberOrNull(row.lot_area_value),
    lotAreaUnit: row.lot_area_unit ? String(row.lot_area_unit) : null,
    primaryImageUrl: row.primary_image_url
      ? String(row.primary_image_url)
      : null,
    imageUrls: normalizeImageUrls(
      row.image_urls,
      row.primary_image_url ? String(row.primary_image_url) : null,
    ),
    description: row.description ? String(row.description) : null,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    sourceListedAt: row.source_listed_at
      ? String(row.source_listed_at)
      : null,
    sourceKey: String(row.source_key),
    sourceDisplayName: String(row.source_display_name),
    effectiveNeighbourhood: neighbourhood,
    effectiveNeighbourhoodProvenance: provenance,
    effectiveNeighbourhoodProvenanceLabel: provenanceLabel,
    effectivePropertyType,
    publicAttributes: normalizePublicAttributes(row.public_attributes),
    effectiveSummary: row.effective_summary
      ? String(row.effective_summary).trim() || null
      : null,
    displayDescription: normalizeDisplayDescription(row.display_description),
    displayDescriptionNl: normalizeDisplayDescription(
      row.display_description_nl,
    ),
  };
}

async function fetchPublicListingPages(
  select: string,
): Promise<Record<string, unknown>[]> {
  const client = createReadOnlySupabaseClient();
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("public_property_listings")
      .select(select)
      .order("last_seen_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw publicQueryError(error.message);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export const getPublicListings = cache(
  async (): Promise<PublicPropertyListing[]> => {
    try {
      const rows = await fetchPublicListingPages(PUBLIC_SELECT);
      return rows.map(normalizePublicListing);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Fail soft when Dutch column is not applied yet.
      if (isMissingNlColumnError(message)) {
        try {
          const rows = await fetchPublicListingPages(PUBLIC_SELECT_WITHOUT_NL);
          return rows.map(normalizePublicListing);
        } catch (nlInner) {
          const nlMessage =
            nlInner instanceof Error ? nlInner.message : String(nlInner);
          if (!isMissingPresentationColumnError(nlMessage)) throw nlInner;
        }
      }
      // Fail soft when the v5 view columns are not applied yet.
      if (
        isMissingPresentationColumnError(message) ||
        isMissingNlColumnError(message)
      ) {
        try {
          const rows = await fetchPublicListingPages(
            PUBLIC_SELECT_WITHOUT_PRESENTATION,
          );
          return rows.map(normalizePublicListing);
        } catch (inner) {
          const innerMessage =
            inner instanceof Error ? inner.message : String(inner);
          if (!isMissingEffectiveColumnError(innerMessage)) throw inner;
          const rows = await fetchPublicListingPages(PUBLIC_SELECT_BASIC);
          return rows.map(normalizePublicListing);
        }
      }
      if (!isMissingEffectiveColumnError(message)) throw error;
      // Pre-migration rollout: serve basic public fields safely.
      const rows = await fetchPublicListingPages(PUBLIC_SELECT_BASIC);
      return rows.map(normalizePublicListing);
    }
  },
);

export const getPublicListingById = cache(async (id: string) => {
  const listings = await getPublicListings();
  return listings.find((listing) => listing.id === id) ?? null;
});
