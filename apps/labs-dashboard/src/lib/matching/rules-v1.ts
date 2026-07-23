/**
 * Deterministic rules_v1 matcher for Labs Property Search.
 * Explainable hard filters + soft preference scoring. No AI.
 */

import {
  SCORING_VERSION,
  matchLabelForScore,
  type ListingMatchCandidate,
  type MatchResult,
  type SearchRequestProfile,
} from "./types.ts";

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function tokenSet(tokens: string[]): Set<string> {
  return new Set(tokens.map((t) => norm(t)).filter(Boolean));
}

function neighbourhoodMatches(
  text: string | null | undefined,
  needles: string[],
): boolean {
  const hay = norm(text);
  if (!hay) return false;
  return needles.some((n) => {
    const needle = norm(n);
    return Boolean(needle && hay.includes(needle));
  });
}

function listingHasToken(
  listing: ListingMatchCandidate,
  token: string,
): boolean {
  const t = norm(token);
  if (!t) return false;
  if (listing.amenityTokens.some((a) => norm(a) === t || norm(a).includes(t))) {
    return true;
  }
  const title = norm(listing.title);
  return Boolean(title && title.includes(t));
}

function saleAliases(): Set<string> {
  return new Set([
    "sale",
    "buy",
    "for-sale",
    "for_sale",
    "homes-for-sale",
    "homes_for_sale",
  ]);
}

function rentAliases(): Set<string> {
  return new Set([
    "rent",
    "rental",
    "for-rent",
    "for_rent",
    "homes-for-rent",
    "homes_for_rent",
  ]);
}

export function scoreListing(
  request: SearchRequestProfile,
  listing: ListingMatchCandidate,
): MatchResult {
  const reasons: string[] = [];
  const tradeOffs: string[] = [];
  const missingInformation: string[] = [];

  const fail = (tradeOff: string): MatchResult => ({
    listingId: listing.listingId,
    hardPass: false,
    matchScore: 0,
    matchLabel: null,
    matchReasons: [],
    tradeOffs: [tradeOff],
    missingInformation,
    scoringVersion: SCORING_VERSION,
  });

  if (!listing.publicEligible || norm(listing.status) !== "active") {
    return fail("Listing is not currently available in the public inventory.");
  }

  if (
    request.excludedNeighbourhoods.length &&
    neighbourhoodMatches(
      listing.neighbourhoodText,
      request.excludedNeighbourhoods,
    )
  ) {
    return fail("Location is excluded by your search.");
  }

  if (request.transactionType && request.transactionType !== "either") {
    const lt = norm(listing.listingType);
    if (lt) {
      const aliases =
        request.transactionType === "sale" ? saleAliases() : rentAliases();
      if (
        !aliases.has(lt) &&
        lt !== request.transactionType &&
        lt !== `for_${request.transactionType}` &&
        lt !== `homes_for_${request.transactionType}`
      ) {
        return fail(
          request.transactionType === "sale"
            ? "Listed for rent, not for sale."
            : "Listed for sale, not for rent.",
        );
      }
    }
  }

  const price = listing.benchmarkPriceXcg;
  if (request.minPrice !== null && price !== null && price < request.minPrice) {
    return fail("Asking price is below your minimum budget.");
  }
  if (request.maxPrice !== null) {
    if (price === null) {
      // Trustworthy XCG required — cannot falsely pass a budget filter.
      return fail("No reliable XCG price available to check against your budget.");
    }
    if (price > request.maxPrice) {
      return fail("Asking price is above your maximum budget.");
    }
  }

  if (request.minBedrooms !== null) {
    if (listing.bedrooms === null) {
      missingInformation.push("Bedroom count is not listed.");
      tradeOffs.push("Bedroom count is unknown.");
    } else if (listing.bedrooms < request.minBedrooms) {
      return fail("Fewer bedrooms than requested.");
    }
  }

  if (request.minBathrooms !== null) {
    if (listing.bathrooms === null) {
      missingInformation.push("Bathroom count is not listed.");
      tradeOffs.push("Bathroom count is unknown.");
    } else if (listing.bathrooms < request.minBathrooms) {
      return fail("Fewer bathrooms than requested.");
    }
  }

  if (request.minFloorAreaM2 !== null) {
    if (listing.floorAreaM2 === null) {
      missingInformation.push("Floor area is not listed.");
      tradeOffs.push("Floor area is unknown.");
    } else if (listing.floorAreaM2 < request.minFloorAreaM2) {
      return fail("Floor area is below your minimum.");
    }
  }

  if (request.propertyTypes.length) {
    const pt = norm(listing.propertyType);
    const wanted = tokenSet(request.propertyTypes);
    if (pt) {
      const ok = [...wanted].some((w) => pt.includes(w) || w.includes(pt));
      // house ≈ villa / townhouse soft alias for type hard filter
      const houseFamily =
        wanted.has("house") &&
        (pt.includes("villa") ||
          pt.includes("house") ||
          pt.includes("townhouse") ||
          pt.includes("home"));
      if (!ok && !houseFamily) {
        return fail("Property type does not match your search.");
      }
    } else {
      missingInformation.push("Property type is not listed.");
      tradeOffs.push("Property type is unknown.");
    }
  }

  // Required locations are a hard filter when provided.
  if (request.preferredNeighbourhoods.length) {
    if (!listing.neighbourhoodText) {
      return fail("Location is not listed, so it cannot meet your area requirement.");
    }
    if (
      !neighbourhoodMatches(
        listing.neighbourhoodText,
        request.preferredNeighbourhoods,
      )
    ) {
      return fail("Not in one of your required locations.");
    }
  }

  for (const deal of request.dealbreakers) {
    if (listingHasToken(listing, deal)) {
      return fail(`Dealbreaker found: ${deal}.`);
    }
  }

  for (const must of request.mustHaves) {
    if (!listingHasToken(listing, must)) {
      // Missing optional evidence — do not invent a confirmed match.
      missingInformation.push(`Must-have not confirmed: ${must}.`);
      tradeOffs.push(`Must-have not evidenced: ${must}.`);
    }
  }

  let score = 0.35;
  reasons.push("Meets your core requirements.");

  if (price !== null && request.maxPrice !== null) {
    score += 0.15;
    reasons.push("Within your maximum XCG budget.");
  }

  if (request.minBedrooms !== null && listing.bedrooms !== null) {
    score += 0.1;
    reasons.push(`Has at least ${request.minBedrooms} bedroom${request.minBedrooms === 1 ? "" : "s"}.`);
  }

  if (request.preferredNeighbourhoods.length) {
    score += 0.2;
    reasons.push("In one of your required locations.");
  } else {
    score += 0.05;
  }

  if (
    request.propertyTypes.length &&
    listing.propertyType &&
    tokenSet(request.propertyTypes).size
  ) {
    score += 0.05;
    reasons.push("Property type fits your search.");
  }

  for (const must of request.mustHaves) {
    if (listingHasToken(listing, must)) {
      score += 0.06;
      reasons.push(`Includes required feature: ${must}.`);
    } else {
      score -= 0.04;
    }
  }

  for (const pref of request.preferences) {
    if (listingHasToken(listing, pref)) {
      score += 0.05;
      reasons.push(`Matches preference: ${pref}.`);
    } else if (norm(pref) === "move-in ready" || norm(pref) === "renovation candidate") {
      // Renovation prefs are soft narrative only — never invent condition.
      missingInformation.push(`Renovation preference (${pref}) cannot be verified from listing data.`);
      tradeOffs.push(`Could not verify: ${pref}.`);
    } else {
      tradeOffs.push(`Preference not evidenced: ${pref}.`);
    }
  }

  score = Math.max(0, Math.min(1, Math.round(score * 10000) / 10000));
  const hardPass = true;

  return {
    listingId: listing.listingId,
    hardPass,
    matchScore: score,
    matchLabel: matchLabelForScore(score, hardPass),
    matchReasons: reasons,
    tradeOffs,
    missingInformation: unique(missingInformation),
    scoringVersion: SCORING_VERSION,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function rankListings(
  request: SearchRequestProfile,
  listings: ListingMatchCandidate[],
  limit = 25,
): MatchResult[] {
  const scored = listings.map((listing) => scoreListing(request, listing));
  const passing = scored.filter((m) => m.hardPass);
  passing.sort((a, b) => b.matchScore - a.matchScore);
  return passing.slice(0, limit);
}

export function summarizeRestrictiveCriteria(
  request: SearchRequestProfile,
  totalEligible: number,
  hardFailCounts: Record<string, number>,
): string[] {
  const suggestions: string[] = [];
  if (request.maxPrice !== null) {
    suggestions.push("Raise or clear the maximum budget.");
  }
  if (request.preferredNeighbourhoods.length) {
    suggestions.push("Add nearby neighbourhoods or broaden the location list.");
  }
  if (request.propertyTypes.length) {
    suggestions.push("Allow additional property types (for example house and villa).");
  }
  if (request.minBedrooms !== null && request.minBedrooms >= 3) {
    suggestions.push("Lower the minimum bedroom count.");
  }
  if (request.mustHaves.length) {
    suggestions.push("Move some must-haves to preferences.");
  }
  if (request.transactionType && request.transactionType !== "either") {
    suggestions.push("Switch buy/rent to “either” if you are flexible.");
  }
  if (!suggestions.length && totalEligible > 0) {
    suggestions.push("Relax one or more hard requirements and try again.");
  }
  if (hardFailCounts.budget) {
    suggestions.unshift("Budget appears to be the most restrictive filter.");
  } else if (hardFailCounts.location) {
    suggestions.unshift("Location requirements appear most restrictive.");
  }
  return suggestions.slice(0, 5);
}

export function countHardFailures(
  request: SearchRequestProfile,
  listings: ListingMatchCandidate[],
): Record<string, number> {
  const counts: Record<string, number> = {
    budget: 0,
    location: 0,
    type: 0,
    beds: 0,
    transaction: 0,
  };
  for (const listing of listings) {
    if (!listing.publicEligible || norm(listing.status) !== "active") continue;
    if (request.maxPrice !== null) {
      if (
        listing.benchmarkPriceXcg === null ||
        listing.benchmarkPriceXcg > request.maxPrice
      ) {
        counts.budget += 1;
      }
    }
    if (
      request.preferredNeighbourhoods.length &&
      (!listing.neighbourhoodText ||
        !neighbourhoodMatches(
          listing.neighbourhoodText,
          request.preferredNeighbourhoods,
        ))
    ) {
      counts.location += 1;
    }
    if (
      request.minBedrooms !== null &&
      listing.bedrooms !== null &&
      listing.bedrooms < request.minBedrooms
    ) {
      counts.beds += 1;
    }
    if (request.propertyTypes.length && listing.propertyType) {
      const pt = norm(listing.propertyType);
      const wanted = tokenSet(request.propertyTypes);
      const ok = [...wanted].some((w) => pt.includes(w) || w.includes(pt));
      const houseFamily =
        wanted.has("house") &&
        (pt.includes("villa") || pt.includes("house") || pt.includes("home"));
      if (!ok && !houseFamily) counts.type += 1;
    }
  }
  return counts;
}
