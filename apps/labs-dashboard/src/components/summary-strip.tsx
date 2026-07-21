import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { cn } from "@/lib/utils";

export type SummaryItem = {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  tip?: React.ReactNode;
  tipLabel?: string;
  href?: string;
  icon?: LucideIcon;
};

export function SummaryStrip({
  items,
  className,
}: {
  items: SummaryItem[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border bg-border shadow-xs sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {items.map(({ label, value, helper, tip, tipLabel, href, icon: Icon }) => {
        const content = (
          <div className="pointer-events-none">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <span className="truncate">{label}</span>
                {tip ? (
                  <HelpTip
                    label={tipLabel ?? label}
                    className="pointer-events-auto relative z-10 shrink-0"
                  >
                    {tip}
                  </HelpTip>
                ) : null}
              </dt>
              {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
            </div>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </dd>
            {helper ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {helper}
              </p>
            ) : null}
          </div>
        );

        return (
          <div
            key={label}
            className={cn(
              "relative min-w-0 bg-card p-4",
              href && "transition-colors hover:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-ring",
            )}
          >
            {content}
            {href ? (
              <Link
                href={href}
                className="absolute inset-0 z-0 outline-none"
                aria-label={`${label}: ${String(value)}. View details`}
              />
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
