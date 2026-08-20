import Link from "next/link";

import { PayNetworkControl } from "@/components/pay-network-control";
import { ResetDemoButton } from "@/components/reset-demo-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money-display";
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
import { isTestnetConfig, mainnetSelectionAllowed } from "@/lib/pay/networks";
import { sortOffersForLandlordList, statusLabel, statusTone } from "@/lib/rent-advance/helpers";
import { loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const book = await loadBook();
  const offers = sortOffersForLandlordList(book.offers);
  const review = offers.filter((offer) => offer.status === "under_review");
  const funding = offers.filter((offer) => offer.status === "funding");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description="Approve offers, record collections, set the payment network, and restore the starting book."
      />

      {review.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {review.map((offer) => (
              <div
                key={offer.reference}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{offer.reference}</p>
                  <p className="text-xs text-muted-foreground">
                    {offer.property.summary} · {offer.property.district}
                  </p>
                </div>
                <Button size="sm" asChild>
                  <Link href={`/admin/${offer.reference}`}>Review</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {funding.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Open on Marketplace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {funding.map((offer) => (
              <p key={offer.reference}>
                {offer.reference} · {offer.property.summary} ·{" "}
                <Money cents={offer.offeringCents - offer.fundedCents} /> remaining
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Offer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Purchase</TableHead>
              <TableHead>Filled</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
              <TableRow key={offer.reference}>
                <TableCell>
                  <p className="font-medium">{offer.reference}</p>
                  <p className="text-xs text-muted-foreground">
                    {offer.property.district} · {offer.property.summary}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(offer.status)}>
                    {statusLabel(offer.status)}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <Money cents={offer.monthlyRentCents} />
                </TableCell>
                <TableCell>
                  <Money cents={offer.purchasePriceCents} />
                </TableCell>
                <TableCell>
                  <Money cents={offer.fundedCents} compact /> /{" "}
                  <Money cents={offer.offeringCents} compact />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/${offer.reference}`}>Manage</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PayNetworkControl
        networkKey={book.cryptoConfig?.networkKey ?? ""}
        networkLabel={book.cryptoConfig?.networkLabel?.trim() || "Network to be confirmed"}
        isTestnet={isTestnetConfig(book.cryptoConfig)}
        allowMainnet={mainnetSelectionAllowed()}
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Reset the book</p>
          <p className="text-sm text-muted-foreground">
            Restores the seeded offers, payments, and positions. Keeps the
            selected test network.
          </p>
        </div>
        <ResetDemoButton />
      </div>
    </div>
  );
}
