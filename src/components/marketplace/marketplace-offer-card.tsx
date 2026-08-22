import Link from "next/link";
import { BedDouble, House, MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { HelpTip } from "@/components/help-tip";
import { PropertyCover } from "@/components/property-cover";
import { PLAIN } from "@/lib/rent-advance/copy";
import { formatXcg } from "@/lib/rent-advance/money";
import { bandPlainName } from "@/lib/rent-advance/scoring";
import {
  coverSrcFor,
  effectiveOfferStatus,
  formatDayMonthYear,
  remainingOfferingCents,
  statusLabel,
} from "@/lib/rent-advance/helpers";
import type { BuyerOfferCard } from "@/lib/rent-advance/types";

function SpecDivider() {
  return (
    <svg
      width="1"
      height="12"
      viewBox="0 0 1 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-grey-600"
      aria-hidden
    >
      <rect width="1" height="12" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function SpecItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex h-7 items-center gap-1">
      {icon}
      <span className="text-[12px] font-medium leading-5 text-grey-800">{label}</span>
    </span>
  );
}

export function MarketplaceOfferCard({
  card,
  priority = false,
}: {
  card: BuyerOfferCard;
  priority?: boolean;
}) {
  const href = `/offers/${card.reference}`;
  const title = card.summary.trim() || `${card.type} in ${card.district}`;
  const bedsLabel = `${card.bedrooms} ${card.bedrooms === 1 ? "bed" : "beds"}`;
  const monthsLabel = `${card.months} ${card.months === 1 ? "month" : "months"}`;
  const effectiveStatus = effectiveOfferStatus(card);
  const statusLine =
    effectiveStatus === "funding"
      ? card.minted
        ? "Listed"
        : "Mint pending"
      : statusLabel(effectiveStatus);
  const metaLabel = `${statusLine}\u00A0\u00A0•\u00A0\u00A0${monthsLabel}`;
  const remaining = remainingOfferingCents(card);
  const purchasable = remaining > 0 && effectiveStatus === "funding" && card.minted;
  const specs = [
    {
      key: "beds",
      icon: <BedDouble className="size-4 shrink-0 text-grey-800" aria-hidden />,
      label: bedsLabel,
    },
    {
      key: "type",
      icon: <House className="size-4 shrink-0 text-grey-800" aria-hidden />,
      label: card.type,
    },
    {
      key: "district",
      icon: <MapPin className="size-4 shrink-0 text-grey-800" aria-hidden />,
      label: card.district,
    },
  ];

  return (
    <article className="relative flex h-full w-full flex-col rounded-[12px] border border-grey-200 bg-surface transition-colors hover:border-grey-300">
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-[12px]"
        aria-label={`View offer ${title}`}
      />
      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-t-[12px] bg-grey-100">
          <PropertyCover
            src={coverSrcFor(card.type, card.coverImageSrc)}
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            priority={priority}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-5 min-[769px]:p-6">
          <span className="min-w-0 whitespace-nowrap text-[11px] font-medium leading-[11px] text-grey-800">
            {metaLabel}
          </span>

          <h2 className="min-w-0 text-[18px] leading-[26px] text-surface-dark">
            <span className="line-clamp-2 min-w-0 font-semibold">{title}</span>
          </h2>

          <div className="flex min-h-7 flex-wrap items-center">
            {specs.map((item, index) => (
              <span key={item.key} className="flex h-7 items-center whitespace-nowrap">
                <SpecItem icon={item.icon} label={item.label} />
                {index < specs.length - 1 ? (
                  <span className="flex shrink-0 items-center px-2">
                    <SpecDivider />
                  </span>
                ) : null}
              </span>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <div className="border-t border-grey-300 pt-3">
              <p className="text-xl font-semibold leading-6 text-surface-dark">
                <span className="tabular-nums">
                  {purchasable
                    ? formatXcg(remaining, true)
                    : formatXcg(card.offeringCents, true)}
                </span>
                <span className="text-[14px] font-medium leading-5 text-grey-800">
                  {" "}
                  {purchasable
                    ? "for the whole offer"
                    : effectiveStatus === "expired"
                      ? "listing expired"
                      : "purchased"}
                </span>
                <span className="pointer-events-auto relative z-20 ml-1 inline-flex align-middle">
                  <HelpTip label="Amount filled">{PLAIN.amountTaken}</HelpTip>
                </span>
              </p>
            </div>
            <p className="text-xs leading-5 font-normal text-grey-900">
              Combined property view {card.propertyScore} · {card.propertyLabel}
            </p>
            {purchasable && card.expiresAt ? (
              <p className="text-xs leading-5 font-normal text-grey-800">
                Available until {formatDayMonthYear(card.expiresAt)}
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 text-xs leading-5 font-normal text-grey-800">
              Payment history · {bandPlainName(card.payerBand)}
              <span className="pointer-events-auto relative z-20">
                <HelpTip label="Payment history">{PLAIN.paymentHistory}</HelpTip>
              </span>
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
