/**
 * Optional server-side reverse-geocoding provider abstraction.
 *
 * Disabled unless explicitly configured. Never used during normal page
 * rendering. Not an authoritative neighbourhood source — boundaries win.
 */

import "server-only";

export type ReverseGeocodeResult = {
  displayName: string;
  provider: string;
  latitude: number;
  longitude: number;
  cached: boolean;
  fetchedAt: string;
};

export type ReverseGeocodeProvider = {
  readonly name: string;
  reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult | null>;
};

type CacheEntry = {
  result: ReverseGeocodeResult;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let lastRequestAt = 0;

function cacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function isEnabled() {
  return process.env.REVERSE_GEOCODE_ENABLED?.trim().toLowerCase() === "true";
}

function minIntervalMs() {
  const raw = Number(process.env.REVERSE_GEOCODE_MIN_INTERVAL_MS ?? "1000");
  return Number.isFinite(raw) && raw >= 250 ? raw : 1000;
}

async function rateLimit() {
  const waitFor = minIntervalMs() - (Date.now() - lastRequestAt);
  if (waitFor > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitFor));
  }
  lastRequestAt = Date.now();
}

/**
 * Placeholder provider. Configure a commercial geocoder here later.
 * Public Nominatim bulk usage is intentionally unsupported.
 */
export function createConfiguredReverseGeocodeProvider(): ReverseGeocodeProvider | null {
  if (!isEnabled()) return null;
  const endpoint = process.env.REVERSE_GEOCODE_ENDPOINT?.trim();
  const apiKey = process.env.REVERSE_GEOCODE_API_KEY?.trim();
  if (!endpoint || !apiKey) return null;

  return {
    name: "configured",
    async reverseGeocode(latitude, longitude) {
      const key = cacheKey(latitude, longitude);
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return { ...hit.result, cached: true };
      }

      await rateLimit();
      const url = new URL(endpoint);
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { display_name?: string };
      if (!payload.display_name) return null;

      const result: ReverseGeocodeResult = {
        displayName: payload.display_name,
        provider: "configured",
        latitude,
        longitude,
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
      cache.set(key, {
        result,
        expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      });
      return result;
    },
  };
}

/**
 * Lookup helper for controlled CLI/maintenance commands only.
 * Returns null when reverse geocoding is disabled or unconfigured.
 */
export async function reverseGeocodeIfEnabled(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> {
  const provider = createConfiguredReverseGeocodeProvider();
  if (!provider) return null;
  return provider.reverseGeocode(latitude, longitude);
}
