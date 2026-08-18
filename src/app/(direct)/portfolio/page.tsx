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
        description="Pre-seeded book-entry positions. Distributions are automatic when rent is collected."
      />
      <SummaryStrip
        items={[
          {
            label: "Contributed",
            value: <Money cents={contributed} compact />,
            helper: `across ${positions.length} positions`,
            tip: "What the sole holder paid in for these positions.",
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
              <TableHead>Awaiting release</TableHead>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {positions[0]?.settlementTxHash ? (
        <p className="text-sm text-muted-foreground">
          Advance settlement{" "}
          <CopyValue
            value={positions[0].settlementTxHash}
            label="settlement reference"
            truncate
          />
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Positions are book-entries. There is no token and no Claim button.
        </p>
      )}
    </ThemeMerkado>
  );
}
