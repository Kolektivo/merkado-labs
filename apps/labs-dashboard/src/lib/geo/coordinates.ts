/** Shared Curaçao map and geographic quality helpers. */

export const CURACAO_BOUNDS = {
  latMin: 11.9,
  latMax: 12.5,
  lonMin: -69.3,
  lonMax: -68.6,
} as const;

/** Default MapLibre camera for island-wide browsing. */
export const CURACAO_VIEW = {
  center: [-68.99, 12.17] as [number, number],
  zoom: 10.4,
  minZoom: 8,
  maxZoom: 18,
  bounds: [
    [-69.3, 11.9],
    [-68.6, 12.5],
  ] as [[number, number], [number, number]],
};

export type CoordinateQuality =
  | "valid_curacao"
  | "missing_coords"
  | "invalid_coords"
  | "outside_curacao";

export type NeighbourhoodAssignmentStatus =
  | "unprocessed"
  | "missing_coords"
  | "invalid_coords"
  | "outside_curacao"
  | "outside_polygons"
  | "inferred"
  | "matched"
  | "conflict"
  | "source_only";

export function coordinateQuality(
  latitude: number | null,
  longitude: number | null,
): CoordinateQuality {
  if (latitude === null || longitude === null) return "missing_coords";
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return "invalid_coords";
  }
  if (
    latitude < CURACAO_BOUNDS.latMin ||
    latitude > CURACAO_BOUNDS.latMax ||
    longitude < CURACAO_BOUNDS.lonMin ||
    longitude > CURACAO_BOUNDS.lonMax
  ) {
    return "outside_curacao";
  }
  return "valid_curacao";
}

export function hasMappableCoordinates(
  latitude: number | null,
  longitude: number | null,
): latitude is number {
  return coordinateQuality(latitude, longitude) === "valid_curacao";
}

export const ASSIGNMENT_STATUS_LABELS: Record<
  NeighbourhoodAssignmentStatus,
  string
> = {
  unprocessed: "Not checked yet",
  missing_coords: "No map pin",
  invalid_coords: "Broken coordinates",
  outside_curacao: "Outside Curaçao",
  outside_polygons: "No matching area",
  inferred: "Area from map",
  matched: "Website & map agree",
  conflict: "Website & map disagree",
  source_only: "Area from website only",
};

export const COORDINATE_QUALITY_LABELS: Record<CoordinateQuality, string> = {
  valid_curacao: "Valid Curaçao pin",
  missing_coords: "No map pin",
  invalid_coords: "Broken coordinates",
  outside_curacao: "Outside Curaçao",
};
