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

const TRACKING_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

const RESIZE_QUERY_KEYS = new Set([
  "w",
  "h",
  "width",
  "height",
  "q",
  "quality",
  "fit",
  "crop",
  "resize",
  "auto",
  "dpr",
  "fm",
  "format",
]);

const WP_SIZE_SUFFIX_RE = /-\d{2,4}x\d{2,4}(?=\.[A-Za-z0-9]+$)/i;
const REMAX_CACHE_FILE_RE =
  /^(?:(.*)-)?(\d{9,12})-(\d{2,5})x(\d{2,5})(\.[A-Za-z0-9]+)$/i;
const REMAX_EMPTY_BODY_ASPECT_TOLERANCE = 0.02;
const REMAX_TS_FUZZ_SECONDS = 2;

type RemaxMeta = {
  body: string;
  timestamp: number;
  width: number;
  height: number;
  area: number;
  aspect: number;
  emptyBody: boolean;
};

function stripWordpressSizeSuffix(pathname: string): string {
  if (!pathname.toLowerCase().includes("/wp-content/uploads/")) return pathname;
  return pathname.replace(WP_SIZE_SUFFIX_RE, "");
}

/** Normalize scheme/host/path; strip tracking params; collapse WP size suffixes. */
export function canonicalizeListingImageUrl(url: string): string {
  let raw = url.trim();
  if (raw.startsWith("//")) raw = `https:${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return raw;
  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) params.delete(key);
  }
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = stripWordpressSizeSuffix(parsed.pathname);
  parsed.search = params.toString() ? `?${params.toString()}` : "";
  parsed.hash = "";
  return parsed.toString();
}

function pathIdentityUrl(url: string): string {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (RESIZE_QUERY_KEYS.has(key.toLowerCase())) params.delete(key);
  }
  parsed.search = params.toString() ? `?${params.toString()}` : "";
  return parsed.toString();
}

function intParam(value: string | null): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function resizeQualityScore(url: string): [number, number, number] {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const width = intParam(params.get("w") ?? params.get("width"));
  const height = intParam(params.get("h") ?? params.get("height"));
  const quality = intParam(params.get("q") ?? params.get("quality"));
  const area = width && height ? width * height : Math.max(width, height);
  return [area, quality, url.length];
}

function remaxCacheMeta(url: string): RemaxMeta | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("remax-abc.com") || !parsed.pathname.includes("/img/cache/")) {
    return null;
  }
  const name = parsed.pathname.split("/").pop() ?? "";
  const match = REMAX_CACHE_FILE_RE.exec(name);
  if (!match) return null;
  const body = (match[1] ?? "").toLowerCase();
  const width = Number(match[3]);
  const height = Number(match[4]);
  return {
    body,
    timestamp: Number(match[2]),
    width,
    height,
    area: width * height,
    aspect: height ? width / height : 0,
    emptyBody: !body,
  };
}

function aspectClose(a: number, b: number, tolerance: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

function remaxAspectBucket(meta: RemaxMeta): string {
  if (meta.height <= 0) return "0";
  return String(Math.round(meta.aspect * 50) / 50);
}

/** Identity key aligned with Python ``image_identity_key``. */
export function listingImageIdentityKey(url: string): string {
  const canon = canonicalizeListingImageUrl(url);
  const meta = remaxCacheMeta(canon);
  if (meta) {
    if (meta.emptyBody) {
      return `remax::${meta.timestamp}:${remaxAspectBucket(meta)}`;
    }
    return `remax:${meta.body}:${meta.timestamp}`;
  }
  return pathIdentityUrl(canon);
}

function findRemaxDuplicateIndex(
  keptMeta: Array<RemaxMeta | null>,
  meta: RemaxMeta,
): number | null {
  for (let index = 0; index < keptMeta.length; index += 1) {
    const prev = keptMeta[index];
    if (!prev || prev.body !== meta.body) continue;
    if (meta.emptyBody) {
      if (prev.timestamp !== meta.timestamp) continue;
      if (
        !aspectClose(
          prev.aspect,
          meta.aspect,
          REMAX_EMPTY_BODY_ASPECT_TOLERANCE,
        )
      ) {
        continue;
      }
    } else if (
      Math.abs(prev.timestamp - meta.timestamp) > REMAX_TS_FUZZ_SECONDS
    ) {
      continue;
    }
    return index;
  }
  return null;
}

function scoreBetter(
  current: string,
  candidate: string,
  currentMeta: RemaxMeta | null,
  candidateMeta: RemaxMeta | null,
): boolean {
  if (candidateMeta && currentMeta && candidateMeta.area !== currentMeta.area) {
    return candidateMeta.area > currentMeta.area;
  }
  const currentScore = resizeQualityScore(current);
  const candidateScore = resizeQualityScore(candidate);
  for (let i = 0; i < 3; i += 1) {
    if (candidateScore[i]! !== currentScore[i]!) {
      return candidateScore[i]! > currentScore[i]!;
    }
  }
  return false;
}

/**
 * Deduplicate gallery URLs with shared identity rules (exact, URL variants,
 * WordPress sizes, RE/MAX cache sizes) while preserving first-seen order and
 * preferring higher-quality variants.
 */
export function uniqueListingImages(images: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  const keptMeta: Array<RemaxMeta | null> = [];
  const keptIdentity: string[] = [];

  for (const raw of images) {
    const trimmed = raw?.trim();
    if (!trimmed || !isValidListingImageUrl(trimmed)) continue;
    const canonical = canonicalizeListingImageUrl(trimmed);
    if (!isValidListingImageUrl(canonical)) continue;
    const meta = remaxCacheMeta(canonical);

    if (meta) {
      const dupIndex = findRemaxDuplicateIndex(keptMeta, meta);
      if (dupIndex != null) {
        if (
          scoreBetter(kept[dupIndex]!, canonical, keptMeta[dupIndex]!, meta)
        ) {
          kept[dupIndex] = canonical;
          keptMeta[dupIndex] = meta;
          keptIdentity[dupIndex] = listingImageIdentityKey(canonical);
        }
        continue;
      }
      const identity = listingImageIdentityKey(canonical);
      seen.add(identity);
      kept.push(canonical);
      keptMeta.push(meta);
      keptIdentity.push(identity);
      continue;
    }

    const identity = listingImageIdentityKey(canonical);
    if (seen.has(identity)) {
      const dupIndex = keptIdentity.indexOf(identity);
      if (scoreBetter(kept[dupIndex]!, canonical, null, null)) {
        kept[dupIndex] = canonical;
      }
      continue;
    }
    seen.add(identity);
    kept.push(canonical);
    keptMeta.push(null);
    keptIdentity.push(identity);
  }

  return kept;
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
