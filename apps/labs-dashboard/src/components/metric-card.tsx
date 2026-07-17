import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tip,
  tipLabel,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tip?: React.ReactNode;
  tipLabel?: string;
  /** When set, the whole card becomes a link into the relevant page. */
  href?: string;
}) {
  return (
    <Card
      className={cn(
        "@container/card relative flex h-full min-w-0 flex-col gap-0 py-0",
        href &&
          "group/metric transition-colors hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      {href ? (
        <Link
          href={href}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${label}: ${value}. View details`}
        />
      ) : null}
      <CardHeader className="pointer-events-none flex-1 pb-4 pt-(--card-spacing)">
        <CardDescription className="flex min-w-0 items-center gap-1.5 pr-1">
          <span className="truncate">{label}</span>
          {tip ? (
            <HelpTip
              label={tipLabel ?? label}
              className="pointer-events-auto relative z-10 shrink-0"
            >
              {tip}
            </HelpTip>
          ) : null}
        </CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums tracking-tight @[220px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>
          <div className="relative flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon
              className={cn(
                "size-4",
                href && "transition-opacity group-hover/metric:opacity-0",
              )}
            />
            {href ? (
              <ArrowUpRight className="absolute size-4 opacity-0 transition-opacity group-hover/metric:opacity-100" />
            ) : null}
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="pointer-events-none mt-auto min-h-11 items-start text-xs leading-snug text-muted-foreground">
        <span className="line-clamp-2">{hint}</span>
      </CardFooter>
    </Card>
  );
}
