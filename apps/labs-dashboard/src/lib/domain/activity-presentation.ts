/**
 * Deterministic Passport activity presentation contract.
 *
 * Shared by public Browse Passports and admin listing timelines. Designed so
 * a future car Passport can reuse the same filter/delta helpers without
 * depending on property-specific writers.
 *
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

/** Listing context used to separate asking-anchor changes from FX/display noise. */
export type PassportTimelineContext = {
  audience?: "public" | "admin";
  /**
   * True when the listing has a source-published XCG/ANG alternate
   * (`source_official_conversion`). Foreign display lines are not the
   * stable asking anchor for public activity.
   */
  hasOfficialXcgAlternate?: boolean;
  /**
   * Current stable asking currency on the listing (e.g. XCG after RE/MAX
   * re-anchor). Historical foreign display events are suppressed when this
   * is an XCG-equivalent currency.
   */
  stableAskingCurrency?: string | null;
  /** Approved EUR→XCG rate when converting a genuine EUR asking anchor. */
  eurToXcgRate?: number | null;
  includeSecondary?: boolean;
};

const PRIMARY_EVENT_TYPES = new Set([
  "first_seen",
  "source_listed",
  "price_changed",
  // currency_changed is retained in storage but never primary for Passport UI
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
  "currency_changed",
]);

const POLICY_MARKERS = [
  "policy_revalidation",
  "zero_cost_reeval",
  "reeval_stored_proposals",
  "policy_rematerialization",
  "system_repair",
];

const XCG_EQUIVALENT = new Set(["XCG", "ANG", "NAF"]);
const USD_TO_XCG = 1.79;

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

/** Numeric-normalized money key so "100" and "100.0" collapse as duplicates. */
function moneyKeyNormalized(value: unknown): string | null {
  const money = moneyValue(value);
  if (!money) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.currency === undefined && record.amount === undefined) return null;
    const currency =
      typeof record.currency === "string"
        ? record.currency.toUpperCase()
        : String(record.currency ?? "");
    return `${record.amount}|${currency}`;
  }
  return `${money.amount}|${money.currency}`;
}

function currencyOnlyKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.currency !== "string") return null;
  return record.currency.toUpperCase();
}

/** Convert an asking amount to whole XCG when the conversion is confident. */
export function toNormalizedXcgAmount(
  amount: number,
  currency: string,
  eurToXcgRate?: number | null,
): number | null {
  const code = currency.trim().toUpperCase();
  if (!Number.isFinite(amount)) return null;
  if (XCG_EQUIVALENT.has(code)) return Math.round(amount);
  if (code === "USD") return Math.round(amount * USD_TO_XCG);
  if (code === "EUR") {
    if (eurToXcgRate == null || !Number.isFinite(eurToXcgRate) || eurToXcgRate <= 0) {
      return null;
    }
    return Math.round(amount * eurToXcgRate);
  }
  return null;
}

export type ActivityPriceDelta = {
  previous: { amount: number; currency: string };
  next: { amount: number; currency: string };
};

export type ActivityPublicXcgDelta = {
  previousXcg: number;
  nextXcg: number;
  /** Original asking sides retained for admin provenance only. */
  previousOriginal: { amount: number; currency: string };
  nextOriginal: { amount: number; currency: string };
};

/** Admin/audit asking-currency delta (never used for public Passport rows). */
export function activityPriceDelta(
  event: ActivityEventLike,
): ActivityPriceDelta | null {
  if (event.eventType !== "price_changed") return null;
  const previous = moneyValue(event.previousValue);
  const next = moneyValue(event.newValue);
  return previous && next ? { previous, next } : null;
}

/**
 * Public Passport price delta — XCG only.
 * Returns null when the event is not a confident asking-anchor change.
 */
export function activityPublicXcgDelta(
  event: ActivityEventLike,
  context: PassportTimelineContext = {},
): ActivityPublicXcgDelta | null {
  if (event.eventType !== "price_changed") return null;
  const previous = moneyValue(event.previousValue);
  const next = moneyValue(event.newValue);
  if (!previous || !next) return null;
  if (previous.currency !== next.currency) return null;

  const previousXcg = toNormalizedXcgAmount(
    previous.amount,
    previous.currency,
    context.eurToXcgRate,
  );
  const nextXcg = toNormalizedXcgAmount(
    next.amount,
    next.currency,
    context.eurToXcgRate,
  );
  if (previousXcg == null || nextXcg == null) return null;
  if (previousXcg === nextXcg) return null;
  return {
    previousXcg,
    nextXcg,
    previousOriginal: previous,
    nextOriginal: next,
  };
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

function isForeignDisplayCurrency(currency: string): boolean {
  return !XCG_EQUIVALENT.has(currency) && currency !== "USD";
}

export function classifyActivityEvent(
  event: ActivityEventLike,
  previousSameType?: ActivityEventLike | null,
  context: PassportTimelineContext = {},
): PresentationDecision {
  const eventType = event.eventType;
  const notes = (event.notes ?? "").toLowerCase();
  const audience = context.audience ?? "public";

  // Hard presentation safety rules override legacy stored classifications.
  if (eventType === "currency_changed") {
    return {
      presentationClass: "suppressed",
      suppressedReason: "currency_session_not_public",
      presentationMetadata: {
        eventType,
        admin_review: audience === "admin",
      },
      visibleInDefault: false,
    };
  }

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

  if (eventType === "price_changed") {
    const previous = moneyValue(event.previousValue);
    const next = moneyValue(event.newValue);
    if (previous && next) {
      if (previous.amount === next.amount && previous.currency === next.currency) {
        return {
          presentationClass: "suppressed",
          suppressedReason: "identical_observation",
          presentationMetadata: { eventType },
          visibleInDefault: false,
        };
      }
      if (previous.currency !== next.currency) {
        return {
          presentationClass: "suppressed",
          suppressedReason: "currency_session_switch",
          presentationMetadata: {
            eventType,
            previousCurrency: previous.currency,
            nextCurrency: next.currency,
            admin_review: true,
          },
          visibleInDefault: false,
        };
      }
      // Source-official XCG alternate / re-anchored XCG asking is the stable signal.
      // Historical EUR (and other foreign display) wobble must not appear as price changes.
      const stableCurrency = (context.stableAskingCurrency ?? "").toUpperCase();
      const stableIsXcgEquivalent = XCG_EQUIVALENT.has(stableCurrency);
      if (
        isForeignDisplayCurrency(previous.currency) &&
        (context.hasOfficialXcgAlternate || stableIsXcgEquivalent)
      ) {
        return {
          presentationClass: "suppressed",
          suppressedReason: "non_anchor_display_observation",
          presentationMetadata: {
            eventType,
            currency: previous.currency,
            stableAskingCurrency: stableCurrency || null,
            admin_review: true,
          },
          visibleInDefault: false,
        };
      }
      const previousXcg = toNormalizedXcgAmount(
        previous.amount,
        previous.currency,
        context.eurToXcgRate,
      );
      const nextXcg = toNormalizedXcgAmount(
        next.amount,
        next.currency,
        context.eurToXcgRate,
      );
      if (previousXcg != null && nextXcg != null && previousXcg === nextXcg) {
        return {
          presentationClass: "suppressed",
          suppressedReason: "same_normalized_xcg",
          presentationMetadata: {
            eventType,
            previousXcg,
            nextXcg,
          },
          visibleInDefault: false,
        };
      }
      // Genuine EUR asking change requires a confident XCG conversion for public rows.
      if (
        audience === "public" &&
        previous.currency === "EUR" &&
        (previousXcg == null || nextXcg == null)
      ) {
        return {
          presentationClass: "suppressed",
          suppressedReason: "ambiguous_anchor",
          presentationMetadata: {
            eventType,
            admin_review: true,
          },
          visibleInDefault: false,
        };
      }
    }
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

  // Stored classifications apply only when hard safety rules above did not fire.
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
    moneyKeyNormalized(event.previousValue) ===
      moneyKeyNormalized(previousSameType.previousValue) &&
    moneyKeyNormalized(event.newValue) ===
      moneyKeyNormalized(previousSameType.newValue)
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
  if (
    previousSameType &&
    eventType === "currency_changed" &&
    currencyOnlyKey(event.previousValue) ===
      currencyOnlyKey(previousSameType.previousValue) &&
    currencyOnlyKey(event.newValue) === currencyOnlyKey(previousSameType.newValue)
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

/**
 * Default Passport timeline (newest-first input).
 * Keeps a single earliest "First seen by Merkado" and applies suppress rules.
 */
export function filterDefaultTimeline<T extends ActivityEventLike>(
  events: T[],
  options: PassportTimelineContext = {},
): T[] {
  const includeSecondary = options.includeSecondary ?? true;
  const chronological = [...events].reverse();
  const lastByType = new Map<string, ActivityEventLike>();
  const kept = new Set<string>();
  let keptFirstSeen = false;

  for (const event of chronological) {
    const eventType = event.eventType;
    if (eventType === "first_seen" || eventType === "listing_first_seen") {
      if (keptFirstSeen) {
        continue;
      }
      const decision = classifyActivityEvent(event, null, options);
      if (!decision.visibleInDefault) continue;
      if (decision.presentationClass === "secondary" && !includeSecondary) {
        continue;
      }
      keptFirstSeen = true;
      kept.add(event.id ?? String(events.indexOf(event)));
      lastByType.set(eventType, event);
      continue;
    }

    const decision = classifyActivityEvent(
      event,
      lastByType.get(eventType) ?? null,
      options,
    );
    lastByType.set(eventType, event);
    if (!decision.visibleInDefault) continue;
    if (decision.presentationClass === "secondary" && !includeSecondary) {
      continue;
    }
    kept.add(event.id ?? String(events.indexOf(event)));
  }

  return events.filter((event, index) => kept.has(event.id ?? String(index)));
}

/** Alias for the reusable Passport presentation contract. */
export const buildPassportTimeline = filterDefaultTimeline;

/** Latest visible material event timestamp (not scraper last_seen_at). */
export function latestVisibleMaterialAt(
  events: ActivityEventLike[],
  options: PassportTimelineContext = {},
): string | null {
  const visible = filterDefaultTimeline(events, options);
  for (const event of visible) {
    if (event.eventAt) return event.eventAt;
  }
  return null;
}

export function dryRunPresentationCounts(
  events: ActivityEventLike[],
  options: PassportTimelineContext = {},
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
    currency_session_not_public: 0,
    currency_session_switch: 0,
    non_anchor_display_observation: 0,
    same_normalized_xcg: 0,
    identical_observation: 0,
    ambiguous_anchor: 0,
    duplicate_first_seen: 0,
  };

  let keptFirstSeen = false;
  for (const event of chronological) {
    const eventType = event.eventType;
    counts.total += 1;
    if (eventType === "first_seen" || eventType === "listing_first_seen") {
      if (keptFirstSeen) {
        counts.suppressed += 1;
        counts.duplicate_first_seen += 1;
        continue;
      }
      keptFirstSeen = true;
    }
    const decision = classifyActivityEvent(
      event,
      lastByType.get(eventType) ?? null,
      options,
    );
    lastByType.set(eventType, event);
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

/** Detect source-official XCG/ANG alternate on a listing row. */
export function listingHasOfficialXcgAlternate(
  officialAlternatePrices: unknown,
  conversionMethod?: string | null,
): boolean {
  if (conversionMethod === "source_official_conversion") return true;
  if (!Array.isArray(officialAlternatePrices)) return false;
  return officialAlternatePrices.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    const currency =
      typeof record.currency === "string" ? record.currency.toUpperCase() : "";
    const provenance =
      typeof record.provenance === "string" ? record.provenance : "";
    return (
      XCG_EQUIVALENT.has(currency) &&
      (provenance === "source_official_conversion" || provenance === "")
    );
  });
}
