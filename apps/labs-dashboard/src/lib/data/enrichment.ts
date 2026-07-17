import "server-only";

import { cache } from "react";

import { getRecentAiEnrichmentJobs } from "@/lib/data/queries";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export type ProposalQueueItem = {
  id: string;
  listingId: string;
  listingTitle: string | null;
  sourceName: string | null;
  status: string;
  reviewStatus: string;
  confidence: number | null;
  model: string;
  generatedAt: string;
};

export const getEnrichmentDashboard = cache(async () => {
  const client = createLabsAdminClient();
  const [{ data, error }, jobs] = await Promise.all([
    client
      .from("ai_enrichment_proposals")
      .select(
        "id,property_listing_id,status,review_status,confidence,model,generated_at,listing:property_listings(title,source:property_sources(display_name))",
      )
      .order("generated_at", { ascending: false })
      .limit(100),
    getRecentAiEnrichmentJobs(12),
  ]);

  if (error) {
    throw new Error(`Unable to load AI proposals: ${error.message}`);
  }

  const proposals: ProposalQueueItem[] = (data ?? []).map((row) => {
    const listingRaw = Array.isArray(row.listing)
      ? row.listing[0]
      : row.listing;
    const listing =
      listingRaw && typeof listingRaw === "object"
        ? (listingRaw as Record<string, unknown>)
        : null;
    const sourceRaw = listing?.source;
    const source = Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw;
    const sourceRecord =
      source && typeof source === "object"
        ? (source as Record<string, unknown>)
        : null;

    return {
      id: String(row.id),
      listingId: String(row.property_listing_id),
      listingTitle: listing?.title ? String(listing.title) : null,
      sourceName: sourceRecord?.display_name
        ? String(sourceRecord.display_name)
        : null,
      status: String(row.status),
      reviewStatus: String(row.review_status ?? "unreviewed"),
      confidence:
        row.confidence === null || row.confidence === undefined
          ? null
          : Number(row.confidence),
      model: String(row.model),
      generatedAt: String(row.generated_at),
    };
  });

  return {
    proposals,
    jobs,
    unreviewed: proposals.filter(
      (proposal) => proposal.reviewStatus === "unreviewed",
    ).length,
    needsReview: proposals.filter(
      (proposal) => proposal.status === "needs_review",
    ).length,
  };
});
