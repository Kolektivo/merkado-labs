import Link from "next/link";
import { notFound } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HOLDER_NO_PROMISE } from "@/lib/rent-advance/copy";
import {
  canShowContribute,
  formatDayMonthYear,
  statusLabel,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { getPurchaserOffer } from "@/lib/rent-advance/store";

import { ContributeGate } from "./contribute-gate";

export const dynamic = "force-dynamic";

export default async function BuyerOfferPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const offer = await getPurchaserOffer(ref);
  if (!offer) notFound();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/offers">← All offers</Link>
      </Button>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(offer.status)}>
            {statusLabel(offer.status)}
          </StatusBadge>
          <StatusBadge tone="neutral">
            Property score {offer.passport.total} · {offer.passportLabel}
          </StatusBadge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {offer.district} · {offer.type} · {offer.bedrooms}{" "}
          {offer.bedrooms === 1 ? "bed" : "beds"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Offer {offer.reference}. District only — no street address, tenant
          name, employer, or income figure.
        </p>
      </div>

      {offer.relatedParty ? (
        <Alert>
          <AlertTitle>Related-party disclosure</AlertTitle>
          <AlertDescription>
            {offer.relatedPartyNote ??
              "This offer involves a related party and was priced above market."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="passport">
        <TabsList variant="line">
          <TabsTrigger value="passport">Passport</TabsTrigger>
          <TabsTrigger value="comparables">Comparables</TabsTrigger>
          <TabsTrigger value="payer">Payer</TabsTrigger>
          <TabsTrigger value="terms">Terms</TabsTrigger>
        </TabsList>

        <TabsContent value="passport" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Passport {offer.passport.total}/100 · {offer.passportLabel}
                <HelpTip label="Passport">
                  Property quality grade. Street address is never shown here.
                </HelpTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {offer.district} · {offer.type} · {offer.bedrooms}{" "}
                {offer.bedrooms === 1 ? "bed" : "beds"} ·{" "}
                {offer.interiorM2} m²
              </p>
              <p>{offer.summary}</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <ScoreRow label="Rent vs market" value={offer.passport.rentVsMarket} />
                <ScoreRow label="Market depth" value={offer.passport.marketDepth} />
                <ScoreRow label="Condition" value={offer.passport.condition} />
                <ScoreRow label="Accessibility" value={offer.passport.accessibility} />
              </dl>
              <p className="text-muted-foreground">
                Rent-to-market {Math.round(offer.rentToMarket * 100)}% of market.
                Street address is not shown.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparables" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Comparables</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[480px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Rent</TableHead>
                    <TableHead>Beds</TableHead>
                    <TableHead>m²</TableHead>
                    <TableHead>Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offer.comparables.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
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

        <TabsContent value="payer" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Payer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{offer.payer.bandLabel}</p>
              <p>On-time {offer.payer.onTimePercent}%</p>
              <p>Employment type · {offer.payer.employmentStatus}</p>
              <p>Affordability band · {offer.payer.rentToIncomeBand}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>Term {offer.months} months</p>
              <p>
                Funded <Money cents={offer.fundedCents} /> of{" "}
                <Money cents={offer.offeringCents} /> offering
              </p>
              <p>Via {offer.agency}</p>
              <div>
                <p className="mb-2 font-medium">
                  Six-month distribution schedule · scheduled, not promised
                </p>
                <div className="overflow-x-auto">
                <Table className="min-w-[480px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offer.receivables.map((row) => (
                      <TableRow key={row.n}>
                        <TableCell>{row.n}</TableCell>
                        <TableCell>{formatDayMonthYear(row.dueDate)}</TableCell>
                        <TableCell>
                          <Money cents={row.amountCents} />
                        </TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-muted-foreground">
                {HOLDER_NO_PROMISE}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {canShowContribute(offer.status) ? <ContributeGate /> : null}
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
