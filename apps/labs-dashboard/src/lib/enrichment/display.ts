/**
 * Listing-detail helpers for source / AI / effective values and change audit.
 */

import {
  POLICY_VERSION,
  PROMPT_VERSION,
  SCHEMA_VERSION,
} from "./versions.ts";

/** Alias of shared versions — prefer `lib/enrichment/versions.ts` for bumps. */
export const CURRENT_PROMPT_VERSION = PROMPT_VERSION;
export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;
export const CURRENT_POLICY_VERSION = POLICY_VERSION;

export type ProvenanceKind =
  | "source"
  | "deterministic"
  | "ai_extracted"
  | "geospatial"
  | "manual_override";

export type FieldDecisionStatus =
  | "auto_applied"
  | "needs_attention"
  | "rejected"
  | "redundant"
  | "skipped"
  | "not_evaluated";

export type FieldDecisionView = {
  key: string;
  displayLabel: string;
  before: unknown;
  after: unknown;
  evidence: string | null;
  confidence: number | null;
  status: FieldDecisionStatus;
  model: string | null;
  runAt: string | null;
  conflict: boolean;
  reasons: string[];
};

/** Reason codes that mean review for ambiguity/conflict — not low confidence. */
export const AMBIGUITY_ATTENTION_REASON_CODES = [
  "model_conflict_indicator",
  "effective_resolver_conflict",
  "terrace_variant_needs_attention",
  "legacy_proposal_requires_audit",
] as const;

const AMBIGUITY_REASON_SET = new Set<string>(AMBIGUITY_ATTENTION_REASON_CODES);

export const PROVENANCE_LABELS: Record<
  ProvenanceKind,
  { text: string; tip: string }
> = {
  source: {
    text: "Source",
    tip: "Taken directly from the realtor website.",
  },
  deterministic: {
    text: "Deterministic",
    tip: "Normalized by Labs code from source evidence (not AI).",
  },
  ai_extracted: {
    text: "AI extracted",
    tip: "Extracted by AI from source text with supporting evidence.",
  },
  geospatial: {
    text: "Geospatial",
    tip: "Assigned from map coordinates or neighbourhood polygons.",
  },
  manual_override: {
    text: "Manual override",
    tip: "Set or corrected by an administrator.",
  },
};

export function decisionStatusLabel(status: string): string {
  switch (status) {
    case "auto_applied":
      return "Applied";
    case "needs_attention":
      return "Needs review";
    case "rejected":
      return "Rejected";
    case "redundant":
      return "Redundant";
    case "skipped":
      return "Skipped";
    default:
      return status.replaceAll("_", " ");
  }
}

/** Human-readable labels for common enrichment ReasonCode strings. */
export const REASON_CODE_LABELS: Record<string, string> = {
  forbidden_field: "This field is not allowed for AI enrichment",
  unknown_attribute_flexible_bag: "Stored as a flexible unknown attribute",
  unknown_or_empty_value: "Proposed value was unknown or empty",
  missing_or_weak_evidence: "Evidence was missing or too weak",
  evidence_not_grounded: "Evidence was not grounded in source text",
  evidence_grounding: "Evidence grounded in source text",
  terrace_variant_needs_attention: "Terrace variant needs human review",
  model_conflict_indicator: "Model reported a conflict",
  parking_spaces_not_integer: "Parking spaces must be a whole number",
  parking_spaces_out_of_bounds: "Parking spaces value was out of range",
  confidence_too_low: "Confidence too low to use",
  confidence_moderate_needs_attention: "Moderate confidence — needs review",
  confidence_below_field_auto_apply_threshold:
    "Below the field-specific auto-apply confidence bar",
  confidence_below_auto_apply_rejected:
    "Below auto-apply confidence — rejected",
  effective_resolver_conflict: "Conflicts with the effective-value resolver",
  high_confidence_evidence_backed: "High confidence with supporting evidence",
  already_represented_by_source: "Already represented by the source value",
  already_represented_by_map: "Already represented by the map assignment",
  redundant_source_value: "Redundant with the source value",
  redundant_map_value: "Redundant with the map value",
  redundant_duplicate_proposal: "Duplicate of an existing proposal",
  protected_source_field: "Protected source field — AI cannot overwrite",
  generic_neighbourhood: "Neighbourhood is too generic (island-level)",
  narrative_invents_protected_claim:
    "Narrative invented a protected factual claim",
  property_type_equivalent: "Property type is equivalent to the source",
  property_type_refines_generic_source:
    "Property type refines a generic source type",
  property_type_source_wins_quiet: "Source property type kept quietly",
  subjective_accessibility_rejected:
    "Subjective accessibility claim rejected",
  subjective_marketing_rejected: "Subjective marketing claim rejected",
  source_negation_confirms_false: "Source negation confirms a false value",
  source_negation_rejects_true: "Source negation rejects a true value",
  source_terrace_false_wins: "Source terrace=false takes precedence",
  unsupported_rejected: "Unsupported value rejected",
  legacy_proposal_requires_audit: "Legacy proposal shape — needs audit",
  curated_location_knowledge_gated_community:
    "Accepted from reviewed location knowledge (gated community)",
  waterfront_proximity_not_proven:
    "Near the sea/beach only — waterfront not proven",
  furnished_optional_or_negotiable:
    "Furniture is optional or negotiable — not auto-furnished",
  direct_bilingual_evidence: "Direct bilingual source evidence",
  evidence_span_in_source: "Evidence span found in source text",
  snippet_present_synonym_missing:
    "Snippet present but field synonym missing",
  gated_without_gate_synonym_rejected:
    "Resort/gated claim without gate language rejected",
  paraphrased_evidence_with_synonym:
    "Paraphrased evidence with a matching synonym",
  nearby_facility_not_property_attribute:
    "Nearby facility — not a property attribute",
};

export function humanizeReasonCode(code: string): string {
  const mapped = REASON_CODE_LABELS[code];
  if (mapped) return mapped;
  return code.replaceAll("_", " ");
}

export function humanizeReasonCodes(reasons: string[]): string[] {
  return reasons.map(humanizeReasonCode);
}

export type ReasonDisplay = {
  code: string;
  label: string;
};

/** Plain-language label plus the machine-readable reason code. */
export function reasonDisplays(reasons: string[]): ReasonDisplay[] {
  return reasons.map((code) => ({
    code,
    label: humanizeReasonCode(code),
  }));
}

/**
 * Why a high-confidence proposal can still need a person — conflict or
 * ambiguity, not "confidence too low."
 */
export function explainAttentionReview(
  decision: Pick<FieldDecisionView, "confidence" | "reasons" | "conflict">,
): string | null {
  const reasons = decision.reasons ?? [];
  const highConfidence =
    decision.confidence !== null && decision.confidence >= 0.85;
  const ambiguityReasons = reasons.filter((code) =>
    AMBIGUITY_REASON_SET.has(code),
  );

  if (ambiguityReasons.length || decision.conflict) {
    const parts = ambiguityReasons.map(humanizeReasonCode);
    if (decision.conflict && !ambiguityReasons.includes("model_conflict_indicator")) {
      parts.unshift("Model reported a conflict");
    }
    const detail = parts.length
      ? parts.join("; ")
      : "Conflicting signals need a human decision";
    if (highConfidence) {
      return `High model confidence (${Math.round(
        (decision.confidence as number) * 100,
      )}%) can still require review when signals conflict or the value is ambiguous — ${detail}. This is not a low-confidence rejection.`;
    }
    return detail;
  }

  if (highConfidence && reasons.includes("confidence_moderate_needs_attention")) {
    return "Confidence is high enough to surface, but policy still requires a person for this field.";
  }

  if (
    highConfidence &&
    reasons.some(
      (code) =>
        code === "missing_or_weak_evidence" ||
        code === "evidence_not_grounded" ||
        code === "snippet_present_synonym_missing",
    )
  ) {
    return `High model confidence (${Math.round(
      (decision.confidence as number) * 100,
    )}%) with incomplete evidence grounding — review required. This is not a low-confidence rejection.`;
  }

  return null;
}

export function isCurrentPolicyVersions(
  promptVersion: string | null | undefined,
  schemaVersion: string | null | undefined,
): boolean {
  return (
    promptVersion === CURRENT_PROMPT_VERSION &&
    schemaVersion === CURRENT_SCHEMA_VERSION
  );
}

type SelectableProposal = {
  id: string;
  status: string;
  generatedAt: string;
  promptVersion: string;
  schemaVersion: string;
  inputChecksum?: string | null;
};

function isSuccessStatus(status: string): boolean {
  return status === "succeeded" || status === "needs_review";
}

/**
 * Prefer the retained current-policy (v5) successful attempt, else newest
 * successful attempt, else the newest row. Matches enrichment dashboard
 * retained ranking.
 */
export function selectRetainedProposal<T extends SelectableProposal>(
  proposals: T[],
  preferredChecksum?: string | null,
): T | null {
  if (!proposals.length) return null;
  if (preferredChecksum) {
    const byChecksum = proposals.find(
      (item) => item.inputChecksum === preferredChecksum,
    );
    if (byChecksum) return byChecksum;
  }
  const successful = proposals.filter((item) => isSuccessStatus(item.status));
  if (!successful.length) return proposals[0] ?? null;
  const ranked = [...successful].sort((a, b) => {
    const aCurrent = isCurrentPolicyVersions(a.promptVersion, a.schemaVersion)
      ? 0
      : 1;
    const bCurrent = isCurrentPolicyVersions(b.promptVersion, b.schemaVersion)
      ? 0
      : 1;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;
    return b.generatedAt.localeCompare(a.generatedAt);
  });
  return ranked[0] ?? proposals[0] ?? null;
}

/**
 * Collapse duplicate field keys to the latest effective decision (last
 * occurrence wins — mirrors evaluation order in stored proposals).
 */
export function latestEffectiveDecisions(
  decisions: FieldDecisionView[],
): FieldDecisionView[] {
  const byKey = new Map<string, FieldDecisionView>();
  for (const decision of decisions) {
    const key = decision.key || decision.displayLabel;
    if (!key) continue;
    byKey.set(key, decision);
  }
  return [...byKey.values()];
}

/**
 * Neighbourhood AI candidates are audit-only when a stronger source or map
 * neighbourhood already exists. Keep them out of the operational queue.
 */
export function isOperationalAttentionDecision(
  decision: Pick<FieldDecisionView, "key" | "status" | "reasons">,
  context?: {
    sourceNeighbourhood?: string | null;
    mapNeighbourhood?: string | null;
  },
): boolean {
  const reasons = decision.reasons ?? [];
  if (
    reasons.includes("already_represented_by_source") ||
    reasons.includes("already_represented_by_map")
  ) {
    return false;
  }
  if (decision.status !== "needs_attention") return false;
  if (decision.key !== "neighbourhood_candidate") return true;
  const source = (context?.sourceNeighbourhood ?? "").trim();
  const map = (context?.mapNeighbourhood ?? "").trim();
  const sourceSpecific =
    source.length > 0 &&
    !["curacao", "curaçao", "curaçao island", "island"].includes(
      source.toLocaleLowerCase(),
    );
  const mapSpecific = map.length > 0;
  if (sourceSpecific || mapSpecific) return false;
  return true;
}

export function extractFieldDecisions(
  proposal: Record<string, unknown> | null | undefined,
  meta?: { model?: string | null; generatedAt?: string | null },
): FieldDecisionView[] {
  if (!proposal) return [];
  const raw = proposal.field_decisions;
  if (!Array.isArray(raw)) {
    // Legacy proposal shape: synthesize a light view from features.
    const features = asRecord(proposal.features);
    const legacy = Object.entries(features).flatMap(([key, value]) => {
      const item = asRecord(value);
      if (!item.value || item.value === "unknown") return [];
      return [
        {
          key,
          displayLabel: titleize(key),
          before: null,
          after: item.value,
          evidence:
            typeof item.supporting_evidence === "string"
              ? item.supporting_evidence
              : null,
          confidence:
            typeof item.confidence === "number" ? item.confidence : null,
          status: "needs_attention" as const,
          model: meta?.model ?? null,
          runAt: meta?.generatedAt ?? null,
          conflict: Boolean(item.conflict),
          reasons: ["legacy_proposal_requires_audit"],
        },
      ];
    });
    return latestEffectiveDecisions(legacy);
  }

  const mapped = raw.map((entry) => {
    const item = asRecord(entry);
    const status = String(item.final_status ?? "not_evaluated") as FieldDecisionStatus;
    return {
      key: String(item.key ?? ""),
      displayLabel: String(item.display_label ?? titleize(String(item.key ?? ""))),
      before: item.previous_effective ?? null,
      after: item.resulting_effective ?? item.proposed_value ?? null,
      evidence:
        typeof item.evidence_snippet === "string" ? item.evidence_snippet : null,
      confidence: typeof item.confidence === "number" ? item.confidence : null,
      status,
      model: meta?.model ?? null,
      runAt: meta?.generatedAt ?? null,
      conflict: Boolean(item.conflict),
      reasons: Array.isArray(item.reasons)
        ? item.reasons.map(String)
        : [],
    };
  });
  return latestEffectiveDecisions(mapped);
}

export function effectiveAttributesFromProposal(
  proposal: Record<string, unknown> | null | undefined,
): Array<{ key: string; value: unknown; provenance: ProvenanceKind }> {
  if (!proposal) return [];
  const applied = proposal.applied_attributes;
  if (!Array.isArray(applied)) return [];
  return applied
    .map((entry) => {
      const item = asRecord(entry);
      return {
        key: String(item.key ?? ""),
        value: item.effective_value ?? item.value ?? null,
        provenance: "ai_extracted" as const,
      };
    })
    .filter((item) => item.key);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function titleize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Internal Labs AI coverage categories (ops dashboard). */
export type AiCoverageCategory =
  | "ai_current"
  | "ai_never_run"
  | "ai_failed"
  | "ai_stale"
  | "ai_deferred"
  | "ai_ran_no_display_description";

export const AI_COVERAGE_LABELS: Record<AiCoverageCategory, string> = {
  ai_current: "AI current",
  ai_never_run: "AI never run",
  ai_failed: "AI failed",
  ai_stale: "AI stale",
  ai_deferred: "AI deferred",
  ai_ran_no_display_description:
    "AI ran, but no display description was approved",
};

export const AI_COVERAGE_TIPS: Record<AiCoverageCategory, string> = {
  ai_current:
    "Latest successful enrichment matches the current listing input; display description is approved or not required.",
  ai_never_run: "No successful AI enrichment has been recorded for this listing.",
  ai_failed: "The latest AI enrichment attempt failed or returned invalid output.",
  ai_stale:
    "Source content changed after the last successful enrichment (input checksum drifted).",
  ai_deferred:
    "AI was skipped because the daily/pipeline budget was exhausted (budget_deferred).",
  ai_ran_no_display_description:
    "AI ran successfully, but no display_description block was auto-applied / projected for public use.",
};

const DISPLAY_DECISION_KEYS = [
  "display_overview",
  "display_layout",
  "display_outdoor",
  "display_location",
  "display_condition",
] as const;

function hasApprovedDisplayDescription(
  proposalBody: Record<string, unknown> | null | undefined,
  publicDisplayDescription?: unknown,
): boolean {
  if (
    publicDisplayDescription &&
    typeof publicDisplayDescription === "object" &&
    !Array.isArray(publicDisplayDescription) &&
    Object.keys(publicDisplayDescription as object).length > 0
  ) {
    return true;
  }
  if (!proposalBody) return false;
  const decisions = extractFieldDecisions(proposalBody);
  return DISPLAY_DECISION_KEYS.some((key) => {
    const hit = decisions.find((d) => d.key === key);
    return hit?.status === "auto_applied" && hit.after != null && hit.after !== "";
  });
}

/**
 * Resolve internal AI coverage label from listing + retained proposal signals.
 * Prefer this over raw enrichment_status for ops dashboards.
 */
export function resolveAiCoverage(input: {
  enrichmentStatus?: string | null;
  enrichmentLastInputChecksum?: string | null;
  /** Recomputed semantic input checksum; required for accurate stale detection. */
  currentInputChecksum?: string | null;
  proposalStatus?: string | null;
  proposalInputChecksum?: string | null;
  pipelineAiResult?: string | null;
  proposalBody?: Record<string, unknown> | null;
  publicDisplayDescription?: unknown;
}): { category: AiCoverageCategory; label: string; tip: string } {
  const status = (input.enrichmentStatus ?? "not_run").toLowerCase();
  const propStatus = (input.proposalStatus ?? "").toLowerCase();
  const pipeAi = (input.pipelineAiResult ?? "").toLowerCase();

  if (pipeAi === "budget_deferred") {
    return {
      category: "ai_deferred",
      label: AI_COVERAGE_LABELS.ai_deferred,
      tip: AI_COVERAGE_TIPS.ai_deferred,
    };
  }

  const failed =
    status === "failed" ||
    propStatus === "failed" ||
    propStatus === "invalid_output";
  const never =
    (status === "not_run" ||
      status === "queued" ||
      status === "running" ||
      !status) &&
    !propStatus;

  if (never) {
    return {
      category: "ai_never_run",
      label: AI_COVERAGE_LABELS.ai_never_run,
      tip: AI_COVERAGE_TIPS.ai_never_run,
    };
  }

  if (
    failed &&
    (status === "failed" ||
      !propStatus ||
      propStatus === "failed" ||
      propStatus === "invalid_output")
  ) {
    return {
      category: "ai_failed",
      label: AI_COVERAGE_LABELS.ai_failed,
      tip: AI_COVERAGE_TIPS.ai_failed,
    };
  }

  const successish =
    ["succeeded", "needs_review", "skipped_unchanged"].includes(status) ||
    ["succeeded", "needs_review", "auto_applied", "skipped_unchanged"].includes(
      propStatus,
    );

  // Stale only when caller supplies a recomputed current input checksum.
  const retainedChecksum =
    input.proposalInputChecksum || input.enrichmentLastInputChecksum || null;
  if (
    successish &&
    input.currentInputChecksum &&
    retainedChecksum &&
    input.currentInputChecksum !== retainedChecksum
  ) {
    return {
      category: "ai_stale",
      label: AI_COVERAGE_LABELS.ai_stale,
      tip: AI_COVERAGE_TIPS.ai_stale,
    };
  }

  if (successish) {
    if (
      !hasApprovedDisplayDescription(
        input.proposalBody,
        input.publicDisplayDescription,
      )
    ) {
      return {
        category: "ai_ran_no_display_description",
        label: AI_COVERAGE_LABELS.ai_ran_no_display_description,
        tip: AI_COVERAGE_TIPS.ai_ran_no_display_description,
      };
    }
    return {
      category: "ai_current",
      label: AI_COVERAGE_LABELS.ai_current,
      tip: AI_COVERAGE_TIPS.ai_current,
    };
  }

  if (failed) {
    return {
      category: "ai_failed",
      label: AI_COVERAGE_LABELS.ai_failed,
      tip: AI_COVERAGE_TIPS.ai_failed,
    };
  }

  return {
    category: "ai_never_run",
    label: AI_COVERAGE_LABELS.ai_never_run,
    tip: AI_COVERAGE_TIPS.ai_never_run,
  };
}

/** Tone for AI coverage badges. */
export function aiCoverageTone(
  category: AiCoverageCategory,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (category) {
    case "ai_current":
      return "success";
    case "ai_stale":
    case "ai_deferred":
    case "ai_ran_no_display_description":
      return "warning";
    case "ai_failed":
      return "error";
    case "ai_never_run":
    default:
      return "neutral";
  }
}
