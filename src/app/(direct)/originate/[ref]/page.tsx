import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OfferCustomerActions } from "./offer-ops-forms";
import { LandlordProceedsCard } from "@/components/rent-advance/landlord-proceeds-card";
import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { ShareOfferButton } from "@/components/share-offer-button";
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
import { formatDateTime } from "@/lib/format";
import {
  effectiveOfferStatus,
  rentToMarket,
  offerDisplayName,
  customerStatusLabel,
  listingExpiresAt,
  formatDayMonthYear,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { formatPercent } from "@/lib/rent-advance/money";
import { bandLabel, payerBandLabel } from "@/lib/rent-advance/scoring";
import { proceedsPresentation } from "@/lib/rent-advance/custody";
import { getOffer } from "@/lib/rent-advance/store";

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

export default async function OfferOpsPage({
  params,
}: {
  params: Params;
}) {
  const { ref } = await params;
  const offer = await getOffer(ref);
  if (!offer) notFound();

  const belowMarket = Number.isFinite(rentToMarket(offer)) && rentToMarket(offer) < 1;
  const proceeds = proceedsPresentation(offer);
  const effectiveStatus = effectiveOfferStatus(offer);
  const sold =
    proceeds.purchased ||
    proceeds.landlordPaid ||
    effectiveStatus === "live" ||
    effectiveStatus === "collecting";
  const showProceedsCard = offer.status !== "draft";
  const expiresAt = listingExpiresAt(offer.publishedAt);
  const expiresLabel = expiresAt ? formatDayMonthYear(expiresAt) : null;
  const lifecycleEvents = offer.events.filter((event) =>
    /offer request|approved|denied|offer created|listed|listing|offer sold|whole offer|sale amount|status set/i.test(
      event.title,
    ),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={offerDisplayName(offer)}
        description={`${offer.reference} · ${offer.property.district}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={statusTone(effectiveStatus)}>
              {customerStatusLabel(effectiveStatus)}
            </StatusBadge>
            {effectiveStatus === "funding" ||
            effectiveStatus === "live" ||
            effectiveStatus === "collecting" ? (
              <ShareOfferButton reference={offer.reference} />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="bg-primary/5 ring-primary/20">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
              Sale amount
              <HelpTip label="Sale amount">
              The one-time amount paid automatically after the whole offer is
              bought.
              </HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Money
              cents={offer.purchasePriceCents}
              className="text-xl font-semibold text-primary"
              showUsd
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Offer status
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {customerStatusLabel(effectiveStatus)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Marketplace window
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {sold
              ? "Offer sold"
              : effectiveStatus === "funding"
                ? "Open on Marketplace"
                : "Not on the marketplace"}
            {expiresLabel &&
            !sold && effectiveStatus === "funding" ? (
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                Available until {expiresLabel} · 60-day listing window
              </span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {showProceedsCard ? (
        <LandlordProceedsCard
          propertyName={offerDisplayName(offer)}
          presentation={proceeds}
        />
      ) : null}

      <OfferCustomerActions reference={offer.reference} status={offer.status} />

      <details className="rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-4 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          More offer details
        </summary>
        <Tabs defaultValue="overview" className="px-4 pb-4">
          <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="passport">Quality scores</TabsTrigger>
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
                  {lifecycleEvents.map((event) => (
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
                        <Money cents={row.rentCents} showUsd />
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

        </Tabs>
      </details>
    </div>
  );
}
