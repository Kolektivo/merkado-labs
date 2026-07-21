/**
 * XCG price-over-time series from genuine asking-price changes.
 * Rate-only benchmark recalculations do not move the chart.
 */

export type OfficialAlternatePrice = {
  amount: number | string;
  currency: string;
  provenance?: string | null;
  evidence?: string | null;
  source_label?: string | null;
  sourceLabel?: string | null;
};

export type AskingObservation = {
  id: string;
  observedAt: string;
  price: number;
  currency: string;
  originalPrice?: number | null;
  originalCurrency?: string | null;
  benchmarkPriceXcg?: number | null;
  conversionProvider?: string | null;
  conversionMethod?: string | null;
  officialAlternatePrices?: OfficialAlternatePrice[] | null;
};

export type XcgPricePoint = {
  date: string;
  /** Chart Y value in XCG. */
  priceXcg: number;
  originalAmount: number;
  originalCurrency: string;
  xcgProvenance: "source_official_conversion" | "merkado_benchmark";
  conversionProvider: string | null;
  observationId: string;
  observedAt: string;
};

const XCG_EQUIVALENT = new Set(["XCG", "ANG", "NAF"]);

function askingKey(point: AskingObservation): string {
  const amount = point.originalPrice ?? point.price;
  const currency = point.originalCurrency ?? point.currency;
  return `${amount}|${currency}`;
}

function pickOfficialXcg(
  alts: OfficialAlternatePrice[] | null | undefined,
): { amount: number; currency: string } | null {
  if (!alts?.length) return null;
  for (const alt of alts) {
    const provenance = (alt.provenance ?? "").toLowerCase();
    if (provenance && provenance !== "source_official_conversion") continue;
    const currency = String(alt.currency ?? "").toUpperCase();
    if (!XCG_EQUIVALENT.has(currency)) continue;
    const amount = Number(alt.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return { amount, currency };
  }
  return null;
}

/**
 * Collapse consecutive identical asking amounts, then map each material
 * asking change to an XCG Y-value (official XCG when stored, else benchmark).
 */
export function buildXcgPriceSeries(
  observations: AskingObservation[],
): XcgPricePoint[] {
  if (!observations.length) return [];

  const sorted = [...observations].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt),
  );
  const material: AskingObservation[] = [];
  for (const point of sorted) {
    const previous = material[material.length - 1];
    if (previous && askingKey(previous) === askingKey(point)) {
      material[material.length - 1] = point;
      continue;
    }
    material.push(point);
  }

  const series: XcgPricePoint[] = [];
  for (const point of material) {
    const originalAmount = point.originalPrice ?? point.price;
    const originalCurrency = (
      point.originalCurrency ??
      point.currency ??
      ""
    ).toUpperCase();
    const official = pickOfficialXcg(point.officialAlternatePrices);
    let priceXcg: number | null = null;
    let xcgProvenance: XcgPricePoint["xcgProvenance"] = "merkado_benchmark";

    if (official) {
      priceXcg = official.amount;
      xcgProvenance = "source_official_conversion";
    } else if (
      point.benchmarkPriceXcg !== null &&
      point.benchmarkPriceXcg !== undefined
    ) {
      priceXcg = point.benchmarkPriceXcg;
      xcgProvenance = "merkado_benchmark";
    } else if (XCG_EQUIVALENT.has(originalCurrency)) {
      priceXcg = originalAmount;
      xcgProvenance = "merkado_benchmark";
    }

    if (priceXcg === null || !Number.isFinite(priceXcg)) continue;

    series.push({
      date: point.observedAt.slice(0, 10),
      priceXcg,
      originalAmount,
      originalCurrency,
      xcgProvenance,
      conversionProvider: point.conversionProvider ?? null,
      observationId: point.id,
      observedAt: point.observedAt,
    });
  }
  return series;
}
