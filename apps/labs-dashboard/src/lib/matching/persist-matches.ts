import "server-only";

import { createLabsAdminClient } from "@/lib/supabase/admin";

import { runPublicMatchPreview } from "./run-public-match.ts";
import type { PropertySearchCriteria } from "./types.ts";

export async function persistMatchReportsForRequest(
  requestId: string,
  criteria: PropertySearchCriteria,
  options: { limit?: number } = {},
) {
  const preview = await runPublicMatchPreview(criteria, {
    limit: options.limit ?? 25,
  });
  const client = createLabsAdminClient();

  for (const match of preview.matches) {
    const { error } = await client.from("listing_match_reports").upsert(
      {
        property_search_request_id: requestId,
        property_listing_id: match.listingId,
        match_score: match.matchScore,
        hard_pass: match.hardPass,
        match_reasons: match.matchReasons,
        trade_offs: [
          ...match.tradeOffs,
          ...match.missingInformation.map((item) => `Missing: ${item}`),
        ],
        evidence: {
          source: match.listing.sourceDisplayName,
          neighbourhood: match.listing.neighbourhoodText,
          benchmark_price_xcg: match.listing.benchmarkPriceXcg,
          match_label: match.matchLabel,
        },
        scoring_version: match.scoringVersion,
      },
      {
        onConflict:
          "property_search_request_id,property_listing_id,scoring_version",
      },
    );
    if (error) {
      throw new Error(`Unable to save match report: ${error.message}`);
    }
  }

  return preview;
}
