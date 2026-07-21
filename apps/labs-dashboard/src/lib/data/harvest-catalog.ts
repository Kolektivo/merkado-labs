import type { HarvestJob } from "@/lib/domain/types";

/**
 * Direct-source adapter jobs for merkado-labs.
 * Pipeline + workflow_dispatch exist; GitHub daily cron is temporarily Off.
 * Keep in sync with docs/04 and src/merkado_labs/scrapers/.
 */
export const HARVEST_JOBS: HarvestJob[] = [
  {
    id: "remax-curacao-manual",
    name: "RE/MAX Curaçao manual adapter",
    sourceName: "RE/MAX",
    schedule: "Pipeline / manual dispatch",
    cron: "0 10 * * * (intended; cron temporarily Off)",
    timezone: "America/Curacao",
    runner: "Local Python (merkado_labs.scrapers.adapters.remax_curacao)",
    workflowPath: ".github/workflows/property-pipeline-labs.yml",
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
      "Complete catalog imported (v0.4.1). Catalog contract 220; Terra-v3 initial backfill complete (220/220). Refresh via Data Operations / workflow_dispatch; GitHub daily cron temporarily Off.",
  },
  {
    id: "keller-williams-manual",
    name: "Keller Williams Curaçao manual adapter",
    sourceName: "Keller Williams Curaçao",
    schedule: "Pipeline / manual dispatch",
    cron: "0 10 * * * (intended; cron temporarily Off)",
    timezone: "America/Curacao",
    runner: "Local Python (merkado_labs.scrapers.adapters.keller_williams_curacao)",
    workflowPath: ".github/workflows/property-pipeline-labs.yml",
    pipeline: [
      "Approved-section catalog discovery (sale/rent categories)",
      "Full-catalog sequential detail dry-run (Crawl-Delay 20, robots once/host)",
      "Exclude /silent-listings; reject off-domain URLs",
      "Complete-catalog success only when discovery + detail gates pass",
      "Dry-run before Labs import; pipeline dispatch available",
    ],
    status: "manual",
    notes:
      "Adapter v0.3.1. Labs catalog 104 listings. Crawl-Delay 20, sequential. Refresh via Data Operations / workflow_dispatch; GitHub daily cron temporarily Off. Partial runs never mark missing/removed.",
  },
  {
    id: "sothebys-planned",
    name: "Sotheby's International Realty adapter",
    sourceName: "Sotheby's International Realty",
    schedule: "Not scheduled",
    cron: null,
    timezone: "UTC",
    runner: "Skeleton / recon only (v0.1.2)",
    workflowPath: null,
    pipeline: [
      "Reconnaissance (2026-07-20 BLOCKED)",
      "Affiliate TLS + network WAF check",
      "Official feed / partner API required",
      "No browser automation",
    ],
    status: "planned",
    notes:
      "BLOCKED 2026-07-20: affiliate TLS expired/mismatched; sothebysrealty.com routes HTTP 202 WAF; app.sir.com office shell has no catalog. Not Ready. Next: official affiliate feed/export or Anywhere partner API with written approval. No WAF bypass.",
  },
  {
    id: "moret-manual",
    name: "Moret Real Estate manual adapter",
    sourceName: "Moret Real Estate",
    schedule: "Pipeline / manual dispatch",
    cron: "0 10 * * * (intended; cron temporarily Off)",
    timezone: "America/Curacao",
    runner: "Local Python (merkado_labs.scrapers.adapters.moret_real_estate)",
    workflowPath: ".github/workflows/property-pipeline-labs.yml",
    pipeline: [
      "WPEstate /properties/ pagination discovery (rel=next + page/N)",
      "Prefer canonical source URLs; WPML language mirrors are aliases",
      "Deterministic detail parse (post ID, price_area, status, fields)",
      "Complete-catalog offline import establishes baseline",
      "Lifecycle absence only after successful complete catalog",
    ],
    status: "manual",
    notes:
      "Adapter v0.2.0 activated 2026-07-20: first complete catalog (71), public eligible 71, Terra-v3 initial backfill complete (71/71). Normal refresh = new/changed only. GitHub daily cron temporarily Off.",
  },
  {
    id: "monumentenzorg-manual",
    name: "Monumentenzorg Curaçao manual adapter",
    sourceName: "Monumentenzorg Curaçao",
    schedule: "Pipeline / manual dispatch",
    cron: "0 10 * * * (intended; cron temporarily Off)",
    timezone: "America/Curacao",
    runner: "scripts/adapters/run_monumentenzorg_curacao.py",
    workflowPath: ".github/workflows/property-pipeline-labs.yml",
    pipeline: [
      "estate_property /properties/ discovery",
      "estate_property-sitemap.xml cross-check",
      "Detail parse (certifi TLS, ≥2s)",
      "Complete-catalog offline import establishes baseline",
      "Lifecycle absence only after successful complete catalog",
    ],
    status: "manual",
    notes:
      "Adapter v0.2.0 activated 2026-07-20: first complete catalog (5), public eligible 2, coordinates 0/5, Terra-v3 initial backfill complete (5/5). Heritage /our_property/ out of scope. GitHub daily cron temporarily Off.",
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
