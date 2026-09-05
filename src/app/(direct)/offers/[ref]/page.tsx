import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, House, MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { HelpTip } from "@/components/help-tip";
import { PropertyCover } from "@/components/property-cover";
import { ShareOfferButton } from "@/components/share-offer-button";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeMerkado } from "@/components/theme-merkado";
import { HOLDER_NO_PROMISE, PLAIN } from "@/lib/rent-advance/copy";
import {
  coverSrcFor,
  customerStatusLabel,
  formatDayMonthYear,
  listingExpiresAt,
  remainingOfferingCents,
  statusTone,
} from "@/lib/rent-advance/helpers";
import { formatUsd, formatXcg } from "@/lib/rent-advance/money";
import { getPurchaserOffer } from "@/lib/rent-advance/store";
import { getLinkedWalletForAccount } from "@/lib/rent-advance/accounts";
import { getOptionalUser } from "@/lib/supabase/server-client";

import { SubscribeForm } from "./subscribe-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: ref.toUpperCase() };
}

export default async function BuyerOfferPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const offer = await getPurchaserOffer(ref);
  if (!offer) notFound();

  const user = await getOptionalUser();
  const linked = user ? await getLinkedWalletForAccount(user.id) : null;
  const linkedWalletAddress = linked?.walletAddress ?? null;

  const remaining = remainingOfferingCents(offer);
  const expiresAt = listingExpiresAt(offer.publishedAt);
  const expiresLabel = expiresAt ? formatDayMonthYear(expiresAt) : null;
  const bedsLabel = `${offer.bedrooms} ${offer.bedrooms === 1 ? "bed" : "beds"}`;
  const monthsLabel = `${offer.months} ${offer.months === 1 ? "month" : "months"}`;
  const title = offer.summary.trim() || `${offer.type} in ${offer.district}`;
  const monthlyRentCents = offer.receivables[0]?.amountCents ?? null;
  const openToBuy =
    (offer.status === "funding" || offer.status === "live" || offer.status === "collecting");
  const configured = Boolean(offer.contractAddress);

  return (
    <ThemeMerkado className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/offers"
        className="inline-flex items-center gap-1.5 text-sm text-grey-800 hover:text-surface-dark"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All offers
      </Link>

      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl bg-grey-100">
            <PropertyCover
              src={coverSrcFor(offer.type, offer.coverImageSrc)}
              alt={`${offer.type} in ${offer.district}`}
              sizes="(min-width: 1024px) 640px, 100vw"
              priority
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone(offer.status)}>
                {customerStatusLabel(offer.status)}
              </StatusBadge>
              <span className="text-xs tracking-wide text-grey-800">
                {offer.reference}
              </span>
              <ShareOfferButton reference={offer.reference} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-surface-dark">
              {title}
            </h1>
            <div className="flex flex-wrap items-center text-[13px] text-grey-800">
              <Spec icon={<BedDouble className="size-3.5" />} label={bedsLabel} />
              <SpecDivider />
              <Spec icon={<House className="size-3.5" />} label={offer.type} />
              <SpecDivider />
              <Spec icon={<MapPin className="size-3.5" />} label={offer.district} />
              <span className="px-2 text-grey-500">·</span>
              <span>{offer.interiorM2} m²</span>
              <span className="px-2 text-grey-500">·</span>
              <span>{monthsLabel}</span>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:row-span-2">
          {openToBuy ? (
            <SubscribeForm
              reference={offer.reference}
              remainingCents={remaining}
              fundedCents={offer.fundedCents}
              offeringCents={offer.offeringCents}
              expiresLabel={expiresLabel}
              minted={offer.minted}
              configured={configured}
              tokenId={offer.tokenId}
              contractAddress={offer.contractAddress}
              linkedWalletAddress={linkedWalletAddress}
            />
          ) : (
            <ClosedOfferCard
              status={customerStatusLabel(offer.status)}
              offeringCents={offer.offeringCents}
            />
          )}
        </aside>

        <Tabs defaultValue="passport" className="min-w-0">
          <TabsList
            variant="line"
            className="h-auto w-full justify-start gap-6 rounded-none border-b border-grey-200 bg-transparent p-0"
          >
            <TabsTrigger
              value="passport"
              className="rounded-none px-0 pb-2.5 after:bottom-0 after:h-px after:bg-surface-dark"
            >
              Property
            </TabsTrigger>
            <TabsTrigger
              value="comparables"
              className="rounded-none px-0 pb-2.5 after:bottom-0 after:h-px after:bg-surface-dark"
            >
              Similar
            </TabsTrigger>
            <TabsTrigger
              value="payer"
              className="rounded-none px-0 pb-2.5 after:bottom-0 after:h-px after:bg-surface-dark"
            >
              History
            </TabsTrigger>
            <TabsTrigger
              value="terms"
              className="rounded-none px-0 pb-2.5 after:bottom-0 after:h-px after:bg-surface-dark"
            >
              Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="passport" className="mt-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="flex items-center gap-1 text-sm font-semibold text-surface-dark">
                  Combined property view
                  <HelpTip label="Combined property view">
                    {PLAIN.propertyScore}
                  </HelpTip>
                </h2>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold tracking-tight text-surface-dark tabular-nums">
                  {offer.propertyScore}
                </p>
                <p className="text-sm text-grey-800">{offer.propertyLabel}</p>
              </div>
            </div>
            <dl className="mt-6 space-y-4 border-t border-grey-200 pt-5">
              <ScoreBar
                label="Rent vs typical"
                value={offer.passport.rentVsMarket}
                max={40}
              />
              <ScoreBar
                label="Market depth"
                value={offer.passport.marketDepth}
                max={25}
              />
              <ScoreBar
                label="Condition"
                value={offer.passport.condition}
                max={20}
              />
              <ScoreBar
                label="Accessibility"
                value={offer.passport.accessibility}
                max={20}
              />
            </dl>
          </TabsContent>

          <TabsContent value="comparables" className="mt-6">
            {offer.comparables.length === 0 ? (
              <p className="text-sm text-grey-800">
                No nearby listings to compare yet.
              </p>
            ) : (
              <ul className="divide-y divide-grey-200 border-t border-grey-200">
                {offer.comparables.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-baseline justify-between gap-4 py-3.5"
                  >
                    <p className="text-sm font-semibold tabular-nums text-surface-dark">
                      {formatXcg(row.rentCents)}
                      <span className="ml-1.5 font-normal text-grey-800">
                        / month
                      </span>
                    </p>
                    <p className="text-sm text-grey-800">
                      {row.bedrooms} {row.bedrooms === 1 ? "bed" : "beds"}
                      <span className="px-1.5 text-grey-500">·</span>
                      {row.interiorM2} m²
                      <span className="px-1.5 text-grey-500">·</span>
                      {row.daysListed} days listed
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="payer" className="mt-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="flex items-center gap-1 text-sm font-semibold text-surface-dark">
                  Payment history
                  <HelpTip label="Payment history">{PLAIN.paymentHistory}</HelpTip>
                </h2>
                <p className="mt-1 text-sm text-grey-800">
                  Paid on time {offer.payer.onTimePercent}% of the last 12
                  months
                </p>
              </div>
              <p className="text-3xl font-semibold tracking-tight text-surface-dark">
                {offer.payer.bandLabel}
              </p>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-grey-200">
              <div
                className="h-full rounded-full bg-surface-dark"
                style={{ width: `${offer.payer.onTimePercent}%` }}
              />
            </div>
          </TabsContent>

          <TabsContent value="terms" className="mt-6 space-y-5">
            <p className="text-sm text-grey-800">
              {monthsLabel}
              {monthlyRentCents != null ? (
                <>
                  {" "}
                  at {formatXcg(monthlyRentCents)} / month.{" "}
                </>
              ) : (
                ". "
              )}
              {formatXcg(offer.fundedCents)} of {formatXcg(offer.offeringCents)}{" "}
              filled.
            </p>
            <ul className="divide-y divide-grey-200 border-t border-grey-200">
              {offer.receivables.map((row) => (
                <li
                  key={row.n}
                  className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 py-3 text-sm"
                >
                  <span className="text-grey-800">Month {row.n}</span>
                  <span className="text-grey-800">
                    {formatDayMonthYear(row.dueDate)}
                  </span>
                  <span className="text-right">
                    <span className="font-medium tabular-nums text-surface-dark">
                      {formatXcg(row.amountCents)}
                    </span>
                    <span className="ml-2 capitalize text-grey-800">
                      {row.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-5 text-grey-800">{HOLDER_NO_PROMISE}</p>
          </TabsContent>
        </Tabs>
      </div>
    </ThemeMerkado>
  );
}

function ClosedOfferCard({
  status,
  offeringCents,
}: {
  status: string;
  offeringCents: number;
}) {
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <p className="text-[11px] font-medium tracking-wide text-grey-800 uppercase">
        {status}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-surface-dark">
        Closed
      </p>
      <p className="mt-1 text-sm text-grey-800">
        {formatXcg(offeringCents)} ({formatUsd(offeringCents)}) offering · not open to purchase
      </p>
    </div>
  );
}

function Spec({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  );
}

function SpecDivider() {
  return (
    <span className="flex shrink-0 items-center px-2.5" aria-hidden>
      <svg width="1" height="12" viewBox="0 0 1 12" className="text-grey-500">
        <rect width="1" height="12" rx="0.5" fill="currentColor" />
      </svg>
    </span>
  );
}

function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm text-grey-800">{label}</dt>
        <dd className="text-sm font-medium tabular-nums text-surface-dark">
          {value}
        </dd>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-grey-200">
        <div
          className="h-full rounded-full bg-grey-600"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
