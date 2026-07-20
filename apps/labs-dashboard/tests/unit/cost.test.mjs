import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateUsageCostUsd,
  formatPercent,
  formatUsd,
  isStructuredOutputFailureStatus,
  isSuccessfulProposalStatus,
  parseTokenUsage,
  safeDivide,
  sumCostUsd,
  sumTokenUsage,
  totalTokenCount,
} from "../../src/lib/enrichment/cost.ts";

test("calculateUsageCostUsd matches the recorded reconciliation example for gpt-5.6-terra", () => {
  // Real attempt from data/processed/ai_usage_reconciliation.json —
  // calculated_cost_usd: 0.0455, cross-checked against pricing.py.
  const tokens = {
    inputTokens: 4381,
    cachedInputTokens: 4378,
    outputTokens: 2963,
    reasoningTokens: 427,
  };
  assert.equal(calculateUsageCostUsd("gpt-5.6-terra", tokens), 0.0455);
});

test("calculateUsageCostUsd bills all input at the cached rate when cached exceeds input", () => {
  const tokens = {
    inputTokens: 2000,
    cachedInputTokens: 8000,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  const cost = calculateUsageCostUsd("gpt-5.6-terra", tokens);
  // All 2000 input tokens billed at the cached rate (0.25/1M) = 0.0005.
  assert.equal(cost, 0.0005);
});

test("calculateUsageCostUsd returns null for an unknown model rather than borrowing a rate", () => {
  const tokens = { inputTokens: 100, cachedInputTokens: 0, outputTokens: 100, reasoningTokens: 0 };
  assert.equal(calculateUsageCostUsd("some-unreleased-model", tokens), null);
});

test("parseTokenUsage normalizes a stored token_usage JSON blob and ignores garbage", () => {
  assert.deepEqual(parseTokenUsage(null), {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  });
  assert.deepEqual(
    parseTokenUsage({
      input_tokens: 100,
      cached_input_tokens: 40,
      output_tokens: 20,
      reasoning_tokens: 5,
      unrelated_field: "ignored",
    }),
    { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, reasoningTokens: 5 },
  );
});

test("sumTokenUsage and totalTokenCount aggregate without double-counting reasoning", () => {
  const usage = sumTokenUsage([
    { inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, reasoningTokens: 1 },
    { inputTokens: 20, cachedInputTokens: 0, outputTokens: 15, reasoningTokens: 3 },
  ]);
  assert.deepEqual(usage, {
    inputTokens: 30,
    cachedInputTokens: 2,
    outputTokens: 20,
    reasoningTokens: 4,
  });
  assert.equal(totalTokenCount(usage), 50);
});

test("sumCostUsd treats null costs as zero instead of poisoning the total", () => {
  assert.equal(sumCostUsd([0.01, null, 0.02]), 0.03);
});

test("proposal status classifiers match the raw ai_enrichment_proposals.status values", () => {
  assert.equal(isSuccessfulProposalStatus("succeeded"), true);
  assert.equal(isSuccessfulProposalStatus("needs_review"), true);
  assert.equal(isSuccessfulProposalStatus("failed"), false);
  assert.equal(isStructuredOutputFailureStatus("invalid_output"), true);
  assert.equal(isStructuredOutputFailureStatus("failed"), false);
});

test("safeDivide guards against zero/invalid denominators", () => {
  assert.equal(safeDivide(10, 0), null);
  assert.equal(safeDivide(10, 5), 2);
});

test("formatUsd shows extra precision for cents-scale amounts and formatPercent rounds cleanly", () => {
  assert.equal(formatUsd(0.0455), "$0.0455");
  assert.equal(formatUsd(12.3), "$12.30");
  assert.equal(formatUsd(null), "—");
  assert.equal(formatPercent(0.256), "25.6%");
  assert.equal(formatPercent(null), "—");
});
