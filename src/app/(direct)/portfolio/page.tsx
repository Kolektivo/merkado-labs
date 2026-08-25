import Link from "next/link";

import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import { ThemeMerkado } from "@/components/theme-merkado";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusLabel, statusTone } from "@/lib/rent-advance/helpers";
import { listPortfolioPositions } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const { positions, contributed, received, expectedRemaining, active } =
    await listPortfolioPositions();

  return (
    <ThemeMerkado className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Positions you purchased, and later rent that arrives when the renter pays."
      />
      <SummaryStrip
        items={[
          {
            label: "Contributed",
            value: <Money cents={contributed} compact showUsd />,
            helper: `across ${positions.length} positions`,
            tip: "What the holder contributed. The landlord receives a lower one-time purchase price.",
          },
          {
            label: "Collected",
            value: <Money cents={received} compact showUsd />,
            helper: "actual collections only",
            tip: "Rent that actually arrived — never a promised figure.",
          },
          {
            label: "Expected remaining",
            value: <Money cents={expectedRemaining} compact showUsd />,
            helper: "if remaining collections arrive",
            tip: "Scheduled leftover only if later months are collected.",
          },
          {
            label: "Active offers",
            value: String(active),
          },
        ]}
      />
      {positions.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No positions yet. Buy a whole open offer in Marketplace and it will
          appear here.
        </div>
      ) : null}
      <div className="grid gap-3 md:hidden">
        {positions.map((position) => (
          <Link
            key={position.positionId}
            href={`/portfolio/${position.reference}`}
            className="rounded-xl border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{position.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {position.positionId} · {position.type}
                </p>
              </div>
              <StatusBadge tone={statusTone(position.status)}>
                {statusLabel(position.status)}
              </StatusBadge>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Collected</dt>
                <dd className="mt-1 font-medium">
                  <Money cents={position.collectedCents} showUsd />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ready</dt>
                <dd className="mt-1 font-medium">
                  <Money cents={position.pendingDistributionCents} showUsd />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Claimed</dt>
                <dd className="mt-1 font-medium">
                  <Money cents={position.distributedCents} showUsd />
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
      {positions.length > 0 ? (
        <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Ready to claim</TableHead>
              <TableHead>Claimed</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.positionId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/portfolio/${position.reference}`}
                    className="hover:underline"
                  >
                    {position.summary}
                  </Link>
                  <p className="text-xs font-normal text-muted-foreground">
                    {position.district} · {position.type}
                  </p>
                </TableCell>
                <TableCell>{position.positionId}</TableCell>
                <TableCell>
                  <Money cents={position.collectedCents} showUsd />
                </TableCell>
                <TableCell>
                  <Money cents={position.pendingDistributionCents} showUsd />
                </TableCell>
                <TableCell>
                  <Money cents={position.distributedCents} showUsd />
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(position.status)}>
                    {statusLabel(position.status)}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        When rent arrives, open the position, connect a wallet on Base Sepolia,
        and claim the rent.
      </p>
    </ThemeMerkado>
  );
}
