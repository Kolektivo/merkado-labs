import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SearchX } from "lucide-react";

import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { proceedsPresentation } from "@/lib/rent-advance/custody";
import {
  attentionItems,
  bookTotals,
  customerStatusLabel,
  effectiveOfferStatus,
  offerDisplayName,
  sortOffersForLandlordList,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { loadBook } from "@/lib/rent-advance/store";
import type { Offer, OfferStatus } from "@/lib/rent-advance/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Offers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS: { value: "all" | OfferStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under review" },
  { value: "funding", label: "Listed" },
  { value: "live", label: "Sold" },
  { value: "denied", label: "Denied" },
  { value: "expired", label: "Expired" },
  { value: "closed", label: "Closed" },
  { value: "default", label: "Default" },
];

const ATTENTION_TONE: Record<
  "error" | "warning" | "info",
  string
> = {
  error:
    "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
  warning:
    "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
  info: "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30",
};

function nextOfferStep(
  offer: Offer,
  proceeds: ReturnType<typeof proceedsPresentation>,
) {
  const status = effectiveOfferStatus(offer);
  if (status === "draft") return "Submit this request";
  if (status === "under_review") return "Wait for approval";
  if (status === "denied") return "Review the decision";
  if (status === "live" || status === "collecting") return "Sale amount paid automatically";
  if (proceeds.landlordPaid) return "Sale amount paid automatically";
  if (status === "funding") return "Listed for 60 days";
  return "Offer sold";
}

function parseStatus(
  raw: string | string[] | undefined,
): "all" | OfferStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return FILTERS.some((filter) => filter.value === value)
    ? (value as "all" | OfferStatus)
    : "all";
}

export default async function OriginatePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const book = await loadBook();
  const totals = bookTotals(book);
  const attention = attentionItems(book);
  const filtered =
    status === "all"
      ? book.offers
      : status === "live"
        ? book.offers.filter(
            (offer) =>
              effectiveOfferStatus(offer) === "collecting" ||
              effectiveOfferStatus(offer) === "live",
          )
        : book.offers.filter((offer) => effectiveOfferStatus(offer) === status);
  const offers = sortOffersForLandlordList(filtered);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Offers"
        description="Track review, listing, sale, and automatic payout."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/originate/simulator">Simulator</Link>
            </Button>
            <Button asChild>
              <Link href="/originate/new">
                <Plus data-icon="inline-start" />
                Create offer
              </Link>
            </Button>
          </div>
        }
      />

      <details
        open={status !== "all"}
        className="rounded-xl bg-card shadow-xs ring-1 ring-foreground/10"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Filter offers
        </summary>
        <nav
          aria-label="Filter offers by status"
          className="flex flex-wrap gap-1 border-t p-3"
        >
          {FILTERS.map((filter) => {
            const href =
              filter.value === "all"
                ? "/originate"
                : `/originate?status=${filter.value}`;
            const active = status === filter.value;
            return (
              <Button
                key={filter.value}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </details>

      {offers.length ? (
        <>
          <div className="grid gap-3 md:hidden">
            {offers.map((offer) => {
              const proceeds = proceedsPresentation(offer);
              const nextStep = nextOfferStep(offer, proceeds);
              const effectiveStatus = effectiveOfferStatus(offer);
              return (
                <Link
                  key={offer.reference}
                  href={`/originate/${offer.reference}`}
                  className={cn(
                    "rounded-xl border bg-card px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    proceeds.minted && !proceeds.purchased && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{offerDisplayName(offer)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {offer.reference} · {offer.property.district}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(effectiveStatus)}>
                      {customerStatusLabel(effectiveStatus)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm">
                    <Money cents={offer.purchasePriceCents} showUsd /> · {offer.months}{" "}
                    months
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-sm",
                      proceeds.minted && !proceeds.purchased
                        ? "font-medium text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {nextStep}
                  </p>
                </Link>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <Table className="min-w-[760px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ref</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Sale amount</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => {
                  const proceeds = proceedsPresentation(offer);
                  const nextStep = nextOfferStep(offer, proceeds);
                  const effectiveStatus = effectiveOfferStatus(offer);
                  return (
                    <TableRow
                      key={offer.reference}
                      className={cn(
                        proceeds.minted && !proceeds.purchased && "bg-primary/5",
                      )}
                    >
                      <TableCell className="font-medium">
                        <Link
                          href={`/originate/${offer.reference}`}
                          className="hover:underline"
                        >
                          {offer.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p className="font-medium">{offerDisplayName(offer)}</p>
                        {offer.property.district !== offerDisplayName(offer) ? (
                          <p className="text-xs text-muted-foreground">
                            {offer.property.district}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={offer.purchasePriceCents} showUsd />
                      </TableCell>
                      <TableCell>{offer.months} months</TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(effectiveStatus)}>
                          {customerStatusLabel(effectiveStatus)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-sm",
                          proceeds.minted && !proceeds.purchased &&
                            "font-medium text-primary",
                        )}
                      >
                        {nextStep}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No offers in this status</EmptyTitle>
                <EmptyDescription>
                  Try another filter or create a new offer.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      <details className="rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Book overview
        </summary>
        <div className="flex flex-col gap-4 border-t p-4">
          <SummaryStrip
            items={[
          {
            label: "Total paid",
            value: <Money cents={totals.totalAdvanced} />,
            tip: "Cash already paid to landlords for sold rent months.",
          },
          {
            label: "Outstanding",
            value: <Money cents={totals.outstanding} />,
            tip: "Sold rent that has not been collected yet.",
          },
          {
            label: "Collected to date",
            value: <Money cents={totals.collectedToDate} />,
            tip: "All rent received so far across the book.",
          },
          {
            label: "Active offers",
            value: totals.live,
            tip: "Offers that are live or already collecting.",
          },
            ]}
          />

          {attention.filter((item) => item.count > 0).length > 0 ? (
            <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Needs attention ·{" "}
            {attention.reduce((sum, item) => sum + item.count, 0)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {attention
              .filter((item) => item.count > 0)
              .map((item) => (
                <Link key={item.label} href={item.href} className="min-w-0">
                  <Card className={cn("h-full", ATTENTION_TONE[item.tone])}>
                    <CardHeader className="pb-0">
                      <CardTitle className="flex items-center justify-between gap-2 text-sm">
                        <span>{item.label}</span>
                        <span className="tabular-nums">{item.count}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {item.detail}
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
            </section>
          ) : null}
        </div>
      </details>
    </div>
  );
}
