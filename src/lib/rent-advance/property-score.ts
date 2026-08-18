export type PropertyScoreResult = {
  listingScore: number;
  rentToMarketRatio: number | null;
  multiplier: number;
  propertyScore: number;
  marketDataAvailable: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rentToMarketMultiplier(ratio: number): number {
  if (ratio <= 0.7) return 1.1;
  if (ratio <= 0.85) return 1.05;
  if (ratio <= 1) return 1;
  if (ratio <= 1.15) return 0.95;
  return 0.9;
}

export function derivePropertyScore(
  listingScore: number,
  contractualMonthlyRentCents: number,
  estimatedMarketMonthlyRentCents: number,
): PropertyScoreResult {
  const listing = clamp(listingScore, 0, 100);
  const marketOk =
    Number.isFinite(estimatedMarketMonthlyRentCents) &&
    estimatedMarketMonthlyRentCents > 0;

  if (!marketOk) {
    return {
      listingScore: listing,
      rentToMarketRatio: null,
      multiplier: 1,
      propertyScore: clamp(Math.round(listing), 0, 100),
      marketDataAvailable: false,
    };
  }

  const ratio = contractualMonthlyRentCents / estimatedMarketMonthlyRentCents;
  const multiplier = rentToMarketMultiplier(ratio);
  return {
    listingScore: listing,
    rentToMarketRatio: ratio,
    multiplier,
    propertyScore: clamp(Math.round(listing * multiplier), 0, 100),
    marketDataAvailable: true,
  };
}
