/** Build a /listings URL while preserving current filters. */
export function listingsHref(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | null | undefined> = {},
): string {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key in overrides) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || value === "") {
      next.delete(key);
      continue;
    }
    next.set(key, value);
  }
  const query = next.toString();
  return query ? `/listings?${query}` : "/listings";
}
