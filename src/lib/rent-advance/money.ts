export const USDC_DECIMALS = 6;
export const USDC_ATOMIC_FACTOR = 1_000_000;
export const INTERNAL_CAP = 0.24;
export const REGULATORY_CEILING = 0.27;
export const FEE_FLOOR = 0.045;
export const RELATED_PARTY_PREMIUM = 0.0025;

/** 1 USD = 1 USDC. Book amounts stay integer cents. */
export const USD_USDC_PEG = 1;

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

export function formatUsd(cents: number, compact = false): string {
  const amount = cents / 100;
  if (compact && Math.abs(amount) >= 100) {
    return `$${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(Math.round(amount))}`;
  }
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function formatUsdWhole(cents: number): string {
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))}`;
}

/** @deprecated Demo money is USD. Kept so older call sites keep compiling. */
export function formatXcg(cents: number, compact = false): string {
  return formatUsd(cents, compact);
}

/** @deprecated Demo money is USD. Kept so older call sites keep compiling. */
export function formatXcgWhole(cents: number): string {
  return formatUsdWhole(cents);
}

export function formatPercent(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function usdcAtomicFromUsdCents(cents: number): number {
  return roundHalfUp(cents * (USDC_ATOMIC_FACTOR / 100));
}

/** @deprecated Book cents are USD. Same as usdcAtomicFromUsdCents. */
export function usdcAtomicFromXcgCents(cents: number): number {
  return usdcAtomicFromUsdCents(cents);
}

export function formatUsdcAtomic(atomic: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(atomic / USDC_ATOMIC_FACTOR)} USDC`;
}

export function formatUsdcAtomicAmount(atomic: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(atomic / USDC_ATOMIC_FACTOR);
}
