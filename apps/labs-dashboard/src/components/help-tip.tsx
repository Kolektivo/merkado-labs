"use client";

import { CircleHelp } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function HelpTip({
  label,
  children,
  className,
  side = "top",
}: {
  /** Short accessible name for the term being explained */
  label: string;
  children: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          aria-label={`What is ${label}?`}
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[260px] text-left leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/** Inline term with a help tip — plain language first, detail on hover. */
export function Term({
  children,
  tip,
  label,
}: {
  children: React.ReactNode;
  tip: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="underline decoration-dotted decoration-muted-foreground/60 underline-offset-2">
        {children}
      </span>
      <HelpTip label={label}>{tip}</HelpTip>
    </span>
  );
}
