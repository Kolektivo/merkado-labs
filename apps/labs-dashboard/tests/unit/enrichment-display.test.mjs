import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_POLICY_VERSION,
  CURRENT_PROMPT_VERSION,
  CURRENT_SCHEMA_VERSION,
  explainAttentionReview,
  extractFieldDecisions,
  isCurrentPolicyVersions,
  isOperationalAttentionDecision,
  latestEffectiveDecisions,
  reasonDisplays,
  resolveAiCoverage,
  selectRetainedProposal,
} from "../../src/lib/enrichment/display.ts";

test("extractFieldDecisions keeps latest effective decision per field key", () => {
  const decisions = extractFieldDecisions({
    field_decisions: [
      {
        key: "pool",
        display_label: "Pool",
        final_status: "needs_attention",
        proposed_value: true,
        confidence: 0.98,
        conflict: true,
        reasons: ["model_conflict_indicator"],
      },
      {
        key: "pool",
        display_label: "Pool",
        final_status: "auto_applied",
        proposed_value: true,
        confidence: 0.98,
        conflict: false,
        reasons: ["high_confidence_evidence_backed"],
      },
      {
        key: "gated_community",
        display_label: "Gated",
        final_status: "needs_attention",
        proposed_value: true,
        confidence: 0.9,
        reasons: ["effective_resolver_conflict"],
      },
    ],
  });
  assert.equal(decisions.length, 2);
  const pool = decisions.find((d) => d.key === "pool");
  assert.equal(pool?.status, "auto_applied");
  assert.deepEqual(pool?.reasons, ["high_confidence_evidence_backed"]);
});

test("latestEffectiveDecisions collapses duplicate keys to last occurrence", () => {
  const collapsed = latestEffectiveDecisions([
    {
      key: "pet_suitability",
      displayLabel: "Pets",
      before: null,
      after: true,
      evidence: null,
      confidence: 0.9,
      status: "needs_attention",
      model: null,
      runAt: null,
      conflict: false,
      reasons: ["model_conflict_indicator"],
    },
    {
      key: "pet_suitability",
      displayLabel: "Pets",
      before: null,
      after: false,
      evidence: null,
      confidence: 0.95,
      status: "rejected",
      model: null,
      runAt: null,
      conflict: false,
      reasons: ["unsupported_rejected"],
    },
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].status, "rejected");
});

test("selectRetainedProposal prefers current policy over newer obsolete run", () => {
  const selected = selectRetainedProposal([
    {
      id: "new-v3",
      status: "succeeded",
      generatedAt: "2026-07-20T12:00:00Z",
      promptVersion: "listing_enrichment_v3",
      schemaVersion: "listing_enrichment_schema_v3",
    },
    {
      id: "current-v5",
      status: "needs_review",
      generatedAt: "2026-07-19T12:00:00Z",
      promptVersion: CURRENT_PROMPT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  ]);
  assert.equal(selected?.id, "current-v5");
  assert.equal(CURRENT_POLICY_VERSION, "enrichment_policy_v5");
  assert.equal(
    isCurrentPolicyVersions(CURRENT_PROMPT_VERSION, CURRENT_SCHEMA_VERSION),
    true,
  );
});

test("selectRetainedProposal honors preferred checksum", () => {
  const selected = selectRetainedProposal(
    [
      {
        id: "a",
        status: "succeeded",
        generatedAt: "2026-07-20T12:00:00Z",
        promptVersion: CURRENT_PROMPT_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        inputChecksum: "aaa",
      },
      {
        id: "b",
        status: "succeeded",
        generatedAt: "2026-07-19T12:00:00Z",
        promptVersion: CURRENT_PROMPT_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        inputChecksum: "bbb",
      },
    ],
    "bbb",
  );
  assert.equal(selected?.id, "b");
});

test("explainAttentionReview clarifies high-confidence conflicts", () => {
  const note = explainAttentionReview({
    confidence: 0.98,
    conflict: true,
    reasons: ["model_conflict_indicator"],
  });
  assert.match(note ?? "", /98%/);
  assert.match(note ?? "", /not a low-confidence/);
  assert.match(note ?? "", /conflict/i);
});

test("reasonDisplays pairs plain language with machine codes", () => {
  const rows = reasonDisplays(["effective_resolver_conflict"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "effective_resolver_conflict");
  assert.equal(
    rows[0].label,
    "Conflicts with the effective-value resolver",
  );
});

test("skipped decisions are not operational attention", () => {
  assert.equal(
    isOperationalAttentionDecision({
      key: "pool",
      status: "skipped",
      reasons: [],
    }),
    false,
  );
});

test("resolveAiCoverage labels never-run, failed, stale, and no display", () => {
  assert.equal(
    resolveAiCoverage({ enrichmentStatus: "not_run" }).label,
    "AI never run",
  );
  assert.equal(
    resolveAiCoverage({
      enrichmentStatus: "failed",
      proposalStatus: "invalid_output",
    }).label,
    "AI failed",
  );
  assert.equal(
    resolveAiCoverage({
      enrichmentStatus: "succeeded",
      proposalStatus: "succeeded",
      proposalInputChecksum: "abc",
      currentInputChecksum: "def",
      proposalBody: {
        field_decisions: [
          {
            key: "display_overview",
            final_status: "auto_applied",
            proposed_value: "Nice villa",
          },
        ],
      },
    }).label,
    "AI stale",
  );
  assert.equal(
    resolveAiCoverage({
      enrichmentStatus: "succeeded",
      proposalStatus: "succeeded",
      proposalBody: { field_decisions: [] },
    }).label,
    "AI ran, but no display description was approved",
  );
  assert.equal(
    resolveAiCoverage({
      enrichmentStatus: "succeeded",
      proposalStatus: "succeeded",
      publicDisplayDescription: { overview: "Nice villa" },
    }).label,
    "AI current",
  );
  assert.equal(
    resolveAiCoverage({ pipelineAiResult: "budget_deferred" }).label,
    "AI deferred",
  );
});
