import { formatPercent, formatUsd, formatXcg } from "@/lib/rent-advance/money";
import { cn } from "@/lib/utils";

export function Money({
  cents,
  className,
  compact = false,
  showUsd = false,
}: {
  cents: number;
  className?: string;
  compact?: boolean;
  showUsd?: boolean;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatXcg(cents, compact)}
      {showUsd && !compact ? (
        <span className="ml-1.5 text-muted-foreground" aria-label={`USD ${formatUsd(cents)}`}>
          ({formatUsd(cents)})
        </span>
      ) : null}
    </span>
  );
}

export function Rate({
  value,
  digits = 2,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatPercent(value, digits)}</span>
  );
}
