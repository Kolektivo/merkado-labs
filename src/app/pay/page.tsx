import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDayMonthYear,
  isUpcomingPaymentRequest,
  openPaymentRequests,
  paymentStatusLabel,
} from "@/lib/rent-advance/helpers";
import { RENTER_ACCOUNT_ID } from "@/lib/rent-advance/ids";
import { formatUsdcAtomic, formatXcg } from "@/lib/rent-advance/money";
import { loadBook } from "@/lib/rent-advance/store";
import { isMerkadoConfigured } from "@/lib/onchain/config";
import { NOT_CONFIGURED } from "@/lib/rent-advance/copy";
import type { PaymentRequestStatus } from "@/lib/rent-advance/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merkado Pay" };

function tone(status: PaymentRequestStatus) {
  if (status === "confirmed") return "success" as const;
  if (status === "failed" || status === "expired") return "error" as const;
  if (status === "overdue" || status === "partial") return "warning" as const;
  if (status === "pending" || status === "initiated") return "info" as const;
  return "neutral" as const;
}

export default async function PayIndexPage() {
  const book = await loadBook();
  const configured = isMerkadoConfigured();
  const requests = (book.paymentRequests ?? [])
    .filter((row) => row.accountId === RENTER_ACCOUNT_ID)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const open = openPaymentRequests(requests);
  const next = open[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rent payments</h1>
        <p className="text-sm text-muted-foreground">
          Pay the same rent. Amounts are shown in XCG. Settlement is USDC.
        </p>
      </div>

      {!configured ? (
        <Alert variant="destructive">
          <AlertTitle>{NOT_CONFIGURED.title}</AlertTitle>
          <AlertDescription>{NOT_CONFIGURED.body}</AlertDescription>
        </Alert>
      ) : null}

      {next ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <StatusBadge tone={tone(next.status)}>
              {paymentStatusLabel(next.status)}
            </StatusBadge>
            <p className="text-sm text-muted-foreground">{next.periodLabel}</p>
            <p className="text-3xl font-semibold tabular-nums">
              {formatXcg(next.amountXcgCents)}
            </p>
            <p className="text-xs text-muted-foreground">
              Settles as {formatUsdcAtomic(next.amountUsdcAtomic)}
            </p>
            <Button asChild className="min-h-11 w-full">
              <Link href={`/pay/${next.paymentRequestId}`}>Pay this rent</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No rent is due right now.</p>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {requests.map((row) => {
          const offer = book.offers.find((item) => item.reference === row.offerReference);
          const label = isUpcomingPaymentRequest(requests, row)
            ? paymentStatusLabel(row.status, true)
            : paymentStatusLabel(row.status);
          return (
            <li key={row.paymentRequestId}>
              <Link
                href={`/pay/${row.paymentRequestId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{row.periodLabel}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {offer?.property.summary ?? row.offerReference} · due{" "}
                    {formatDayMonthYear(row.dueDate)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block tabular-nums">{formatXcg(row.amountXcgCents)}</span>
                  <span className="text-xs text-muted-foreground">
                    {label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
