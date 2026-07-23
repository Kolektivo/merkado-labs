import "server-only";

import { getPublicListings } from "../data/public-listings.ts";
import type {
  PublicListingAttribute,
  PublicPropertyListing,
} from "../domain/types.ts";

import {
  countHardFailures,
  rankListings,
  summarizeRestrictiveCriteria,
} from "./rules-v1.ts";
import {
  criteriaToProfile,
  type ListingMatchCandidate,
  type PropertySearchCriteria,
  type RankedMatch,
} from "./types.ts";

function amenityTokensFromListing(listing: PublicPropertyListing): string[] {
  const tokens: string[] = [];
  for (const attr of listing.publicAttributes ?? []) {
    if (isTruthyAttribute(attr)) {
      tokens.push(attr.key.replaceAll("_", " "));
      if (attr.displayLabel) tokens.push(attr.displayLabel.toLowerCase());
    }
  }
  return [...new Set(tokens.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function isTruthyAttribute(attr: PublicListingAttribute): boolean {
  if (attr.valueType === "boolean") return attr.value === true;
  if (typeof attr.value === "number") return attr.value > 0;
  if (typeof attr.value === "string") {
    const v = attr.value.trim().toLowerCase();
    return Boolean(v) && v !== "false" && v !== "no" && v !== "none";
  }
  return false;
}

export function toMatchCandidate(
  listing: PublicPropertyListing,
): ListingMatchCandidate {
  return {
    listingId: listing.id,
    externalId: listing.externalId,
    listingType: listing.listingType,
    propertyType: listing.effectivePropertyType ?? listing.propertyType,
    status: "active",
    publicEligible: true,
    benchmarkPriceXcg: listing.benchmarkPriceXcg,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    floorAreaM2: listing.floorAreaM2,
    neighbourhoodText: listing.effectiveNeighbourhood,
    amenityTokens: amenityTokensFromListing(listing),
    title: listing.displayTitle ?? listing.title,
    sourceDisplayName: listing.sourceDisplayName,
    primaryImageUrl: listing.primaryImageUrl,
    originalPrice: listing.originalPrice,
    originalCurrency: listing.originalCurrency,
  };
}

export type PublicMatchPreview = {
  criteria: PropertySearchCriteria;
  inventoryCount: number;
  matchCount: number;
  matches: RankedMatch[];
  adjustmentSuggestions: string[];
};

export async function runPublicMatchPreview(
  criteria: PropertySearchCriteria,
  options: { limit?: number } = {},
): Promise<PublicMatchPreview> {
  const limit = options.limit ?? 5;
  const listings = await getPublicListings();
  const candidates = listings.map(toMatchCandidate);
  const profile = criteriaToProfile(criteria);
  const ranked = rankListings(profile, candidates, Math.max(limit, 25));
  const top = ranked.slice(0, limit);
  const byId = new Map(candidates.map((c) => [c.listingId, c]));
  const matches: RankedMatch[] = top
    .map((result) => {
      const listing = byId.get(result.listingId);
      if (!listing) return null;
      return { ...result, listing };
    })
    .filter((m): m is RankedMatch => Boolean(m));

  const hardFailCounts = countHardFailures(profile, candidates);
  const adjustmentSuggestions =
    matches.length === 0
      ? summarizeRestrictiveCriteria(
          profile,
          candidates.length,
          hardFailCounts,
        )
      : [];

  return {
    criteria,
    inventoryCount: listings.length,
    matchCount: ranked.length,
    matches,
    adjustmentSuggestions,
  };
}
