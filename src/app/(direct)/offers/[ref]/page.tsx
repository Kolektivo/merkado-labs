import Link from "next/link";
import { notFound } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { PropertyCover } from "@/components/property-cover";
import { StatusBadge } from "@/components/status-badge";
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
import { ThemeMerkado } from "@/components/theme-merkado";
import { HOLDER_NO_PROMISE } from "@/lib/rent-advance/copy";
import {
  canShowContribute,
  coverSrcFor,
  formatDayMonthYear,
  remainingOfferingCents,
  statusLabel,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { getPurchaserOffer } from "@/lib/rent-advance/store";

import { SubscribeForm } from "./subscribe-form";

export const dynamic = "force-dynamic";

export default async function BuyerOfferPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const offer = await getPurchaserOffer(ref);
  if (!offer) notFound();

  const remaining = remainingOfferingCents(offer);
  const bedsLabel = `${offer.bedrooms} ${offer.bedrooms === 1 ? "bed" : "beds"}`;

  return (
    <ThemeMerkado className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/offers">← All offers</Link>
      </Button>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(offer.status)}>
            {statusLabel(offer.status)}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {offer.propertyScore} · {offer.propertyLabel}
          </StatusBadge>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {offer.district} · {offer.type} · {bedsLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            {offer.summary} · {offer.interiorM2} m² · {offer.months} months ·{" "}
            {offer.reference}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted">
          <PropertyCover
            src={coverSrcFor(offer.type, offer.coverImageSrc)}
            alt={`${offer.type} in ${offer.district}`}
            sizes="(min-width: 1024px) 55vw, 100vw"
          />
        </div>

        <aside className="lg:sticky lg:top-20">
          {canShowContribute(offer.status) ? (
            <SubscribeForm
              reference={offer.reference}
              remainingCents={remaining}
              fundedCents={offer.fundedCents}
              offeringCents={offer.offeringCents}
            />
          ) : (
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              This offering is not open to purchase.
            </div>
          )}
        </aside>
      </div>

      <Tabs defaultValue="passport">
        <TabsList variant="line">
          <TabsTrigger value="passport">Property view</TabsTrigger>
          <TabsTrigger value="comparables">Similar homes</TabsTrigger>
          <TabsTrigger value="payer">Payment history</TabsTrigger>
          <TabsTrigger value="terms">Terms</TabsTrigger>
        </TabsList>

        <TabsContent value="passport" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Combined property view {offer.propertyScore}/100 ·{" "}
                {offer.propertyLabel}
                <HelpTip label="Combined property view">
                  Listing quality plus how the rent compares to typical nearby
                  rent.
                </HelpTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                <ScoreRow label="Rent vs typical rent" value={offer.passport.rentVsMarket} />
                <ScoreRow label="Market depth" value={offer.passport.marketDepth} />
                <ScoreRow label="Condition" value={offer.passport.condition} />
                <ScoreRow label="Accessibility" value={offer.passport.accessibility} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparables" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Similar homes</CardTitle>
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
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{offer.payer.bandLabel}</p>
              <p>Paid on time {offer.payer.onTimePercent}% of the last 12 months</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                Term {offer.months} months.{" "}
                <Money cents={offer.fundedCents} /> of{" "}
                <Money cents={offer.offeringCents} /> filled.
              </p>
              <div>
                <p className="mb-2 font-medium">Later rent months</p>
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
              <p className="text-muted-foreground">{HOLDER_NO_PROMISE}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ThemeMerkado>
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
