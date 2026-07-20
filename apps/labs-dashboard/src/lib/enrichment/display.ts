/**
 * Listing-detail helpers for source / AI / effective values and change audit.
 */

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
      return "Auto-applied";
    case "needs_attention":
      return "Needs attention";
    case "rejected":
      return "Rejected";
    case "skipped":
      return "Skipped";
    default:
      return status.replaceAll("_", " ");
  }
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
  if (decision.status !== "needs_attention") return false;
  if (decision.key !== "neighbourhood_candidate") return true;
  const reasons = decision.reasons ?? [];
  if (
    reasons.includes("already_represented_by_source") ||
    reasons.includes("already_represented_by_map")
  ) {
    return false;
  }
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
    return Object.entries(features).flatMap(([key, value]) => {
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
  }

  return raw.map((entry) => {
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
