"use client";

import { HelpTip } from "@/components/help-tip";
import {
  INDICATIVE_PRICE_TIP,
  formatOriginalPrice,
  formatXcgPrimary,
  type PriceDisplayModel,
} from "@/lib/domain/price-display";
import { cn } from "@/lib/utils";

/**
 * Renders an XCG-primary price with the original amount shown as a smaller
 * secondary line. See `src/lib/domain/price-display.ts` for the resolution
 * rules. True foreign-currency conversions show an indicative tip icon
 * beside the primary XCG amount (not repeated disclaimer text).
 */
export function PriceDisplay({
  model,
  size = "md",
  align = "start",
  className,
}: {
  model: PriceDisplayModel;
  size?: "sm" | "md" | "lg";
  align?: "start" | "end";
  className?: string;
}) {
  const primaryText =
    model.primaryAmount === null
      ? "Not available"
      : model.primaryCurrency === "XCG"
        ? formatXcgPrimary(model.primaryAmount)
        : formatOriginalPrice(model.primaryAmount, model.primaryLabel);

  const primarySizeClass =
    size === "lg"
      ? "text-2xl sm:text-3xl"
      : size === "sm"
        ? "text-sm"
        : "text-base";

  return (
    <div
      className={cn(
        "min-w-0 flex flex-col gap-0.5",
        align === "end" && "items-end text-right",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex min-w-0 flex-wrap items-center gap-1 font-mono font-semibold tabular-nums",
          primarySizeClass,
        )}
      >
        {primaryText}
        {model.showIndicativeTip ? (
          <HelpTip label="indicative price" className="align-middle">
            {INDICATIVE_PRICE_TIP}
          </HelpTip>
        ) : null}
      </span>
      {model.secondaryLabel ? (
        <span className="font-mono text-xs text-muted-foreground">
          {model.secondaryLabel}
        </span>
      ) : null}
      {model.disclaimer ? (
        <span className="text-xs text-muted-foreground">{model.disclaimer}</span>
      ) : null}
      {model.soldDisclaimer ? (
        <span className="text-xs text-muted-foreground">
          {model.soldDisclaimer}
        </span>
      ) : null}
    </div>
  );
}
