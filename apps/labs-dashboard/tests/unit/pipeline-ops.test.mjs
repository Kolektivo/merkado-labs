import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("pipeline enqueue API requires admin session and never runs scrape/AI", () => {
  const route = source("src/app/api/pipeline/runs/route.ts");
  assert.match(route, /assertLabsAdminSession/);
  assert.match(route, /assertPipelinePostAllowed/);
  assert.match(route, /enqueuePipelineRun/);
  assert.match(route, /workflow_dispatch/);
  assert.doesNotMatch(route, /process_enrichment_job|OPENAI_API_KEY/);
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
  assert.match(readiness, /Terra-v3 initial backfill complete \(220\/220\)/);
  assert.doesNotMatch(
    readiness,
    /Adapter v0\.4\.1 deterministic import is pending/,
  );
  assert.match(readiness, /GitHub daily cron On/);
  assert.match(readiness, /listingCountExpected: 104/);
  assert.match(readiness, /sourceKey: "moret_real_estate"[\s\S]*?readiness: "ready"/);
  assert.match(readiness, /First complete catalog established \(71\)/);
  assert.match(readiness, /access_route_under_investigation/);
  assert.match(readiness, /BLOCKED \(2026-07-20 recon\)/);
  assert.match(readiness, /blockerKind: "waf_restriction"/);
  assert.match(
    readiness,
    /sourceKey: "monumentenzorg_curacao"[\s\S]*?readiness: "ready"/,
  );
  assert.match(readiness, /listingCountExpected: 5/);
  assert.match(readiness, /catalogStatus: "access_route_under_investigation"/);
  assert.doesNotMatch(
    readiness,
    /sourceKey: "monumentenzorg_curacao"[\s\S]*?readiness: "partial"/,
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
  assert.match(enqueue, /PIPELINE_AI_COST_CEILING_USD = 2/);
  assert.match(enqueue, /dispatchPropertyPipelineWorkflow/);
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
  assert.match(controls, /formatUsd\(2\)/);
  assert.match(controls, /formatUsd\(25\)/);
  assert.match(
    controls,
    /Unchanged\s+successful listings are skipped at no AI cost/,
  );
});

test("data operations page shows schedule flag and budgets", () => {
  const page = source("src/app/data-operations/page.tsx");
  assert.match(page, /Data operations/);
  assert.match(page, /Refresh & enrich|PipelineRefreshControls/);
  assert.match(page, /PipelineRunProgress/);
  assert.match(page, /Automatic refresh/);
  assert.match(page, /AUTOMATIC_REFRESH_ENABLED/);
  assert.match(page, /begins on default branch/);
  assert.match(page, /06:00 Curaçao/);
  assert.match(page, /USD 2 \/ day/);
  assert.match(page, /GitHub workflow/);
  assert.match(page, /Manual Run now dispatch needs setup/);
  assert.doesNotMatch(page, /Manual dispatch \(cron Off\)/);
  assert.match(page, /Daily automation is configured On/);
  const schedule = source("src/lib/pipeline/schedule.ts");
  assert.match(schedule, /AUTOMATIC_REFRESH_ENABLED = true/);
  const settings = source("src/app/settings/page.tsx");
  assert.match(settings, /Daily automation configured/);
  assert.match(settings, /begins once the workflow is on the default branch/);
  assert.doesNotMatch(settings, /Manual dispatch \(cron Off\)/);

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

test("dispatch credential stays server-only", () => {
  const dispatch = source("src/lib/pipeline/dispatch-github.ts");
  assert.match(dispatch, /server-only/);
  assert.match(dispatch, /GITHUB_TOKEN/);
  assert.doesNotMatch(dispatch, /NEXT_PUBLIC_GITHUB/);
  const guard = source("src/lib/pipeline/request-guard.ts");
  assert.match(guard, /Cross-site pipeline request rejected/);
  assert.match(guard, /Too many pipeline requests/);
});

test("enrichment page has Overview / Runs / Needs review", () => {
  const page = source("src/app/enrichment/page.tsx");
  assert.match(page, /role="tablist"/);
  assert.match(page, /\/enrichment\?view=overview/);
  assert.match(page, /\/enrichment\?view=runs/);
  assert.match(page, /Needs review/);
  assert.match(page, /Advanced audit detail/);
  assert.match(page, /COST_ESTIMATE_LABEL/);
});

test("listing detail keeps optional diagnostics out of the primary summary", () => {
  const page = source("src/app/listings/[id]/page.tsx");
  assert.match(page, /<PriceDisplay model=\{priceDisplay\}/);
  assert.doesNotMatch(page, /Original asking rent/);
  assert.doesNotMatch(page, /optional detail/);
  assert.match(page, /listing\.bedrooms != null/);
  assert.match(page, /listing\.resort \?/);
});

test("quality neighbourhood gaps drill into an actual listings filter", () => {
  const analytics = source("src/lib/data/analytics.ts");
  const filters = source("src/components/listing-filters.tsx");
  const quality = source("src/app/quality/page.tsx");
  assert.match(analytics, /locationGap: value\("locationGap"\)/);
  assert.match(analytics, /listingHasNeighbourhoodSearchGap/);
  assert.match(analytics, /neighbourhoodKeysMatch/);
  assert.match(analytics, /listingCanonicalNeighbourhood/);
  assert.match(filters, /Missing from neighbourhood search/);
  assert.match(
    quality,
    /locationGap=missing_neighbourhood&from=quality/,
  );
});

test("listing AI changes keep audit detail collapsed", () => {
  const changes = source("src/components/listing-ai-changes.tsx");
  assert.match(changes, /History \/ advanced/);
  assert.match(changes, /Rejected \/ ignored technical audit/);
  assert.match(changes, /Applied changes/);
  assert.match(changes, /Needs review/);
  assert.match(changes, /selectRetainedProposal/);
});
