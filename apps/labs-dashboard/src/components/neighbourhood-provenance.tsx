"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline">
            Website: {sourceName ?? "Not given"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">
          Neighbourhood name taken from the listing website.
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary">
            Map: {inferredName ?? "None"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">
          Neighbourhood guessed from the pin on official Curaçao area
          boundaries.
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">
          Whether the website name and the map pin point to the same area.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
