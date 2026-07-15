import type { HarvestJob } from "@/lib/domain/types";

/**
 * merkado-labs harvest jobs operated from this repository.
 * Keep in sync with `.github/workflows/` when schedules change.
 */
export const HARVEST_JOBS: HarvestJob[] = [
  {
    id: "chh-daily-harvest",
    name: "CHH daily harvest",
    sourceName: "CaribbeanHouseHunt.com",
    schedule: "Daily at 03:00 UTC",
    cron: "0 3 * * *",
    timezone: "UTC",
    runner: "GitHub Actions",
    workflowPath: ".github/workflows/chh-daily-harvest.yml",
    pipeline: [
      "Download a fresh snapshot from the website",
      "Import that snapshot into the merkado-labs database",
      "Keep a copy of the snapshot for 90 days",
    ],
    status: "active",
    notes:
      "Downloads the public CaribbeanHouseHunt map data, saves a frozen copy (snapshot), then loads it into the merkado-labs database. You can also start this by hand from GitHub Actions.",
  },
];

export function harvestJobsForSource(sourceName: string): HarvestJob[] {
  return HARVEST_JOBS.filter((job) => job.sourceName === sourceName);
}
