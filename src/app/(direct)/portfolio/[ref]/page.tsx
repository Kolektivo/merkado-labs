import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClaimRentForm } from "@/components/rent-advance/claim-rent-form";
import { CopyValue } from "@/components/copy-value";
import { Money } from "@/components/money-display";
import { RouteSuccessDialog } from "@/components/route-success-dialog";
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
import { mergeOnchain } from "@/lib/rent-advance/custody";
import { getPortfolioPosition, loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: ref.toUpperCase() };
}

export default async function PortfolioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const [position, book] = await Promise.all([
    getPortfolioPosition(ref),
    loadBook(),
  ]);
  if (!position) notFound();
  const offer = book.offers.find((row) => row.reference === position.reference);
  const onchain = mergeOnchain(offer?.onchain);
  const contractAddress = onchain.contractAddress ?? book.cryptoConfig?.offerNftContract ?? null;
  const configured = Boolean(contractAddress);
  const distributions = (book.distributions ?? []).filter(
    (row) => row.offerReference === position.reference,
  );
  const pendingCollect = distributions.filter((row) => row.status === "claimable");
  const pendingCents = pendingCollect.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <ThemeMerkado className="space-y-6">
      {query.success === "purchase" ? (
        <RouteSuccessDialog
          title="Purchase recorded"
          description={`${position.summary} was added to your Portfolio. Future rent appears here after the renter pays.`}
          storageKey={`merkado:success:purchase:${position.reference}`}
          closeHref={`/portfolio/${position.reference}`}
        />
      ) : query.success === "rent" ? (
        <RouteSuccessDialog
          title="Rent claimed"
          description={`${position.summary} rent was added to your claimed total.`}
          storageKey={`merkado:success:rent:${position.reference}`}
          closeHref={`/portfolio/${position.reference}`}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portfolio">← Portfolio</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/offers/${position.reference}`}>View offer</Link>
        </Button>
      </div>
      <div className="space-y-2">
        <StatusBadge tone={statusTone(position.status)}>
          {statusLabel(position.status)}
        </StatusBadge>
        <h1 className="text-3xl font-semibold tracking-tight">
          {position.summary}
        </h1>
        <p className="text-sm text-muted-foreground">
          Position {position.positionId} · {position.type} · {position.months} months
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
            label: "Ready to claim",
            value: <Money cents={position.pendingDistributionCents} compact />,
          },
          {
            label: "Claimed",
            value: <Money cents={position.distributedCents} compact />,
          },
        ]}
      />
      {pendingCents > 0 ? (
        <Card className="ring-primary/30 shadow-md">
          <CardHeader>
            <CardTitle>Rent ready to claim</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimRentForm
              reference={position.reference}
              tokenId={onchain.tokenId}
              amountCents={pendingCents}
              configured={configured}
              contractAddress={contractAddress}
            />
          </CardContent>
        </Card>
      ) : position.distributedCents > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Rent claimed</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Money cents={position.distributedCents} showUsd /> claimed so far.
          </CardContent>
        </Card>
      ) : null}
      <details className="rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Payment history
        </summary>
        <Card className="rounded-none py-0 shadow-none ring-0">
          <CardContent className="border-t pt-4">
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
                          <p>
                            {distribution.status === "claimable"
                              ? "Ready to claim"
                              : distribution.status === "claimed"
                                ? "Claimed"
                                : distribution.status}
                          </p>
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
      </details>
    </ThemeMerkado>
  );
}
