import { landlordProceedsPresentation } from "@/lib/rent-advance/custody";
import { offerDisplayName } from "@/lib/rent-advance/helpers";
import { formatXcg } from "@/lib/rent-advance/money";
import type { DemoBook } from "@/lib/rent-advance/types";

export type DashboardNotificationKind = "sale_proceeds" | "rent_claim";

export type DashboardNotification = {
  id: string;
  kind: DashboardNotificationKind;
  title: string;
  subject: string;
  detail: string;
  href: string;
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
    originate: visible.filter((item) => item.kind === "sale_proceeds").length,
    portfolio: visible.filter((item) => item.kind === "rent_claim").length,
  };
}

export function dashboardNotifications(
  book: DemoBook,
): DashboardNotification[] {
  const items: DashboardNotification[] = [];

  for (const offer of book.offers) {
    const proceeds = landlordProceedsPresentation(offer);
    if (proceeds.status !== "available") continue;
    items.push({
      id: `sale:${offer.reference}`,
      kind: "sale_proceeds",
      title: "Sale amount ready to claim",
      subject: offerDisplayName(offer),
      detail: formatXcg(proceeds.amountCents),
      href: `/originate/${offer.reference}`,
    });
  }

  const pendingByOffer = new Map<string, number>();
  for (const row of book.distributions ?? []) {
    if (row.status !== "pending") continue;
    pendingByOffer.set(
      row.offerReference,
      (pendingByOffer.get(row.offerReference) ?? 0) + row.amountCents,
    );
  }

  for (const [reference, amountCents] of pendingByOffer) {
    const offer = book.offers.find((row) => row.reference === reference);
    items.push({
      id: `rent:${reference}`,
      kind: "rent_claim",
      title: "Rent ready to claim",
      subject: offer ? offerDisplayName(offer) : reference,
      detail: formatXcg(amountCents),
      href: `/portfolio/${reference}`,
    });
  }

  return items;
}
