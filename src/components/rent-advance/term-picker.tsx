"use client";

import { Button } from "@/components/ui/button";
import { DISPLAY_TERMS } from "@/lib/rent-advance/pricing";
import { cn } from "@/lib/utils";

function termHint(months: number): string | null {
  if (months === 3) return "Requires separate regulatory advice";
  if (months === 9 || months === 12) return "Simulation only · not approved for origination";
  return null;
}

export function TermPicker({
  value,
  onChange,
  allowSimulation = false,
}: {
  value: number;
  onChange: (months: number) => void;
  allowSimulation?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {DISPLAY_TERMS.map((months) => {
        const approved = months === 6;
        const selectable = approved || (allowSimulation && months !== 3);
        const hint = termHint(months);
        const selected = value === months;
        return (
          <Button
            key={months}
            type="button"
            variant={selected ? "default" : "outline"}
            disabled={!selectable}
            aria-pressed={selected}
            className={cn("h-auto min-h-16 flex-col items-start gap-1 px-3 py-2.5 whitespace-normal")}
            onClick={() => selectable && onChange(months)}
          >
            <span className="font-medium">{months} months</span>
            {hint ? (
              <span className="text-left text-xs font-normal opacity-80">{hint}</span>
            ) : (
              <span className="text-xs font-normal opacity-80">Approved term</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
