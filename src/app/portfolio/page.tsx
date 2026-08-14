import Link from "next/link";

import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
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
export const metadata = { title: "Merkado Direct · Portfolio" };

export default async function PortfolioPage() {
  const { positions, contributed, received, expectedRemaining, active } =
    await listPortfolioPositions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Book-entry positions in Caribbean guilders. Not a wallet."
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
            label: "Distributions received",
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
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>District</TableHead>
              <TableHead>Term</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Contributed</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.reference}>
                <TableCell className="font-medium">
                  <Link
                    href={`/portfolio/${position.reference}`}
                    className="hover:underline"
                  >
                    {position.reference}
                  </Link>
                  <p className="text-xs font-normal text-muted-foreground">
                    {position.type} · {position.bedrooms} beds
                  </p>
                </TableCell>
                <TableCell>{position.district}</TableCell>
                <TableCell>{position.months} months</TableCell>
                <TableCell>
                  {position.collectedMonths} of {position.months}
                </TableCell>
                <TableCell>
                  <Money cents={position.fundedCents} />
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
      <p className="text-sm text-muted-foreground">
        Each claim is a book-entry on this register. There is no wallet
        address.
      </p>
    </div>
  );
}
