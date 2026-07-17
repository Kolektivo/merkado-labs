import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

function repoRoot(): string {
  // apps/labs-dashboard → repository root
  return path.resolve(process.cwd(), "../..");
}

/**
 * Spawn the Python enrichment CLI in the background.
 * OpenAI stays in Python; this only launches the job processor.
 */
export function spawnEnrichmentJob(
  jobId: string,
  options: { force?: boolean; batchSize?: number } = {},
): void {
  const scriptPath = path.join(repoRoot(), "scripts", "run_ai_enrichment.py");
  const python = process.env.PYTHON?.trim() || "python";
  const args = [scriptPath, "--job-id", jobId];
  if (options.force) args.push("--force");
  if (options.batchSize && options.batchSize > 0) {
    args.push("--batch-size", String(options.batchSize));
  }

  const child = spawn(python, args, {
    cwd: repoRoot(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
    windowsHide: true,
  });
  child.unref();
}
