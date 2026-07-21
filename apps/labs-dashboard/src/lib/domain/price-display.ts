/**
 * XCG-primary price display model for listing detail, browse cards, and the
 * listing table. Canonical rules come from
 * `docs/06-currency-and-pricing-rules.md`:
 *
 * - Primary: XCG benchmark, prefixed `Cg`.
 * - Secondary: original source amount when its currency differs from
 *   XCG/ANG/NAf (ANG/NAf are 1:1 with XCG, so they are not "different").
 * - True foreign-currency conversions expose an indicative tip (not inline
 *   disclaimer text): "Indicative equivalent based on known information."
 * - Sold listings additionally show: "Last known listing price. The actual
 *   sale price may differ."
 * - If an original price exists but no XCG benchmark is available, show the
 *   original with "XCG equivalent currently unavailable" instead of a
 *   fabricated conversion.
 */

/** Tip content for true foreign-currency → XCG conversions. */
export const INDICATIVE_PRICE_TIP =
  "Indicative equivalent based on known information.";

const SOLD_DISCLAIMER =
  "Last known listing price. The actual sale price may differ.";
const BENCHMARK_UNAVAILABLE_LABEL = "XCG equivalent currently unavailable";

/** ANG / NAf are 1:1 with XCG — not treated as a "different" currency. */
const XCG_EQUIVALENT_CURRENCIES = new Set(["XCG", "ANG", "NAF"]);

export type PriceDisplayModel = {
  primaryLabel: string;
  primaryAmount: number | null;
  primaryCurrency: "XCG" | null;
  secondaryLabel: string | null;
  disclaimer: string | null;
  soldDisclaimer: string | null;
  benchmarkUnavailable: boolean;
  /**
   * True only for a real foreign-currency conversion (original differs from
   * XCG/ANG/NAF and an XCG benchmark exists). Identity XCG/ANG/NAF cases are false.
   */
  showIndicativeTip: boolean;
  /** Null excludes the listing from mixed-currency sort. */
  sortKeyXcg: number | null;
};

function isSoldStatus(listingStatus?: string | null, isSold?: boolean) {
  return Boolean(isSold) || (listingStatus ?? "").toLowerCase() === "sold";
}

function formatAmount(amount: number): string {
  // Keep amount formatting locale-stable so SSR and the browser never diverge.
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * Canonical XCG primary label. Do not use `Intl` currency style for XCG —
 * Node and browsers disagree on the symbol (`Cg.` vs `XCG`), which breaks
 * hydration in client components.
 */
export function formatXcgPrimary(amount: number): string {
  return `Cg ${formatAmount(amount)}`;
}

export function formatOriginalPrice(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!code) return formatAmount(amount);
  if (code === "XCG" || code === "ANG" || code === "NAF") {
    return formatXcgPrimary(amount);
  }
  return `${code} ${formatAmount(amount)}`;
}

export function buildPriceDisplay(input: {
  originalPrice: number | null;
  originalCurrency: string | null;
  benchmarkPriceXcg: number | null;
  listingStatus?: string | null;
  isSold?: boolean;
}): PriceDisplayModel {
  const sold = isSoldStatus(input.listingStatus, input.isSold);
  const soldDisclaimer = sold ? SOLD_DISCLAIMER : null;

  const hasOriginal =
    input.originalPrice !== null &&
    input.originalPrice !== undefined &&
    Boolean(input.originalCurrency);
  const hasBenchmark =
    input.benchmarkPriceXcg !== null && input.benchmarkPriceXcg !== undefined;

  const originalCurrencyCode = (input.originalCurrency ?? "").toUpperCase();
  const originalDiffersFromXcg =
    hasOriginal && !XCG_EQUIVALENT_CURRENCIES.has(originalCurrencyCode);
  const showIndicativeTip = Boolean(hasBenchmark && originalDiffersFromXcg);

  if (hasBenchmark) {
    const secondaryLabel =
      hasOriginal && originalDiffersFromXcg
        ? formatOriginalPrice(
            input.originalPrice as number,
            input.originalCurrency as string,
          )
        : null;
    return {
      primaryLabel: "Cg",
      primaryAmount: input.benchmarkPriceXcg as number,
      primaryCurrency: "XCG",
      secondaryLabel,
      // Tip covers indicative conversion; identity XCG/ANG/NAF need no text.
      disclaimer: null,
      soldDisclaimer,
      benchmarkUnavailable: false,
      showIndicativeTip,
      sortKeyXcg: input.benchmarkPriceXcg as number,
    };
  }

  if (hasOriginal) {
    return {
      primaryLabel: input.originalCurrency as string,
      primaryAmount: input.originalPrice as number,
      primaryCurrency: null,
      secondaryLabel: null,
      disclaimer: BENCHMARK_UNAVAILABLE_LABEL,
      soldDisclaimer,
      benchmarkUnavailable: true,
      showIndicativeTip: false,
      sortKeyXcg: null,
    };
  }

  return {
    primaryLabel: "Cg",
    primaryAmount: null,
    primaryCurrency: "XCG",
    secondaryLabel: null,
    disclaimer: null,
    soldDisclaimer,
    benchmarkUnavailable: true,
    showIndicativeTip: false,
    sortKeyXcg: null,
  };
}
