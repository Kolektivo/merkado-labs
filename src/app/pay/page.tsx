import { redirect } from "next/navigation";

import { CANONICAL_PAYMENT_REQUEST_ID } from "@/lib/rent-advance/ids";
import { currentRenterPaymentRequest } from "@/lib/rent-advance/payment-apply";
import { loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merkado Pay" };

export default async function PayIndexPage() {
  const book = await loadBook();
  const current = currentRenterPaymentRequest(book);
  redirect(`/pay/${current?.paymentRequestId ?? CANONICAL_PAYMENT_REQUEST_ID}`);
}
