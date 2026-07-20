import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("pipeline enqueue API requires admin session and never runs scrape/AI", () => {
  const route = source("src/app/api/pipeline/runs/route.ts");
  assert.match(route, /assertLabsAdminSession/);
  assert.match(route, /enqueuePipelineRun/);
  assert.match(route, /Queued — waiting for worker/);
  assert.doesNotMatch(route, /process_enrichment_job|OPENAI|fetch\(/);
  assert.match(route, /Never scrapes|never scrapes|Enqueue a manual/i);
});

test("operations cards do not query missing adapter_version column", () => {
  const ops = source("src/lib/data/operations.ts");
  assert.match(ops, /\.from\("property_sources"\)/);
  assert.doesNotMatch(ops, /adapter_version/);
  assert.match(ops, /SOURCE_READINESS/);
});

test("run-all ready filter excludes partial and blocked sources", () => {
  const readiness = source("src/lib/domain/source-readiness.ts");
  assert.match(readiness, /keller_williams_curacao/);
  assert.match(readiness, /remax_curacao/);
  assert.match(readiness, /moret_real_estate/);
  assert.match(readiness, /monumentenzorg_curacao/);
  assert.match(readiness, /sothebys_curacao/);
  assert.match(readiness, /adapterVersion: "0\.2\.0"/);
  assert.match(readiness, /listingCountExpected: 71/);
  assert.match(readiness, /readiness: "blocked"/);
  assert.match(readiness, /allowsFullRefresh: false/);
  assert.match(readiness, /adapterVersion: "0\.4\.1"/);
  assert.match(readiness, /initial AI backfill is separate/);
  assert.doesNotMatch(
    readiness,
    /Adapter v0\.4\.1 deterministic import is pending/,
  );
  assert.match(readiness, /requires approval/);
  // Ready sources include KW, RE/MAX, and Moret; blocked remain excluded.
  assert.match(readiness, /sourceKey: "moret_real_estate"[\s\S]*?readiness: "ready"/);
  assert.match(readiness, /First complete catalog established \(71\)/);
  assert.match(readiness, /adapter_complete_import_pending/);
  assert.match(readiness, /Access route under investigation/);
  assert.match(
    readiness,
    /sourceKey: "monumentenzorg_curacao"[\s\S]*?readiness: "partial"/,
  );
  assert.match(readiness, /catalogStatus: "access_route_under_investigation"/);
  assert.doesNotMatch(
    readiness,
    /sourceKey: "monumentenzorg_curacao"[\s\S]*?readiness: "ready"/,
  );
  assert.doesNotMatch(
    readiness,
    /sourceKey: "sothebys_curacao"[\s\S]*?readiness: "ready"/,
  );

  const enqueue = source("src/lib/pipeline/enqueue.ts");
  assert.match(enqueue, /filterRunAllReady/);
  assert.match(enqueue, /assertCanEnqueueFullRefresh/);
  assert.match(enqueue, /Production project is forbidden/);
  assert.match(enqueue, /partial/);
  assert.match(enqueue, /blocked/);
  assert.match(enqueue, /PIPELINE_AI_COST_CEILING_USD = 0\.75/);
});

test("confirmation separates changed-listing AI from initial backfill", () => {
  const controls = source("src/components/pipeline-refresh-controls.tsx");
  assert.match(controls, /Changed-listing enrichment/);
  assert.match(controls, /Initial AI backfill/);
  assert.match(controls, /requires a separate approval/);
  assert.match(controls, /Source refresh/);
  assert.match(controls, /Technical details/);
  assert.doesNotMatch(
    controls,
    /Adapter v0\.4\.1 deterministic import is pending/,
  );
  assert.match(controls, /formatUsd\(0\.75\)/);
  assert.match(
    controls,
    /Unchanged\s+successful listings are skipped at no AI cost/,
  );
});

test("data operations page shows progress stages and waiting-for-worker", () => {
  const page = source("src/app/data-operations/page.tsx");
  assert.match(page, /Data operations/);
  assert.match(page, /Refresh & enrich|PipelineRefreshControls/);
  assert.match(page, /PipelineRunProgress/);
  assert.match(page, /local worker/);

  const progress = source("src/components/pipeline-run-progress.tsx");
  const readiness = source("src/lib/domain/source-readiness.ts");
  assert.match(progress, /PIPELINE_STAGE_LABELS/);
  for (const stage of [
    "Checking source",
    "Fetching listings",
    "Validating data",
    "Saving updates",
    "Matching locations",
    "Adding AI details",
    "Final checks",
  ]) {
    assert.match(readiness, new RegExp(stage));
  }
  assert.match(progress, /External API cost: USD 0/);
  assert.match(progress, /Infrastructure runtime not estimated/);
  assert.match(progress, /Skipped unchanged/);
});

test("enrichment page has Overview / Runs / Needs attention", () => {
  const page = source("src/app/enrichment/page.tsx");
  assert.match(page, /TabsTrigger value="overview"/);
  assert.match(page, /TabsTrigger value="runs"/);
  assert.match(page, /Needs attention/);
  assert.match(page, /Advanced audit detail/);
  assert.match(page, /COST_ESTIMATE_LABEL/);
});

test("listing overview hides empty optional fields", () => {
  const page = source("src/app/listings/[id]/page.tsx");
  assert.match(page, /optional detail/);
  assert.match(page, /not available/);
  assert.match(page, /from this source/);
  assert.match(page, /listing\.bedrooms != null/);
  assert.match(page, /listing\.resort \?/);
});

test("listing AI changes keep audit detail collapsed", () => {
  const changes = source("src/components/listing-ai-changes.tsx");
  assert.match(changes, /Advanced metadata/);
  assert.match(changes, /Detailed audit/);
  assert.match(changes, /Applied changes/);
});
