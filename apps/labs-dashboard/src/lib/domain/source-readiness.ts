export type ReadinessVerdict = "ready" | "partial" | "blocked";

export type PipelineStage =
  | "preflight"
  | "scraping"
  | "validation"
  | "import"
  | "location"
  | "ai_enrichment"
  | "verification";

export const PIPELINE_STAGES: PipelineStage[] = [
  "preflight",
  "scraping",
  "validation",
  "import",
  "location",
  "ai_enrichment",
  "verification",
];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  preflight: "Checking source",
  scraping: "Fetching listings",
  validation: "Validating data",
  import: "Saving updates",
  location: "Matching locations",
  ai_enrichment: "Adding AI details",
  verification: "Final checks",
};

export type SourceReadinessConfig = {
  sourceKey: string;
  displayName: string;
  adapterVersion: string;
  readiness: ReadinessVerdict;
  listingCountExpected: number | null;
  catalogStatus: string;
  currentIssue: string | null;
  primaryAction: "Refresh & enrich" | "Continue setup" | "Blocked";
  blockerKind:
    | "official_feed_needed"
    | "access_unavailable"
    | "ssl_dns_failure"
    | "waf_restriction"
    | null;
  allowsFullRefresh: boolean;
};

export const SOURCE_READINESS: SourceReadinessConfig[] = [
  {
    sourceKey: "keller_williams_curacao",
    displayName: "Keller Williams Curaçao",
    adapterVersion: "0.3.0",
    readiness: "ready",
    listingCountExpected: 84,
    catalogStatus: "complete",
    currentIssue: null,
    primaryAction: "Refresh & enrich",
    blockerKind: null,
    allowsFullRefresh: true,
  },
  {
    sourceKey: "remax_curacao",
    displayName: "RE/MAX Curaçao",
    adapterVersion: "0.4.1",
    readiness: "ready",
    listingCountExpected: 220,
    catalogStatus: "complete",
    currentIssue:
      "The initial AI backfill is separate from a normal source refresh and still requires approval.",
    primaryAction: "Refresh & enrich",
    blockerKind: null,
    allowsFullRefresh: true,
  },
  {
    sourceKey: "moret_real_estate",
    displayName: "Moret Real Estate",
    adapterVersion: "0.1.1",
    readiness: "partial",
    listingCountExpected: 5,
    catalogStatus: "bounded_sample",
    currentIssue: "Only a five-listing sample is proven; the full catalog is not ready.",
    primaryAction: "Continue setup",
    blockerKind: null,
    allowsFullRefresh: false,
  },
  {
    sourceKey: "monumentenzorg_curacao",
    displayName: "Monumentenzorg Curaçao",
    adapterVersion: "0.1.1",
    readiness: "blocked",
    listingCountExpected: null,
    catalogStatus: "blocked",
    currentIssue: "The website connection is unavailable. An official feed or partner access is needed.",
    primaryAction: "Blocked",
    blockerKind: "ssl_dns_failure",
    allowsFullRefresh: false,
  },
  {
    sourceKey: "sothebys_curacao",
    displayName: "Sotheby's International Realty",
    adapterVersion: "0.1.1",
    readiness: "blocked",
    listingCountExpected: null,
    catalogStatus: "blocked",
    currentIssue: "The website blocks automated access. An approved data feed is needed.",
    primaryAction: "Blocked",
    blockerKind: "waf_restriction",
    allowsFullRefresh: false,
  },
];

export function readySourceKeys(
  configs: SourceReadinessConfig[] = SOURCE_READINESS,
): string[] {
  return configs
    .filter((item) => item.readiness === "ready" && item.allowsFullRefresh)
    .map((item) => item.sourceKey);
}

export function blockerLabel(
  kind: SourceReadinessConfig["blockerKind"],
): string | null {
  switch (kind) {
    case "official_feed_needed":
      return "Official feed needed";
    case "access_unavailable":
      return "Access unavailable";
    case "ssl_dns_failure":
      return "SSL/DNS failure";
    case "waf_restriction":
      return "WAF restriction";
    default:
      return null;
  }
}

export type UiReadiness =
  | "Ready"
  | "Partial"
  | "Blocked"
  | "Running"
  | "Failed"
  | "Queued";

export function displayReadiness(
  base: ReadinessVerdict,
  runStatus?: string | null,
): UiReadiness {
  if (runStatus === "queued") return "Queued";
  if (runStatus === "running" || runStatus === "stopping") return "Running";
  if (runStatus === "failed") return "Failed";
  if (base === "ready") return "Ready";
  if (base === "partial") return "Partial";
  return "Blocked";
}
