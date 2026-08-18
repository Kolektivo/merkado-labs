import { buildScheduledReceivables } from "@/lib/rent-advance/helpers";
import type { Offer } from "@/lib/rent-advance/types";

export type QuoteCarry = {
  quote: boolean;
  rentGuilders: number;
  marketGuilders: number;
  listingScore: number;
  payerScore: number;
  related: boolean;
  months: number;
};

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseQuoteCarry(
  params: Record<string, string | string[] | undefined>,
): QuoteCarry | null {
  if (one(params, "quote") !== "1") return null;
  const rentGuilders = Number(one(params, "rent"));
  const marketGuilders = Number(one(params, "market"));
  const listingRaw = one(params, "listing");
  const payerRaw = one(params, "payer");
  const listingScore = listingRaw === "" ? 89 : Number(listingRaw);
  const payerScore = payerRaw === "" ? 95 : Number(payerRaw);
  const months = Number(one(params, "months") || "6");
  if (!Number.isFinite(rentGuilders) || rentGuilders <= 0) return null;
  return {
    quote: true,
    rentGuilders,
    marketGuilders: Number.isFinite(marketGuilders) && marketGuilders > 0 ? marketGuilders : 3000,
    listingScore: Number.isFinite(listingScore)
      ? Math.min(100, Math.max(0, listingScore))
      : 89,
    payerScore: Number.isFinite(payerScore)
      ? Math.min(100, Math.max(0, payerScore))
      : 95,
    related: one(params, "related") !== "0",
    months: Number.isFinite(months) ? months : 6,
  };
}

export function applyQuoteCarry(offer: Offer, carry: QuoteCarry): Offer {
  const monthlyRentCents = Math.round(carry.rentGuilders * 100);
  return {
    ...offer,
    months: carry.months,
    monthlyRentCents,
    marketRentCents: Math.round(carry.marketGuilders * 100),
    relatedParty: carry.related,
    relatedPartyNote: carry.related
      ? offer.relatedPartyNote
      : null,
    lease: { ...offer.lease, monthlyRentCents },
    passport: { ...offer.passport, total: carry.listingScore },
    tenant: {
      ...offer.tenant,
      scores: { ...offer.tenant.scores, total: carry.payerScore },
    },
    receivables: buildScheduledReceivables(
      offer.reference,
      monthlyRentCents,
      carry.months === 6 ? 6 : offer.receivables.length || 6,
    ),
  };
}
