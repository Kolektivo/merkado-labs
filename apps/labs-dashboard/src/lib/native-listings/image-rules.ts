import { MAX_NATIVE_IMAGES } from "@/lib/native-listings/constants";

export type ImageRuleResult =
  | { ok: true }
  | { ok: false; error: string };

/** MAX_NATIVE_IMAGES is a per-listing total, not a per-request batch size. */
export function validateUploadCapacity(
  existingCount: number,
  incomingCount: number,
  maxImages: number = MAX_NATIVE_IMAGES,
): ImageRuleResult {
  if (incomingCount < 1) {
    return { ok: false, error: "No files uploaded." };
  }
  if (existingCount < 0) {
    return { ok: false, error: "Invalid existing image count." };
  }
  if (existingCount >= maxImages) {
    return {
      ok: false,
      error: `This listing already has the maximum of ${maxImages} images.`,
    };
  }
  const remaining = maxImages - existingCount;
  if (incomingCount > remaining) {
    return {
      ok: false,
      error: `This listing can accept ${remaining} more image${remaining === 1 ? "" : "s"} (maximum ${maxImages} total).`,
    };
  }
  return { ok: true };
}

/**
 * Reorder payload must be an exact unique permutation of the listing's stored
 * storage_path values — no missing, duplicate, or foreign paths.
 */
export function validateReorderPermutation(
  orderedPaths: string[],
  storedPaths: string[],
): ImageRuleResult {
  if (!Array.isArray(orderedPaths) || orderedPaths.length === 0) {
    return { ok: false, error: "orderedPaths is required." };
  }
  if (orderedPaths.some((path) => typeof path !== "string" || !path.trim())) {
    return { ok: false, error: "Image paths must be non-empty strings." };
  }
  if (orderedPaths.length !== storedPaths.length) {
    return {
      ok: false,
      error: "Reorder must include every stored image exactly once.",
    };
  }
  const uniqueOrdered = new Set(orderedPaths);
  if (uniqueOrdered.size !== orderedPaths.length) {
    return { ok: false, error: "Duplicate image paths are not allowed." };
  }
  const stored = new Set(storedPaths);
  for (const path of orderedPaths) {
    if (!stored.has(path)) {
      return {
        ok: false,
        error: "Unknown or foreign image path in reorder request.",
      };
    }
  }
  return { ok: true };
}

/**
 * When images exist, exactly one row is primary (sort_order 0).
 * When none exist, no primaries.
 */
export function assignPrimaryFlags<T extends { sortOrder: number }>(
  images: T[],
): Array<T & { isPrimary: boolean }> {
  if (!images.length) return [];
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.map((image, index) => ({
    ...image,
    isPrimary: index === 0,
  }));
}

export function assertExactlyOnePrimary(
  images: Array<{ isPrimary: boolean }>,
): ImageRuleResult {
  if (!images.length) return { ok: true };
  const primaryCount = images.filter((image) => image.isPrimary).length;
  if (primaryCount !== 1) {
    return {
      ok: false,
      error: `Expected exactly one primary image, found ${primaryCount}.`,
    };
  }
  return { ok: true };
}
