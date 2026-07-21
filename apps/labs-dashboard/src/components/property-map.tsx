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
import { listingDetailHref } from "@/lib/breadcrumbs";
import type { MapListingMarker } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/format";
import { resolveListingPrimaryImageUrl } from "@/lib/listing-gallery-urls";
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
  detailContext,
}: {
  markers: MapListingMarker[];
  styleUrl: string;
  attribution: string;
  detailContext?: {
    from?: string;
    fromId?: string;
    returnTo?: string;
  };
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

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Browse mapped listings as a keyboard-friendly list
        </summary>
        <div className="max-h-72 divide-y overflow-y-auto border-t">
          {markers.map((marker) => (
            <Link
              key={marker.id}
              href={listingDetailHref(marker.id, detailContext)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/30"
            >
              <span className="min-w-0 truncate">
                {marker.title ?? "Untitled listing"}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatCurrency(marker.currentPrice, marker.currency)}
              </span>
            </Link>
          ))}
        </div>
      </details>

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
              The neighbourhood named on the website and the area guessed from
              the map pin are kept separate so you can compare them.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-4 pb-6">
            {selectedMarkers.map((marker) => (
              <MarkerDetails
                key={marker.id}
                marker={marker}
                detailContext={detailContext}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MarkerDetails({
  marker,
  detailContext,
}: {
  marker: MapListingMarker;
  detailContext?: {
    from?: string;
    fromId?: string;
    returnTo?: string;
  };
}) {
  const title = marker.title ?? "Untitled listing";
  const detailHref = listingDetailHref(marker.id, detailContext);

  const imageUrl = resolveListingPrimaryImageUrl({
    primaryImageUrl: marker.primaryImageUrl,
  });
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="relative aspect-[16/9] overflow-hidden rounded-md border bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
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
          Website: {marker.neighbourhoodName ?? "Not given"}
        </Badge>
        <Badge variant="secondary">
          Map: {marker.inferredNeighbourhoodName ?? "None"}
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
          <dt className="text-muted-foreground">Collected from</dt>
          <dd>{marker.sourceName}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={detailHref}>Open internal detail</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a
            href={marker.originalRealtorUrl ?? marker.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Original listing
            <ExternalLink className="size-3.5" />
            <span className="sr-only"> (opens in new tab)</span>
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
