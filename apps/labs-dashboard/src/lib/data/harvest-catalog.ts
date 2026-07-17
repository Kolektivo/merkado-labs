import type { HarvestJob } from "@/lib/domain/types";

/**
 * Direct-source adapter jobs for merkado-labs.
 * Scheduling stays disabled until each adapter passes QA.
 * Keep in sync with docs/04 and src/merkado_labs/scrapers/.
 */
export const HARVEST_JOBS: HarvestJob[] = [
  {
    id: "remax-curacao-manual",
    name: "RE/MAX Curaçao manual adapter",
    sourceName: "RE/MAX",
    schedule: "Manual only",
    cron: null,
    timezone: "UTC",
    runner: "Local Python (merkado_labs.scrapers.adapters.remax_curacao)",
    workflowPath: null,
    pipeline: [
      "Discover listing URLs from sale/rent index pagination",
      "Bounded HTTPS fetch of listing detail pages",
      "Deterministic parse of price, currency, and property fields",
      "Dry-run review before Labs import",
      "Idempotent Labs import + source-run health",
      "Lifecycle absence only on complete successful runs",
    ],
    status: "manual",
    notes:
      "Complete manual catalog imported (v0.4). Rich evidence + description refresh 2026-07-17. Scheduling remains disabled.",
  },
  {
    id: "keller-williams-manual",
    name: "Keller Williams Curaçao manual adapter",
    sourceName: "Keller Williams Curaçao",
    schedule: "Manual only",
    cron: null,
    timezone: "UTC",
    runner: "Local Python (merkado_labs.scrapers.adapters.keller_williams_curacao)",
    workflowPath: null,
    pipeline: [
      "Bounded sequential detail fetch (Crawl-Delay 20)",
      "Exclude /silent-listings",
      "Deterministic parse + fixture tests",
      "Dry-run before Labs import",
    ],
    status: "manual",
    notes:
      "Adapter v0.1. Labs import 2026-07-17: 40 listings (38 eligible). Crawl-Delay 20. Pagination incomplete. Scheduling disabled.",
  },
  {
    id: "sothebys-planned",
    name: "Sotheby's International Realty adapter",
    sourceName: "Sotheby's International Realty",
    schedule: "Not scheduled",
    cron: null,
    timezone: "UTC",
    runner: "Skeleton / recon only",
    workflowPath: null,
    pipeline: ["Reconnaissance", "Feed/sitemap/API check", "No browser automation"],
    status: "planned",
    notes: "HTTP 202/WAF on robots/search/sitemap (2026-07-17). No browser automation.",
  },
  {
    id: "moret-manual",
    name: "Moret Real Estate manual adapter",
    sourceName: "Moret Real Estate",
    schedule: "Manual only",
    cron: null,
    timezone: "UTC",
    runner: "Local Python (merkado_labs.scrapers.adapters.moret_real_estate)",
    workflowPath: null,
    pipeline: [
      "WPEstate index discovery",
      "Canonicalize bilingual URLs",
      "Deterministic parse + fixtures",
      "Bounded Labs import",
    ],
    status: "manual",
    notes: "v0.1. Bounded 5-listing Labs import 2026-07-17. Expand after price_area QA.",
  },
  {
    id: "monumentenzorg-planned",
    name: "Monumentenzorg Curaçao adapter",
    sourceName: "Monumentenzorg Curaçao",
    schedule: "Not scheduled",
    cron: null,
    timezone: "UTC",
    runner: "Fixture parser only (live blocked)",
    workflowPath: null,
    pipeline: ["Confirm listing scope", "ANG/XCG handling", "Fixtures", "Parser"],
    status: "planned",
    notes: "SSL expired on monumentenzorg.cw; alt DNS failed. Partner access needed.",
  },
];

export function harvestJobsForSource(sourceName: string): HarvestJob[] {
  const needle = sourceName.trim().toLowerCase();
  return HARVEST_JOBS.filter((job) => {
    const jobName = job.sourceName.trim().toLowerCase();
    return (
      jobName === needle ||
      needle.includes(jobName) ||
      jobName.includes(needle)
    );
  });
}
