/**
 * Public-safe effective attribute contract for Browse / Property Passport.
 *
 * Only allowlisted, auto-applied effective values may appear publicly.
 * Confidence, evidence, proposal, and policy objects stay internal.
 */

export type PublicAttributeValueType = "boolean" | "number" | "text" | "enum";

export type PublicAttribute = {
  key: string;
  displayLabel: string;
  value: boolean | number | string;
  valueType: PublicAttributeValueType;
  subtype?: string | null;
};

export type PublicNeighbourhoodProvenance =
  | "source"
  | "map"
  | "ai_extracted"
  | "unavailable";

export const PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS: Record<
  PublicNeighbourhoodProvenance,
  string
> = {
  source: "From source",
  map: "Matched from map",
  ai_extracted: "Extracted from listing text",
  unavailable: "Not specified",
};

/** Consumer-facing attribute keys approved for public display and filters. */
export const PUBLIC_ATTRIBUTE_ALLOWLIST = [
  "pool",
  "pool_subtype",
  "furnished",
  "parking",
  "parking_spaces",
  "garage",
  "gated_community",
  "air_conditioning",
  "garden",
  "terrace",
  "balcony",
  "sea_view",
  "solar_panels",
  "generator",
  "water_heater",
  "security_features",
  "appliance_inclusion",
  "accessibility",
  "pet_suitability",
  "living_room",
  "kitchen",
  "outdoor_kitchen",
  "gas_included",
  "garden_maintenance_included",
] as const;

export type PublicAttributeKey = (typeof PUBLIC_ATTRIBUTE_ALLOWLIST)[number];

export const PUBLIC_ATTRIBUTE_DISPLAY_LABELS: Record<string, string> = {
  pool: "Pool",
  pool_subtype: "Pool type",
  furnished: "Furnished",
  parking: "Parking",
  parking_spaces: "Parking spaces",
  garage: "Garage",
  gated_community: "Gated community",
  air_conditioning: "Air conditioning",
  garden: "Garden",
  terrace: "Terrace",
  balcony: "Balcony",
  sea_view: "Sea view",
  solar_panels: "Solar panels",
  generator: "Generator",
  water_heater: "Water heater",
  security_features: "Security",
  appliance_inclusion: "Appliances",
  accessibility: "Accessibility",
  pet_suitability: "Pet suitability",
  living_room: "Living room",
  kitchen: "Kitchen",
  outdoor_kitchen: "Outdoor kitchen",
  gas_included: "Gas included",
  garden_maintenance_included: "Garden maintenance included",
};

/** Passport feature groups — omit empty groups at render time. */
export const PUBLIC_FEATURE_GROUPS: Array<{
  id: string;
  title: string;
  keys: readonly string[];
}> = [
  {
    id: "essentials",
    title: "Essentials",
    keys: ["furnished", "air_conditioning", "appliance_inclusion"],
  },
  {
    id: "indoor",
    title: "Indoor",
    keys: ["accessibility", "pet_suitability"],
  },
  {
    id: "outdoor",
    title: "Outdoor",
    keys: ["pool", "garden", "terrace", "balcony"],
  },
  {
    id: "building_community",
    title: "Building and community",
    keys: ["gated_community", "parking", "parking_spaces", "garage"],
  },
  {
    id: "views_location",
    title: "Views and location",
    keys: ["sea_view"],
  },
  {
    id: "security_utilities",
    title: "Security and utilities",
    keys: ["security_features", "solar_panels", "generator", "water_heater"],
  },
];

/** Attribute filters enabled only when coverage is meaningful. */
export const PUBLIC_ATTRIBUTE_FILTER_KEYS = [
  "furnished",
  "gated_community",
  "parking",
  "air_conditioning",
] as const;

const ALLOWLIST_SET = new Set<string>(PUBLIC_ATTRIBUTE_ALLOWLIST);

export function normalizePublicAttributeKey(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (cleaned === "gated") return "gated_community";
  if (cleaned === "solar") return "solar_panels";
  if (cleaned === "security") return "security_features";
  if (cleaned === "appliances") return "appliance_inclusion";
  return cleaned;
}

export function isPublicAttributeKey(key: string): boolean {
  return ALLOWLIST_SET.has(normalizePublicAttributeKey(key));
}

function coercePublicValue(
  raw: unknown,
): { value: boolean | number | string; valueType: PublicAttributeValueType } | null {
  if (raw === null || raw === undefined || raw === "" || raw === "unknown") {
    return null;
  }
  if (typeof raw === "boolean") {
    return { value: raw, valueType: "boolean" };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: raw, valueType: "number" };
  }
  if (typeof raw === "string") {
    const lowered = raw.trim().toLowerCase();
    if (lowered === "true" || lowered === "present") {
      return { value: true, valueType: "boolean" };
    }
    if (lowered === "false" || lowered === "explicitly_absent") {
      return { value: false, valueType: "boolean" };
    }
    if (/^-?\d+(\.\d+)?$/.test(lowered)) {
      const num = Number(lowered);
      if (Number.isFinite(num)) return { value: num, valueType: "number" };
    }
    return { value: raw.trim(), valueType: "text" };
  }
  return null;
}

/**
 * Normalize a public_attributes JSON array from the safe view.
 * Unknown keys and unusable values are dropped.
 */
export function normalizePublicAttributes(raw: unknown): PublicAttribute[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, PublicAttribute>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const key = normalizePublicAttributeKey(String(item.key ?? ""));
    if (!isPublicAttributeKey(key)) continue;

    const coerced = coercePublicValue(item.value ?? item.effective_value);
    if (!coerced) continue;
    // Boolean false is still a usable public fact ("explicitly absent").
    if (coerced.valueType === "boolean" && coerced.value === false) {
      // Keep false values for Passport completeness; cards skip them.
    }

    const declaredType = String(item.value_type ?? item.valueType ?? "");
    const valueType =
      declaredType === "boolean" ||
      declaredType === "number" ||
      declaredType === "text" ||
      declaredType === "enum"
        ? declaredType
        : coerced.valueType;

    byKey.set(key, {
      key,
      displayLabel:
        typeof item.display_label === "string" && item.display_label.trim()
          ? item.display_label.trim()
          : typeof item.displayLabel === "string" && item.displayLabel.trim()
            ? item.displayLabel.trim()
            : (PUBLIC_ATTRIBUTE_DISPLAY_LABELS[key] ??
              key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())),
      value: coerced.value,
      valueType,
      subtype:
        typeof item.subtype === "string" && item.subtype.trim()
          ? item.subtype.trim()
          : null,
    });
  }

  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/** True when the attribute is useful as a positive chip on a browse card. */
export function isPositivePublicAttribute(attr: PublicAttribute): boolean {
  if (attr.valueType === "boolean") return attr.value === true;
  if (attr.valueType === "number") {
    return typeof attr.value === "number" && attr.value > 0;
  }
  return String(attr.value).trim().length > 0;
}

export function publicAttributeChipLabel(attr: PublicAttribute): string {
  if (attr.key === "parking_spaces" && typeof attr.value === "number") {
    return `${attr.value} parking spaces`;
  }
  if (attr.key === "pool" && attr.subtype) {
    return `Pool (${attr.subtype})`;
  }
  return attr.displayLabel;
}

export const PUBLIC_ATTRIBUTE_CHIP_PRIORITY = [
  "pool",
  "furnished",
  "air_conditioning",
  "gated_community",
  "parking",
  "sea_view",
  "garden",
  "terrace",
  "balcony",
  "security_features",
] as const;

const PUBLIC_ATTRIBUTE_CHIP_PRIORITY_INDEX = new Map<string, number>(
  PUBLIC_ATTRIBUTE_CHIP_PRIORITY.map((key, index) => [key, index]),
);

/** Select compact, high-value positive facts for Browse cards. */
export function selectBrowseAttributeChips(
  attrs: PublicAttribute[],
  limit = 5,
): string[] {
  return attrs
    .filter(isPositivePublicAttribute)
    .sort(
      (a, b) =>
        (PUBLIC_ATTRIBUTE_CHIP_PRIORITY_INDEX.get(a.key) ??
          Number.POSITIVE_INFINITY) -
          (PUBLIC_ATTRIBUTE_CHIP_PRIORITY_INDEX.get(b.key) ??
            Number.POSITIVE_INFINITY) || a.key.localeCompare(b.key),
    )
    .slice(0, Math.max(0, limit))
    .map(publicAttributeChipLabel);
}

export function groupPublicAttributes(
  attrs: PublicAttribute[],
): Array<{ id: string; title: string; attributes: PublicAttribute[] }> {
  const usable = attrs.filter((attr) => {
    if (attr.valueType === "boolean") return attr.value === true || attr.value === false;
    return isPositivePublicAttribute(attr);
  });
  const byKey = new Map(usable.map((attr) => [attr.key, attr]));
  return PUBLIC_FEATURE_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    attributes: group.keys
      .map((key) => byKey.get(key))
      .filter((attr): attr is PublicAttribute => Boolean(attr))
      .filter((attr) => attr.valueType !== "boolean" || attr.value === true),
  })).filter((group) => group.attributes.length > 0);
}

export function listingHasPublicAttribute(
  attrs: PublicAttribute[],
  key: string,
  required: "true" | "any" = "true",
): boolean {
  const canon = normalizePublicAttributeKey(key);
  const match = attrs.find((attr) => attr.key === canon);
  if (!match) return false;
  if (required === "any") return true;
  return match.valueType === "boolean" ? match.value === true : true;
}
