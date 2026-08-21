"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "-m-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          aria-label={`What is ${label}?`}
          aria-expanded={open}
          onPointerDown={(event) => {
            // Keep tips inside Links from navigating; toggle open on touch.
            event.stopPropagation();
            if (event.pointerType === "touch") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <CircleHelp className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-[300px] text-left text-xs leading-relaxed"
      >
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
