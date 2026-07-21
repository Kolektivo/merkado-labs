/**
 * Additive presentation classification for listing activity timelines.
 * Does not delete immutable events — hide/group in the default view only.
 */

export type PresentationClass =
  | "primary"
  | "secondary"
  | "suppressed"
  | "grouped";

export type PresentationDecision = {
  presentationClass: PresentationClass;
  suppressedReason: string | null;
  presentationMetadata: Record<string, unknown> | null;
  visibleInDefault: boolean;
};

export type ActivityEventLike = {
  id?: string;
  eventType: string;
  eventAt?: string;
  previousValue?: unknown;
  newValue?: unknown;
  notes?: string | null;
  presentationClass?: string | null;
  suppressedReason?: string | null;
  presentationMetadata?: Record<string, unknown> | null;
};

const PRIMARY_EVENT_TYPES = new Set([
  "first_seen",
  "source_listed",
  "price_changed",
  "currency_changed",
  "source_marked_sold",
  "source_marked_rented",
  "source_marked_under_contract",
  "source_returned_active",
  "source_description_changed",
  "missing_from_source",
  "removed_from_source",
  "relisted",
  "source_attribution_changed",
  "material_field_changed",
]);

const RATE_ONLY_TYPES = new Set(["benchmark_recalculated"]);

const ENRICHMENT_TYPES = new Set([
  "ai_enrichment_started",
  "ai_enrichment_completed",
  "ai_enrichment_failed",
  "ai_enrichment_skipped",
  "ai_enrichment_auto_applied",
  "ai_enrichment_needs_attention",
  "enrichment_completed",
]);

const OPS_NOISE_TYPES = new Set([
  "manual_override",
  "source_refresh_completed",
]);

const POLICY_MARKERS = [
  "policy_revalidation",
  "zero_cost_reeval",
  "reeval_stored_proposals",
  "policy_rematerialization",
];

function moneyKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.amount === undefined && record.currency === undefined) return null;
  return `${record.amount}|${record.currency}`;
}

export function classifyActivityEvent(
  event: ActivityEventLike,
  previousSameType?: ActivityEventLike | null,
): PresentationDecision {
  if (event.presentationClass) {
    const stored = event.presentationClass as PresentationClass;
    return {
      presentationClass: stored,
      suppressedReason: event.suppressedReason ?? null,
      presentationMetadata: event.presentationMetadata ?? null,
      visibleInDefault: stored === "primary" || stored === "secondary",
    };
  }

  const eventType = event.eventType;
  const notes = (event.notes ?? "").toLowerCase();

  if (RATE_ONLY_TYPES.has(eventType)) {
    return {
      presentationClass: "suppressed",
      suppressedReason: "benchmark_rate_only",
      presentationMetadata: { eventType },
      visibleInDefault: false,
    };
  }
  if (ENRICHMENT_TYPES.has(eventType)) {
    return {
      presentationClass: "suppressed",
      suppressedReason: "enrichment_only",
      presentationMetadata: { eventType },
      visibleInDefault: false,
    };
  }
  if (OPS_NOISE_TYPES.has(eventType)) {
    return {
      presentationClass: "suppressed",
      suppressedReason: "ops_noise",
      presentationMetadata: { eventType },
      visibleInDefault: false,
    };
  }
  if (POLICY_MARKERS.some((marker) => notes.includes(marker))) {
    return {
      presentationClass: "suppressed",
      suppressedReason: "policy_revalidation",
      presentationMetadata: { eventType },
      visibleInDefault: false,
    };
  }

  if (
    previousSameType &&
    (eventType === "price_changed" || eventType === "currency_changed") &&
    moneyKey(event.previousValue) === moneyKey(previousSameType.previousValue) &&
    moneyKey(event.newValue) === moneyKey(previousSameType.newValue)
  ) {
    return {
      presentationClass: "suppressed",
      suppressedReason: "dual_writer_duplicate",
      presentationMetadata: {
        eventType,
        duplicateOf: previousSameType.id ?? null,
      },
      visibleInDefault: false,
    };
  }

  if (eventType === "price_changed") {
    const prev = event.previousValue as Record<string, unknown> | null;
    const next = event.newValue as Record<string, unknown> | null;
    if (
      prev &&
      next &&
      prev.currency === next.currency &&
      prev.amount !== undefined &&
      next.amount !== undefined
    ) {
      const delta = Math.abs(Number(prev.amount) - Number(next.amount));
      if (Number.isFinite(delta) && delta <= 1) {
        return {
          presentationClass: "secondary",
          suppressedReason: "suspected_display_fx_jitter",
          presentationMetadata: { suspected_display_fx_jitter: true },
          visibleInDefault: true,
        };
      }
    }
  }

  if (PRIMARY_EVENT_TYPES.has(eventType)) {
    return {
      presentationClass: "primary",
      suppressedReason: null,
      presentationMetadata: null,
      visibleInDefault: true,
    };
  }

  return {
    presentationClass: "secondary",
    suppressedReason: "unclassified_secondary",
    presentationMetadata: { eventType },
    visibleInDefault: true,
  };
}

/** Default timeline: genuine seller/source activity (newest-first input). */
export function filterDefaultTimeline<T extends ActivityEventLike>(
  events: T[],
  options: { includeSecondary?: boolean } = {},
): T[] {
  const includeSecondary = options.includeSecondary ?? true;
  const chronological = [...events].reverse();
  const lastByType = new Map<string, ActivityEventLike>();
  const kept = new Set<string>();

  for (const event of chronological) {
    const decision = classifyActivityEvent(
      event,
      lastByType.get(event.eventType) ?? null,
    );
    lastByType.set(event.eventType, event);
    if (!decision.visibleInDefault) continue;
    if (decision.presentationClass === "secondary" && !includeSecondary) {
      continue;
    }
    kept.add(event.id ?? String(events.indexOf(event)));
  }

  return events.filter((event, index) =>
    kept.has(event.id ?? String(index)),
  );
}

export function dryRunPresentationCounts(
  events: ActivityEventLike[],
): Record<string, number> {
  const chronological = [...events].reverse();
  const lastByType = new Map<string, ActivityEventLike>();
  const counts: Record<string, number> = {
    total: 0,
    primary: 0,
    secondary: 0,
    suppressed: 0,
    grouped: 0,
    visible_default: 0,
    benchmark_rate_only: 0,
    enrichment_only: 0,
    dual_writer_duplicate: 0,
    policy_revalidation: 0,
    ops_noise: 0,
    suspected_display_fx_jitter: 0,
  };

  for (const event of chronological) {
    const decision = classifyActivityEvent(
      event,
      lastByType.get(event.eventType) ?? null,
    );
    lastByType.set(event.eventType, event);
    counts.total += 1;
    counts[decision.presentationClass] =
      (counts[decision.presentationClass] ?? 0) + 1;
    if (decision.visibleInDefault) counts.visible_default += 1;
    if (decision.suppressedReason) {
      counts[decision.suppressedReason] =
        (counts[decision.suppressedReason] ?? 0) + 1;
    }
  }
  return counts;
}
