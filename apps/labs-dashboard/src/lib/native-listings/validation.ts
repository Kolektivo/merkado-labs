import {
  CONTACT_METHOD_OPTIONS,
  CURRENCY_OPTIONS,
  LISTING_TYPE_OPTIONS,
  NATIVE_FEATURE_KEYS,
  REAL_ESTATE_TYPE_OPTIONS,
} from "@/lib/native-listings/constants";
import {
  PUBLIC_ATTRIBUTE_DISPLAY_LABELS,
} from "@/lib/domain/public-attributes";

export type NativeListingInput = {
  listingType?: string | null;
  title?: string | null;
  realEstateType?: string | null;
  neighbourhood?: string | null;
  originalPrice?: number | null;
  originalCurrency?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floorAreaM2?: number | null;
  lotAreaValue?: number | null;
  lotAreaUnit?: string | null;
  description?: string | null;
  features?: string[] | null;
  contactName?: string | null;
  contactMethod?: string | null;
  contactValue?: string | null;
};

export type NativeValidationResult = {
  ok: boolean;
  errors: string[];
};

const REAL_ESTATE_TYPES = new Set(
  REAL_ESTATE_TYPE_OPTIONS.map((option) => option.value),
);
const LISTING_TYPES = new Set(LISTING_TYPE_OPTIONS.map((option) => option.value));
const CURRENCIES = new Set(CURRENCY_OPTIONS);
const CONTACT_METHODS = new Set(
  CONTACT_METHOD_OPTIONS.map((option) => option.value),
);
const FEATURE_KEYS = new Set(NATIVE_FEATURE_KEYS);

function optionalNumber(
  value: unknown,
  label: string,
  errors: string[],
  { min = 0, allowNull = true }: { min?: number; allowNull?: boolean } = {},
): number | null {
  if (value === null || value === undefined || value === "") {
    if (!allowNull) errors.push(`${label} is required.`);
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} must be a number.`);
    return null;
  }
  if (parsed < min) {
    errors.push(`${label} must be at least ${min}.`);
    return null;
  }
  return parsed;
}

export function normalizeFeatureKeys(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  const unique = new Set<string>();
  for (const item of features) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (FEATURE_KEYS.has(key as (typeof NATIVE_FEATURE_KEYS)[number])) {
      unique.add(key);
    }
  }
  return [...unique];
}

export function buildOwnerAttributes(features: string[]) {
  return features.map((key) => ({
    key,
    display_label: PUBLIC_ATTRIBUTE_DISPLAY_LABELS[key] ?? key,
    value: true,
    value_type: "boolean" as const,
  }));
}

export function validateNativeDraft(input: NativeListingInput): NativeValidationResult {
  const errors: string[] = [];
  const title = input.title?.trim() ?? "";
  if (!title) errors.push("Title is required.");
  if (title.length > 160) errors.push("Title must be 160 characters or fewer.");

  const listingType = input.listingType?.trim() ?? "";
  if (!LISTING_TYPES.has(listingType as "sale" | "rent")) {
    errors.push("Choose sale or rent.");
  }

  const realEstateType = input.realEstateType?.trim() ?? "";
  if (!REAL_ESTATE_TYPES.has(realEstateType as never)) {
    errors.push("Choose a valid real estate type.");
  }

  const neighbourhood = input.neighbourhood?.trim() ?? "";
  if (!neighbourhood) errors.push("Neighbourhood / location is required.");

  const currency = (input.originalCurrency ?? "").trim().toUpperCase();
  if (!CURRENCIES.has(currency as (typeof CURRENCY_OPTIONS)[number])) {
    errors.push("Choose a supported original currency.");
  }

  optionalNumber(input.originalPrice, "Price", errors, { min: 0, allowNull: false });
  optionalNumber(input.bedrooms, "Bedrooms", errors, { min: 0 });
  optionalNumber(input.bathrooms, "Bathrooms", errors, { min: 0 });
  optionalNumber(input.floorAreaM2, "Floor area", errors, { min: 0.01 });
  optionalNumber(input.lotAreaValue, "Lot area", errors, { min: 0 });

  const contactMethod = input.contactMethod?.trim() ?? "";
  if (contactMethod && !CONTACT_METHODS.has(contactMethod as never)) {
    errors.push("Contact method must be WhatsApp, phone, or email.");
  }

  const contactValue = input.contactValue?.trim() ?? "";
  if (contactMethod && !contactValue) {
    errors.push("Contact value is required when a contact method is set.");
  }
  if (contactMethod === "email" && contactValue && !contactValue.includes("@")) {
    errors.push("Contact email looks invalid.");
  }

  normalizeFeatureKeys(input.features);

  return { ok: errors.length === 0, errors };
}

/** Extra publish gates beyond draft validation. */
export function validateNativePublish(input: {
  draft: NativeListingInput;
  imageCount: number;
}): NativeValidationResult {
  const base = validateNativeDraft(input.draft);
  const errors = [...base.errors];
  const price = Number(input.draft.originalPrice);
  if (!(Number.isFinite(price) && price > 0)) {
    errors.push("A positive price is required to publish.");
  }
  if (input.imageCount < 1) {
    errors.push("At least one image is required to publish.");
  }
  const contactMethod = input.draft.contactMethod?.trim() ?? "";
  const contactValue = input.draft.contactValue?.trim() ?? "";
  if (!contactMethod || !CONTACT_METHODS.has(contactMethod as never)) {
    errors.push("Valid contact method is required to publish.");
  }
  if (!contactValue) {
    errors.push("Valid contact information is required to publish.");
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function evaluateManualPublicEligibility(input: {
  status: string;
  originalPrice: number | null;
  title: string | null;
  realEstateType: string | null;
  listingType: string | null;
  primaryImageUrl: string | null;
  contactMethod: string | null;
  contactValue: string | null;
}): { eligible: boolean; reason: string } {
  if (input.status !== "active") {
    return { eligible: false, reason: "not_active" };
  }
  if (input.originalPrice == null) {
    return { eligible: false, reason: "missing_price" };
  }
  if (!(input.originalPrice > 0)) {
    return { eligible: false, reason: "non_positive_price" };
  }
  if (!input.title?.trim()) {
    return { eligible: false, reason: "missing_required_fields" };
  }
  if (!input.realEstateType?.trim()) {
    return { eligible: false, reason: "missing_required_fields" };
  }
  if (input.listingType !== "sale" && input.listingType !== "rent") {
    return { eligible: false, reason: "missing_required_fields" };
  }
  if (!input.primaryImageUrl?.trim()) {
    return { eligible: false, reason: "missing_image" };
  }
  if (!input.contactMethod?.trim() || !input.contactValue?.trim()) {
    return { eligible: false, reason: "missing_contact" };
  }
  return { eligible: true, reason: "eligible" };
}
