import { formatPercent, formatXcg } from "@/lib/rent-advance/money";
import { cn } from "@/lib/utils";

export function Money({
  cents,
  className,
  compact = false,
}: {
  cents: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatXcg(cents, compact)}</span>
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
