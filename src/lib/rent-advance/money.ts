export const XCG_USD_PEG = 1.79;
export const INTERNAL_CAP = 0.24;
export const REGULATORY_CEILING = 0.27;
export const FEE_FLOOR = 0.045;
export const RELATED_PARTY_PREMIUM = 0.0025;

export class CapExceededError extends Error {
  readonly effectiveAnnualised: number;

  constructor(effectiveAnnualised: number) {
    super(
      `Effective annualised cost ${(effectiveAnnualised * 100).toFixed(2)}% is above the 24% hard cap.`,
    );
    this.name = "CapExceededError";
    this.effectiveAnnualised = effectiveAnnualised;
  }
}

export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
}

export function percentOfCents(cents: number, rate: number): number {
  return roundHalfUp(cents * rate);
}

export function formatXcg(cents: number, compact = false): string {
  const amount = cents / 100;
  if (compact && Math.abs(amount) >= 100) {
    return `Cg ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(Math.round(amount))}`;
  }
  return `Cg ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function formatXcgWhole(cents: number): string {
  return `Cg ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))}`;
}

export function formatPercent(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function usdFromXcgCents(cents: number): number {
  return cents / 100 / XCG_USD_PEG;
}

export function formatUsdFromXcg(cents: number): string {
  return `USD ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdFromXcgCents(cents))}`;
}
