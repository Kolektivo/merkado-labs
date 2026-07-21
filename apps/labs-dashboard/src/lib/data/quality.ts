import "server-only";

import { cache } from "react";

import { summarizeGeographicQuality } from "@/lib/data/analytics";
import { getAllListings } from "@/lib/data/queries";
import {
  listingHasMapGap,
  listingHasNeighbourhoodSearchGap,
} from "@/lib/domain/location-gaps";

export { listingHasMapGap, listingHasNeighbourhoodSearchGap };

export const getQualitySummary = cache(async () => {
  const listings = await getAllListings();
  const lifecycleCounts = new Map<string, number>();
  const exclusionCounts = new Map<string, number>();

  for (const listing of listings) {
    lifecycleCounts.set(
      listing.status,
      (lifecycleCounts.get(listing.status) ?? 0) + 1,
    );
    if (!listing.publicEligible) {
      const reason = listing.publicExclusionReason ?? "not_classified";
      exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
    }
  }

  const missingCoordinates = listings.filter(listingHasMapGap).length;
  const missingNeighbourhoodSearch = listings.filter(
    listingHasNeighbourhoodSearchGap,
  ).length;

  return {
    totalListings: listings.length,
    publicEligible: listings.filter((listing) => listing.publicEligible).length,
    missingPrice: listings.filter(
      (listing) =>
        listing.publicExclusionReason === "missing_price" ||
        (listing.originalPrice ?? listing.currentPrice ?? 0) <= 0,
    ).length,
    /** Map pin gaps only (missing lat/lng). */
    missingCoordinates,
    /** Neighbourhood filter/search gaps after effective resolve + canonicalize. */
    missingNeighbourhoodSearch,
    missingEvidenceChecksum: listings.filter(
      (listing) => !listing.sourceDescriptionChecksum,
    ).length,
    unresolvedConflicts: listings.filter(
      (listing) => listing.unresolvedConflictCount > 0,
    ).length,
    unresolvedConflictRows: listings.reduce(
      (sum, listing) => sum + listing.unresolvedConflictCount,
      0,
    ),
    lifecycleCounts: Array.from(lifecycleCounts.entries()),
    exclusionCounts: Array.from(exclusionCounts.entries()),
    geographic: summarizeGeographicQuality(listings),
  };
});
