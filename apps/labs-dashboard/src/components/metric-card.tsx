import type { LucideIcon } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tip,
  tipLabel,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tip?: React.ReactNode;
  tipLabel?: string;
}) {
  return (
    <Card className="@container/card flex h-full min-w-0 flex-col gap-0 py-0">
      <CardHeader className="flex-1 pb-4 pt-(--card-spacing)">
        <CardDescription className="flex min-w-0 items-center gap-1.5 pr-1">
          <span className="truncate">{label}</span>
          {tip ? (
            <HelpTip label={tipLabel ?? label} className="shrink-0">
              {tip}
            </HelpTip>
          ) : null}
        </CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums tracking-tight @[220px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="mt-auto min-h-11 items-start text-xs leading-snug text-muted-foreground">
        <span className="line-clamp-2">{hint}</span>
      </CardFooter>
    </Card>
  );
}
