import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SummaryItem = {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
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
      {items.map(({ label, value, helper, href, icon: Icon }) => {
        const content = (
          <>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground">{label}</dt>
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
          </>
        );

        return (
          <div
            key={label}
            className="min-w-0 bg-card p-4"
          >
            {href ? (
              <Link
                href={href}
                className="-m-2 block rounded-lg p-2 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </div>
        );
      })}
    </dl>
  );
}
