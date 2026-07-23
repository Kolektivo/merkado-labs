/** Labs admin native listing constants (real estate only). */

export const NATIVE_LISTING_ORIGIN = "manual" as const;

export const REAL_ESTATE_TYPE_OPTIONS = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" },
  { value: "bungalow", label: "Bungalow" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
] as const;

export type RealEstateTypeValue =
  (typeof REAL_ESTATE_TYPE_OPTIONS)[number]["value"];

export const LISTING_TYPE_OPTIONS = [
  { value: "sale", label: "For sale" },
  { value: "rent", label: "For rent" },
] as const;

export const CURRENCY_OPTIONS = ["XCG", "USD", "EUR", "ANG"] as const;

export const CONTACT_METHOD_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
] as const;

export const NATIVE_FEATURE_KEYS = [
  "pool",
  "furnished",
  "parking",
  "garage",
  "gated_community",
  "air_conditioning",
  "garden",
  "terrace",
  "balcony",
  "sea_view",
  "waterfront",
  "solar_panels",
  "generator",
  "security_features",
] as const;

export const MAX_NATIVE_IMAGES = 12;
export const MAX_NATIVE_IMAGE_BYTES = 5 * 1024 * 1024;
export const NATIVE_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export const NATIVE_WIZARD_STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Features" },
  { id: 3, label: "Photos" },
  { id: 4, label: "Review" },
] as const;

export const MANUAL_ACTIVITY_EVENTS = [
  "submitted",
  "published",
  "material_field_changed",
  "price_changed",
  "unpublished",
  "marked_sold",
  "marked_rented",
  "republished",
] as const;
