import { mergeOnchain, mintState } from "@/lib/rent-advance/custody";
import { offerDisplayName } from "@/lib/rent-advance/helpers";
import { formatXcg } from "@/lib/rent-advance/money";
import type { DemoBook } from "@/lib/rent-advance/types";

function sameWallet(left: string, right: string): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export type DashboardNotificationKind = "offer_update" | "rent_claim";

export type DashboardNotification = {
  id: string;
  kind: DashboardNotificationKind;
  title: string;
  subject: string;
  detail: string;
  href: string;
  actionLabel: string;
};

export function visibleNotifications(
  items: DashboardNotification[],
  clearedIds: string[],
): DashboardNotification[] {
  return items.filter((item) => !clearedIds.includes(item.id));
}

export function navNotificationCounts(
  items: DashboardNotification[],
  clearedIds: string[],
) {
  const visible = visibleNotifications(items, clearedIds);
  return {
    originate: visible.filter((item) => item.kind === "offer_update").length,
    portfolio: visible.filter((item) => item.kind === "rent_claim").length,
  };
}

export function dashboardNotifications(
  book: DemoBook,
  accountId?: string | null,
  walletAddress?: string | null,
): DashboardNotification[] {
  if (accountId === null) return [];
  const items: DashboardNotification[] = [];

  for (const offer of book.offers) {
    if (
      accountId &&
      offer.createdByAccountId !== accountId
    ) {
      continue;
    }
    const onchain = mergeOnchain(offer.onchain);
    const state = mintState(offer);
    if (state === "purchased" && onchain.landlordPaid) {
      items.push({
        id: `sale-paid:${offer.reference}`,
        kind: "offer_update",
        title: "Offer sold · sale proceeds paid",
        subject: offerDisplayName(offer),
        detail: formatXcg(offer.purchasePriceCents),
        href: `/originate/${offer.reference}`,
        actionLabel: "View payout",
      });
    } else if (state === "minted") {
      items.push({
        id: `listed:${offer.reference}`,
        kind: "offer_update",
        title: "Offer listed on Marketplace",
        subject: offerDisplayName(offer),
        detail: "Open for purchase on Marketplace",
        href: `/originate/${offer.reference}`,
        actionLabel: "View offer",
      });
    } else if (offer.status === "funding") {
      items.push({
        id: `mint-pending:${offer.reference}`,
        kind: "offer_update",
        title: "Offer approved · Listed",
        subject: offerDisplayName(offer),
        detail: "Opening on Marketplace shortly",
        href: `/originate/${offer.reference}`,
        actionLabel: "View offer",
      });
    } else if (offer.status === "denied") {
      items.push({
        id: `denied:${offer.reference}`,
        kind: "offer_update",
        title: "Offer request denied",
        subject: offerDisplayName(offer),
        detail: "Open the offer for the decision",
        href: `/originate/${offer.reference}`,
        actionLabel: "View decision",
      });
    }
  }

  const claimableByOffer = new Map<string, number>();
  for (const row of book.distributions ?? []) {
    if (row.status !== "claimable") continue;
    claimableByOffer.set(
      row.offerReference,
      (claimableByOffer.get(row.offerReference) ?? 0) + row.amountCents,
    );
  }

  for (const [reference, amountCents] of claimableByOffer) {
    const offer = book.offers.find((row) => row.reference === reference);
    if (
      walletAddress &&
      !sameWallet(offer?.onchain?.purchaserAddress ?? "", walletAddress)
    ) {
      continue;
    }
    items.push({
      id: `rent:${reference}`,
      kind: "rent_claim",
      title: "Rent ready to claim",
      subject: offer ? offerDisplayName(offer) : reference,
      detail: formatXcg(amountCents),
      href: `/portfolio/${reference}`,
      actionLabel: "Open and claim",
    });
  }

  return items;
}
