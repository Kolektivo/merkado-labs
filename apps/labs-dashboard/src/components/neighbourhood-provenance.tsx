"use client";

import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";
import {
  ASSIGNMENT_STATUS_LABELS,
  type NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";

export function NeighbourhoodProvenanceBadges({
  sourceName,
  inferredName,
  status,
}: {
  sourceName: string | null;
  inferredName: string | null;
  status: NeighbourhoodAssignmentStatus;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="inline-flex items-center gap-1">
        <Badge variant="outline">Website: {sourceName ?? "Not given"}</Badge>
        <HelpTip label="website neighbourhood">
          Neighbourhood name taken from the listing website.
        </HelpTip>
      </span>
      <span className="inline-flex items-center gap-1">
        <Badge variant="secondary">Map: {inferredName ?? "None"}</Badge>
        <HelpTip label="map neighbourhood">
          Neighbourhood guessed from the pin on official Curaçao area
          boundaries.
        </HelpTip>
      </span>
      <span className="inline-flex items-center gap-1">
        <Badge
          variant={
            status === "conflict"
              ? "destructive"
              : status === "matched" || status === "inferred"
                ? "default"
                : "outline"
          }
        >
          {ASSIGNMENT_STATUS_LABELS[status]}
        </Badge>
        <HelpTip label="neighbourhood match">
          Whether the website name and the map pin point to the same area.
        </HelpTip>
      </span>
    </div>
  );
}
