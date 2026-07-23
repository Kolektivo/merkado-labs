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
  "submitted",
  "published",
  "unpublished",
  "marked_sold",
  "marked_rented",
  "republished",
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
  "system_repair",
];

function moneyKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.amount === undefined && record.currency === undefined) return null;
  return `${record.amount}|${record.currency}`;
}

function moneyValue(
  value: unknown,
): { amount: number; currency: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const amount = Number(record.amount);
  const currency =
    typeof record.currency === "string" ? record.currency.toUpperCase() : "";
  if (!Number.isFinite(amount) || !currency) return null;
  return { amount, currency };
}

export type ActivityPriceDelta = {
  previous: { amount: number; currency: string };
  next: { amount: number; currency: string };
};

/** Public-safe asking-price delta; excludes metadata and operational notes. */
export function activityPriceDelta(
  event: ActivityEventLike,
): ActivityPriceDelta | null {
  if (event.eventType !== "price_changed") return null;
  const previous = moneyValue(event.previousValue);
  const next = moneyValue(event.newValue);
  return previous && next ? { previous, next } : null;
}

/** Shared human-facing label for internal and public Passport timelines. */
export function activityTitle(eventType: string): string {
  const labels: Record<string, string> = {
    first_seen: "First seen by Merkado",
    listing_first_seen: "First seen by Merkado",
    source_listed: "Listed on the source website",
    price_changed: "Asking price changed",
    currency_changed: "Asking currency changed",
    status_changed: "Listing status changed",
    missing_from_source: "No longer found in a complete source refresh",
    removed_from_source: "Removed from the source website",
    relisted: "Listed again on the source website",
    source_marked_sold: "Marked sold on the source website",
    source_marked_rented: "Marked rented on the source website",
    source_marked_under_contract: "Marked under contract on the source website",
    source_returned_active: "Returned to active on the source website",
    source_description_changed: "Source description changed",
    submitted: "Native listing submitted",
    published: "Native listing published",
    unpublished: "Native listing unpublished",
    marked_sold: "Marked as sold",
    marked_rented: "Marked as rented",
    republished: "Native listing republished",
    material_field_changed: "Listing details changed",
  };
  return (
    labels[eventType] ??
    eventType
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export function classifyActivityEvent(
  event: ActivityEventLike,
  previousSameType?: ActivityEventLike | null,
): PresentationDecision {
  const eventType = event.eventType;
  const notes = (event.notes ?? "").toLowerCase();

  // Hard presentation safety rules override legacy stored classifications.
  if (
    event.suppressedReason === "suspected_display_fx_jitter" ||
    (eventType === "price_changed" &&
      (() => {
        const previous = moneyValue(event.previousValue);
        const next = moneyValue(event.newValue);
        return (
          previous !== null &&
          next !== null &&
          previous.currency === next.currency &&
          Math.abs(previous.amount - next.amount) <= 1
        );
      })())
  ) {
    return {
      presentationClass: "suppressed",
      suppressedReason: "suspected_display_fx_jitter",
      presentationMetadata: { suspected_display_fx_jitter: true },
      visibleInDefault: false,
    };
  }
  if (POLICY_MARKERS.some((marker) => notes.includes(marker))) {
    return {
      presentationClass: "suppressed",
      suppressedReason: notes.includes("system_repair")
        ? "system_repair"
        : "policy_revalidation",
      presentationMetadata: { eventType },
      visibleInDefault: false,
    };
  }
  if (event.presentationClass) {
    const stored = event.presentationClass as PresentationClass;
    return {
      presentationClass: stored,
      suppressedReason: event.suppressedReason ?? null,
      presentationMetadata: event.presentationMetadata ?? null,
      visibleInDefault: stored === "primary" || stored === "secondary",
    };
  }

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
    system_repair: 0,
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
