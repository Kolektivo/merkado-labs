import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("enrichment scope metadata is exactly one v4 value each", () => {
  const scope = source("src/lib/enrichment/scope.ts");

  const promptMatches = scope.match(/listing_enrichment_v\d+/g) || [];
  const schemaMatches = scope.match(/listing_enrichment_schema_v\d+/g) || [];
  const policyMatches = scope.match(/enrichment_policy_v\d+/g) || [];

  assert.deepEqual([...new Set(promptMatches)], ["listing_enrichment_v4"]);
  assert.deepEqual(
    [...new Set(schemaMatches)],
    ["listing_enrichment_schema_v4"],
  );
  assert.deepEqual([...new Set(policyMatches)], ["enrichment_policy_v4"]);

  assert.match(scope, /export const PROMPT_VERSION = "listing_enrichment_v4"/);
  assert.match(
    scope,
    /export const SCHEMA_VERSION = "listing_enrichment_schema_v4"/,
  );
  assert.match(scope, /export const POLICY_VERSION = "enrichment_policy_v4"/);
  assert.match(scope, /policyVersion: POLICY_VERSION/);

  assert.doesNotMatch(scope, /listing_enrichment_v1/);
  assert.doesNotMatch(scope, /listing_enrichment_schema_v1/);
  assert.doesNotMatch(scope, /enrichment_policy_v1/);
});

test("pipeline enqueue stores approved USD 0.75 AI ceiling", () => {
  const enqueue = source("src/lib/pipeline/enqueue.ts");
  assert.match(enqueue, /PIPELINE_AI_COST_CEILING_USD = 0\.75/);
  assert.match(enqueue, /estimated_ceiling_usd: ceiling/);
  assert.doesNotMatch(enqueue, /expectedAi \* 1800/);
});
