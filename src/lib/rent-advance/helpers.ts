import { positionIdFor, receivableIdFor } from "@/lib/rent-advance/ids";
import { formatXcg } from "@/lib/rent-advance/money";
import { derivePropertyScore } from "@/lib/rent-advance/property-score";
import { bandLabel, payerBandLabel, scoreBand } from "@/lib/rent-advance/scoring";
import type {
  AttentionItem,
  BuyerOfferCard,
  DemoBook,
  Offer,
  OfferStatus,
  PortfolioPosition,
  PortfolioPositionDetail,
  PurchaserOfferDetail,
  Receivable,
} from "@/lib/rent-advance/types";

function monthsFrom(start: string, count: number, endDay = 28): string[] {
  const date = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + index + 1, 0);
    const day = Math.min(endDay, next.getUTCDate());
    next.setUTCDate(day);
    return next.toISOString().slice(0, 10);
  });
}

export function buildScheduledReceivables(
  reference: string,
  monthlyRentCents: number,
  months: number,
  start = "2026-09-01",
): Receivable[] {
  return monthsFrom(start, months).map((dueDate, index) => ({
    n: index + 1,
    dueDate,
    amountCents: monthlyRentCents,
    status: "scheduled" as const,
    receivableId: receivableIdFor(reference, index + 1),
  }));
}

export function listingScore(offer: Offer): number {
  return offer.passport.total;
}

export function propertyScoreFor(offer: Offer) {
  return derivePropertyScore(
    listingScore(offer),
    offer.monthlyRentCents,
    offer.marketRentCents,
  );
}

export function rentToMarket(offer: Offer): number {
  if (!Number.isFinite(offer.marketRentCents) || offer.marketRentCents <= 0) {
    return Number.NaN;
  }
  return offer.monthlyRentCents / offer.marketRentCents;
}

export function countsAsAdvanced(offer: Offer): boolean {
  return offer.status !== "draft" && offer.status !== "under_review" && offer.fundedCents > 0;
}

export function rentToIncomeBand(monthlyRentCents: number, monthlyIncomeCents: number): string {
  if (monthlyIncomeCents <= 0) return "Not available";
  const ratio = monthlyRentCents / monthlyIncomeCents;
  if (ratio < 0.35) return "Under 35%";
  if (ratio < 0.45) return "35–45%";
  if (ratio < 0.55) return "45–55%";
  return "55% or above";
}

export function onTimePercent(latePayments12m: number): number {
  const late = Math.min(12, Math.max(0, latePayments12m));
  return Math.round(((12 - late) / 12) * 100);
}

export function formatDayMonthYear(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  return `${day} ${months[month - 1]} ${year}`;
}

export function distributionsReceivedCents(offer: Offer): number {
  return offer.collections
    .filter(
      (row) =>
        row.status === "received" ||
        row.status === "reconciled" ||
        row.status === "released",
    )
    .reduce((sum, row) => sum + row.amountCents, 0);
}

export function holderPositions(book: DemoBook) {
  return book.offers.filter((offer) => offer.fundedCents > 0);
}

export function portfolioSummary(book: DemoBook) {
  const positions = holderPositions(book);
  const contributed = positions.reduce((sum, offer) => sum + offer.fundedCents, 0);
  const received = positions.reduce(
    (sum, offer) => sum + distributionsReceivedCents(offer),
    0,
  );
  const expectedRemaining = positions.reduce(
    (sum, offer) => sum + outstandingCents(offer),
    0,
  );
  const active = positions.filter((offer) =>
    ["live", "collecting", "funding"].includes(offer.status),
  ).length;
  return { positions, contributed, received, expectedRemaining, active };
}

export function collectedCount(offer: Offer): number {
  return offer.receivables.filter((row) => row.status === "received").length;
}

export function propertyCoverSrc(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized.includes("villa")) return "/properties/villa.webp";
  if (normalized.includes("town")) return "/properties/townhouse.webp";
  if (normalized.includes("studio")) return "/properties/studio.webp";
  if (normalized.includes("apartment") || normalized.includes("flat")) {
    return "/properties/apartment.webp";
  }
  return "/properties/house.webp";
}

export function outstandingCents(offer: Offer): number {
  return offer.receivables
    .filter((row) => row.status !== "received")
    .reduce((sum, row) => sum + row.amountCents, 0);
}

export function statusTone(status: OfferStatus) {
  switch (status) {
    case "live":
    case "collecting":
      return "info" as const;
    case "funding":
      return "info" as const;
    case "under_review":
      return "warning" as const;
    case "default":
      return "error" as const;
    case "closed":
    case "draft":
    default:
      return "neutral" as const;
  }
}

export function statusLabel(status: OfferStatus): string {
  switch (status) {
    case "under_review":
      return "Under review";
    case "live":
      return "Live";
    case "funding":
      return "Funding";
    case "collecting":
      return "Collecting";
    case "closed":
      return "Closed";
    case "default":
      return "Default";
    case "draft":
      return "Draft";
  }
}

export function canRecordCollection(status: OfferStatus): boolean {
  return status === "live" || status === "collecting" || status === "default";
}

export function isMarketplaceStatus(status: OfferStatus): boolean {
  return status !== "draft" && status !== "under_review";
}

export function canShowContribute(status: OfferStatus): boolean {
  return status === "live" || status === "funding" || status === "collecting";
}

export function payerPayee(offer: Offer): string {
  return offer.paymentOption === "A"
    ? offer.collectionAgent
    : offer.fundsCustodian;
}

export function anonymizeOffer(offer: Offer): BuyerOfferCard {
  const derived = propertyScoreFor(offer);
  return {
    reference: offer.reference,
    district: offer.property.district,
    type: offer.property.type,
    summary: offer.property.summary,
    bedrooms: offer.property.bedrooms,
    listingScore: derived.listingScore,
    propertyScore: derived.propertyScore,
    propertyBand: scoreBand(derived.propertyScore),
    propertyLabel: bandLabel(derived.propertyScore),
    passportScore: derived.propertyScore,
    passportBand: scoreBand(derived.propertyScore),
    passportLabel: bandLabel(derived.propertyScore),
    payerBand: scoreBand(offer.tenant.scores.total),
    rentToMarket: derived.rentToMarketRatio,
    marketDataAvailable: derived.marketDataAvailable,
    months: offer.months,
    offeringCents: offer.offeringCents,
    fundedCents: offer.fundedCents,
    scheduledAnnualised: offer.effectiveAnnualised > 0 ? 0.102 : 0.102,
    agency: offer.agency,
    status: offer.status,
    relatedParty: offer.relatedParty,
  };
}

export function toPurchaserOffer(offer: Offer): PurchaserOfferDetail {
  return {
    ...anonymizeOffer(offer),
    relatedPartyNote: offer.relatedPartyNote,
    interiorM2: offer.property.interiorM2,
    passport: {
      total: offer.passport.total,
      rentVsMarket: offer.passport.rentVsMarket,
      marketDepth: offer.passport.marketDepth,
      condition: offer.passport.condition,
      accessibility: offer.passport.accessibility,
    },
    comparables: offer.comparables.map((row) => ({
      id: row.id,
      rentCents: row.rentCents,
      bedrooms: row.bedrooms,
      interiorM2: row.interiorM2,
      daysListed: row.daysListed,
    })),
    payer: {
      bandLabel: payerBandLabel(offer.tenant.scores.total),
      onTimePercent: onTimePercent(offer.tenant.latePayments12m),
      employmentStatus: offer.tenant.employmentStatus,
      rentToIncomeBand: rentToIncomeBand(
        offer.monthlyRentCents,
        offer.tenant.monthlyIncomeCents,
      ),
    },
    receivables: offer.receivables.map((row) => ({
      n: row.n,
      dueDate: row.dueDate,
      amountCents: row.amountCents,
      status: row.status,
    })),
  };
}

export function distributionTotals(book: DemoBook, offer: Offer) {
  const rows = (book.distributions ?? []).filter(
    (row) => row.offerReference === offer.reference,
  );
  return {
    collectedCents: distributionsReceivedCents(offer),
    pendingDistributionCents: rows
      .filter((row) => row.status === "pending")
      .reduce((sum, row) => sum + row.amountCents, 0),
    distributedCents: rows
      .filter((row) => row.status === "distributed")
      .reduce((sum, row) => sum + row.amountCents, 0),
    settlementTxHash:
      book.ledgerTransactions?.find(
        (row) =>
          row.offerReference === offer.reference && row.kind === "advance_settlement",
      )?.txHash ?? null,
  };
}

export function toPortfolioPosition(offer: Offer, book?: DemoBook): PortfolioPosition {
  const money = book
    ? distributionTotals(book, offer)
    : {
        collectedCents: distributionsReceivedCents(offer),
        pendingDistributionCents: 0,
        distributedCents: distributionsReceivedCents(offer),
        settlementTxHash: null,
      };
  return {
    ...anonymizeOffer(offer),
    positionId: positionIdFor(offer.reference),
    receivedCents: money.collectedCents,
    remainingCents: outstandingCents(offer),
    collectedCents: money.collectedCents,
    pendingDistributionCents: money.pendingDistributionCents,
    distributedCents: money.distributedCents,
    collectedMonths: collectedCount(offer),
    settlementTxHash: money.settlementTxHash,
  };
}

export function toPortfolioPositionDetail(
  offer: Offer,
  book?: DemoBook,
): PortfolioPositionDetail {
  return {
    ...toPortfolioPosition(offer, book),
    receivables: offer.receivables.map((row) => {
      const collection = offer.collections.find(
        (item) => item.receivableN === row.n,
      );
      return {
        n: row.n,
        dueDate: row.dueDate,
        amountCents: row.amountCents,
        status: row.status,
        actualOn: collection?.receivedOn ?? null,
        actualCents: collection?.amountCents ?? null,
        missed: row.status === "missed",
      };
    }),
  };
}

const OFFER_LIST_ORDER: Record<OfferStatus, number> = {
  collecting: 0,
  live: 1,
  funding: 2,
  default: 3,
  under_review: 4,
  draft: 5,
  closed: 6,
};

export function sortOffersForLandlordList(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    const rank =
      (OFFER_LIST_ORDER[a.status] ?? 9) - (OFFER_LIST_ORDER[b.status] ?? 9);
    return rank !== 0 ? rank : a.reference.localeCompare(b.reference);
  });
}

export function attentionItems(book: DemoBook): AttentionItem[] {
  const overdue = book.offers.filter((offer) => offer.status === "default");
  const unsettled = book.offers.filter((offer) => offer.status === "funding");
  const missedOffer = book.offers.find((offer) =>
    offer.receivables.some((row) => row.status === "missed"),
  );
  const missed = book.offers.flatMap((offer) =>
    offer.receivables.filter((row) => row.status === "missed"),
  );
  const unclaimedOffers = book.offers.filter((offer) => {
    const received = offer.collections
      .filter((row) => row.status === "reconciled" || row.status === "received")
      .reduce((inner, row) => inner + row.amountCents, 0);
    return received > 0 && offer.status !== "closed";
  });
  const unclaimed = unclaimedOffers.length;
  const unclaimedOffer = unclaimedOffers[0];

  return [
    {
      tone: "error",
      label: "Late collection",
      count: overdue.length,
      detail: overdue[0]
        ? `Past due · ${overdue[0].reference}`
        : "none",
      href: overdue[0] ? `/originate/${overdue[0].reference}` : "/originate",
    },
    {
      tone: "warning",
      label: "Not yet settled",
      count: unsettled.length,
      detail: unsettled[0]
        ? `Funded, cash not yet sent · ${unsettled[0].reference}`
        : "none",
      href: unsettled[0] ? `/originate/${unsettled[0].reference}` : "/originate",
    },
    {
      tone: "warning",
      label: "Missed month",
      count: missed.length,
      detail: missed.length
        ? `A month did not arrive · ${missedOffer?.reference ?? "book"}`
        : "none",
      href: missedOffer ? `/originate/${missedOffer.reference}` : "/originate",
    },
    {
      tone: "info",
      label: "Rent received, not yet released",
      count: unclaimed,
      detail: unclaimed
        ? "Collected rent is waiting for a two-person release"
        : "none waiting",
      href: unclaimedOffer
        ? `/originate/${unclaimedOffer.reference}`
        : "/originate",
    },
  ];
}

export function bookTotals(book: DemoBook) {
  const counted = book.offers.filter(countsAsAdvanced);
  const totalAdvanced = counted.reduce(
    (sum, offer) => sum + offer.purchasePriceCents,
    0,
  );
  const outstanding = counted.reduce(
    (sum, offer) => sum + outstandingCents(offer),
    0,
  );
  const remainingCollections = counted.reduce(
    (sum, offer) =>
      sum + offer.receivables.filter((row) => row.status !== "received").length,
    0,
  );
  const collectedToDate = counted.reduce(
    (sum, offer) => sum + distributionsReceivedCents(offer),
    0,
  );
  const live = book.offers.filter((offer) =>
    ["live", "collecting", "funding"].includes(offer.status),
  ).length;

  return {
    totalAdvanced,
    outstanding,
    remainingCollections,
    collectedToDate,
    live,
    draft: book.offers.filter((offer) => offer.status === "draft").length,
    review: book.offers.filter((offer) => offer.status === "under_review").length,
    funding: book.offers.filter((offer) => offer.status === "funding").length,
  };
}

export function landlordDisclosure(offer: Offer) {
  return {
    netAdvance: formatXcg(offer.purchasePriceCents),
    grossForgone: formatXcg(offer.monthlyRentCents * offer.months),
    totalCost: formatXcg(offer.feeCents),
    flatFee: `${(offer.feeRate * 100).toFixed(2)}%`,
    effective: `${(offer.effectiveAnnualised * 100).toFixed(1)}%`,
    monthly: `${(offer.monthlyIrr * 100).toFixed(2)}%`,
    nominal: `${(offer.nominalAnnualised * 100).toFixed(1)}%`,
  };
}
