import Link from "next/link";
import { notFound } from "next/navigation";

import { Money } from "@/components/money-display";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HOLDER_NO_PROMISE } from "@/lib/rent-advance/copy";
import {
  formatDayMonthYear,
  statusLabel,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { getPortfolioPosition } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";

export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const position = await getPortfolioPosition(ref);
  if (!position) notFound();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/portfolio">← Portfolio</Link>
      </Button>
      <div className="space-y-2">
        <StatusBadge tone={statusTone(position.status)}>
          {statusLabel(position.status)}
        </StatusBadge>
        <h1 className="text-3xl font-semibold tracking-tight">
          {position.reference} · {position.district}
        </h1>
        <p className="text-sm text-muted-foreground">
          {position.type} · {position.bedrooms} beds · {position.months} months
          · Passport {position.passportScore} · {position.passportLabel}.
          District only.
        </p>
      </div>
      <SummaryStrip
        items={[
          { label: "Contributed", value: <Money cents={position.fundedCents} compact /> },
          {
            label: "Distributions received",
            value: <Money cents={position.receivedCents} compact />,
          },
          {
            label: "Expected remaining",
            value: <Money cents={position.remainingCents} compact />,
          },
          { label: "Payer band", value: position.payerBand },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Schedule versus actual collections</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {position.receivables.map((row) => (
                <TableRow key={row.n}>
                  <TableCell>{row.n}</TableCell>
                  <TableCell>{formatDayMonthYear(row.dueDate)}</TableCell>
                  <TableCell>
                    <Money cents={row.amountCents} />
                  </TableCell>
                  <TableCell>
                    {row.actualOn && row.actualCents != null ? (
                      <span>
                        {formatDayMonthYear(row.actualOn)} ·{" "}
                        <Money cents={row.actualCents} />
                      </span>
                    ) : row.missed ? (
                      "Missed"
                    ) : (
                      "Not received"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-4 text-sm text-muted-foreground">{HOLDER_NO_PROMISE}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This claim is a book-entry in XCG for Merkado Receivables I B.V. It
            is not a wallet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
