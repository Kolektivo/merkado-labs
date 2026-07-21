/** Deduplicate gallery URLs while preserving order. */
export function uniqueListingImages(images: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of images) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
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
  const fromGallery = (input.imageUrls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  if (fromGallery.length) return uniqueListingImages(fromGallery);
  if (input.primaryImageUrl?.trim()) return [input.primaryImageUrl.trim()];
  return [];
}
