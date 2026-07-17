/**
 * Plain-language labels and short explanations for non-technical dashboard UX.
 * Keep filter values / API keys as-is; only change what people read.
 */

import { titleCase } from "@/lib/format";

type TipEntry = { label: string; tip: string };

export const TIPS = {
  totalInventory: {
    label: "total inventory",
    tip: "Every property we currently store from approved realtor websites — including ones that are no longer for sale.",
  },
  publiclyVisible: {
    label: "publicly visible",
    tip: "Listings that are still active, have a usable price, and show which realtor posted them. These are the ones safe enough to show in a public browse experience.",
  },
  sources: {
    label: "sources",
    tip: "Realtor websites we collect listings from. Automatic daily updates are turned off until each site is approved.",
  },
  aiNeedsReview: {
    label: "AI needs review",
    tip: "AI wrote suggestions for some listings (for example clearer features). A person still has to accept or reject them — they never overwrite the original ad automatically.",
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
    tip: "Whether AI has been asked to suggest extra details for this listing. Suggestions stay separate from the original source facts until someone reviews them.",
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
    tip: "Listings with no map pin, so they cannot appear on the map view.",
  },
  evidenceChecksum: {
    label: "source evidence",
    tip: "We keep a private fingerprint of the original ad text so we can prove what the website said. The raw HTML is never shown in public queries.",
  },
  unreviewedProposals: {
    label: "unreviewed",
    tip: "AI suggestions that nobody has accepted or rejected yet. These need a human decision.",
  },
  needsReviewProposals: {
    label: "needs review",
    tip: "AI marked these suggestions as needing a closer look — for example low confidence or unusual fields.",
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
  adapterStatus: {
    label: "source readiness",
    tip: "How ready this realtor website is for automatic collection: planned (not built yet), recon (being studied), manual (works but only when started by hand), or active (approved for scheduling).",
  },
  aggregatorRecord: {
    label: "aggregator record",
    tip: "An older third-party listing page. Preferred practice is the original realtor website when available.",
  },
} as const satisfies Record<string, TipEntry>;

const ADAPTER_STATUS_LABELS: Record<string, string> = {
  active: "Ready for schedule",
  manual: "Manual import only",
  recon: "Being researched",
  planned: "Planned",
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
  active: "Active (still listed)",
  sold: "Sold",
  inactive: "Inactive (incl. rented)",
  missing: "Missing from latest full check",
  removed: "Removed from website",
  unknown: "Unknown",
};

const ENRICHMENT_STATUS_LABELS: Record<string, string> = {
  not_run: "Not run yet",
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  skipped_unchanged: "Skipped (nothing changed)",
  failed: "Failed",
  needs_review: "Needs review",
};

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  missing_price: "No asking price",
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
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  proposed: "Suggested",
  needs_review: "Needs closer look",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Replaced by newer suggestion",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  unreviewed: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
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
      return "success";
    case "queued":
    case "running":
      return "info";
    case "needs_review":
      return "warning";
    case "failed":
      return "error";
    default:
      return "neutral";
  }
}

/** Color tone for proposal review status. */
export function reviewStatusTone(
  value: string | null | undefined,
): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "approved":
      return "success";
    case "unreviewed":
      return "warning";
    case "rejected":
      return "error";
    case "changes_requested":
      return "info";
    default:
      return "neutral";
  }
}

/** Color tone for AI job status. */
export function jobStatusTone(value: string | null | undefined): UiStatusTone {
  switch ((value ?? "").toLowerCase()) {
    case "succeeded":
      return "success";
    case "queued":
    case "running":
      return "info";
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
