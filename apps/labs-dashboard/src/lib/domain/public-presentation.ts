/**
 * Public English presentation helpers for Browse / Passport / SEO.
 *
 * Prefer AI `displayTitle` / `displaySummary` when the public view exposes them.
 * Otherwise build deterministic English fallbacks — never blank titles, never
 * prefer raw Dutch source as primary public copy.
 */

function titleCase(value: string | null | undefined): string {
  if (!value) return "Not specified";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export type PublicPresentationFields = {
  /** Auto-applied English title from enrichment (v5+); may be absent pre-migration. */
  displayTitle?: string | null;
  /** Auto-applied English summary from enrichment (v5+). */
  displaySummary?: string | null;
  /** Raw source title — not used as primary public copy. */
  title?: string | null;
  /** Legacy concise summary (may already be English). */
  effectiveSummary?: string | null;
  displayDescription?: {
    overview?: string | null;
    language?: string | null;
  } | null;
  bedrooms?: number | null;
  effectivePropertyType?: string | null;
  propertyType?: string | null;
  effectiveNeighbourhood?: string | null;
  listingType?: string | null;
  externalId?: string | null;
};

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || null;
}

function propertyTypeLabel(raw: string | null | undefined): string | null {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  return titleCase(cleaned.replaceAll("-", "_"));
}

/**
 * Deterministic English title when AI display_title is not yet available.
 * Hierarchy: bedrooms+type+area → type+area → Property in {area} → Property listing.
 */
export function buildFallbackDisplayTitle(
  input: PublicPresentationFields,
): string {
  const type = propertyTypeLabel(
    input.effectivePropertyType ?? input.propertyType,
  );
  const neighbourhood = cleanText(input.effectiveNeighbourhood);
  const beds =
    typeof input.bedrooms === "number" &&
    Number.isFinite(input.bedrooms) &&
    input.bedrooms > 0
      ? Math.floor(input.bedrooms)
      : null;

  const typePart = type ?? "Property";
  const bedPart =
    beds != null
      ? `${beds}-Bedroom ${typePart}`
      : typePart === "Property"
        ? "Property"
        : typePart;

  if (neighbourhood) {
    if (bedPart === "Property") return `Property in ${neighbourhood}`;
    return `${bedPart} in ${neighbourhood}`;
  }

  if (bedPart !== "Property") return bedPart;

  const listingType = cleanText(input.listingType)?.toLowerCase();
  if (listingType === "sale") return "Property for sale";
  if (listingType === "rent") return "Property for rent";

  if (input.externalId) return `Property ${input.externalId}`;
  return "Property listing";
}

/** Truncate for meta / card summary without cutting mid-word when possible. */
export function truncatePublicSummary(
  value: string,
  maxLength = 180,
): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  const slice = cleaned.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 80 ? slice.slice(0, lastSpace) : slice;
  return `${base}…`;
}

export function buildFallbackDisplaySummary(
  input: PublicPresentationFields,
): string | null {
  const overview = cleanText(input.displayDescription?.overview);
  if (overview) return truncatePublicSummary(overview, 180);

  const parts: string[] = [];
  const type = propertyTypeLabel(
    input.effectivePropertyType ?? input.propertyType,
  );
  const neighbourhood = cleanText(input.effectiveNeighbourhood);
  const beds =
    typeof input.bedrooms === "number" &&
    Number.isFinite(input.bedrooms) &&
    input.bedrooms > 0
      ? Math.floor(input.bedrooms)
      : null;

  if (beds != null && type) {
    parts.push(`${beds}-bedroom ${type.toLowerCase()}`);
  } else if (type) {
    parts.push(type.toLowerCase());
  } else {
    parts.push("Property");
  }
  if (neighbourhood) parts.push(`in ${neighbourhood}`);
  parts.push("on Curaçao");

  const listingType = cleanText(input.listingType)?.toLowerCase();
  if (listingType === "sale") parts.push("· for sale");
  if (listingType === "rent") parts.push("· for rent");

  return truncatePublicSummary(parts.join(" "), 180);
}

/** Public card / detail / SEO title — never blank. */
export function resolvePublicDisplayTitle(
  input: PublicPresentationFields,
): string {
  return cleanText(input.displayTitle) ?? buildFallbackDisplayTitle(input);
}

/**
 * Preferred public summary: AI display_summary → effective_summary →
 * display overview → deterministic English fallback (may be null only if
 * callers opt out of fallback via resolvePublicMetaDescription).
 */
export function resolvePublicDisplaySummary(
  input: PublicPresentationFields,
  options: { fallback?: boolean } = {},
): string | null {
  const preferFallback = options.fallback !== false;
  const fromDisplay = cleanText(input.displaySummary);
  if (fromDisplay) return truncatePublicSummary(fromDisplay, 180);
  const fromEffective = cleanText(input.effectiveSummary);
  if (fromEffective) return truncatePublicSummary(fromEffective, 180);
  const overview = cleanText(input.displayDescription?.overview);
  if (overview) return truncatePublicSummary(overview, 180);
  return preferFallback ? buildFallbackDisplaySummary(input) : null;
}

/** Meta description always returns English copy. */
export function resolvePublicMetaDescription(
  input: PublicPresentationFields,
): string {
  return (
    resolvePublicDisplaySummary(input) ??
    "Property listing in Curaçao from Merkado Labs public preview."
  );
}

/** English listing-type badge for public surfaces. */
export function publicListingTypeLabel(
  listingType: string | null | undefined,
): string {
  switch ((listingType ?? "").trim().toLowerCase()) {
    case "sale":
      return "For sale";
    case "rent":
      return "For rent";
    case "":
      return "Listing";
    default:
      return titleCase(listingType ?? null);
  }
}
