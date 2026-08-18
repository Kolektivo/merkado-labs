import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyValue, ExplorerLink } from "@/components/copy-value";
import { Money } from "@/components/money-display";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import { ThemeMerkado } from "@/components/theme-merkado";
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
import { getPortfolioPosition, loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";

export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const [position, book] = await Promise.all([
    getPortfolioPosition(ref),
    loadBook(),
  ]);
  if (!position) notFound();
  const distributions = (book.distributions ?? []).filter(
    (row) => row.offerReference === position.reference,
  );

  return (
    <ThemeMerkado className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/portfolio">← Portfolio</Link>
      </Button>
      <div className="space-y-2">
        <StatusBadge tone={statusTone(position.status)}>
          {statusLabel(position.status)}
        </StatusBadge>
        <h1 className="text-3xl font-semibold tracking-tight">
          {position.positionId}
        </h1>
        <p className="text-sm text-muted-foreground">
          {position.reference} · {position.district} · {position.type} ·{" "}
          {position.months} months · Property Score {position.propertyScore}.
          District only. Distributions are automatic.
        </p>
      </div>
      <SummaryStrip
        items={[
          { label: "Contributed", value: <Money cents={position.fundedCents} compact /> },
          {
            label: "Collected",
            value: <Money cents={position.collectedCents} compact />,
          },
          {
            label: "Awaiting release",
            value: <Money cents={position.pendingDistributionCents} compact />,
          },
          {
            label: "Distributed",
            value: <Money cents={position.distributedCents} compact />,
          },
        ]}
      />
      {position.settlementTxHash ? (
        <Card>
          <CardHeader>
            <CardTitle>Advance settlement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <CopyValue
              value={position.settlementTxHash}
              label="settlement reference"
              truncate
            />
            <ExplorerLink
              baseUrl={book.cryptoConfig?.explorerBaseUrl}
              hash={position.settlementTxHash}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Collections and automatic distributions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {position.receivables.map((row) => {
                const distribution = distributions.find((item) =>
                  item.collectionId.endsWith(`-${row.n}`) ||
                  item.distributionId.endsWith(`-${row.n}`),
                );
                return (
                  <TableRow key={row.n}>
                    <TableCell>{row.n}</TableCell>
                    <TableCell>{formatDayMonthYear(row.dueDate)}</TableCell>
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
                    <TableCell>
                      {distribution ? (
                        <div className="space-y-1">
                          <p className="capitalize">{distribution.status}</p>
                          {distribution.txHash ? (
                            <CopyValue
                              value={distribution.txHash}
                              label="distribution reference"
                              truncate
                            />
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-4 text-sm text-muted-foreground">{HOLDER_NO_PROMISE}</p>
        </CardContent>
      </Card>
    </ThemeMerkado>
  );
}
