"use client";

import { Label } from "@/components/ui/label";
import { bandLabel, scoreBand } from "@/lib/rent-advance/scoring";

export function ScoreSlider({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const band = scoreBand(safe);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-sm tabular-nums">
          <span className="font-medium">{safe}</span>
          <span className="text-muted-foreground"> · {bandLabel(safe)}</span>
        </p>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={safe}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        aria-valuetext={`${safe}, band ${band}, ${bandLabel(safe)}`}
        className="h-10 w-full accent-foreground"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
