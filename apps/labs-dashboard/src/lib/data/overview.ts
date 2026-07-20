import "server-only";

import { cache } from "react";

import {
  getAllListings,
  getPropertySources,
  getSourceRuns,
} from "@/lib/data/queries";
import { getRetainedAttentionListingCount } from "@/lib/data/enrichment";
import { getLatestPipelineRuns } from "@/lib/data/operations";

export type OverviewWarning = {
  sourceKey: string;
  message: string;
  severity: "attention" | "blocked";
};

export const getOverviewData = cache(async () => {
  const [listings, sources, runs, pipelineRuns, attentionListingCount] =
    await Promise.all([
    getAllListings(),
    getPropertySources(),
    getSourceRuns(),
    getLatestPipelineRuns(8),
    getRetainedAttentionListingCount(),
  ]);

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
    listingsNeedingAttention: attentionListingCount,
    healthySourceCount: sourceSummaries.filter(
      (source) => source.latestRun?.outcome === "success",
    ).length,
    activePipelineCount: pipelineRuns.filter((run) =>
      ["queued", "running", "stopping"].includes(run.status),
    ).length,
    failedPipelineCount: pipelineRuns.filter((run) => run.status === "failed")
      .length,
    recentPipelineRuns: pipelineRuns.filter((run) =>
      ["completed", "completed_with_errors", "failed", "cancelled"].includes(
        run.status,
      ),
    ),
    sourceSummaries,
    warnings,
  };
});
