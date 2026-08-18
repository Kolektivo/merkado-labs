import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { networkDisplayLabel } from "@/lib/pay/config";
import { formatDayMonthYear } from "@/lib/rent-advance/helpers";
import { RENTER_ACCOUNT_ID } from "@/lib/rent-advance/ids";
import { formatUsdcAtomic, formatXcg } from "@/lib/rent-advance/money";
import { currentRenterPaymentRequest } from "@/lib/rent-advance/payment-apply";
import { loadBook } from "@/lib/rent-advance/store";
import type { PaymentRequestStatus } from "@/lib/rent-advance/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Payments" };

function parseFilter(value: string | string[] | undefined): "all" | "upcoming" | "open" | "paid" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "upcoming" || raw === "open" || raw === "paid" ? raw : "all";
}

function paymentStatusLabel(status: PaymentRequestStatus) {
  if (status === "confirmed") return "Paid";
  if (status === "pending") return "Awaiting confirmation";
  if (status === "partial") return "Incorrect amount";
  if (status === "failed") return "Failed";
  if (status === "overdue") return "Overdue";
  if (status === "expired") return "Expired";
  if (status === "initiated") return "Started";
  return "Due";
}

function matches(
  status: PaymentRequestStatus,
  dueDate: string,
  filter: "all" | "upcoming" | "open" | "paid",
  nextDueDate: string | null,
) {
  if (filter === "all") return true;
  if (filter === "paid") return status === "confirmed";
  if (filter === "upcoming") {
    return (
      (status === "due" || status === "initiated") &&
      Boolean(nextDueDate) &&
      dueDate > nextDueDate!
    );
  }
  if (status === "confirmed" || status === "expired") return false;
  if (
    status === "failed" ||
    status === "partial" ||
    status === "pending" ||
    status === "overdue"
  ) {
    return true;
  }
  return !nextDueDate || dueDate <= nextDueDate;
}

export default async function MyPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.tab);
  let book;
  try {
    book = await loadBook();
  } catch {
    return (
      <div className="rounded-xl border p-4">
        <h1 className="text-2xl font-semibold">My Payments</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Payments could not be loaded. Try again, or reset the demo from
          Overview.
        </p>
      </div>
    );
  }

  const requests = (book.paymentRequests ?? []).filter(
    (row) => row.accountId === RENTER_ACCOUNT_ID,
  );
  const next = currentRenterPaymentRequest(book);
  const offer = next
    ? book.offers.find((row) => row.reference === next.offerReference)
    : null;
  const visible = requests.filter((row) =>
    matches(row.status, row.dueDate, filter, next?.dueDate ?? null),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Payments</h1>
        <p className="text-sm text-muted-foreground">
          The same fictional renter used in Merkado Pay.
        </p>
      </div>

      {next ? (
        <Card>
          <CardHeader>
            <CardTitle>Next payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">{offer?.property.summary}</p>
            <p className="text-sm text-muted-foreground">{next.periodLabel}</p>
            <p className="text-3xl font-semibold">{formatUsdcAtomic(next.amountUsdcAtomic)}</p>
            <p className="text-sm">{formatXcg(next.amountXcgCents)}</p>
            <p className="text-sm">Due {formatDayMonthYear(next.dueDate)}</p>
            <p className="text-sm">{paymentStatusLabel(next.status)}</p>
            <p className="text-xs text-muted-foreground">
              {networkDisplayLabel(book.cryptoConfig)}
            </p>
            {next.status === "confirmed" ? (
              <Button asChild variant="outline" className="mt-2 min-h-11">
                <Link href={`/pay/${next.paymentRequestId}`}>View receipt</Link>
              </Button>
            ) : (
              <Button asChild className="mt-2 min-h-11">
                <Link href={`/pay/${next.paymentRequestId}`}>Pay rent</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No open rent payments.</p>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Payment filters">
        {(
          [
            ["all", "All"],
            ["open", "Open"],
            ["upcoming", "Upcoming"],
            ["paid", "Paid"],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} asChild>
            <Link href={value === "all" ? "/account/payments" : `/account/payments?tab=${value}`}>
              {label}
            </Link>
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments in this view.</p>
        ) : (
          visible.map((row) => (
            <Link
              key={row.paymentRequestId}
              href={`/pay/${row.paymentRequestId}`}
              className="block rounded-xl border bg-card px-4 py-3"
            >
              <p className="font-medium">{row.periodLabel}</p>
              <p className="text-sm">
                {formatUsdcAtomic(row.amountUsdcAtomic)} · {formatXcg(row.amountXcgCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {paymentStatusLabel(row.status)} · {formatDayMonthYear(row.dueDate)}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
