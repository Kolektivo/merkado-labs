import {
  CapExceededError,
  FEE_FLOOR,
  INTERNAL_CAP,
  RELATED_PARTY_PREMIUM,
  percentOfCents,
} from "@/lib/rent-advance/money";
import { bandAdjustment, type ScoreBand } from "@/lib/rent-advance/scoring";

export const APPROVED_TERMS = [6] as const;
export const DISPLAY_TERMS = [3, 6, 9, 12] as const;

export const BASE_FEE_BY_TERM: Record<number, number | null> = {
  3: null,
  6: 0.0575,
  9: 0.0825,
  12: 0.1075,
};

export type QuoteInput = {
  monthlyRentCents: number;
  months: number;
  feeRate?: number;
  passportScore?: number;
  payerScore?: number;
  relatedParty?: boolean;
};

export type Quote = {
  monthlyRentCents: number;
  months: number;
  grossReceivablesCents: number;
  baseFeeRate: number;
  passportAdjustment: number;
  payerAdjustment: number;
  relatedPartyPremium: number;
  feeRate: number;
  feeCents: number;
  purchasePriceCents: number;
  advanceRate: number;
  monthlyIrr: number;
  nominalAnnualised: number;
  effectiveAnnualised: number;
  capBreached: boolean;
  termApproved: boolean;
};

function solveMonthlyIrr(purchasePrice: number, rent: number, months: number): number {
  if (purchasePrice <= 0 || rent <= 0 || months <= 0) {
    throw new Error("Cash flows must be positive.");
  }
  if (purchasePrice >= rent * months) return 0;

  let low = 1e-12;
  let high = 2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const pv = (rent * (1 - (1 + mid) ** -months)) / mid;
    if (pv > purchasePrice) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function resolveFeeRate(input: {
  months: number;
  passportScore?: number;
  payerScore?: number;
  relatedParty?: boolean;
  feeRate?: number;
}): {
  baseFeeRate: number;
  passportAdjustment: number;
  payerAdjustment: number;
  relatedPartyPremium: number;
  feeRate: number;
  termApproved: boolean;
} {
  const termApproved = input.months === 6;
  const base = BASE_FEE_BY_TERM[input.months];
  if (base == null) {
    throw new Error("The 3-month term is not approved and cannot be priced.");
  }

  if (input.feeRate != null) {
    return {
      baseFeeRate: base,
      passportAdjustment: 0,
      payerAdjustment: 0,
      relatedPartyPremium: input.relatedParty ? RELATED_PARTY_PREMIUM : 0,
      feeRate: input.feeRate,
      termApproved,
    };
  }

  const passportAdjustment = bandAdjustment(input.passportScore ?? 0);
  const payerAdjustment = bandAdjustment(input.payerScore ?? 0);
  const relatedPartyPremium = input.relatedParty ? RELATED_PARTY_PREMIUM : 0;
  const feeRate = Math.max(
    FEE_FLOOR,
    base + passportAdjustment + payerAdjustment + relatedPartyPremium,
  );

  return {
    baseFeeRate: base,
    passportAdjustment,
    payerAdjustment,
    relatedPartyPremium,
    feeRate,
    termApproved,
  };
}

export function priceQuote(input: QuoteInput): Quote {
  if (input.months === 3) {
    throw new Error("The 3-month term is not approved and cannot be priced.");
  }
  if (!Number.isInteger(input.monthlyRentCents) || input.monthlyRentCents <= 0) {
    throw new Error("Monthly rent must be a positive integer in cents.");
  }
  if (!Number.isInteger(input.months) || input.months <= 0) {
    throw new Error("Term must be a positive whole number of months.");
  }

  const resolved = resolveFeeRate(input);
  const grossReceivablesCents = input.monthlyRentCents * input.months;
  const feeCents = percentOfCents(grossReceivablesCents, resolved.feeRate);
  const purchasePriceCents = grossReceivablesCents - feeCents;
  const advanceRate = purchasePriceCents / grossReceivablesCents;
  const monthlyIrr = solveMonthlyIrr(
    purchasePriceCents,
    input.monthlyRentCents,
    input.months,
  );
  const nominalAnnualised = monthlyIrr * 12;
  const effectiveAnnualised = (1 + monthlyIrr) ** 12 - 1;
  const capBreached = effectiveAnnualised > INTERNAL_CAP + 1e-12;

  return {
    monthlyRentCents: input.monthlyRentCents,
    months: input.months,
    grossReceivablesCents,
    ...resolved,
    feeCents,
    purchasePriceCents,
    advanceRate,
    monthlyIrr,
    nominalAnnualised,
    effectiveAnnualised,
    capBreached,
  };
}

export function assertQuoteWithinCap(quote: Quote): Quote {
  if (quote.capBreached) {
    throw new CapExceededError(quote.effectiveAnnualised);
  }
  return quote;
}

export function priceOrBlock(input: QuoteInput): Quote {
  return assertQuoteWithinCap(priceQuote(input));
}

export function holderSchedule(input: {
  offeringCents: number;
  purchasePriceCents: number;
  monthlyCollectionCents: number;
  months: number;
  units: number;
}) {
  const originationSpreadCents = input.offeringCents - input.purchasePriceCents;
  const perUnitPerMonthCents = Math.round(input.monthlyCollectionCents / input.units);
  const perUnitTotalCents = perUnitPerMonthCents * input.months;
  const perUnitReturnCents = perUnitTotalCents - Math.round(input.offeringCents / input.units);
  const monthlyIrr = solveMonthlyIrr(
    Math.round(input.offeringCents / input.units),
    perUnitPerMonthCents,
    input.months,
  );
  return {
    originationSpreadCents,
    perUnitPerMonthCents,
    perUnitTotalCents,
    perUnitReturnCents,
    monthlyIrr,
    effectiveAnnualised: (1 + monthlyIrr) ** 12 - 1,
  };
}

export function scoreBandLabel(score: number): ScoreBand {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}
