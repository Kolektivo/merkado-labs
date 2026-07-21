/**
 * Shared effective-neighbourhood resolution used by listing detail, browse,
 * filters, and tables.
 *
 * Priority:
 * 1. Specific explicit source neighbourhood, when valid and non-generic.
 * 2. Authoritative point-in-polygon map assignment from valid coordinates.
 * 3. High-confidence, evidence-grounded AI neighbourhood candidate — only
 *    when the source is missing/generic and the map assignment is unavailable.
 * 4. Otherwise unspecified.
 *
 * AI can never overwrite a stronger source or map value, and the map wins
 * over a conflicting AI candidate because AI is only consulted once both
 * stronger tiers are exhausted.
 *
 * The winning tier's display `name` is canonicalized for filters/cards;
 * `sourceName` / `mapName` / `aiName` keep the original evidence strings.
 *
 * Mirrors `src/merkado_labs/enrichment/neighbourhood.py` — keep both in sync
 * when the priority rules change.
 */

import {
  canonicalizeNeighbourhood,
  neighbourhoodKeysMatch,
} from "./neighbourhood-aliases";

/** Generic island-level mentions that are not a real neighbourhood. */
const GENERIC_NEIGHBOURHOOD_TERMS = new Set([
  "curacao",
  "curaçao",
  "curaçao island",
  "island",
  "netherlands antilles",
  "dutch caribbean",
]);

/**
 * Minimum AI candidate confidence to treat it as "high-confidence" —
 * mirrors `AUTO_APPLY_CONFIDENCE_THRESHOLD` in
 * `src/merkado_labs/enrichment/policy.py`.
 */
export const AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD = 0.85;

export type NeighbourhoodProvenance =
  | "source"
  | "map"
  | "ai_extracted"
  | "unavailable";

export const NEIGHBOURHOOD_PROVENANCE_LABELS: Record<
  NeighbourhoodProvenance,
  string
> = {
  source: "Website",
  map: "Map match",
  ai_extracted: "AI suggested",
  unavailable: "Not specified",
};

export type EffectiveNeighbourhood = {
  name: string | null;
  provenance: NeighbourhoodProvenance;
  sourceName: string | null;
  mapName: string | null;
  aiName: string | null;
  conflict: boolean;
  /** Display label for provenance (e.g. "Website", "Map match"). */
  label: string;
};

function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function isGenericNeighbourhood(
  value: string | null | undefined,
): boolean {
  const cleaned = clean(value);
  if (!cleaned) return true;
  if (GENERIC_NEIGHBOURHOOD_TERMS.has(cleaned.toLocaleLowerCase())) return true;
  return canonicalizeNeighbourhood(cleaned).reason === "generic";
}

/** Specific, non-generic name, or null when missing/generic. */
function specific(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned || isGenericNeighbourhood(cleaned)) return null;
  return cleaned;
}

function displayName(value: string): string {
  return canonicalizeNeighbourhood(value).canonicalDisplay ?? value;
}

export function resolveEffectiveNeighbourhood(input: {
  /** Explicit neighbourhood taken from the source website. */
  sourceName?: string | null;
  /** Point-in-polygon map assignment from valid coordinates. */
  mapName?: string | null;
  /** AI-proposed neighbourhood candidate (e.g. from an enrichment proposal). */
  aiCandidateName?: string | null;
  aiCandidateConfidence?: number | null;
  /**
   * Whether the AI candidate passed evidence grounding (e.g. the policy
   * field decision for `neighbourhood_candidate` was `auto_applied`).
   * Defaults to `true` so callers without a policy decision can rely on
   * confidence alone; pass `false` explicitly for rejected/needs-attention
   * candidates.
   */
  aiEvidenceGrounded?: boolean;
}): EffectiveNeighbourhood {
  const sourceName = clean(input.sourceName);
  const mapName = clean(input.mapName);
  const aiName = clean(input.aiCandidateName);

  const specificSource = specific(sourceName);
  const specificMap = specific(mapName);
  const specificAi = specific(aiName);

  // Conflict after canonical keys disagree — never silently merge assets.
  const conflict = Boolean(
    specificSource &&
      specificMap &&
      !neighbourhoodKeysMatch(specificSource, specificMap),
  );

  if (specificSource) {
    return {
      name: displayName(specificSource),
      provenance: "source",
      sourceName,
      mapName,
      aiName,
      conflict,
      label: NEIGHBOURHOOD_PROVENANCE_LABELS.source,
    };
  }

  if (specificMap) {
    return {
      name: displayName(specificMap),
      provenance: "map",
      sourceName,
      mapName,
      aiName,
      conflict,
      label: NEIGHBOURHOOD_PROVENANCE_LABELS.map,
    };
  }

  const grounded = input.aiEvidenceGrounded ?? true;
  const highConfidence =
    input.aiCandidateConfidence !== null &&
    input.aiCandidateConfidence !== undefined &&
    input.aiCandidateConfidence >= AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD;

  if (specificAi && grounded && highConfidence) {
    return {
      name: displayName(specificAi),
      provenance: "ai_extracted",
      sourceName,
      mapName,
      aiName,
      conflict,
      label: NEIGHBOURHOOD_PROVENANCE_LABELS.ai_extracted,
    };
  }

  return {
    name: null,
    provenance: "unavailable",
    sourceName,
    mapName,
    aiName,
    conflict,
    label: NEIGHBOURHOOD_PROVENANCE_LABELS.unavailable,
  };
}
