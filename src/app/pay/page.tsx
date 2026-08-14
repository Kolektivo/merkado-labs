import { notFound } from "next/navigation";

import { formatDayMonthYear, payerPayee } from "@/lib/rent-advance/helpers";
import { getOffer } from "@/lib/rent-advance/store";

import { PayApp } from "./pay-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay rent" };

const CANONICAL = "MRA-001";

export default async function PayPage() {
  const offer = await getOffer(CANONICAL);
  if (!offer) notFound();

  const next = offer.receivables.find((row) => row.status === "scheduled");
  const recentPayments = offer.collections.map((row) => ({
    dateLabel: formatDayMonthYear(row.receivedOn),
    amountCents: row.amountCents,
  }));

  return (
    <PayApp
      address={offer.property.address}
      district={offer.property.district}
      nextAmountCents={next?.amountCents ?? offer.monthlyRentCents}
      nextDueLabel={next ? formatDayMonthYear(next.dueDate) : ""}
      payee={payerPayee(offer)}
      reference={offer.reference}
      canPay={Boolean(next)}
      recentPayments={recentPayments}
    />
  );
}
