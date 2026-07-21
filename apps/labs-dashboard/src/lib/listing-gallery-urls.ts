/** Absolute http(s) image URLs only — rejects relative/empty/junk for next/image. */
export function isValidListingImageUrl(url: string): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Deduplicate gallery URLs while preserving order. */
export function uniqueListingImages(images: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of images) {
    const url = raw?.trim();
    if (!url || !isValidListingImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Resolve gallery URLs for cards/detail with primary fallback. */
export function resolveListingGalleryUrls(input: {
  imageUrls?: string[] | null;
  primaryImageUrl?: string | null;
}): string[] {
  const fromGallery = uniqueListingImages(
    (input.imageUrls ?? []).filter(
      (url): url is string => typeof url === "string" && url.trim().length > 0,
    ),
  );
  if (fromGallery.length) return fromGallery;
  if (input.primaryImageUrl?.trim()) {
    return uniqueListingImages([input.primaryImageUrl.trim()]);
  }
  return [];
}

/** Single validated thumbnail URL for table/map (shared gallery rules). */
export function resolveListingPrimaryImageUrl(input: {
  imageUrls?: string[] | null;
  primaryImageUrl?: string | null;
}): string | null {
  return resolveListingGalleryUrls(input)[0] ?? null;
}
