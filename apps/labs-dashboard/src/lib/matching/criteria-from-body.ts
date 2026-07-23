import {
  emptyCriteria,
  type PropertySearchCriteria,
  type RenovationWillingness,
  type TransactionType,
} from "./types.ts";

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function asTransactionType(value: unknown): TransactionType {
  const raw = String(value ?? "either");
  return raw === "sale" || raw === "rent" || raw === "either" ? raw : "either";
}

function asRenovation(value: unknown): RenovationWillingness {
  const raw = String(value ?? "unknown");
  if (
    raw === "none" ||
    raw === "light" ||
    raw === "moderate" ||
    raw === "major" ||
    raw === "unknown"
  ) {
    return raw;
  }
  return "unknown";
}

export function criteriaFromBody(
  body: Record<string, unknown>,
): PropertySearchCriteria {
  const minPrice = optionalNumber(body.minPrice);
  const maxPrice = optionalNumber(body.maxPrice);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw new Error("Minimum budget cannot be greater than maximum budget.");
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Property Search";

  return emptyCriteria({
    title,
    transactionType: asTransactionType(body.transactionType),
    minPrice,
    maxPrice,
    minBedrooms: optionalNumber(body.minBedrooms),
    minBathrooms: optionalNumber(body.minBathrooms),
    minFloorAreaM2: optionalNumber(body.minFloorAreaM2),
    propertyTypes: stringList(body.propertyTypes),
    preferredNeighbourhoods: stringList(body.preferredNeighbourhoods),
    excludedNeighbourhoods: stringList(body.excludedNeighbourhoods),
    mustHaves: stringList(body.mustHaves),
    preferences: stringList(body.preferences),
    dealbreakers: stringList(body.dealbreakers),
    renovationWillingness: asRenovation(body.renovationWillingness),
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    unclear: stringList(body.unclear),
  });
}

export function criteriaToInsertRow(
  criteria: PropertySearchCriteria,
  intakeSource: "what_fits_me" | "direct",
  status: "draft" | "confirmed" = "draft",
) {
  const now = new Date().toISOString();
  return {
    title: criteria.title,
    status,
    transaction_type: criteria.transactionType,
    min_price: criteria.minPrice,
    max_price: criteria.maxPrice,
    price_currency: "XCG",
    min_bedrooms: criteria.minBedrooms,
    min_bathrooms: criteria.minBathrooms,
    min_floor_area_m2: criteria.minFloorAreaM2,
    property_types: criteria.propertyTypes,
    preferred_neighbourhoods: criteria.preferredNeighbourhoods,
    excluded_neighbourhoods: criteria.excludedNeighbourhoods,
    must_haves: criteria.mustHaves,
    preferences: criteria.preferences,
    dealbreakers: criteria.dealbreakers,
    renovation_willingness: criteria.renovationWillingness,
    notes: criteria.notes,
    intake_source: intakeSource,
    confirmed_at: status === "confirmed" ? now : null,
    updated_at: now,
  };
}
