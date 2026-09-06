import { formatDayMonthYear, isUpcomingPaymentRequest } from "@/lib/rent-advance/helpers";
import { mergeOnchain } from "@/lib/rent-advance/custody";
import { earlierOpenPaymentRequest } from "@/lib/rent-advance/payment-apply";
import { loadBook, paymentRequestsForWallet } from "@/lib/rent-advance/store";
import { toPublicCryptoConfig } from "@/lib/pay/networks";
import { getActiveLinkedWallet } from "@/lib/wallet-link/service";
import { getOptionalUser } from "@/lib/supabase/server-client";

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
  const [book, user] = await Promise.all([loadBook(), getOptionalUser()]);
  const linkedWallet = user ? await getActiveLinkedWallet(user.id) : null;
  const requests = linkedWallet ? paymentRequestsForWallet(book, linkedWallet) : [];
  const request = requests.find((row) => row.paymentRequestId === paymentRequestId);
  if (!request) {
    return <PayNotFound />;
  }

  const offer = book.offers.find((row) => row.reference === request.offerReference);
  const onchain = mergeOnchain(offer?.onchain);
  const earlier = earlierOpenPaymentRequest(book, request.paymentRequestId);
  const history = requests
    .map((row) => ({
      paymentRequestId: row.paymentRequestId,
      offerReference: row.offerReference,
      periodLabel: row.periodLabel,
      status: row.status,
      amountUsdcAtomic: row.amountUsdcAtomic,
      amountXcgCents: row.amountXcgCents,
      dueDateLabel: formatDayMonthYear(row.dueDate),
      upcoming: isUpcomingPaymentRequest(book.paymentRequests ?? [], row),
    }));
  const publicCryptoConfig = toPublicCryptoConfig(book.cryptoConfig);
  const contractAddress = onchain.contractAddress ?? book.cryptoConfig?.offerNftContract ?? null;
  const configured = Boolean(contractAddress);
  const linkedWalletAddress = linkedWallet;

  return (
    <PayApp
      paymentRequestId={request.paymentRequestId}
      periodLabel={request.periodLabel}
      dueDateLabel={formatDayMonthYear(request.dueDate)}
      amountUsdcAtomic={request.amountUsdcAtomic}
      amountXcgCents={request.amountXcgCents}
      paymentReference={request.paymentReference}
      receivingAddress={request.receivingAddress}
      networkLabel={publicCryptoConfig?.networkLabel?.trim() ?? ""}
      status={request.status}
      txHash={request.txHash}
      propertyLabel={offer?.property.summary ?? "Rental"}
      district={offer?.property.district ?? ""}
      earlierPeriodLabel={earlier?.periodLabel ?? null}
      history={history}
      configured={configured}
      minted={onchain.tokenId != null}
      tokenId={onchain.tokenId}
       contractAddress={contractAddress}
       linkedWalletAddress={linkedWalletAddress}
      pendingRecovery={
        Boolean(request.submittedTxHash) &&
        (request.status === "pending" || request.status === "initiated" || request.status === "due")
      }
    />
  );
}
