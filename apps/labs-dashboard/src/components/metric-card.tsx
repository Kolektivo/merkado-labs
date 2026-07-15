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
  /** Extra explanation shown on the help icon next to the label */
  tip?: React.ReactNode;
  tipLabel?: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {label}
          {tip ? (
            <HelpTip label={tipLabel ?? label}>{tip}</HelpTip>
          ) : null}
        </CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums tracking-tight @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="text-xs text-muted-foreground">{hint}</CardFooter>
    </Card>
  );
}
