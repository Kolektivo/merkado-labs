import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DualControlForm,
  OfferOpsForms,
} from "./offer-ops-forms";
import { CopyValue, ExplorerLink } from "@/components/copy-value";
import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { SaleNotLoan } from "@/components/sale-not-loan";
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
import { ARREARS_LADDER, arrearsStep } from "@/lib/rent-advance/arrears";
import {
  collectedCount,
  distributionTotals,
  landlordDisclosure,
  propertyScoreFor,
  rentToMarket,
  statusLabel,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { formatPercent } from "@/lib/rent-advance/money";
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

function daysLate(dueDate: string): number {
  const due = Date.parse(`${dueDate}T12:00:00`);
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.floor((Date.now() - due) / 86_400_000));
}

export default async function OfferOpsPage({ params }: { params: Params }) {
  const { ref } = await params;
  const [offer, book] = await Promise.all([getOffer(ref), loadBook()]);
  if (!offer) notFound();

  const disclosure = landlordDisclosure(offer);
  const collected = collectedCount(offer);
  const nextReceivable =
    offer.receivables.find((row) => row.status === "scheduled") ?? null;
  const releasable = offer.collections.filter(
    (row) => row.status === "received" || row.status === "reconciled",
  );
  const missed = offer.receivables.find((row) => row.status === "missed");
  const lateDays = missed ? Math.max(1, daysLate(missed.dueDate)) : 0;
  const currentArrears = missed ? arrearsStep(lateDays) : null;
  const belowMarket = Number.isFinite(rentToMarket(offer)) && rentToMarket(offer) < 1;
  const derived = propertyScoreFor(offer);
  const money = distributionTotals(book, offer);
  const settlement = book.ledgerTransactions?.find(
    (row) => row.offerReference === offer.reference && row.kind === "advance_settlement",
  );

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
        <Alert>
          <AlertTitle>One-time upfront settlement</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              The landlord already received the purchase price. Later rent is
              collected for holders and is not paid to the landlord again.
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
            <p className="text-xs">
              Collected <Money cents={money.collectedCents} /> · pending
              distribution <Money cents={money.pendingDistributionCents} /> ·
              distributed <Money cents={money.distributedCents} />
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {offer.status === "draft" ? (
        <Alert>
          <AlertTitle>Draft</AlertTitle>
          <AlertDescription>
            Nothing has been sold yet. Save and approve before collections
            start.
          </AlertDescription>
        </Alert>
      ) : null}

      {offer.relatedParty ? (
        <Alert>
          <AlertTitle>Related-party offer</AlertTitle>
          <AlertDescription>
            {offer.status === "under_review" || offer.status === "draft"
              ? "The landlord is connected to Merkado. An independent approver must sign before funding. The fee includes a related-party premium."
              : "The landlord is connected to Merkado. The fee includes a related-party premium. Independent approval is already on the file."}
          </AlertDescription>
        </Alert>
      ) : null}

      <OfferOpsForms
        reference={offer.reference}
        status={offer.status}
        nextReceivableN={nextReceivable?.n ?? null}
        actors={book.actors}
      />

      {releasable.length > 0 ? (
        <DualControlForm
          reference={offer.reference}
          releasableCollections={releasable}
          actors={book.actors}
        />
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="passport">Listing Score</TabsTrigger>
          <TabsTrigger value="servicing">Collections</TabsTrigger>
          <TabsTrigger value="holders">Holders</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <SaleNotLoan
            netAdvance={disclosure.netAdvance}
            grossForgone={disclosure.grossForgone}
            totalCost={disclosure.totalCost}
            flatFee={disclosure.flatFee}
            effective={disclosure.effective}
          />
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
              <AlertTitle>Below-market rent</AlertTitle>
              <AlertDescription>
                Contractual rent is {formatPercent(rentToMarket(offer), 0)} of
                the market estimate. That is a stronger rent-to-market reading.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Listing Score
                  <HelpTip label="Listing Score">
                    Raw underwriting input used for pricing. Property Score is
                    derived for explanation only.
                  </HelpTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  {(
                    [
                      ["Rent vs market", offer.passport.rentVsMarket],
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
                  {bandLabel(offer.passport.total)} · Listing Score{" "}
                  {offer.passport.total} · Property Score {derived.propertyScore}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Payer scores
                  <HelpTip label="Payer scores">
                    How this renter has paid. Holders see a band only — never
                    the name, employer, or income.
                  </HelpTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  {(
                    [
                      ["Payment history", offer.tenant.scores.paymentHistory],
                      ["Rent-to-income", offer.tenant.scores.rentToIncome],
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

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Arrears ladder
            </summary>
            <ol className="mt-3 space-y-2">
              {ARREARS_LADDER.map((step) => {
                const active = currentArrears?.day === step.day;
                return (
                  <li
                    key={step.day}
                    className={
                      active
                        ? "rounded-lg border bg-muted/50 px-3 py-2 text-sm"
                        : "px-3 py-1.5 text-sm"
                    }
                  >
                    <span className="font-medium">Day {step.day}.</span>{" "}
                    <span className="text-muted-foreground">{step.action}</span>
                  </li>
                );
              })}
            </ol>
          </details>

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
