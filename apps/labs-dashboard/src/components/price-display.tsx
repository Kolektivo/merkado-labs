import {
  formatOriginalPrice,
  formatXcgPrimary,
  type PriceDisplayModel,
} from "@/lib/domain/price-display";
import { cn } from "@/lib/utils";

/**
 * Renders an XCG-primary price with the original amount shown as a smaller
 * secondary line. See `src/lib/domain/price-display.ts` for the resolution
 * rules and disclaimers.
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
      ? "text-3xl"
      : size === "sm"
        ? "text-sm"
        : "text-base";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        align === "end" && "items-end text-right",
        className,
      )}
    >
      <span
        className={cn(
          "font-mono font-semibold tabular-nums",
          primarySizeClass,
        )}
      >
        {primaryText}
      </span>
      {model.secondaryLabel ? (
        <span className="font-mono text-xs text-muted-foreground">
          {model.secondaryLabel}
        </span>
      ) : null}
      {model.disclaimer ? (
        <span className="text-xs text-muted-foreground">
          {model.disclaimer}
        </span>
      ) : null}
      {model.soldDisclaimer ? (
        <span className="text-xs text-muted-foreground">
          {model.soldDisclaimer}
        </span>
      ) : null}
    </div>
  );
}
