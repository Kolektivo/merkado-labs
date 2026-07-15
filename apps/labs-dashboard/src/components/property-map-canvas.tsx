"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { MapListingMarker } from "@/lib/domain/types";
import { CURACAO_VIEW } from "@/lib/geo/coordinates";

type ZoomRequest = {
  type: "in" | "out" | "fit" | "reset";
  nonce: number;
} | null;

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string };
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

export function PropertyMapCanvas({
  markers,
  styleUrl,
  attribution,
  zoomRequest,
  onSelectMarkers,
}: {
  markers: MapListingMarker[];
  styleUrl: string;
  attribution: string;
  zoomRequest: ZoomRequest;
  onSelectMarkers: (ids: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelectMarkers);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelectMarkers;
  }, [onSelectMarkers]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: CURACAO_VIEW.center,
      zoom: CURACAO_VIEW.zoom,
      minZoom: CURACAO_VIEW.minZoom,
      maxZoom: CURACAO_VIEW.maxZoom,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: attribution,
      }),
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("load", () => {
      if (cancelled) return;
      map.addSource("listings", {
        type: "geojson",
        data: emptyCollection(),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "listings",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#262626",
          "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 28],
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "listings",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "listings",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#171717",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "clusters", async (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const source = map.getSource("listings") as GeoJSONSource;
        const clusterId = feature.properties?.cluster_id;
        if (typeof clusterId !== "number") return;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom,
        });
      });

      map.on("click", "unclustered-point", (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === "string") onSelectRef.current([id]);
      });

      for (const layer of ["clusters", "unclustered-point"] as const) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setReady(true);
    });

    map.on("error", (event) => {
      setError(event.error?.message ?? "Unable to load the map.");
    });

    mapRef.current = map;
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [attribution, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("listings") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: markers.map((marker) => ({
        type: "Feature",
        properties: { id: marker.id },
        geometry: {
          type: "Point",
          coordinates: [marker.longitude, marker.latitude],
        },
      })),
    });
  }, [markers, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomRequest || !ready) return;
    if (zoomRequest.type === "in") {
      map.zoomIn();
      return;
    }
    if (zoomRequest.type === "out") {
      map.zoomOut();
      return;
    }
    if (zoomRequest.type === "reset") {
      map.easeTo({
        center: CURACAO_VIEW.center,
        zoom: CURACAO_VIEW.zoom,
      });
      return;
    }
    if (!markers.length) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const marker of markers) {
      bounds.extend([marker.longitude, marker.latitude]);
    }
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 });
  }, [markers, ready, zoomRequest]);

  return (
    <div className="relative h-[min(70vh,720px)] w-full bg-muted/30">
      {!ready && !error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
          Loading map…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {!markers.length && ready && !error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
          No listings with valid Curaçao coordinates match the current filters.
        </div>
      ) : null}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function emptyCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
