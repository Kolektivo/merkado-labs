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
      "Approved-section catalog discovery (sale/rent categories)",
      "Full-catalog sequential detail dry-run (Crawl-Delay 20, robots once/host)",
      "Exclude /silent-listings; reject off-domain URLs",
      "Complete-catalog success only when discovery + detail gates pass",
      "Dry-run before Labs import; unscheduled",
    ],
    status: "manual",
    notes:
      "Adapter v0.3. Full catalog imported 2026-07-17 from verified Stage-3 artifact (84 listings: 52 sale + 32 rent, 3 no-price). Offline cache import; no live crawl. Crawl-Delay 20, sequential, manual/unscheduled. Partial runs never mark missing/removed.",
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
    schedule: "Manual only",
    cron: null,
    timezone: "UTC",
    runner: "Local Python (merkado_labs.scrapers.adapters.moret_real_estate)",
    workflowPath: null,
    pipeline: [
      "WPEstate /properties/ pagination discovery (rel=next + page/N)",
      "Prefer Dutch canonical URLs; WPML EN mirrors are aliases",
      "Deterministic detail parse (post ID, price_area, status, fields)",
      "Complete-catalog offline import establishes baseline",
      "Lifecycle absence only after successful complete catalog",
    ],
    status: "manual",
    notes:
      "Adapter v0.2.0 activated 2026-07-20: first complete catalog (71), offline import 66 insert / 5 update, public eligible 71, Terra-v3 initial backfill complete (71/71). Normal refresh = new/changed only. Scheduling remains disabled.",
  },
  {
    id: "monumentenzorg-manual",
    name: "Monumentenzorg Curaçao manual adapter",
    sourceName: "Monumentenzorg Curaçao",
    schedule: "Manual only",
    cron: null,
    timezone: "UTC",
    runner: "scripts/adapters/run_monumentenzorg_curacao.py",
    workflowPath: null,
    pipeline: [
      "estate_property /properties/ discovery",
      "estate_property-sitemap.xml cross-check",
      "Detail parse (certifi TLS, ≥2s)",
      "Complete-catalog offline import establishes baseline",
      "Lifecycle absence only after successful complete catalog",
    ],
    status: "manual",
    notes:
      "Adapter v0.2.0 activated 2026-07-20: first complete catalog (5), public eligible 2, coordinates 0/5, Terra-v3 initial backfill complete (5/5). Heritage /our_property/ out of scope. Scheduling remains disabled.",
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
