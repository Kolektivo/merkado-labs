"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Crosshair,
  ExternalLink,
  ImageOff,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MapListingMarker } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  type NeighbourhoodAssignmentStatus,
} from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

import { PropertyMapCanvas } from "@/components/property-map-canvas";

export function PropertyMap({
  markers,
  styleUrl,
  attribution,
}: {
  markers: MapListingMarker[];
  styleUrl: string;
  attribution: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoomRequest, setZoomRequest] = useState<{
    type: "in" | "out" | "fit" | "reset";
    nonce: number;
  } | null>(null);

  const selectedMarkers = useMemo(() => {
    const byId = new Map(markers.map((marker) => [marker.id, marker]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((marker): marker is MapListingMarker => Boolean(marker));
  }, [markers, selectedIds]);

  function requestZoom(type: "in" | "out" | "fit" | "reset") {
    setZoomRequest({ type, nonce: Date.now() });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{markers.length}</span>{" "}
          mapped listings
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestZoom("in")}
          >
            <Plus className="size-4" />
            Zoom in
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestZoom("out")}
          >
            <Minus className="size-4" />
            Zoom out
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestZoom("fit")}
            disabled={!markers.length}
          >
            <Maximize2 className="size-4" />
            Fit results
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestZoom("reset")}
          >
            <Crosshair className="size-4" />
            Curaçao
          </Button>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <PropertyMapCanvas
          markers={markers}
          styleUrl={styleUrl}
          attribution={attribution}
          zoomRequest={zoomRequest}
          onSelectMarkers={setSelectedIds}
        />
      </div>

      <Sheet
        open={selectedMarkers.length > 0}
        onOpenChange={(open) => {
          if (!open) setSelectedIds([]);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {selectedMarkers.length === 1
                ? "Listing details"
                : `${selectedMarkers.length} listings`}
            </SheetTitle>
            <SheetDescription>
              Source neighbourhood and geographic assignment stay separate.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-4 pb-6">
            {selectedMarkers.map((marker) => (
              <MarkerDetails key={marker.id} marker={marker} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MarkerDetails({ marker }: { marker: MapListingMarker }) {
  const title = marker.title ?? "Untitled listing";

  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="relative aspect-[16/9] overflow-hidden rounded-md border bg-muted">
        {marker.primaryImageUrl ? (
          <Image
            src={marker.primaryImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 480px) 90vw, 360px"
            unoptimized
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="font-medium leading-snug">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {formatCurrency(marker.currentPrice, marker.currency)}
          {marker.listingType ? ` · ${marker.listingType}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          Source: {marker.neighbourhoodName ?? "Unspecified"}
        </Badge>
        <Badge variant="secondary">
          Geo: {marker.inferredNeighbourhoodName ?? "None"}
        </Badge>
        <AssignmentBadge status={marker.neighbourhoodAssignmentStatus} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Bedrooms</dt>
          <dd>{marker.bedrooms ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Area</dt>
          <dd>{marker.floorAreaM2 ? `${marker.floorAreaM2} m²` : "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Source</dt>
          <dd>{marker.sourceName}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/listings/${marker.id}`}>Open internal detail</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={marker.sourceUrl} target="_blank" rel="noreferrer">
            Original listing
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </article>
  );
}

function AssignmentBadge({
  status,
}: {
  status: NeighbourhoodAssignmentStatus;
}) {
  const variant =
    status === "conflict"
      ? "destructive"
      : status === "matched" || status === "inferred"
        ? "default"
        : "outline";
  return (
    <Badge variant={variant} className={cn(status === "matched" && "bg-neutral-800 text-neutral-50")}>
      {ASSIGNMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
