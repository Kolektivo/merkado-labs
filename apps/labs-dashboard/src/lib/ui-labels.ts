/**
 * Plain-language labels and short explanations for non-technical dashboard UX.
 * Keep filter values / API keys as-is; only change what people read.
 */

import { titleCase } from "@/lib/format";

type TipEntry = { label: string; tip: string };

export const TIPS = {
  totalInventory: {
    label: "total inventory",
    tip: "Every property currently stored from approved realtor websites, including listings that are no longer active.",
  },
  publiclyVisible: {
    label: "Public-ready",
    tip: "Active listings with a usable price and clear realtor attribution. These are safe to include in Public preview.",
  },
  sources: {
    label: "sources",
    tip: "Realtor websites we collect listings from. Automatic daily updates are turned off until each site is approved.",
  },
  aiNeedsReview: {
    label: "Needs review",
    tip: "Only listings with a current unresolved factual conflict need a person. Historical rejected rows and confidence-alone noise stay in advanced audit.",
  },
  publicEligibility: {
    label: "public eligibility",
    tip: "Whether this listing is clean enough to show publicly. Excluded listings usually lack a price, realtor attribution, or are no longer active.",
  },
  attribution: {
    label: "realtor attribution",
    tip: "Whether we know which realtor originally posted the ad. Missing or conflicting attribution means we should not show the listing publicly yet.",
  },
  enrichmentStatus: {
    label: "AI enrichment status",
    tip: "Internal AI coverage for this listing: current, never run, failed, stale (source changed), deferred (budget), or ran without an approved display description. High-confidence evidenced fields apply automatically; only conflicts need attention. Source facts are never overwritten.",
  },
  lifecycle: {
    label: "listing lifecycle",
    tip: "Where the listing is in its life on the market: still active, sold, inactive, temporarily missing from a website refresh, or confirmed removed.",
  },
  coordinateQuality: {
    label: "map pin quality",
    tip: "How trustworthy the listing’s map coordinates are — for example a valid Curaçao pin versus missing or broken numbers.",
  },
  assignmentStatus: {
    label: "neighbourhood assignment",
    tip: "How the neighbourhood was decided: from the website, from the map pin, both agreeing, or disagreeing.",
  },
  completeness: {
    label: "completeness",
    tip: "Rough score of how many important fields are filled in (price, location, bedrooms, and similar). Higher means a richer listing record.",
  },
  timesSeen: {
    label: "times seen",
    tip: "How many times our importer found this listing when checking the realtor website.",
  },
  priceChanges: {
    label: "price changes",
    tip: "How many distinct asking prices we have recorded over time for this listing.",
  },
  observed: {
    label: "last observed",
    tip: "The most recent date we still saw this listing on the realtor website.",
  },
  unresolvedConflicts: {
    label: "unresolved conflicts",
    tip: "Cases where two pieces of information disagree (for example two different realtor names) and still need a human decision.",
  },
  missingPrice: {
    label: "missing price",
    tip: "Listings with no usable asking price. Without a price they cannot be shown in public browse.",
  },
  missingCoordinates: {
    label: "missing coordinates",
    tip: "Listings with no latitude/longitude map pin. Affects map display only — not the same as a neighbourhood-search gap.",
  },
  missingNeighbourhoodSearch: {
    label: "missing neighbourhood for search",
    tip: "No usable neighbourhood could be found from either the website or the map pin, so the listing cannot be placed in neighbourhood filters or search.",
  },
  evidenceChecksum: {
    label: "source evidence",
    tip: "We keep a private fingerprint of the original ad text so we can prove what the website said. The raw HTML is never shown in public queries.",
  },
  unreviewedProposals: {
    label: "unreviewed",
    tip: "Legacy research-review flags. Successful auto-applied enrichments do not require approval.",
  },
  needsReviewProposals: {
    label: "Needs review",
    tip: "Listings with at least one current unresolved factual conflict. Quiet rejections and historical rows do not appear here.",
  },
  autoAppliedFields: {
    label: "auto-applied fields",
    tip: "High-confidence, evidence-backed fields that Labs applied automatically without asking for approval first.",
  },
  adapterJobs: {
    label: "collection jobs",
    tip: "Scripts that fetch listings from each realtor website. Most run only when someone starts them manually until the site is fully approved.",
  },
  sourceRuns: {
    label: "import runs",
    tip: "Each time we fetched and imported listings from a website. Success means the run finished cleanly; partial means we got some data but not a full refresh.",
  },
  discovered: {
    label: "found on website",
    tip: "How many listing URLs or cards the importer found on the website during this run.",
  },
  parsed: {
    label: "read successfully",
    tip: "How many of those listings we could read and understand (title, price, and so on).",
  },
  imported: {
    label: "newly imported",
    tip: "How many brand-new listings were added to Labs in this run.",
  },
  updated: {
    label: "updated",
    tip: "How many existing listings were refreshed with newer information from the website.",
  },
  noPrice: {
    label: "no price",
    tip: "Listings found on the website that had no usable asking price, so they were kept out of public browse.",
  },
  warnErr: {
    label: "warnings and errors",
    tip: "Soft problems (warnings) and hard failures (errors) recorded while importing. High error counts usually mean the website layout changed.",
  },
  xcgBenchmark: {
    label: "XCG comparison price",
    tip: "An approximate price in Caribbean guilders (XCG) so you can compare listings that were posted in different currencies. The original currency on the ad remains the source of truth — this is not a bank quote or appraisal.",
  },
  rentalAmount: {
    label: "rental amount",
    tip: "This is the asking rent from the source listing, not a sale price. The rental period is shown when the source states it clearly.",
  },
  adapterStatus: {
    label: "source readiness",
    tip: "How ready this realtor website is for collection: not ready, incomplete, ready for manual runs, or ready for approved scheduling.",
  },
  aggregatorRecord: {
    label: "aggregator record",
    tip: "An older third-party listing page. Preferred practice is the original realtor website when available.",
  },
  grossAiSpend: {
    label: "gross AI spend",
    tip: "Estimated cost of every recorded paid API attempt, including retries and attempts that were later superseded or failed. Estimated from recorded token usage and configured model pricing — not an OpenAI invoice total.",
  },
  retainedResultCost: {
    label: "retained result cost",
    tip: "Estimated cost of only the latest successful attempt per listing — the result that is actually in effect today.",
  },
  wastedAttemptCost: {
    label: "wasted / failed attempt cost",
    tip: "Estimated cost of paid attempts that were not retained — failed calls, structured-output errors, or attempts later replaced by a newer run.",
  },
  costPerAutoAppliedField: {
    label: "cost per auto-applied field",
    tip: "Total estimated spend divided by the number of fields that were ever auto-applied across all attempts. A rough efficiency signal, not a unit price.",
  },
  structuredOutputFailureRate: {
    label: "structured-output failure rate",
    tip: "Share of API attempts where the model's response could not be parsed into the expected schema (status invalid_output).",
  },
  trueAttentionRate: {
    label: "true attention rate",
    tip: "Share of listings with a retained (currently in-effect) result that still have at least one field needing human attention.",
  },
} as const satisfies Record<string, TipEntry>;

const ADAPTER_STATUS_LABELS: Record<string, string> = {
  active: "Ready",
  manual: "Ready · manual",
  recon: "Incomplete",
  planned: "Not ready",
  retired: "Retired",
  unknown: "Unknown",
};

const RUN_OUTCOME_LABELS: Record<string, string> = {
  success: "Succeeded",
  partial: "Partial success",
  failure: "Failed",
  failed: "Failed",
  running: "Running",
  cancelled: "Cancelled",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active (still listed)",
  sold: "Sold",
  inactive: "Inactive",
  unpublished: "Unpublished",
  missing: "Missing from latest full check",
  removed: "Removed from website",
  unknown: "Unknown",
};

const ENRICHMENT_STATUS_LABELS: Record<string, string> = {
  // Prefer AI coverage wording on internal Labs surfaces.
  not_run: "AI never run",
  queued: "AI never run",
  running: "AI never run",
  succeeded: "AI current",
  skipped_unchanged: "AI current",
  failed: "AI failed",
  needs_review: "AI current",
  // Extended coverage keys (when callers pass resolveAiCoverage categories).
  ai_current: "AI current",
  ai_never_run: "AI never run",
  ai_failed: "AI failed",
  ai_stale: "AI stale",
  ai_deferred: "AI deferred",
  ai_ran_no_display_description:
    "AI ran, but no display description was approved",
};

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  missing_price: "No asking price",
  non_positive_price: "Price is zero or negative",
  missing_attribution: "Missing realtor name",
  attribution_conflict: "Conflicting realtor info",
  inactive: "No longer active",
  sold: "Marked sold",
  removed: "Removed from website",
  missing: "Missing from website",
  parser_error: "Could not read the ad",
  retired_source: "From a retired website",
  not_active: "Not currently active",
  unknown_status: "Unclear status",
  low_completeness: "Too little information",
  source_disabled: "Website is disabled",
  not_classified: "Not classified",
  missing_required_fields: "Missing required fields",
  missing_image: "Missing image",
  missing_contact: "Missing contact details",
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  proposed: "Suggested",
  needs_review: "Needs review",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Replaced by newer suggestion",
  auto_applied: "Applied",
  skipped_unchanged: "No changes — AI skipped",
  invalid_output: "AI response could not be processed",
  failed: "AI enrichment failed",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  unreviewed: "Waiting for review",
  approved_for_research: "Approved for research",
  rejected: "Rejected",
  needs_changes: "Needs changes",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Finished",
  completed: "Finished",
  completed_with_errors: "Finished with errors",
  completed_with_warnings: "Finished with warnings",
  failed: "Failed",
  cancelled: "Cancelled",
  up_to_date: "Up to date",
  not_needed: "Not needed",
  budget_deferred: "Budget deferred",
  partial_budget: "Partial budget",
};

export function labelOrTitle(value: string | null | undefined, map: Record<string, string>) {
  if (!value) return "Not specified";
  const key = value.trim().toLowerCase();
  return map[key] ?? titleCase(value.replaceAll("_", " "));
}

export function adapterStatusLabel(value: string | null | undefined) {
  return labelOrTitle(value, ADAPTER_STATUS_LABELS);
}

export function runOutcomeLabel(value: string | null | undefined) {
  return labelOrTitle(value, RUN_OUTCOME_LABELS);
}

export function lifecycleLabel(value: string | null | undefined) {
  return labelOrTitle(value, LIFECYCLE_LABELS);
}

export function enrichmentStatusLabel(value: string | null | undefined) {
  return labelOrTitle(value, ENRICHMENT_STATUS_LABELS);
}

export function exclusionReasonLabel(value: string | null | undefined) {
  return labelOrTitle(value, EXCLUSION_REASON_LABELS);
}

export function proposalStatusLabel(value: string | null | undefined) {
  return labelOrTitle(value, PROPOSAL_STATUS_LABELS);
}

export function reviewStatusLabel(value: string | null | undefined) {
  return labelOrTitle(value, REVIEW_STATUS_LABELS);
}

export function jobStatusLabel(value: string | null | undefined) {
  return labelOrTitle(value, JOB_STATUS_LABELS);
}

export type UiStatusTone = "success" | "warning" | "error" | "info" | "neutral";

/** Color tone for import-run outcomes. */
export function runOutcomeTone(value: string | null | undefined): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "success":
      return "success";
    case "partial":
      return "warning";
    case "failure":
    case "failed":
      return "error";
    case "running":
      return "info";
    default:
      return "neutral";
  }
}

/** Color tone for source/adapter readiness. */
export function adapterStatusTone(
  value: string | null | undefined,
): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return "success";
    case "manual":
      return "info";
    case "recon":
    case "planned":
      return "neutral";
    case "retired":
      return "error";
    default:
      return "neutral";
  }
}

/** Color tone for listing lifecycle / market status. */
export function lifecycleTone(value: string | null | undefined): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return "success";
    case "sold":
      return "info";
    case "draft":
    case "unpublished":
    case "inactive":
    case "missing":
      return "warning";
    case "removed":
      return "error";
    default:
      return "neutral";
  }
}

/** Color tone for AI enrichment status. */
export function enrichmentStatusTone(
  value: string | null | undefined,
): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "succeeded":
    case "skipped_unchanged":
    case "ai_current":
      return "success";
    case "queued":
    case "running":
      return "info";
    case "needs_review":
    case "ai_stale":
    case "ai_deferred":
    case "ai_ran_no_display_description":
      return "warning";
    case "failed":
    case "ai_failed":
      return "error";
    case "not_run":
    case "ai_never_run":
    default:
      return "neutral";
  }
}

/** Color tone for proposal review status. */
export function reviewStatusTone(
  value: string | null | undefined,
): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "approved_for_research":
      return "success";
    case "unreviewed":
      return "warning";
    case "rejected":
      return "error";
    case "needs_changes":
      return "info";
    default:
      return "neutral";
  }
}

/** Color tone for AI job status. */
export function jobStatusTone(value: string | null | undefined): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "succeeded":
    case "completed":
      return "success";
    case "queued":
    case "running":
      return "info";
    case "completed_with_errors":
      return "warning";
    case "failed":
      return "error";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Short public-visibility sentence for listing detail. */
export function publicVisibilityLabel(input: {
  publicEligible: boolean;
  publicExclusionReason: string | null | undefined;
}) {
  if (input.publicEligible) return "OK to show publicly";
  if (input.publicExclusionReason) {
    return `Hidden from public · ${exclusionReasonLabel(input.publicExclusionReason)}`;
  }
  return "Hidden from public";
}
