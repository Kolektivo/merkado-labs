import "server-only";

import { cache } from "react";

import { HARVEST_JOBS } from "@/lib/data/harvest-catalog";
import {
  getAllListings,
  getPropertySources,
  getSourceRuns,
} from "@/lib/data/queries";

export const getSourceDetail = cache(async (sourceKey: string) => {
  const [sources, listings, runs] = await Promise.all([
    getPropertySources(),
    getAllListings(),
    getSourceRuns(),
  ]);
  const source = sources.find((item) => item.sourceKey === sourceKey);
  if (!source) return null;

  const sourceListings = listings.filter(
    (listing) => listing.source.id === source.id,
  );
  const job = HARVEST_JOBS.find((item) => {
    const display = (source.displayName ?? source.name).toLowerCase();
    return (
      item.sourceName.toLowerCase() === display ||
      display.includes(item.sourceName.toLowerCase())
    );
  });

  return {
    source,
    job: job ?? null,
    runs: runs.filter((run) => run.sourceKey === sourceKey),
    listingCount: sourceListings.length,
    activeCount: sourceListings.filter(
      (listing) => listing.status === "active",
    ).length,
    publicEligibleCount: sourceListings.filter(
      (listing) => listing.publicEligible,
    ).length,
    missingPriceCount: sourceListings.filter(
      (listing) => listing.publicExclusionReason === "missing_price",
    ).length,
  };
});
