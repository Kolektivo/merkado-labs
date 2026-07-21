import type { PriceObservation } from "@/lib/domain/types";

export type PriceObservationPoint = Pick<
  PriceObservation,
  "id" | "observedAt" | "price" | "currency"
> & {
  originalPrice?: number | null;
  originalCurrency?: string | null;
  conversionProvider?: string | null;
  conversionRate?: number | null;
  suppressedDuplicateCount?: number;
};

function moneyKey(point: {
  price: number;
  currency: string;
  originalPrice?: number | null;
  originalCurrency?: string | null;
}): string {
  const amount = point.originalPrice ?? point.price;
  const currency = point.originalCurrency ?? point.currency;
  return `${amount}|${currency}`;
}

/**
 * Collapse consecutive identical asking amounts/currencies into one UI point.
 * Raw immutable rows remain in the database for audit; this is read-model only.
 */
export function collapseUnchangedPriceObservations<
  T extends PriceObservationPoint,
>(observations: T[]): T[] {
  if (!observations.length) return [];

  const sorted = [...observations].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt),
  );
  const collapsed: T[] = [];

  for (const point of sorted) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && moneyKey(previous) === moneyKey(point)) {
      collapsed[collapsed.length - 1] = {
        ...previous,
        // Keep the newest observation id/timestamp for "current" semantics
        // while counting how many identical raw rows were suppressed.
        id: point.id,
        observedAt: point.observedAt,
        suppressedDuplicateCount:
          (previous.suppressedDuplicateCount ?? 0) + 1,
      };
      continue;
    }
    collapsed.push({ ...point, suppressedDuplicateCount: 0 });
  }

  return collapsed;
}

/** True when two consecutive points represent a genuine asking-price change. */
export function isGenuinePriceChange(
  previous: PriceObservationPoint | null | undefined,
  next: PriceObservationPoint,
): boolean {
  if (!previous) return true;
  return moneyKey(previous) !== moneyKey(next);
}

export function countDistinctAskingPrices(
  observations: PriceObservationPoint[],
): number {
  return collapseUnchangedPriceObservations(observations).length;
}

export function describeConversionLabel(input: {
  conversionMethod: string | null | undefined;
  conversionProvider: string | null | undefined;
  conversionRate: number | null | undefined;
  conversionRateAt?: string | null | undefined;
}): string {
  const provider = input.conversionProvider ?? "";
  if (provider === "ecb_eur_usd_xcg_peg") {
    const rate =
      input.conversionRate !== null && input.conversionRate !== undefined
        ? ` · EUR→XCG ${input.conversionRate}`
        : "";
    const observed = input.conversionRateAt
      ? ` · ECB observation ${input.conversionRateAt.slice(0, 10)}`
      : "";
    return `ECB USD-per-EUR reference × 1.79 USD→XCG peg${rate}${observed}`;
  }
  if (
    provider === "fixed_test" ||
    provider.startsWith("fixed_") ||
    provider.startsWith("manual") ||
    provider.endsWith("_test")
  ) {
    const rate =
      input.conversionRate !== null && input.conversionRate !== undefined
        ? ` @ ${input.conversionRate}`
        : "";
    return `Historical/manual test EUR→XCG rate${rate} (not a current production benchmark)`;
  }
  if (input.conversionMethod === "usd_fixed_peg") {
    return "Fixed USD→XCG peg (1 USD = 1.79 XCG)";
  }
  if (input.conversionMethod === "identity") {
    return "Identity (XCG/ANG)";
  }
  if (input.conversionMethod === "source_official_conversion") {
    return "Source-official XCG/ANG amount (not Merkado FX)";
  }
  if (input.conversionMethod === "eur_api") {
    return "EUR→XCG via exchange provider";
  }
  if (provider === "source:official_alternate") {
    return "Source-official XCG/ANG amount (not Merkado FX)";
  }
  return input.conversionMethod ?? "Conversion provenance unknown";
}

export function isCurrentProductionBenchmark(provider: string | null | undefined): boolean {
  return provider === "ecb_eur_usd_xcg_peg";
}
