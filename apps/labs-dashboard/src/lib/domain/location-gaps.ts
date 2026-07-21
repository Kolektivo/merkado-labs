/**
 * Frontend classification for location quality metrics.
 * Does not rewrite stored coordinates or neighbourhood evidence.
 */

import { resolveEffectiveNeighbourhood } from "./effective-neighbourhood.ts";

export type LocationGapListing = {
  latitude: number | null;
  longitude: number | null;
  sourceNeighbourhoodText?: string | null;
  inferredNeighbourhood?: { name: string } | null;
};

/** Missing lat/lng — listing cannot appear on the map. */
export function listingHasMapGap(listing: LocationGapListing): boolean {
  return listing.latitude === null || listing.longitude === null;
}

/**
 * No usable neighbourhood for filter/search after effective resolution +
 * canonical display. Source text that is present but only needs alias
 * normalization still yields a name and is not a search gap.
 *
 * When valid coords produced a map neighbourhood, that counts as searchable
 * (point-in-polygon authoritative); source is the filter fallback otherwise.
 */
export function listingHasNeighbourhoodSearchGap(
  listing: LocationGapListing,
): boolean {
  const effective = resolveEffectiveNeighbourhood({
    sourceName: listing.sourceNeighbourhoodText,
    mapName: listing.inferredNeighbourhood?.name ?? null,
  });
  return effective.name === null;
}
