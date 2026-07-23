/** Deterministic Property Search matching types (Labs). */

export type TransactionType = "sale" | "rent" | "either";

export type RenovationWillingness =
  | "none"
  | "light"
  | "moderate"
  | "major"
  | "unknown";

export type MatchLabel = "Strong match" | "Good match" | "Possible match";

export type PropertySearchCriteria = {
  title: string;
  transactionType: TransactionType;
  minPrice: number | null;
  maxPrice: number | null;
  priceCurrency: "XCG";
  minBedrooms: number | null;
  minBathrooms: number | null;
  minFloorAreaM2: number | null;
  propertyTypes: string[];
  /** Required locations (hard filter when non-empty). */
  preferredNeighbourhoods: string[];
  excludedNeighbourhoods: string[];
  mustHaves: string[];
  preferences: string[];
  dealbreakers: string[];
  renovationWillingness: RenovationWillingness;
  notes: string | null;
  /** Phrases that could not be mapped confidently. */
  unclear: string[];
};

export type SearchRequestProfile = {
  transactionType: TransactionType | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceCurrency: string;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minFloorAreaM2: number | null;
  propertyTypes: string[];
  preferredNeighbourhoods: string[];
  excludedNeighbourhoods: string[];
  mustHaves: string[];
  preferences: string[];
  dealbreakers: string[];
};

export type ListingMatchCandidate = {
  listingId: string;
  externalId: string;
  listingType: string | null;
  propertyType: string | null;
  status: string | null;
  publicEligible: boolean;
  benchmarkPriceXcg: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floorAreaM2: number | null;
  neighbourhoodText: string | null;
  amenityTokens: string[];
  title: string | null;
  sourceDisplayName: string | null;
  primaryImageUrl: string | null;
  originalPrice: number | null;
  originalCurrency: string | null;
};

export type MatchResult = {
  listingId: string;
  hardPass: boolean;
  matchScore: number;
  matchLabel: MatchLabel | null;
  matchReasons: string[];
  tradeOffs: string[];
  missingInformation: string[];
  scoringVersion: string;
};

export type RankedMatch = MatchResult & {
  listing: ListingMatchCandidate;
};

export const SCORING_VERSION = "rules_v1";

export function emptyCriteria(
  overrides: Partial<PropertySearchCriteria> = {},
): PropertySearchCriteria {
  return {
    title: "Property Search",
    transactionType: "either",
    minPrice: null,
    maxPrice: null,
    priceCurrency: "XCG",
    minBedrooms: null,
    minBathrooms: null,
    minFloorAreaM2: null,
    propertyTypes: [],
    preferredNeighbourhoods: [],
    excludedNeighbourhoods: [],
    mustHaves: [],
    preferences: [],
    dealbreakers: [],
    renovationWillingness: "unknown",
    notes: null,
    unclear: [],
    ...overrides,
  };
}

export function criteriaToProfile(
  criteria: PropertySearchCriteria,
): SearchRequestProfile {
  return {
    transactionType: criteria.transactionType,
    minPrice: criteria.minPrice,
    maxPrice: criteria.maxPrice,
    priceCurrency: criteria.priceCurrency,
    minBedrooms: criteria.minBedrooms,
    minBathrooms: criteria.minBathrooms,
    minFloorAreaM2: criteria.minFloorAreaM2,
    propertyTypes: criteria.propertyTypes,
    preferredNeighbourhoods: criteria.preferredNeighbourhoods,
    excludedNeighbourhoods: criteria.excludedNeighbourhoods,
    mustHaves: criteria.mustHaves,
    preferences: criteria.preferences,
    dealbreakers: criteria.dealbreakers,
  };
}

export function matchLabelForScore(score: number, hardPass: boolean): MatchLabel | null {
  if (!hardPass) return null;
  if (score >= 0.75) return "Strong match";
  if (score >= 0.55) return "Good match";
  return "Possible match";
}
