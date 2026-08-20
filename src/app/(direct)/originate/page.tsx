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
import {
  attentionItems,
  bookTotals,
  sortOffersForLandlordList,
  statusLabel,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { loadBook } from "@/lib/rent-advance/store";
import type { OfferStatus } from "@/lib/rent-advance/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Offers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS: { value: "all" | OfferStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under review" },
  { value: "funding", label: "Funding" },
  { value: "collecting", label: "Collecting" },
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
      : status === "collecting"
        ? book.offers.filter(
            (offer) => offer.status === "collecting" || offer.status === "live",
          )
        : book.offers.filter((offer) => offer.status === status);
  const offers = sortOffersForLandlordList(filtered);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Offers"
        description="See every landlord offer. Use Simulator for a cash quote, then Create Offer to submit one for review."
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

      <div
        role="tablist"
        aria-label="Offer status"
        className="flex flex-wrap gap-1 rounded-lg border p-0.5"
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
              <Link href={href} role="tab" aria-selected={active}>
                {filter.label}
              </Link>
            </Button>
          );
        })}
      </div>

      <Card className="gap-0 py-0">
        {offers.length ? (
          <CardContent className="overflow-x-auto px-0">
            <div className="space-y-3 px-4 py-3 md:hidden">
              {offers.map((offer) => (
                <Link
                  key={offer.reference}
                  href={`/originate/${offer.reference}`}
                  className="block rounded-xl border px-4 py-3"
                >
                  <p className="font-medium">{offer.reference}</p>
                  <p className="text-sm">{offer.property.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {offer.property.district} · {offer.tenant.initials}
                  </p>
                  <p className="mt-2 text-sm">
                    <Money cents={offer.purchasePriceCents} /> · {offer.months} months
                  </p>
                  <p className="mt-1 text-sm">{statusLabel(offer.status)}</p>
                  <p className="text-xs text-muted-foreground">
                    {offer.nextAction
                      .replace(/^Pull month/, "Record month")
                      .replace(/^Chase subscriptions$/, "Wait for remaining funding")}
                  </p>
                </Link>
              ))}
            </div>
            <Table className="hidden min-w-[760px] md:table [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ref</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Advance</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <TableRow key={offer.reference}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/originate/${offer.reference}`}
                        className="hover:underline"
                      >
                        {offer.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <p className="font-medium">{offer.property.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {offer.property.district}
                      </p>
                    </TableCell>
                    <TableCell>{offer.tenant.initials}</TableCell>
                    <TableCell className="text-right">
                      <Money cents={offer.purchasePriceCents} />
                    </TableCell>
                    <TableCell>{offer.months} months</TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(offer.status)}>
                        {statusLabel(offer.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {offer.nextAction
                        .replace(/^Pull month/, "Record month")
                        .replace(/^Chase subscriptions$/, "Wait for remaining funding")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : (
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
        )}
      </Card>

      <SummaryStrip
        items={[
          {
            label: "Total advanced",
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
            label: "Live offers",
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
  );
}
