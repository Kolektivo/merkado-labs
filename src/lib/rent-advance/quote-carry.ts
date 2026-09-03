import { buildScheduledReceivables } from "@/lib/rent-advance/helpers";
import type { Offer } from "@/lib/rent-advance/types";

export type QuoteCarry = {
  quote: boolean;
  rentCents: number;
  marketCents: number;
  listingScore: number;
  payerScore: number;
  months: number;
  renterWalletAddress: string | null;
};

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function centsFrom(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = Number(one(params, key));
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function parseQuoteCarry(
  params: Record<string, string | string[] | undefined>,
): QuoteCarry | null {
  if (one(params, "quote") !== "1") return null;
  const rentCents =
    centsFrom(params, "rentCents") ||
    Math.round(Number(one(params, "rent")) * 100);
  const marketCents =
    centsFrom(params, "marketCents") ||
    Math.round(Number(one(params, "market")) * 100);
  const listingRaw = one(params, "listing");
  const payerRaw = one(params, "payer");
  const listingScore = listingRaw === "" ? 89 : Number(listingRaw);
  const payerScore = payerRaw === "" ? 95 : Number(payerRaw);
  const months = Number(one(params, "months") || "6");
  const renterWallet = one(params, "renterWallet");
  if (!Number.isFinite(rentCents) || rentCents <= 0) return null;
  return {
    quote: true,
    rentCents,
    marketCents: Number.isFinite(marketCents) && marketCents > 0 ? marketCents : 300000,
    listingScore: Number.isFinite(listingScore)
      ? Math.min(100, Math.max(0, listingScore))
      : 89,
    payerScore: Number.isFinite(payerScore)
      ? Math.min(100, Math.max(0, payerScore))
      : 95,
    months: Number.isFinite(months) ? months : 6,
    renterWalletAddress: /^0x[0-9a-fA-F]{40}$/.test(renterWallet)
      ? renterWallet
      : null,
  };
}

export function applyQuoteCarry(offer: Offer, carry: QuoteCarry): Offer {
  return {
    ...offer,
    months: carry.months,
    monthlyRentCents: carry.rentCents,
    marketRentCents: carry.marketCents,
    relatedParty: false,
    relatedPartyNote: null,
    lease: { ...offer.lease, monthlyRentCents: carry.rentCents },
    passport: { ...offer.passport, total: carry.listingScore },
    tenant: {
      ...offer.tenant,
      scores: { ...offer.tenant.scores, total: carry.payerScore },
    },
    renterWalletAddress: carry.renterWalletAddress ?? offer.renterWalletAddress ?? null,
    receivables: buildScheduledReceivables(
      offer.reference,
      carry.rentCents,
      carry.months === 6 ? 6 : offer.receivables.length || 6,
    ),
  };
}

export function quoteHref(input: {
  rentCents: number;
  marketCents: number;
  listing: number;
  payer: number;
  months: number;
  renterWalletAddress?: string | null;
}) {
  const params = new URLSearchParams({
    quote: "1",
    rentCents: String(input.rentCents),
    marketCents: String(input.marketCents),
    listing: String(input.listing),
    payer: String(input.payer),
    months: String(input.months),
    ...(input.renterWalletAddress
      ? { renterWallet: input.renterWalletAddress }
      : {}),
  });
  return `/originate/new?${params.toString()}`;
}
