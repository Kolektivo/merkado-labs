/** Map basemap configuration for the merkado-labs dashboard. */

export type MapBasemapConfig = {
  styleUrl: string;
  attribution: string;
  provider: "openstreetmap" | "maptiler" | "custom";
};

const OSM_RASTER_STYLE = {
  version: 8 as const,
  name: "OpenStreetMap",
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
    },
  ],
};

/**
 * Resolve a MapLibre style for local development or a hosted provider.
 *
 * Production should set NEXT_PUBLIC_MAP_STYLE_URL to a MapTiler (or similar)
 * style URL. Public OSM raster tiles are suitable for local merkado-labs development
 * only and are not an appropriate production tile dependency.
 */
export function getMapBasemapConfig(): MapBasemapConfig {
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  const attribution =
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim() ||
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  if (styleUrl) {
    const provider = styleUrl.includes("maptiler")
      ? "maptiler"
      : ("custom" as const);
    return { styleUrl, attribution, provider };
  }

  return {
    styleUrl: `data:application/json,${encodeURIComponent(JSON.stringify(OSM_RASTER_STYLE))}`,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    provider: "openstreetmap",
  };
}
