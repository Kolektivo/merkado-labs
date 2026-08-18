import { formatDayMonthYear } from "@/lib/rent-advance/helpers";
import { RENTER_ACCOUNT_ID } from "@/lib/rent-advance/ids";
import { earlierOpenPaymentRequest } from "@/lib/rent-advance/payment-apply";
import { loadBook } from "@/lib/rent-advance/store";

import { PayApp } from "../pay-app";
import { PayNotFound } from "../pay-not-found";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merkado Pay" };

export default async function PayRequestPage({
  params,
}: {
  params: Promise<{ paymentRequestId: string }>;
}) {
  const { paymentRequestId } = await params;
  const book = await loadBook();
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  if (!request || request.accountId !== RENTER_ACCOUNT_ID) {
    return <PayNotFound />;
  }

  const offer = book.offers.find((row) => row.reference === request.offerReference);
  const earlier = earlierOpenPaymentRequest(book, request.paymentRequestId);
  const history = (book.paymentRequests ?? [])
    .filter((row) => row.accountId === RENTER_ACCOUNT_ID)
    .map((row) => ({
      paymentRequestId: row.paymentRequestId,
      periodLabel: row.periodLabel,
      status: row.status,
      amountUsdcAtomic: row.amountUsdcAtomic,
      amountXcgCents: row.amountXcgCents,
      dueDateLabel: formatDayMonthYear(row.dueDate),
    }));

  return (
    <PayApp
      paymentRequestId={request.paymentRequestId}
      periodLabel={request.periodLabel}
      dueDateLabel={formatDayMonthYear(request.dueDate)}
      amountUsdcAtomic={request.amountUsdcAtomic}
      amountXcgCents={request.amountXcgCents}
      paymentReference={request.paymentReference}
      receivingAddress={request.receivingAddress}
      networkLabel={book.cryptoConfig?.networkLabel?.trim() ?? ""}
      status={request.status}
      txHash={request.txHash}
      propertyLabel={offer?.property.summary ?? "Rental"}
      district={offer?.property.district ?? ""}
      earlierPeriodLabel={earlier?.periodLabel ?? null}
      history={history}
    />
  );
}
