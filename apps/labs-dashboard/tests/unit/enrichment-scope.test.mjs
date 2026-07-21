import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("enrichment scope metadata is exactly one v5 value each", () => {
  const versions = source("src/lib/enrichment/versions.ts");
  const scope = source("src/lib/enrichment/scope.ts");
  const display = source("src/lib/enrichment/display.ts");

  const promptMatches = versions.match(/listing_enrichment_v\d+/g) || [];
  const schemaMatches = versions.match(/listing_enrichment_schema_v\d+/g) || [];
  const policyMatches = versions.match(/enrichment_policy_v\d+(?:_\d+)?/g) || [];

  assert.deepEqual([...new Set(promptMatches)], ["listing_enrichment_v5"]);
  assert.deepEqual(
    [...new Set(schemaMatches)],
    ["listing_enrichment_schema_v5"],
  );
  assert.deepEqual([...new Set(policyMatches)], ["enrichment_policy_v5"]);

  assert.match(versions, /export const PROMPT_VERSION = "listing_enrichment_v5"/);
  assert.match(
    versions,
    /export const SCHEMA_VERSION = "listing_enrichment_schema_v5"/,
  );
  assert.match(versions, /export const POLICY_VERSION = "enrichment_policy_v5"/);
  assert.match(scope, /from "@\/lib\/enrichment\/versions"/);
  assert.match(scope, /policyVersion: POLICY_VERSION/);
  assert.match(display, /from "\.\/versions\.ts"/);
  assert.match(display, /CURRENT_PROMPT_VERSION = PROMPT_VERSION/);

  assert.doesNotMatch(versions, /listing_enrichment_v1/);
  assert.doesNotMatch(versions, /listing_enrichment_schema_v1/);
  assert.doesNotMatch(versions, /enrichment_policy_v1/);
});

test("pipeline enqueue stores approved daily AI budget ceiling", () => {
  const enqueue = source("src/lib/pipeline/enqueue.ts");
  assert.match(enqueue, /PIPELINE_AI_COST_CEILING_USD = 2/);
  assert.match(enqueue, /estimated_ceiling_usd: ceiling/);
  assert.match(enqueue, /dispatchPropertyPipelineWorkflow/);
  assert.doesNotMatch(enqueue, /expectedAi \* 1800/);
});
