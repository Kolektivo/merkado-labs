import "server-only";

import { cache } from "react";

import {
  getAllListings,
  getPropertySources,
  getSourceRuns,
} from "@/lib/data/queries";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export type OverviewWarning = {
  sourceKey: string;
  message: string;
  severity: "attention" | "blocked";
};

export const getOverviewData = cache(async () => {
  const [listings, sources, runs] = await Promise.all([
    getAllListings(),
    getPropertySources(),
    getSourceRuns(),
  ]);
  const client = createLabsAdminClient();
  const { count: proposalCount, error: proposalError } = await client
    .from("ai_enrichment_proposals")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "unreviewed");

  if (proposalError) {
    throw new Error(`Unable to load AI review count: ${proposalError.message}`);
  }

  const latestRunBySource = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestRunBySource.has(run.sourceKey)) {
      latestRunBySource.set(run.sourceKey, run);
    }
  }

  const sourceSummaries = sources.map((source) => ({
    ...source,
    publicEligibleCount: listings.filter(
      (listing) =>
        listing.source.id === source.id && listing.publicEligible,
    ).length,
    latestRun: source.sourceKey
      ? (latestRunBySource.get(source.sourceKey) ?? null)
      : null,
  }));

  const warnings: OverviewWarning[] = [];
  for (const source of sourceSummaries) {
    if (["recon", "planned"].includes(source.adapterStatus ?? "")) {
      warnings.push({
        sourceKey: source.sourceKey ?? source.name,
        message: `${source.displayName ?? source.name} is blocked or reconnaissance-only.`,
        severity: "blocked",
      });
    } else if (!source.latestRun) {
      warnings.push({
        sourceKey: source.sourceKey ?? source.name,
        message: `${source.displayName ?? source.name} has no recorded source run.`,
        severity: "attention",
      });
    } else if (source.latestRun.outcome !== "success") {
      warnings.push({
        sourceKey: source.sourceKey ?? source.name,
        message: `${source.displayName ?? source.name}'s latest run is ${source.latestRun.outcome}.`,
        severity: "attention",
      });
    }
  }

  return {
    totalInventory: listings.length,
    publicEligibleInventory: listings.filter(
      (listing) => listing.publicEligible,
    ).length,
    activeInventory: listings.filter((listing) => listing.status === "active")
      .length,
    proposalsNeedingReview: proposalCount ?? 0,
    sourceSummaries,
    warnings,
  };
});
