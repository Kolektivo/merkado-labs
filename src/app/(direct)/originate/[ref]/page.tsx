import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LandlordProceedsCard } from "./landlord-proceeds-card";
import { OfferCustomerActions } from "./offer-ops-forms";
import { CopyValue, ExplorerLink } from "@/components/copy-value";
import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime, titleCase } from "@/lib/format";
import {
  collectedCount,
  distributionTotals,
  rentToMarket,
  statusLabel,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { formatPercent } from "@/lib/rent-advance/money";
import { findLandlordProceedsClaim } from "@/lib/rent-advance/payment-apply";
import { bandLabel, payerBandLabel } from "@/lib/rent-advance/scoring";
import { getOffer, loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";

type Params = Promise<{ ref: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: ref };
}

export default async function OfferOpsPage({ params }: { params: Params }) {
  const { ref } = await params;
  const [offer, book] = await Promise.all([getOffer(ref), loadBook()]);
  if (!offer) notFound();

  const collected = collectedCount(offer);
  const belowMarket = Number.isFinite(rentToMarket(offer)) && rentToMarket(offer) < 1;
  const money = distributionTotals(book, offer);
  const settlement = book.ledgerTransactions?.find(
    (row) => row.offerReference === offer.reference && row.kind === "advance_settlement",
  );
  const claim = findLandlordProceedsClaim(book, offer.reference);

  return (
    <div className="space-y-6">
      <PageHeader
        title={offer.reference}
        description={`${offer.property.summary} · ${offer.property.district}`}
        actions={
          <StatusBadge tone={statusTone(offer.status)}>
            {statusLabel(offer.status)}
          </StatusBadge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Property
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{offer.property.summary}</p>
            <p className="text-xs text-muted-foreground">
              {offer.property.district}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Payer
            </CardTitle>
          </CardHeader>
          <CardContent className="font-medium">{offer.tenant.initials}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Advance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Money cents={offer.purchasePriceCents} className="font-medium" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Collected
            </CardTitle>
          </CardHeader>
          <CardContent className="font-medium">
            {collected} of {offer.months} months
          </CardContent>
        </Card>
      </div>

      {settlement ? (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Landlord settlement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">
              <Money cents={offer.purchasePriceCents} /> paid
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <CopyValue
                value={settlement.txHash ?? settlement.transactionId}
                label="settlement reference"
                truncate
              />
              <ExplorerLink
                baseUrl={book.cryptoConfig?.explorerBaseUrl}
                hash={settlement.txHash}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Collected <Money cents={money.collectedCents} /> · awaiting
              distribution <Money cents={money.pendingDistributionCents} /> ·
              distributed <Money cents={money.distributedCents} />
            </p>
          </CardContent>
        </Card>
      ) : null}

      {offer.settlementMode === "landlord_claim" ? (
        <LandlordProceedsCard
          reference={offer.reference}
          claim={claim ?? null}
          purchasePriceCents={offer.purchasePriceCents}
          feeCents={offer.feeCents}
        />
      ) : null}

      {offer.status === "draft" ? (
        <Alert>
          <AlertTitle>Draft</AlertTitle>
          <AlertDescription>
            Nothing has been sold yet. Submit this draft for independent
            approval before funding.
          </AlertDescription>
        </Alert>
      ) : null}

      <OfferCustomerActions reference={offer.reference} status={offer.status} />

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="passport">Quality scores</TabsTrigger>
          <TabsTrigger value="servicing">Collections</TabsTrigger>
          <TabsTrigger value="holders">Holders</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <Table className="min-w-[640px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offer.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(event.at)}
                      </TableCell>
                      <TableCell className="whitespace-normal font-medium">
                        {event.title}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {event.detail}
                      </TableCell>
                      <TableCell>{event.actor}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="passport" className="space-y-4 pt-4">
          {belowMarket ? (
            <Alert>
              <AlertTitle>Rent is below typical</AlertTitle>
              <AlertDescription>
                This rent is {formatPercent(rentToMarket(offer), 0)} of typical
                nearby rent. Below typical is usually stronger for this offer.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Property quality
                  <HelpTip label="Property quality">
                    Also called Listing Score. How strong this listing looks.
                    This number sets the cash offer. The combined property view
                    is only for explanation.
                  </HelpTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  {(
                    [
                      ["Rent vs typical rent", offer.passport.rentVsMarket],
                      ["Market depth", offer.passport.marketDepth],
                      ["Condition", offer.passport.condition],
                      ["Accessibility", offer.passport.accessibility],
                      ["Total", offer.passport.total],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 py-2 text-sm"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-sm text-muted-foreground">
                  {offer.passport.total} · {bandLabel(offer.passport.total)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Payment history
                  <HelpTip label="Payment history">
                    How this renter has paid. Holders see a simple grade only —
                    never the name, employer, or income.
                  </HelpTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  {(
                    [
                      ["Payment history", offer.tenant.scores.paymentHistory],
                      ["Rent vs income", offer.tenant.scores.rentToIncome],
                      ["Employment", offer.tenant.scores.employment],
                      ["Cash buffer", offer.tenant.scores.savings],
                      ["Total", offer.tenant.scores.total],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 py-2 text-sm"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-sm text-muted-foreground">
                  {payerBandLabel(offer.tenant.scores.total)}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Comparables</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <Table className="min-w-[720px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Address</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead className="text-right">Rent</TableHead>
                    <TableHead>Beds</TableHead>
                    <TableHead>m²</TableHead>
                    <TableHead>Days listed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offer.comparables.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-normal">
                        {row.address}
                        {row.excluded ? (
                          <p className="text-xs text-muted-foreground">
                            Excluded · {row.excludeReason}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.district}</TableCell>
                      <TableCell className="text-right">
                        <Money cents={row.rentCents} />
                      </TableCell>
                      <TableCell>{row.bedrooms}</TableCell>
                      <TableCell>{row.interiorM2}</TableCell>
                      <TableCell>{row.daysListed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servicing" className="space-y-4 pt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Receivables</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0">
                <Table className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Month</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offer.receivables.map((row) => (
                      <TableRow key={row.n}>
                        <TableCell>{row.n}</TableCell>
                        <TableCell>{formatDate(row.dueDate)}</TableCell>
                        <TableCell className="text-right">
                          <Money cents={row.amountCents} />
                        </TableCell>
                        <TableCell>{titleCase(row.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Collections</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0">
                <Table className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Month</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offer.collections.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.receivableN}</TableCell>
                        <TableCell>{formatDate(row.receivedOn)}</TableCell>
                        <TableCell className="text-right">
                          <Money cents={row.amountCents} />
                        </TableCell>
                        <TableCell>{titleCase(row.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="holders" className="pt-4">
          <Card className="gap-0 py-0">
            <CardContent className="overflow-x-auto px-0">
              <Table className="min-w-[640px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Holder</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead className="text-right">Contributed</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offer.holders.map((holder) => (
                    <TableRow key={holder.holderId}>
                      <TableCell className="whitespace-normal">
                        {holder.holderName}
                        {holder.anonymised ? (
                          <p className="text-xs text-muted-foreground">
                            Anonymised purchaser entity
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{holder.units}</TableCell>
                      <TableCell className="text-right">
                        <Money cents={holder.contributedCents} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={holder.receivedCents} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
