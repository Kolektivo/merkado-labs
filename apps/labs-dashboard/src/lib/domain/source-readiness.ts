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

export const READY_SOURCE_ORDER = [
  "monumentenzorg_curacao",
  "moret_real_estate",
  "keller_williams_curacao",
  "remax_curacao",
] as const;

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
    adapterVersion: "0.3.1",
    readiness: "ready",
    listingCountExpected: 104,
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
      "Adapter v0.4.1 active (catalog contract 220; coordinates 199/220). Terra-v3 initial backfill complete (220/220). Pipeline ready; GitHub daily cron temporarily Off. Normal Refresh & enrich remains new/changed only.",
    primaryAction: "Refresh & enrich",
    blockerKind: null,
    allowsFullRefresh: true,
  },
  {
    sourceKey: "moret_real_estate",
    displayName: "Moret Real Estate",
    adapterVersion: "0.2.0",
    readiness: "ready",
    listingCountExpected: 71,
    catalogStatus: "complete",
    currentIssue:
      "First complete catalog established (71). Terra-v3 initial backfill complete (71/71). Pipeline ready; GitHub daily cron temporarily Off.",
    primaryAction: "Refresh & enrich",
    blockerKind: null,
    allowsFullRefresh: true,
  },
  {
    sourceKey: "monumentenzorg_curacao",
    displayName: "Monumentenzorg Curaçao",
    adapterVersion: "0.2.0",
    readiness: "ready",
    listingCountExpected: 5,
    catalogStatus: "complete",
    currentIssue:
      "First complete catalog established (5). Terra-v3 initial backfill complete (5/5). Coordinates 0/5. Pipeline ready; GitHub daily cron temporarily Off.",
    primaryAction: "Refresh & enrich",
    blockerKind: null,
    allowsFullRefresh: true,
  },
  {
    sourceKey: "sothebys_curacao",
    displayName: "Sotheby's International Realty",
    adapterVersion: "0.1.2",
    readiness: "blocked",
    listingCountExpected: null,
    catalogStatus: "access_route_under_investigation",
    currentIssue:
      "BLOCKED (2026-07-20 recon): affiliate TLS expired/mismatched; www.sothebysrealty.com inventory/office/robots/sitemap return HTTP 202 WAF/challenge; app.sir.com/curacaosir is an office shell without catalog HTML. Approved public route or partner feed/API still required.",
    primaryAction: "Blocked",
    blockerKind: "waf_restriction",
    allowsFullRefresh: false,
  },
];

export function readySourceKeys(
  configs: SourceReadinessConfig[] = SOURCE_READINESS,
): string[] {
  const ready = new Set(
    configs
      .filter((item) => item.readiness === "ready" && item.allowsFullRefresh)
      .map((item) => item.sourceKey),
  );
  return READY_SOURCE_ORDER.filter((key) => ready.has(key));
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
