"use client";

import { Button } from "@/components/ui/button";
import { DISPLAY_TERMS } from "@/lib/rent-advance/pricing";
import { cn } from "@/lib/utils";

function termHint(months: number): string | null {
  if (months === 3) return "Requires separate regulatory advice";
  if (months === 9 || months === 12) return "not approved for origination";
  return null;
}

export function TermPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (months: number) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {DISPLAY_TERMS.map((months) => {
        const approved = months === 6;
        const hint = termHint(months);
        const selected = value === months;
        return (
          <Button
            key={months}
            type="button"
            variant={selected ? "default" : "outline"}
            disabled={!approved}
            aria-pressed={selected}
            className={cn("h-auto flex-col items-start gap-1 px-3 py-2.5 whitespace-normal")}
            onClick={() => approved && onChange(months)}
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
