import type { ConversionMethod } from "@/lib/domain/types";

const USD_TO_XCG = 1.79;

export type BenchmarkConversion = {
  benchmarkPriceXcg: number | null;
  conversionMethod: ConversionMethod | null;
  conversionRate: number | null;
  conversionProvider: string | null;
  conversionRateAt: string | null;
};

/** Deterministic Labs benchmark rules for admin-entered original amounts. */
export function convertOriginalToBenchmark(
  amount: number,
  currency: string,
  eurToXcgRate?: number | null,
): BenchmarkConversion {
  const code = currency.trim().toUpperCase();
  const now = new Date().toISOString();

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      benchmarkPriceXcg: null,
      conversionMethod: null,
      conversionRate: null,
      conversionProvider: null,
      conversionRateAt: null,
    };
  }

  if (code === "XCG" || code === "ANG" || code === "NAF") {
    return {
      benchmarkPriceXcg: amount,
      conversionMethod: code === "XCG" ? "identity" : "legacy_1_to_1",
      conversionRate: 1,
      conversionProvider: "labs_native_listing",
      conversionRateAt: now,
    };
  }

  if (code === "USD") {
    return {
      benchmarkPriceXcg: amount * USD_TO_XCG,
      conversionMethod: "usd_fixed_peg",
      conversionRate: USD_TO_XCG,
      conversionProvider: "labs_native_listing",
      conversionRateAt: now,
    };
  }

  if (code === "EUR") {
    if (eurToXcgRate == null || !Number.isFinite(eurToXcgRate) || eurToXcgRate <= 0) {
      return {
        benchmarkPriceXcg: null,
        conversionMethod: null,
        conversionRate: null,
        conversionProvider: null,
        conversionRateAt: null,
      };
    }
    return {
      benchmarkPriceXcg: amount * eurToXcgRate,
      conversionMethod: "eur_api",
      conversionRate: eurToXcgRate,
      conversionProvider: "labs_native_listing_eur_pending_or_fixed",
      conversionRateAt: now,
    };
  }

  return {
    benchmarkPriceXcg: null,
    conversionMethod: null,
    conversionRate: null,
    conversionProvider: null,
    conversionRateAt: null,
  };
}
