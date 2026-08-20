import Link from "next/link";

import { CopyValue } from "@/components/copy-value";
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
            value: <Money cents={contributed} compact />,
            helper: `across ${positions.length} positions`,
            tip: "What the holder contributed. The landlord receives a lower one-time purchase price.",
          },
          {
            label: "Collected",
            value: <Money cents={received} compact />,
            helper: "actual collections only",
            tip: "Rent that actually arrived — never a promised figure.",
          },
          {
            label: "Expected remaining",
            value: <Money cents={expectedRemaining} compact />,
            helper: "if remaining collections arrive",
            tip: "Scheduled leftover only if later months are collected.",
          },
          {
            label: "Active offers",
            value: String(active),
          },
        ]}
      />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Position ID</TableHead>
              <TableHead>District</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Awaiting distribution</TableHead>
              <TableHead>Distributed</TableHead>
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
                    {position.positionId}
                  </Link>
                  <p className="text-xs font-normal text-muted-foreground">
                    {position.reference} · {position.type}
                  </p>
                </TableCell>
                <TableCell>{position.district}</TableCell>
                <TableCell>
                  <Money cents={position.collectedCents} />
                </TableCell>
                <TableCell>
                  <Money cents={position.pendingDistributionCents} />
                </TableCell>
                <TableCell>
                  <Money cents={position.distributedCents} />
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(position.status)}>
                    {statusLabel(position.status)}
                  </StatusBadge>
                  {position.settlementTxHash ? (
                    <div className="mt-1">
                      <CopyValue
                        value={position.settlementTxHash}
                        label="settlement reference"
                        truncate
                      />
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        Collected rent is booked to the matching position when the renter pays.
      </p>
    </ThemeMerkado>
  );
}
