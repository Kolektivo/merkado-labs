import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";
import type { EffectiveNeighbourhood } from "@/lib/domain/effective-neighbourhood";
import { cn } from "@/lib/utils";

const PROVENANCE_TIPS: Record<EffectiveNeighbourhood["provenance"], string> = {
  source: "Taken directly from the realtor website.",
  map: "Matched from the map pin against official Curaçao neighbourhood boundaries.",
  ai_extracted:
    "Suggested by AI from the listing text. Only used when the website and map do not provide a specific neighbourhood.",
  unavailable:
    "No website, map, or high-confidence AI neighbourhood is available yet.",
};

/** Small provenance badge for the effective neighbourhood shown on Overview. */
export function EffectiveNeighbourhoodBadge({
  effective,
  className,
}: {
  effective: EffectiveNeighbourhood;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Badge variant={effective.provenance === "unavailable" ? "outline" : "secondary"}>
        {effective.label}
      </Badge>
      <HelpTip label={`${effective.label} neighbourhood`}>
        {PROVENANCE_TIPS[effective.provenance]}
        {effective.conflict
          ? " The website and map disagree here; see Changes & evidence for details."
          : ""}
      </HelpTip>
    </span>
  );
}
